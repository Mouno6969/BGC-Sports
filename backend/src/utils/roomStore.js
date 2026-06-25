// ---------------------------------------------------------------------------
// In-memory room store for watch-party rooms.
//
// For the MVP we keep all room state in memory (no database). Each room holds:
//   - code:          6-char uppercase room code (the room identifier)
//   - hostId:        socket id of the room host (creator)
//   - locked:        whether new participants are blocked from joining
//   - participants:  Map<socketId, { id, username, color }>
//   - playback:      last-known host playback state for "sync to host"
//                    { isPlaying, currentTime, updatedAt }
//
// Swap this module for a Redis-backed implementation to scale horizontally —
// the public method signatures are intentionally simple to make that easy.
// ---------------------------------------------------------------------------

import { customAlphabet } from 'nanoid';

// 6-char codes using unambiguous uppercase letters + digits (no 0/O/1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(ALPHABET, 6);

class RoomStore {
  constructor() {
    /** @type {Map<string, object>} code -> room */
    this.rooms = new Map();
  }

  /** Generate a unique room code not currently in use. */
  _uniqueCode() {
    let code = generateCode();
    while (this.rooms.has(code)) {
      code = generateCode();
    }
    return code;
  }

  /**
   * Create a new room owned by `hostId`.
   * @returns {object} the created room
   */
  createRoom(hostId, hostUsername, hostColor) {
    const code = this._uniqueCode();
    const room = {
      code,
      hostId,
      locked: false,
      participants: new Map(),
      playback: { isPlaying: false, currentTime: 0, updatedAt: Date.now() },
      createdAt: Date.now(),
    };
    room.participants.set(hostId, {
      id: hostId,
      username: hostUsername,
      color: hostColor,
      isHost: true,
    });
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(code.toUpperCase()) || null;
  }

  /**
   * Add a participant to a room.
   * @returns {{ok: boolean, error?: string, room?: object}}
   */
  addParticipant(code, socketId, username, color, maxParticipants) {
    const room = this.getRoom(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.locked) return { ok: false, error: 'Room is locked' };
    if (room.participants.size >= maxParticipants) {
      return { ok: false, error: 'Room is full' };
    }
    room.participants.set(socketId, {
      id: socketId,
      username,
      color,
      isHost: false,
    });
    return { ok: true, room };
  }

  /**
   * Remove a participant from a room. If the host leaves, the oldest remaining
   * participant is promoted to host. Empty rooms are deleted.
   * @returns {{room: object|null, removed: object|null, newHostId: string|null}}
   */
  removeParticipant(code, socketId) {
    const room = this.getRoom(code);
    if (!room) return { room: null, removed: null, newHostId: null };

    const removed = room.participants.get(socketId) || null;
    room.participants.delete(socketId);

    let newHostId = null;
    if (room.participants.size === 0) {
      this.rooms.delete(room.code);
      return { room: null, removed, newHostId: null };
    }

    // Promote a new host if the host left.
    if (room.hostId === socketId) {
      const next = room.participants.keys().next().value;
      room.hostId = next;
      const p = room.participants.get(next);
      if (p) p.isHost = true;
      newHostId = next;
    }

    return { room, removed, newHostId };
  }

  /** Update the host's playback state for "sync to host". */
  updatePlayback(code, playback) {
    const room = this.getRoom(code);
    if (!room) return null;
    room.playback = { ...playback, updatedAt: Date.now() };
    return room.playback;
  }

  /** Toggle the locked state of a room (host only — caller enforces auth). */
  setLocked(code, locked) {
    const room = this.getRoom(code);
    if (!room) return null;
    room.locked = Boolean(locked);
    return room;
  }

  /** Serialize the participant list for sending over the wire. */
  participantList(code) {
    const room = this.getRoom(code);
    if (!room) return [];
    return Array.from(room.participants.values());
  }

  /** Find which room a socket belongs to (linear scan; fine for MVP scale). */
  findRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.participants.has(socketId)) return room;
    }
    return null;
  }
}

export const roomStore = new RoomStore();
