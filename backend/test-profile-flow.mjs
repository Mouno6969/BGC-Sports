// Quick integration test for the profile/avatar identity flow.
// Run: node test-profile-flow.mjs   (server must be running on :4000)
import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const AVATAR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg=';
const AVATAR2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAA=';
const BAD_AVATAR = 'javascript:alert(1)';

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
      const s = io(URL, { transports: ['websocket'] });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    }),
    5000,
    'socket connect'
  );
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

// ---- Test 1: public chat with profile name + avatar ------------------------
async function testChat() {
  console.log('\n[1] Public chat identity');
  const a = await connect();
  const b = await connect();

  const welcomeA = new Promise((r) => a.once('chat:welcome', r));
  a.emit('chat:join', { username: 'Mouno', avatar: AVATAR });
  const wA = await withTimeout(welcomeA, 5000, 'chat:welcome (a)');
  check('profile user keeps chosen name', wA.username === 'Mouno');
  check('welcome carries avatar', wA.avatar === AVATAR);

  const welcomeB = new Promise((r) => b.once('chat:welcome', r));
  b.emit('chat:join', {}); // guest — no name
  const wB = await withTimeout(welcomeB, 5000, 'chat:welcome (b)');
  check('guest gets auto-generated name', /^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/.test(wB.username));

  // Message from profile user should carry avatar
  const msgP = new Promise((r) => {
    const h = (m) => { if (!m.system) { b.off('chat:message', h); r(m); } };
    b.on('chat:message', h);
  });
  a.emit('chat:message', { text: 'hello from profile user' });
  const m1 = await withTimeout(msgP, 5000, 'chat:message (profile user)');
  check('message carries username', m1.username === 'Mouno');
  check('message carries avatar', m1.avatar === AVATAR);

  // Guest message should have empty avatar
  const msgG = new Promise((r) => {
    const h = (m) => { if (!m.system && m.username === wB.username) { a.off('chat:message', h); r(m); } };
    a.on('chat:message', h);
  });
  b.emit('chat:message', { text: 'hello from guest' });
  const m2 = await withTimeout(msgG, 5000, 'chat:message (guest)');
  check('guest message has empty avatar', m2.avatar === '');

  // Malicious avatar must be dropped
  const c = await connect();
  const welcomeC = new Promise((r) => c.once('chat:welcome', r));
  c.emit('chat:join', { username: 'Evil', avatar: BAD_AVATAR });
  await withTimeout(welcomeC, 5000, 'chat:welcome (evil)');
  const msgE = new Promise((r) => {
    const h = (m) => { if (!m.system && m.username === 'Evil') { a.off('chat:message', h); r(m); } };
    a.on('chat:message', h);
  });
  c.emit('chat:message', { text: 'evil msg' });
  const m3 = await withTimeout(msgE, 5000, 'chat:message (evil)');
  check('non-data-URL avatar is rejected', m3.avatar === '');

  // Live profile update — use a DIFFERENT avatar to prove the update path.
  const updated = new Promise((r) => a.once('chat:welcome', r));
  a.emit('chat:update-profile', { username: 'MounoUpdated', avatar: AVATAR2 });
  const wU = await withTimeout(updated, 5000, 'chat:welcome (update-profile)');
  check('chat:update-profile renames in place', wU.username === 'MounoUpdated');
  check('chat:update-profile welcome carries new avatar', wU.avatar === AVATAR2);

  // The new avatar must propagate to subsequent messages.
  const msgU = new Promise((r) => {
    const h = (m) => { if (!m.system && m.username === 'MounoUpdated') { b.off('chat:message', h); r(m); } };
    b.on('chat:message', h);
  });
  a.emit('chat:message', { text: 'after avatar update' });
  const m4 = await withTimeout(msgU, 5000, 'chat:message (after update)');
  check('message after update carries new avatar', m4.avatar === AVATAR2);

  // Update without an avatar field must NOT clear the existing avatar.
  const updated2 = new Promise((r) => a.once('chat:welcome', r));
  a.emit('chat:update-profile', { username: 'MounoFinal' });
  const wU2 = await withTimeout(updated2, 5000, 'chat:welcome (name-only update)');
  check('name-only update preserves avatar', wU2.avatar === AVATAR2);

  a.close(); b.close(); c.close();
}

// ---- Test 2: private room / watch party identity ----------------------------
async function testRoom() {
  console.log('\n[2] Private room / watch party identity');
  const host = await connect();
  const guest = await connect();

  const created = new Promise((r) => host.once('proom:created', r));
  host.emit('proom:create', { username: 'HostUser', avatar: AVATAR });
  const { room } = await withTimeout(created, 5000, 'proom:created');
  check('room created', typeof room.code === 'string' && room.code.length === 6);
  check('host member carries avatar', room.members[0].avatar === AVATAR);

  const joined = new Promise((r) => guest.once('proom:joined', r));
  guest.emit('proom:join', { code: room.code }); // guest, no name/avatar
  const j = await withTimeout(joined, 5000, 'proom:joined');
  const guestMember = j.room.members.find((m) => m.id !== room.hostId);
  check('guest member gets generated name', /^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/.test(guestMember.username));
  check('guest member has empty avatar', guestMember.avatar === '');

  // Room chat carries avatar
  const chatMsg = new Promise((r) => {
    const h = (m) => { if (!m.system) { guest.off('proom:chat', h); r(m); } };
    guest.on('proom:chat', h);
  });
  host.emit('proom:chat', { text: 'hi room' });
  const cm = await withTimeout(chatMsg, 5000, 'proom:chat');
  check('room chat message carries avatar', cm.avatar === AVATAR);

  // Call participants carry avatar
  const participants = new Promise((r) => host.once('proom:call-participants', r));
  host.emit('proom:call-join', { mode: 'video' });
  const list = await withTimeout(participants, 5000, 'proom:call-participants');
  check('call participant carries avatar', list[0].avatar === AVATAR);

  host.close(); guest.close();
}

try {
  await testChat();
  await testRoom();
} catch (err) {
  console.error('Test run error:', err.message);
  fail++;
}
console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
