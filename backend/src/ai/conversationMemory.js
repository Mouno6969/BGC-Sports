// ---------------------------------------------------------------------------
// Temporary conversation memory for BGC AI.
//
// Stores recent user ↔ AI turns in memory (no DB) so follow-ups like
// "it happened some days ago" resolve against the prior question.
// Entries expire by inactivity TTL and are purged on a schedule.
// ---------------------------------------------------------------------------

/** Max stored messages per user (user + assistant counts separately). */
const MAX_TURNS = Number(process.env.AI_MEMORY_MAX_TURNS || 16);

/** Drop a thread after this long without new activity (default 45 min). */
const TTL_MS = Number(process.env.AI_MEMORY_TTL_MS || 45 * 60 * 1000);

/** Hard cap age of any turn regardless of activity (default 2 hours). */
const MAX_AGE_MS = Number(process.env.AI_MEMORY_MAX_AGE_MS || 2 * 60 * 60 * 1000);

/** How often the sweeper runs (default 5 min). */
const CLEAN_EVERY_MS = Number(process.env.AI_MEMORY_CLEAN_MS || 5 * 60 * 1000);

/** @type {Map<string, { turns: Array<{role:string,text:string,ts:number}>, updatedAt: number }>} */
const store = new Map();

let sweeperStarted = false;

function ensureSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  const timer = setInterval(() => {
    try {
      const n = purgeExpired();
      if (n > 0) console.log(`[AI-Memory] purged ${n} expired conversation(s)`);
    } catch (err) {
      console.warn('[AI-Memory] purge failed:', err.message);
    }
  }, CLEAN_EVERY_MS);
  // Don't keep process alive solely for the sweeper (Node)
  if (typeof timer.unref === 'function') timer.unref();
}

/**
 * Append a turn and prune old ones.
 * @param {string} userId
 * @param {'user'|'assistant'} role
 * @param {string} text
 */
export function appendMemory(userId, role, text) {
  ensureSweeper();
  const id = String(userId || '').trim() || 'anonymous';
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!clean) return;

  const now = Date.now();
  let entry = store.get(id);
  if (!entry) {
    entry = { turns: [], updatedAt: now };
    store.set(id, entry);
  }

  entry.turns.push({ role, text: clean, ts: now });
  entry.updatedAt = now;

  // Drop ancient turns first
  const cutoff = now - MAX_AGE_MS;
  entry.turns = entry.turns.filter((t) => t.ts >= cutoff);

  // Cap length
  if (entry.turns.length > MAX_TURNS) {
    entry.turns = entry.turns.slice(-MAX_TURNS);
  }
}

/**
 * @param {string} userId
 * @returns {Array<{role:string,text:string,ts:number}>}
 */
export function getMemoryTurns(userId) {
  ensureSweeper();
  const id = String(userId || '').trim() || 'anonymous';
  const entry = store.get(id);
  if (!entry) return [];

  const now = Date.now();
  if (now - entry.updatedAt > TTL_MS) {
    store.delete(id);
    return [];
  }

  const cutoff = now - MAX_AGE_MS;
  entry.turns = entry.turns.filter((t) => t.ts >= cutoff);
  if (!entry.turns.length) {
    store.delete(id);
    return [];
  }
  return entry.turns.slice();
}

/**
 * Format turns for the LLM prompt.
 * @param {string} userId
 * @param {number} [maxTurns]
 */
export function formatMemoryForPrompt(userId, maxTurns = 12) {
  const turns = getMemoryTurns(userId).slice(-maxTurns);
  if (!turns.length) return '';

  const lines = ['=== RECENT CONVERSATION (temporary memory — use for follow-ups) ==='];
  for (const t of turns) {
    const who = t.role === 'assistant' ? 'BGC AI' : 'User';
    lines.push(`${who}: ${t.text}`);
  }
  lines.push(
    'RULE: Resolve pronouns like "it", "that match", "he", "they", "the coach" from this memory. If the user says "some days ago" / "earlier", they mean the topic already discussed above.'
  );
  lines.push(
    'RULE: If the user only shares an opinion (e.g. "I think it was unfair"), CONTINUE the discussion about the prior topic — do NOT restart with a random scoreline or pretend they asked "what was the result?".'
  );
  return lines.join('\n');
}

/**
 * Classify short follow-ups so we don't re-run a full "research the match"
 * pipeline when the user is just reacting (opinion / agreement).
 *
 * @returns {{
 *   kind: 'none'|'opinion'|'clarification'|'topic_continue',
 *   priorUser: string,
 *   priorAi: string,
 * }}
 */
