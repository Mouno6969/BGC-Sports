// ---------------------------------------------------------------------------
// Query pipeline helpers for BGC AI:
//   1) Prompt Creator AI — structured brief + search queries (FAST, hard timeout)
//   2) Thinking / Verifier AI — fact-check LIVE vs FINISHED (FAST, hard timeout)
// Both fall back to heuristics so chat never hangs on "Understanding…"
// ---------------------------------------------------------------------------

import { queryAIFast, withTimeout } from './aiProvider.js';

const PROMPT_CREATOR_BUDGET_MS = 7000;
const VERIFIER_BUDGET_MS = 8000;

// ---------------------------------------------------------------------------
// Web-search gate — only hit Serper/Tavily/SearchSpace when the question
// actually needs external web knowledge. Live scores / board Qs skip search.
// Past incidents (cards, coaches, “why…”) ALWAYS search.
// ---------------------------------------------------------------------------

/** Pure live-board questions (score/state only) — skip web when board has data. */
const PURE_BOARD_RE =
  /\b(live score|current score|who.?s winning|what.?s the score|correct score|predict(ed|ion)? score|final score prediction|what will (be )?the score|table|standings?|fixtures?|upcoming|kick.?off time)\b/i;

/** Strong signals that the live board alone is NOT enough. */
const WEB_REQUIRED_RE =
  /\b(news|headline|headlines|rumour|rumor|injury|injured|suspended|suspension|transfer|sacked|fired|coach|manager|why\b|what happened|how come|controversy|red card|yellow card|sent off|sending.?off|booking|booked|dissent|VAR|referee|weather|tickets?|odds|betting|bookmaker|history|historical|all.?time|record against|h2h|career|ballon|award|salary|net worth|explain|background|breaking|days? ago|yesterday|last (match|game|night)|earlier|previous)\b/i;

/** Match-incident / disciplinary — always need web (or detailed summary APIs). */
const INCIDENT_RE =
  /\b(yellow card|red card|booking|booked|sent off|sending.?off|coach|manager|referee|VAR|dissent|protest|touchline|bench|dismissed|ban)\b/i;

/**
 * Decide if web search is needed from the user question (+ optional plan/board).
 *
 * Priority:
 *  1) Incident / news / why → ALWAYS search (plan cannot force skip)
 *  2) Pure live score with board coverage → skip search
 *  3) Otherwise search for sports research
 *
 * @param {string} userQuestion
 * @param {{ intent?: string, needsNews?: boolean, needsWebSearch?: boolean, searchQueries?: string[] } | null} plan
 * @param {{ verifiedBoard?: Array, liveCount?: number } | null} context
 * @returns {{ needed: boolean, reason: string, queries: string[] }}
 */
