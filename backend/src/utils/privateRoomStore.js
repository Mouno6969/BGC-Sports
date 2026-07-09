// ---------------------------------------------------------------------------
// In-memory store for PRIVATE ROOMS (replaces the old DM feature).
//
// A private room is created by a host and joined via a 6-char room code.
// Each room contains:
//   - code:          6-char uppercase room code (the room identifier)
//   - hostId:        socket id of the room host (creator / full controller)
//   - locked:        whether new participants are blocked from joining
//   - members:       Map<socketId, {
//                        id, username, color,
//                        inCall,            // whether they joined the A/V call
//                        callMode,          // 'video' | 'audio' | null
//                        micMuted,          // self mic state
//                        camOff,            // self cam state
//                        forceMuted,        // host-enforced mute (cannot speak)
//                     }>
//   - chat:          ring buffer of recent room chat messages
//   - createdAt:     timestamp
//
// Only the host can: kick, force-mute/unmute, lock/unlock, and end the call
// for everyone. When the host leaves, host is transferred to the next member.
// ---------------------------------------------------------------------------

import { customAlphabet } from 'nanoid';

// 6-char codes using unambiguous uppercase letters + digits (no 0/O/1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(ALPHABET, 6);

const CHAT_HISTORY_LIMIT = 100;

class PrivateRoomStore {
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

  /** Create a new private room owned by `hostId`. */
  createRoom(hostId, hostUsername, hostColor, hostAvatar = '') {
    const code = this._uniqueCode();
    const room = {
      code,
      hostId,
      locked: false,
      members: new Map(),
      chat: [],
      createdAt: Date.now(),
    };
    room.members.set(hostId, this._makeMember(hostId, hostUsername, hostColor, hostAvatar));
    this.rooms.set(code, room);
    return room;
  }

  _makeMember(id, username, color, avatar = '') {
    return {
      id,
      username,
      color,
      avatar,
      inCall: false,
      callMode: null,
      micMuted: false,
      camOff: false,
      forceMuted: false,
    };
  }

  getRoom(code) {
    if (!code) return null;
    return this.rooms.get(String(code).toUpperCase()) || null;
  }

  /**
   * Add a member to a room.
   * @returns {{ok: boolean, error?: string, room?: object}}
   */
  addMember(code, socketId, username, color, maxMembers, avatar = '') {
    const room = this.getRoom(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.locked) return { ok: false, error: 'Room is locked by the host' };
    if (room.members.size >= maxMembers) {
      return { ok: false, error: 'Room is full' };
    }
    if (room.members.has(socketId)) return { ok: true, room };
    room.members.set(socketId, this._makeMember(socketId, username, color, avatar));
    return { ok: true, room };
  }

  /**
   * Remove a member. If the host leaves, the oldest remaining member is
   * promoted to host. Empty rooms are deleted.
   * @returns {{room: object|null, removed: object|null, newHostId: string|null}}
   */
  removeMember(code, socketId) {
    const room = this.getRoom(code);
    if (!room) return { room: null, removed: null, newHostId: null };

    const removed = room.members.get(socketId) || null;
    room.members.delete(socketId);

    if (room.members.size === 0) {
      this.rooms.delete(room.code);
      return { room: null, removed, newHostId: null };
    }

    let newHostId = null;
    if (room.hostId === socketId) {
      newHostId = room.members.keys().next().value;
      room.hostId = newHostId;
    }
    return { room, removed, newHostId };
  }

  setLocked(code, locked) {
    const room = this.getRoom(code);
    if (!room) return null;
    room.locked = Boolean(locked);
    return room;
  }

  /** Append a chat message to the room ring buffer. */
  pushChat(code, message) {
    const room = this.getRoom(code);
    if (!room) return null;
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY_LIMIT) room.chat.shift();
    return message;
  }

  /** Update an arbitrary set of fields on a member. */
  updateMember(code, socketId, patch) {
    const room = this.getRoom(code);
    if (!room) return null;
    const member = room.members.get(socketId);
    if (!member) return null;
    Object.assign(member, patch);
    return member;
  }

  /** Serialize the member list for sending over the wire. */
  memberList(code) {
    const room = this.getRoom(code);
    if (!room) return [];
    return Array.from(room.members.values());
  }

  /** Serialize a room (with members) for a given requester. */
  serialize(code, requesterId) {
    const room = this.getRoom(code);
    if (!room) return null;
    return {
      code: room.code,
      hostId: room.hostId,
      locked: room.locked,
      isHost: room.hostId === requesterId,
      members: this.memberList(code),
    };
  }

  /** Find which room a socket belongs to (linear scan; fine for MVP scale). */
  findRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.members.has(socketId)) return room;
    }
    return null;
  }
}

export const privateRoomStore = new PrivateRoomStore();