export function classifyFollowUp(userId, currentQuestion) {
  const q = String(currentQuestion || '').trim();
  const turns = getMemoryTurns(userId);
  const empty = { kind: 'none', priorUser: '', priorAi: '' };
  if (!turns.length || !q) return empty;

  const priorUsers = turns.filter((t) => t.role === 'user');
  const priorUser = priorUsers[priorUsers.length - 1]?.text || '';
  const priorAi = [...turns].reverse().find((t) => t.role === 'assistant')?.text || '';
  if (!priorUser && !priorAi) return empty;

  // Pure opinion / reaction — NOT a new research question
  const opinionRe =
    /^(i think|i feel|i believe|imo|imho|tbh|honestly|that('?s| is| was)? (so )?(unfair|fair|harsh|soft|wrong|right|crazy|ridiculous|correct|stupid|bad|good)|yeah|yep|yup|nah|no way|exactly|agree|disagree|true|false|lol|lmao|haha|wow|omg|same|facts|cap)\b/i;
  const shortOpinion =
    q.length <= 100 &&
    (opinionRe.test(q) ||
      /\b(unfair|fair|harsh|soft|deserved|didn'?t deserve|too much|too soft|ref(eree)? (was|is)|robbery|joke)\b/i.test(
        q
      ));

  if (shortOpinion) {
    return { kind: 'opinion', priorUser, priorAi };
  }

  // Clarification / more detail on same topic
  const clarificationRe =
    /\b(why|how|when|who|what about|more|details?|explain|really|sure|proof|source|which|was it|did he|did she)\b/i;
  if (
    (q.length < 120 && clarificationRe.test(q)) ||
    /\b(it|that|this|they|he|she|them|the match|the game|the coach|same|earlier|before|ago|yesterday|previously|continue)\b/i.test(
      q
    )
  ) {
    return { kind: 'clarification', priorUser, priorAi };
  }

  if (q.length < 60) {
    return { kind: 'topic_continue', priorUser, priorAi };
  }

  return empty;
}

/**
 * Build a search-friendly expansion of a short follow-up using memory.
 * e.g. "it happened some days ago" + prior "egypt coach yellow card..." → combined query.
 * For pure opinions, do NOT expand into a new research query (keeps chat natural).
 */
export function expandFollowUpWithMemory(userId, currentQuestion) {
  const q = String(currentQuestion || '').trim();
  const turns = getMemoryTurns(userId);
  if (!turns.length || !q) return q;

  const kind = classifyFollowUp(userId, q).kind;
  // Opinions stay as-is for the "user said" line; research uses prior topic separately
  if (kind === 'opinion') return q;

  const isFollowUp =
    kind !== 'none' ||
    q.length < 80 ||
    /\b(it|that|this|they|he|she|them|the match|the game|the coach|same|earlier|before|ago|yesterday|previously|as i (said|asked)|continue)\b/i.test(
      q
    );

  if (!isFollowUp) return q;

  const priorUsers = turns.filter((t) => t.role === 'user');
  const lastUser = priorUsers[priorUsers.length - 1]?.text || '';
  const lastAi = [...turns].reverse().find((t) => t.role === 'assistant')?.text || '';

  if (!lastUser && !lastAi) return q;

  const bits = [];
  if (lastUser) bits.push(lastUser.slice(0, 160));
  // Prefer prior user topic for search; keep AI snippet shorter
  if (kind === 'clarification' && lastAi) bits.push(lastAi.slice(0, 100));
  bits.push(q);
  return bits.join(' — ').slice(0, 280);
}

/** Topic string for research when user only sends an opinion reaction. */
export function getPriorTopicForResearch(userId) {
  const turns = getMemoryTurns(userId);
  if (!turns.length) return '';
  const priorUsers = turns.filter((t) => t.role === 'user');
  // Prefer last non-opinion user message
  for (let i = priorUsers.length - 1; i >= 0; i--) {
    const t = priorUsers[i].text;
    const kind = classifyFollowUp(userId, t).kind;
    // classify on a message that is already in memory may mis-detect; use length/heuristics
    if (t.length > 25 || /\b(why|card|coach|score|match|who|predict|injury)\b/i.test(t)) {
      return t;
    }
  }
  return priorUsers[priorUsers.length - 1]?.text || '';
}

/** Clear one user's memory (optional manual wipe). */
export function clearMemory(userId) {
  store.delete(String(userId || '').trim());
}

/** Purge expired threads. Returns number removed. */
export function purgeExpired() {
  const now = Date.now();
  let removed = 0;
  for (const [id, entry] of store) {
    if (now - entry.updatedAt > TTL_MS) {
      store.delete(id);
      removed += 1;
      continue;
    }
    const cutoff = now - MAX_AGE_MS;
    entry.turns = (entry.turns || []).filter((t) => t.ts >= cutoff);
    if (!entry.turns.length) {
      store.delete(id);
      removed += 1;
    }
  }
  return removed;
}

export function getMemoryStats() {
  ensureSweeper();
  let turns = 0;
  for (const entry of store.values()) turns += entry.turns?.length || 0;
  return {
    users: store.size,
    turns,
    ttlMs: TTL_MS,
    maxAgeMs: MAX_AGE_MS,
    maxTurns: MAX_TURNS,
    cleanEveryMs: CLEAN_EVERY_MS,
  };
}

// Start sweeper on module load
ensureSweeper();