export function decideWebSearch(userQuestion, plan = null, context = null) {
  const q = String(userQuestion || '').trim();
  const year = Math.max(new Date().getFullYear(), 2026);
  const board = context?.verifiedBoard || [];
  const hasLive = board.some((m) => m.status === 'LIVE') || (context?.liveCount || 0) > 0;
  const hasBoard = board.length > 0;
  const intent = plan?.intent || '';

  // Pure board first — never open web just for scores/standings/prediction
  const pureBoard =
    PURE_BOARD_RE.test(q) ||
    intent === 'live_score' ||
    intent === 'prediction' ||
    intent === 'standings' ||
    plan?.needsLiveScores === true && !WEB_REQUIRED_RE.test(q) && !INCIDENT_RE.test(q);

  if (pureBoard && !WEB_REQUIRED_RE.test(q) && !INCIDENT_RE.test(q) && intent !== 'news') {
    if (hasBoard || plan?.needsLiveScores) {
      return {
        needed: false,
        reason: hasLive ? 'live_board_covers_question' : 'verified_board_or_score_question_no_web',
        queries: [],
      };
    }
  }

  // Hard web-required: incidents, coaches, cards, why/how, news — NEVER skip
  if (WEB_REQUIRED_RE.test(q) || INCIDENT_RE.test(q) || intent === 'news') {
    return {
      needed: true,
      reason: 'incident_or_news_or_why_requires_web',
      queries: buildWebQueries(q, plan, year, board),
    };
  }

  // Plan asked for web (not for pure board score Qs)
  if (plan?.needsNews === true || plan?.needsWebSearch === true) {
    return {
      needed: true,
      reason: 'plan_requested_web',
      queries: buildWebQueries(q, plan, year, board),
    };
  }

  // 4) Score-like but empty board → search
  if (pureBoard && !hasBoard) {
    return {
      needed: true,
      reason: 'board_empty_need_external_scores',
      queries: buildWebQueries(q, plan, year, board),
    };
  }

  // 5) Short chit-chat / thanks / one-word replies → no web
  if (
    q.length < 24 ||
    /^(hi|hello|hey|thanks|thank you|ok|okay|cool|nice|lol|yes|no)\b/i.test(q)
  ) {
    return {
      needed: false,
      reason: 'short_or_chat_skip_web',
      queries: [],
    };
  }

  // 6) Substantive sports research (not pure board) → search
  if (
    q.length >= 24 &&
    /\b(world cup|fifa|match|team|player|goal|coach|manager|tournament|group|final|semi|vs\.?|versus)\b/i.test(
      q
    )
  ) {
    return {
      needed: true,
      reason: 'general_sports_research',
      queries: buildWebQueries(q, plan, year, board),
    };
  }

  return {
    needed: false,
    reason: 'default_skip_web_no_tool_needed',
    queries: [],
  };
}

/**
 * Build better search queries: include World Cup year, team pair if found on board,
 * and incident keywords.
 */
function buildWebQueries(question, plan, year, board = []) {
  const fromPlan = Array.isArray(plan?.searchQueries)
    ? plan.searchQueries.map(String).filter(Boolean)
    : [];
  const q = String(question || '').trim();
  const queries = [];

  // Prefer plan queries if they look specific enough
  for (const pq of fromPlan) {
    if (pq && pq.length > 8) queries.push(pq.slice(0, 140));
  }

  // Extract team names present both in question and board
  const teamsInQ = [];
  for (const m of board) {
    for (const name of [m.home, m.away]) {
      if (!name || /winner|loser|tbd|quarterfinal|semifinal/i.test(name)) continue;
      if (new RegExp(escapeReg(name.split(' ')[0]), 'i').test(q) || new RegExp(escapeReg(name), 'i').test(q)) {
        if (!teamsInQ.includes(name)) teamsInQ.push(name);
      }
    }
  }
  // Common short names
  for (const t of ['Egypt', 'Argentina', 'Spain', 'Belgium', 'France', 'England', 'Norway', 'Brazil', 'Germany', 'Morocco', 'Switzerland', 'Mexico', 'USA', 'United States']) {
    if (new RegExp(`\\b${t}\\b`, 'i').test(q) && !teamsInQ.some((x) => new RegExp(t, 'i').test(x))) {
      teamsInQ.push(t);
    }
  }

  // If only Egypt mentioned with coach/card, pair with Argentina from board if that KO match exists
  if (
    teamsInQ.length === 1 &&
    /egypt/i.test(teamsInQ[0]) &&
    /\b(coach|yellow|red|card|manager)\b/i.test(q)
  ) {
    const argEgy = (board || []).find(
      (m) =>
        /egypt/i.test(`${m.home} ${m.away}`) &&
        /argentina/i.test(`${m.home} ${m.away}`) &&
        m.status === 'FINISHED'
    );
    if (argEgy) {
      teamsInQ.push(/egypt/i.test(argEgy.home) ? argEgy.away : argEgy.home);
    } else if (!teamsInQ.includes('Argentina')) {
      teamsInQ.push('Argentina');
    }
  }

  const isCardCoach = /\b(yellow|red|card|coach|manager|booking)\b/i.test(q);

  if (teamsInQ.length >= 2) {
    if (isCardCoach) {
      queries.push(
        `${teamsInQ[0]} vs ${teamsInQ[1]} FIFA World Cup ${year} yellow card coach`.slice(0, 140)
      );
      queries.push(
        `${teamsInQ[0]} ${teamsInQ[1]} World Cup ${year} coach yellow card reason`.slice(0, 140)
      );
    } else {
      queries.push(`${teamsInQ[0]} vs ${teamsInQ[1]} FIFA World Cup ${year}`.slice(0, 140));
    }
  } else if (teamsInQ.length === 1) {
    if (isCardCoach) {
      queries.push(
        `${teamsInQ[0]} coach yellow card FIFA World Cup ${year} reason`.slice(0, 140)
      );
    }
    queries.push(`${teamsInQ[0]} FIFA World Cup ${year} ${q.slice(0, 60)}`.slice(0, 140));
  }

  // Direct restatement with year (no hard-coded coach names)
  queries.push(`${q} FIFA World Cup ${year}`.slice(0, 140));
  if (isCardCoach && /egypt/i.test(q)) {
    queries.push(`Egypt Hossam Hassan yellow card Argentina World Cup ${year}`.slice(0, 140));
  }

  // Deduplicate, keep 2–3
  const seen = new Set();
  const out = [];
  for (const item of queries) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 3) break;
  }
  return out;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Use a fast LLM call to rewrite the user question into a structured plan.
 * Hard-capped so UI never sits on "Understanding your question" for minutes.
 */
