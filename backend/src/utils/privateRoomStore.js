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
//                        sessionToken,      // secret token for reconnection resume
//                        disconnected,      // true while in the reconnect grace period
//                        disconnectedAt,    // timestamp of the disconnect (or null)
//                        removalTimer,      // grace-period timer handle (not serialized)
//                     }>
//   - chat:          ring buffer of recent room chat messages
//   - createdAt:     timestamp
//
// Only the host can: kick, force-mute/unmute, lock/unlock, and end the call
// for everyone. When the host leaves, host is transferred to the next member.
//
// RECONNECTION RECOVERY: when a member's socket drops, their slot is kept for
// a grace period (marked `disconnected`) instead of being removed right away.
// The client can resume the slot from a new socket by presenting the member's
// `sessionToken`; the store then re-keys the member entry (and hostId, if the
// member was the host) to the new socket id.
// ---------------------------------------------------------------------------

import { customAlphabet } from 'nanoid';

// 6-char codes using unambiguous uppercase letters + digits (no 0/O/1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(ALPHABET, 6);

// Session tokens are secrets — use a long, URL-safe alphabet.
const TOKEN_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateSessionToken = customAlphabet(TOKEN_ALPHABET, 32);

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
      sessionToken: generateSessionToken(),
      disconnected: false,
      disconnectedAt: null,
      removalTimer: null,
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
   * Remove a member. If the host leaves, a remaining member is promoted to
   * host (preferring CONNECTED members over ones in the reconnect grace
   * period). Empty rooms are deleted, clearing any pending grace timers.
   * @returns {{room: object|null, removed: object|null, newHostId: string|null}}
   */
  removeMember(code, socketId) {
    const room = this.getRoom(code);
    if (!room) return { room: null, removed: null, newHostId: null };

    const removed = room.members.get(socketId) || null;
    if (removed) this._clearRemovalTimer(removed);
    room.members.delete(socketId);

    if (room.members.size === 0) {
      this._deleteRoom(room);
      return { room: null, removed, newHostId: null };
    }

    let newHostId = null;
    if (room.hostId === socketId) {
      newHostId = this._pickNewHost(room);
      room.hostId = newHostId;
    }
    return { room, removed, newHostId };
  }

  /** Prefer promoting a connected member; fall back to the oldest entry. */
  _pickNewHost(room) {
    for (const [id, member] of room.members) {
      if (!member.disconnected) return id;
    }
    return room.members.keys().next().value;
  }

  /** Delete a room, clearing every member's pending grace timer. */
  _deleteRoom(room) {
    room.members.forEach((m) => this._clearRemovalTimer(m));
    this.rooms.delete(room.code);
  }

  _clearRemovalTimer(member) {
    if (member.removalTimer) {
      clearTimeout(member.removalTimer);
      member.removalTimer = null;
    }
  }

  // ------------------------- reconnection recovery -------------------------

  /**
   * Mark a member as disconnected (start of the reconnect grace period).
   * The caller is responsible for attaching a removal timer.
   * @returns {object|null} the member, or null if not found
   */
  markDisconnected(code, socketId) {
    const room = this.getRoom(code);
    if (!room) return null;
    const member = room.members.get(socketId);
    if (!member) return null;
    member.disconnected = true;
    member.disconnectedAt = Date.now();
    // Their socket is gone, so any call membership is over.
    member.inCall = false;
    member.callMode = null;
    return member;
  }

  /** Attach (or replace) the grace-period removal timer on a member. */
  attachRemovalTimer(code, socketId, ms, onExpire) {
    const room = this.getRoom(code);
    if (!room) return null;
    const member = room.members.get(socketId);
    if (!member) return null;
    this._clearRemovalTimer(member);
    member.removalTimer = setTimeout(() => {
      member.removalTimer = null;
      onExpire();
    }, ms);
    // Don't let pending grace timers keep the process alive.
    if (typeof member.removalTimer.unref === 'function') member.removalTimer.unref();
    return member;
  }

  /**
   * Resume a disconnected member's slot from a new socket using their
   * session token. Re-keys the member entry (and hostId if they were host).
   * @returns {{ok: boolean, error?: string, room?: object, member?: object, oldId?: string}}
   */
  resumeMember(code, sessionToken, newSocketId) {
    const room = this.getRoom(code);
    if (!room) return { ok: false, error: 'Room not found' };
    if (!sessionToken) return { ok: false, error: 'Invalid session' };

    let oldId = null;
    let member = null;
    for (const [id, m] of room.members) {
      if (m.sessionToken === sessionToken) {
        oldId = id;
        member = m;
        break;
      }
    }
    if (!member) return { ok: false, error: 'Session expired or not found' };
    if (!member.disconnected && oldId !== newSocketId) {
      // The original socket is still connected — refuse to hijack the slot.
      return { ok: false, error: 'Session is still active on another connection' };
    }

    this._clearRemovalTimer(member);
    room.members.delete(oldId);
    member.id = newSocketId;
    member.disconnected = false;
    member.disconnectedAt = null;
    room.members.set(newSocketId, member);

    if (room.hostId === oldId) {
      room.hostId = newSocketId;
    }
    return { ok: true, room, member, oldId };
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

  /**
   * Serialize the member list for sending over the wire.
   * SECURITY: never expose sessionToken (a resume secret) or timer handles.
   */
  memberList(code) {
    const room = this.getRoom(code);
    if (!room) return [];
    return Array.from(room.members.values()).map(
      ({ sessionToken, removalTimer, ...publicFields }) => publicFields
    );
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
