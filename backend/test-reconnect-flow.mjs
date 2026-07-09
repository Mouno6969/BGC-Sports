// Integration test: reconnection recovery flow (grace period + session resume).
// Run:  PROOM_GRACE_MS=2000 node src/server.js   (in one shell)
//       node test-reconnect-flow.mjs             (in another)
// The server MUST be started with PROOM_GRACE_MS=2000 so grace-expiry cases
// finish quickly. The test asserts against that 2s window.
import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const GRACE_MS = 2000; // must match the server's PROOM_GRACE_MS

/**
 * Wrap an event-based promise so a missing event fails the test with a clear
 * message instead of hanging the run forever.
 */
function withTimeout(promise, ms = 5000, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout waiting for: ${label}`)), ms)
    ),
  ]);
}

function connect() {
  return withTimeout(
    new Promise((resolve, reject) => {
      const s = io(URL, { transports: ['websocket'], reconnection: false });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    }),
    5000,
    'socket connect'
  );
}

function once(sock, event, label) {
  return withTimeout(
    new Promise((r) => sock.once(event, r)),
    6000,
    label || `event ${event}`
  );
}

/** Wait for a proom:members broadcast that satisfies `pred`. */
function membersWhere(sock, pred, label) {
  return withTimeout(
    new Promise((resolve) => {
      const h = (payload) => {
        if (pred(payload)) {
          sock.off('proom:members', h);
          resolve(payload);
        }
      };
      sock.on('proom:members', h);
    }),
    6000,
    label
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

// ---- Test 1: session tokens are issued and kept private --------------------
async function testTokensIssued() {
  console.log('\n[1] Session tokens issued on create/join (and never broadcast)');
  const a = await connect();
  const b = await connect();

  const createdP = once(a, 'proom:created');
  a.emit('proom:create', { username: 'Host' });
  const created = await createdP;
  const code = created.room.code;

  check('create ack carries a sessionToken', typeof created.sessionToken === 'string' && created.sessionToken.length >= 16);
  check('members payload does NOT leak sessionToken', created.room.members.every((m) => !('sessionToken' in m)));
  check('members carry disconnected=false', created.room.members.every((m) => m.disconnected === false));

  const joinedP = once(b, 'proom:joined');
  b.emit('proom:join', { code, username: 'Guest' });
  const joined = await joinedP;

  check('join ack carries a distinct sessionToken', typeof joined.sessionToken === 'string' && joined.sessionToken !== created.sessionToken);
  check('joined members do NOT leak tokens', joined.room.members.every((m) => !('sessionToken' in m)));

  return { a, b, code, hostToken: created.sessionToken, guestToken: joined.sessionToken };
}

// ---- Test 2: disconnect marks member as reconnecting (slot held) -----------
async function testDisconnectHoldsSlot(ctx) {
  console.log('\n[2] Disconnect holds the slot and flags the member');
  const { a, b, code } = ctx;
  const guestId = b.id;

  const membersP = membersWhere(
    a,
    (p) => p.members.some((m) => m.id === guestId && m.disconnected === true),
    'members update flagging guest disconnected'
  );
  b.disconnect();
  const payload = await membersP;

  check('guest still listed after disconnect', payload.members.some((m) => m.id === guestId));
  check('guest flagged disconnected', payload.members.find((m) => m.id === guestId)?.disconnected === true);
  check('member count unchanged during grace', payload.members.length === 2);
}

// ---- Test 3: resume with the session token reclaims the slot ---------------
async function testResume(ctx) {
  console.log('\n[3] Resume with session token reclaims the slot');
  const { a, code, guestToken } = ctx;

  const b2 = await connect();
  const resumedP = once(b2, 'proom:resumed');
  const membersP = membersWhere(
    a,
    (p) => p.members.every((m) => m.disconnected === false) && p.members.length === 2,
    'members update after resume'
  );
  b2.emit('proom:resume', { code, sessionToken: guestToken });
  const resumed = await resumedP;

  check('resume ack carries the room', resumed.room?.code === code);
  check('resume ack carries chat history', Array.isArray(resumed.chat) && resumed.chat.length > 0);
  check('username preserved across resume', resumed.room.members.some((m) => m.username === 'Guest' && m.id === b2.id));
  check('resume ack returns the sessionToken', resumed.sessionToken === guestToken);

  const after = await membersP;
  check('other members see guest reconnected', after.members.find((m) => m.id === b2.id)?.disconnected === false);

  // Resumed socket can chat again.
  const chatP = withTimeout(
    new Promise((r) => {
      const h = (m) => { if (!m.system && m.username === 'Guest') { a.off('proom:chat', h); r(m); } };
      a.on('proom:chat', h);
    }),
    6000,
    'chat from resumed guest'
  );
  b2.emit('proom:chat', { text: 'back online' });
  const msg = await chatP;
  check('resumed guest can send chat', msg.text === 'back online');

  ctx.b2 = b2;
}

// ---- Test 4: resume with a bad token fails cleanly --------------------------
async function testBadToken(ctx) {
  console.log('\n[4] Resume with an invalid token fails');
  const { code } = ctx;
  const x = await connect();
  const failedP = once(x, 'proom:resume-failed');
  x.emit('proom:resume', { code, sessionToken: 'not-a-real-token-000000000000000' });
  const failed = await failedP;
  check('bad token gets proom:resume-failed', typeof failed.error === 'string' && failed.error.length > 0);
  x.disconnect();
}

// ---- Test 5: token cannot hijack a still-connected member ------------------
async function testNoHijack(ctx) {
  console.log('\n[5] A live session cannot be hijacked from a second socket');
  const { code, guestToken } = ctx;
  const evil = await connect();
  const failedP = once(evil, 'proom:resume-failed');
  evil.emit('proom:resume', { code, sessionToken: guestToken });
  const failed = await failedP;
  check('hijack attempt rejected while member is connected', /active/i.test(failed.error || ''));
  evil.disconnect();
}

// ---- Test 6: host disconnect + resume keeps host role -----------------------
async function testHostResume(ctx) {
  console.log('\n[6] Host keeps the host role across a resume');
  const { a, b2, code, hostToken } = ctx;
  const hostOldId = a.id;

  const flaggedP = membersWhere(
    b2,
    (p) => p.members.some((m) => m.id === hostOldId && m.disconnected === true),
    'members update flagging host disconnected'
  );
  a.disconnect();
  const flagged = await flaggedP;
  check('host slot held during grace', flagged.hostId === hostOldId);

  const a2 = await connect();
  const resumedP = once(a2, 'proom:resumed');
  a2.emit('proom:resume', { code, sessionToken: hostToken });
  const resumed = await resumedP;

  check('host resume succeeds', resumed.room?.code === code);
  check('host role re-keyed to the new socket', resumed.room.hostId === a2.id && resumed.room.isHost === true);
  ctx.a2 = a2;
}

// ---- Test 7: grace expiry removes the member and transfers host -------------
async function testGraceExpiry(ctx) {
  console.log('\n[7] Grace expiry finalizes the departure (host transfer to a CONNECTED member)');
  const { a2, b2, code } = ctx;

  // c joins, then the HOST (a2) drops and never resumes.
  const c = await connect();
  const joinedP = once(c, 'proom:joined');
  c.emit('proom:join', { code, username: 'Third' });
  await joinedP;

  const hostOldId = a2.id;
  const hostChangedP = once(b2, 'proom:host-changed', 'host-changed after grace expiry');
  const removedP = membersWhere(
    b2,
    (p) => !p.members.some((m) => m.id === hostOldId),
    'members update after grace expiry removal'
  );
  a2.disconnect();

  const t0 = Date.now();
  const [changed, after] = await Promise.all([hostChangedP, removedP]);
  const elapsed = Date.now() - t0;

  check('member removed after grace expiry', !after.members.some((m) => m.id === hostOldId));
  check(`removal happened after the ~${GRACE_MS}ms grace (took ${elapsed}ms)`, elapsed >= GRACE_MS - 250);
  check('host transferred to a connected member', [b2.id, c.id].includes(changed.hostId));
  check('remaining members all connected', after.members.every((m) => m.disconnected === false));

  ctx.c = c;
}

// ---- Test 8: explicit leave skips the grace period ---------------------------
async function testExplicitLeave(ctx) {
  console.log('\n[8] Explicit leave removes the member immediately (no grace)');
  const { b2, c } = ctx;
  const leftId = c.id;

  const removedP = membersWhere(
    b2,
    (p) => !p.members.some((m) => m.id === leftId),
    'members update after explicit leave'
  );
  const t0 = Date.now();
  c.emit('proom:leave');
  const after = await removedP;
  const elapsed = Date.now() - t0;

  check('member gone right away on explicit leave', !after.members.some((m) => m.id === leftId));
  check(`no grace delay applied (took ${elapsed}ms)`, elapsed < GRACE_MS);
  c.disconnect();
  b2.disconnect();
}

// ---- run --------------------------------------------------------------------
(async () => {
  try {
    const ctx = await testTokensIssued();
    await testDisconnectHoldsSlot(ctx);
    await testResume(ctx);
    await testBadToken(ctx);
    await testNoHijack(ctx);
    await testHostResume(ctx);
    await testGraceExpiry(ctx);
    await testExplicitLeave(ctx);
  } catch (err) {
    fail++;
    console.error('\nTEST RUN ERROR:', err.message);
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})();