export async function createPromptPlan(userQuestion, verifiedSummary = '') {
  const fallback = heuristicPlan(userQuestion);
  const summary = String(verifiedSummary || '').slice(0, 1200);

  const system = `You are a sports-query planner for a FIFA World Cup chat bot.
Decide INTENT first, then which tools are needed. Prefer FEWER tools.

Return ONLY valid JSON (no markdown):
{
  "intent": "live_score|prediction|standings|news|general|chat",
  "needsLiveScores": true/false,
  "needsStandings": true/false,
  "needsNews": true/false,
  "needsWebSearch": true/false,
  "searchQueries": ["max 2 short queries only if needsWebSearch is true, else []"],
  "analysisBrief": "one sentence: what to answer",
  "teams": ["teams mentioned"],
  "answerFocus": "what user wants"
}

TOOL RULES (strict):
- needsLiveScores=true ONLY if user asks about live/current score, who is winning, match status right now, fixtures, or score prediction.
- needsLiveScores=false for: opinions, why/card/coach questions, history, general chat, greetings, "was it unfair", tactics discussion without asking for score.
- needsWebSearch=true for: yellow/red cards, coach incidents, why/how, news, injuries, controversies, past match details not on the board.
- needsWebSearch=false for: pure live score, pure standings, pure score prediction, short chat/opinion.
- Do NOT enable live scores just because the topic is football — only when the USER wants scores.
- Intent "chat" for greetings/thanks/short reactions with no sports research needed.
If "correct score" + LIVE match: intent=prediction, needsLiveScores=true, needsWebSearch=false.`;

  const user = `User question: ${userQuestion}

Optional prior board snapshot (may be empty — plan tools from the QUESTION first):
${summary || '(none — plan without assuming scores are needed)'}

JSON only.`;

  const work = (async () => {
    try {
      const result = await queryAIFast(system, user, {
        timeoutMs: 5500,
        maxProviders: 2,
        maxTokens: 350,
        temperature: 0.1,
      });
      const parsed = parseJsonObject(result.response);
      if (!parsed) {
        return { ...fallback, provider: result.provider || null, usedModel: false, timedOut: false };
      }
      return {
        intent: String(parsed.intent || fallback.intent),
        needsLiveScores:
          parsed.needsLiveScores != null ? Boolean(parsed.needsLiveScores) : fallback.needsLiveScores,
        needsStandings:
          parsed.needsStandings != null ? Boolean(parsed.needsStandings) : fallback.needsStandings,
        needsNews: parsed.needsNews != null ? Boolean(parsed.needsNews) : fallback.needsNews,
        needsWebSearch:
          parsed.needsWebSearch != null ? Boolean(parsed.needsWebSearch) : fallback.needsWebSearch,
        searchQueries: Array.isArray(parsed.searchQueries)
          ? parsed.searchQueries.map(String).filter(Boolean).slice(0, 3)
          : fallback.searchQueries,
        analysisBrief: String(parsed.analysisBrief || fallback.analysisBrief).slice(0, 400),
        teams: Array.isArray(parsed.teams)
          ? parsed.teams.map(String).filter(Boolean).slice(0, 6)
          : fallback.teams,
        answerFocus: String(parsed.answerFocus || fallback.answerFocus).slice(0, 200),
        provider: result.provider || null,
        usedModel: true,
        timedOut: false,
      };
    } catch (err) {
      console.warn('[prompt-creator] failed:', err.message);
      return { ...fallback, usedModel: false, timedOut: false };
    }
  })();

  const result = await withTimeout(work, PROMPT_CREATOR_BUDGET_MS, {
    ...fallback,
    usedModel: false,
    timedOut: true,
  });

  if (result.timedOut) {
    console.warn('[prompt-creator] budget exceeded — using heuristic plan');
  }
  return result;
}

function heuristicPlan(question) {
  const q = String(question || '');
  const year = Math.max(new Date().getFullYear(), 2026);

  // Pure chat / opinion / short chit-chat — no board, no web
  const isChatty =
    /^(hi|hello|hey|thanks|thank you|ok|okay|cool|nice|lol|haha|yes|no|yep|nope|good|great|unfair|agree|disagree)\b/i.test(
      q.trim()
    ) ||
    (q.trim().length < 12 && !/\b(score|live|match|vs|cup|team|player|card|coach)\b/i.test(q));

  // Live board ONLY when user clearly wants scores / live state / prediction
  const needsLive =
    !isChatty &&
    /\b(live\s*score|current\s*score|what.?s the score|who.?s winning|who is winning|score now|match status|minute|second half|first half|kick.?off|fixture|fixtures|upcoming match|happening now|in progress|correct score)\b/i.test(
      q
    );
  const needsStandings =
    !isChatty && /\b(table|standing|group\s*[a-l]\b|bracket|qualify|qualification)\b/i.test(q);
  const needsNews =
    !isChatty &&
    /\b(news|latest|update|headline|rumour|rumor|injury|transfer|sacked)\b/i.test(q);
  const isPrediction =
    !isChatty &&
    /\b(predict|prediction|correct score|will win|who wins|final score|what will the score|who will win)\b/i.test(
      q
    );
  const isIncident =
    !isChatty &&
    /\b(why|yellow card|red card|coach|manager|booking|booked|sent off|referee|var|dissent|protest|what happened)\b/i.test(
      q
    );

  const intent = isChatty
    ? 'general'
    : isPrediction
      ? 'prediction'
      : isIncident
        ? 'news'
        : needsLive
          ? 'live_score'
          : needsStandings
            ? 'standings'
            : needsNews
              ? 'news'
              : 'general';

  // Heuristic web gate — only when research is actually needed
  const gate = decideWebSearch(
    q,
    {
      intent,
      needsNews: needsNews || isIncident,
      needsWebSearch: isIncident || needsNews || (!isChatty && !needsLive && !isPrediction && !needsStandings && q.length >= 24),
    },
    null
  );

  const searchQueries = gate.needed
    ? gate.queries.length
      ? gate.queries
      : [`${q} FIFA World Cup ${year}`.slice(0, 100)]
    : [];

  return {
    intent,
    // Scores only when the user asked for them (or a score prediction)
    needsLiveScores: needsLive || isPrediction,
    needsStandings,
    needsNews: needsNews || isIncident,
    needsWebSearch: gate.needed,
    searchQueries: searchQueries.slice(0, 2),
    analysisBrief: isChatty
      ? 'Respond naturally to the user; do not force live scores.'
      : isPrediction
        ? 'If a relevant match is LIVE report score+clock, then predicted FT. Never invent full-time for LIVE games.'
        : isIncident
          ? 'Explain the incident using evidence; do not pivot to unrelated live scores.'
          : needsLive
            ? 'Report verified LIVE/FINISHED/UPCOMING status only.'
            : 'Answer the user question directly; only mention scores if they asked or it is essential.',
    teams: [],
    answerFocus: q.slice(0, 200),
  };
}

/**
 * Verifier / thinking step — hard time budget; falls back to localLiveGuard.
 */
export async function verifyAnswerWithThinking({
  userQuestion,
  draftAnswer,
  verifiedFactsBlock,
  plan,
}) {
  if (!draftAnswer) {
    return { answer: draftAnswer, verified: false, corrected: false, notes: 'empty draft' };
  }

  // Always run local guard first (instant)
  const pre = localLiveGuard(draftAnswer, verifiedFactsBlock);
  let draft = pre.text;

  const system = `You are a strict sports fact-checker.
VERIFIED MATCH BOARD is ground truth.
If a match is LIVE, the answer must NOT say ended/finished/full time.
Return ONLY JSON: {"ok":true/false,"issues":[],"correctedAnswer":"..."}
Keep answer short. Never mention verification or tools.`;

  const user = `QUESTION: ${userQuestion}
BRIEF: ${plan?.analysisBrief || ''}

VERIFIED BOARD:
${String(verifiedFactsBlock || '').slice(0, 2000)}

DRAFT:
${draft}

JSON only.`;

  const work = (async () => {
    try {
      const result = await queryAIFast(system, user, {
        timeoutMs: 6000,
        maxProviders: 2,
        maxTokens: 450,
        temperature: 0.1,
      });
      const parsed = parseJsonObject(result.response);
      if (!parsed?.correctedAnswer) {
        return {
          answer: draft,
          verified: false,
          corrected: pre.changed,
          notes: 'verifier parse failed',
          provider: result.provider,
          issues: pre.issues,
        };
      }
      let answer = String(parsed.correctedAnswer).trim();
      const local = localLiveGuard(answer, verifiedFactsBlock);
      answer = local.text;
      return {
        answer,
        verified: true,
        corrected: Boolean(
          parsed.ok === false || (parsed.issues || []).length || pre.changed || local.changed
        ),
        notes: Array.isArray(parsed.issues) ? parsed.issues.join('; ') : '',
        issues: [...(parsed.issues || []), ...local.issues],
        provider: result.provider,
      };
    } catch (err) {
      console.warn('[thinking-verifier] failed:', err.message);
      return {
        answer: draft,
        verified: false,
        corrected: pre.changed,
        notes: err.message,
        issues: pre.issues,
      };
    }
  })();

  const out = await withTimeout(work, VERIFIER_BUDGET_MS, {
    answer: draft,
    verified: false,
    corrected: pre.changed,
    notes: 'verifier budget exceeded',
    issues: pre.issues,
    timedOut: true,
  });

  if (out.timedOut) {
    console.warn('[thinking-verifier] budget exceeded — using local guard only');
  }
  return out;
}

/**
 * Deterministic safety net for LIVE matches mislabeled as finished.
 */
export function localLiveGuard(draft, verifiedFactsBlock) {
  const issues = [];
  let text = String(draft || '');
  const board = String(verifiedFactsBlock || '');
  if (!text || !board) return { text, changed: false, issues };

  const liveRe =
    /LIVE\s*\|\s*([^|\n]+?)\s+(\d+)\s*[-–]\s*(\d+)\s+([^|\n]+?)\s*\|([^|\n]*)/gi;
  const liveMatches = [];
  let m;
  while ((m = liveRe.exec(board)) !== null) {
    liveMatches.push({
      home: m[1].trim(),
      homeScore: m[2],
      awayScore: m[3],
      away: m[4].trim(),
      clock: (m[5] || '').trim(),
    });
  }

  if (!liveMatches.length) return { text, changed: false, issues };

  let changed = false;
  for (const lm of liveMatches) {
    const mentionsBoth =
      new RegExp(escapeReg(lm.home), 'i').test(text) &&
      new RegExp(escapeReg(lm.away), 'i').test(text);
    if (!mentionsBoth) continue;

    const falseFinal =
      /\b(ended|ending|finished|finishing|full[-\s]?time|final score|full time|concluded|result was|drew\b|draw that|has just witnessed|we'?ve just witnessed)\b/i.test(
        text
      );

    if (falseFinal) {
      issues.push(
        `${lm.home} vs ${lm.away} is still LIVE (${lm.homeScore}-${lm.awayScore}${lm.clock ? ' ' + lm.clock : ''}) but draft treated it as finished`
      );
      const fix = `*LIVE NOW:* ${lm.home} ${lm.homeScore}-${lm.awayScore} ${lm.away}${lm.clock ? ` (${lm.clock})` : ''} — the match is still in progress, not finished.`;
      text = text
        .replace(/\b(ended|ending) in a\b/gi, 'currently standing at a')
        // Avoid turning "not finished" → "not current score"
        .replace(/\b(?<!not\s)(finished|full time|final score was)\b/gi, 'still level on the scoreboard as')
        .replace(/\bwe'?ve just witnessed\b/gi, 'we are watching')
        .replace(/\bhas just witnessed\b/gi, 'is watching')
        .replace(/not still level on the scoreboard as/gi, 'not finished');
      if (!/\bLIVE NOW\b/i.test(text)) {
        text = `${fix}\n\n${text}`;
      }
      changed = true;
    }
  }

  return { text, changed, issues };
}

function parseJsonObject(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Format board for the LLM. Optionally pass a query so mentioned-team matches
 * (including finished games) are always included, not truncated away.
 */
export function formatVerifiedBoard(verifiedBoard = [], query = '') {
  if (!verifiedBoard?.length) return '';
  const lines = ['STATUS | MATCH | CLOCK/DETAIL | STAGE | SOURCE'];
  const q = String(query || '').toLowerCase();

  const live = verifiedBoard.filter((m) => m.status === 'LIVE');
  const finished = verifiedBoard.filter((m) => m.status === 'FINISHED');
  const upcoming = verifiedBoard.filter((m) => m.status === 'UPCOMING');

  // Matches that mention teams/words from the user question (critical for past games)
  const relevant = q
    ? verifiedBoard.filter((m) => {
        const blob = `${m.home || ''} ${m.away || ''} ${m.stage || ''}`.toLowerCase();
        // token overlap on team names ≥ 4 chars
        const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
        return tokens.some((t) => blob.includes(t));
      })
    : [];

  const picked = [];
  const seen = new Set();
  const push = (m) => {
    if (!m) return;
    const key = m.id || `${m.home}|${m.away}|${m.timestamp}`;
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(m);
  };

  live.forEach(push);
  relevant.forEach(push);
  // Recent finished (not only upcoming) so past WC games stay visible
  finished.slice(0, 10).forEach(push);
  upcoming.slice(0, 8).forEach(push);

  for (const m of picked.slice(0, 28)) {
    const status = m.status || 'UNKNOWN';
    const score =
      m.homeScore != null && m.awayScore != null
        ? `${m.homeScore}-${m.awayScore}`
        : 'vs';
    const clock = m.progress || m.statusDetail || '';
    lines.push(
      `${status} | ${m.home} ${score} ${m.away} | ${clock} | ${m.stage || ''} | ${m.source || ''}`
    );
  }
  lines.push('');
  lines.push(
    'RULE: If STATUS is LIVE, the match has NOT ended. Do not say finished, full time, or final result.'
  );
  lines.push(
    'RULE: If STATUS is FINISHED, you may report the final score. If UPCOMING, do not invent a score.'
  );
  lines.push(
    'RULE: The board may not include cards/coach incidents. For those details, use CURRENT CONTEXT / web reports when provided. Never claim "no information" if web context has relevant reports.'
  );
  return lines.join('\n');
}
