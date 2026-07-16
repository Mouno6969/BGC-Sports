// ---------------------------------------------------------------------------
// BGC AI Agent — World Cup analyst with verified live data + multi-step pipeline.
//
// Pipeline:
//   1. Language prep (translate user → English when needed)
//   2. Collect VERIFIED scores (scores API / ESPN) + sports context
//   3. Prompt-creator AI → structured brief + search queries
//   4. Multi-provider web search with those queries
//   5. Answer AI (grounded on verified board + search)
//   6. Thinking / verifier AI fact-checks LIVE vs FINISHED claims
//   7. Localize reply back to user language
// ---------------------------------------------------------------------------

import { queryAI, queryVisionAI, withTimeout } from './aiProvider.js';
import { collectContextForQuery } from './sportsDataCollector.js';
import {
  webSearch,
  formatSearchContext,
  extractEvidenceFacts,
  looksLikeEvidenceRefusal,
  looksLikeWeakIncidentAnswer,
  answerFromEvidence,
} from './webSearch.js';
import { prepareUserMessage, localizeReply } from './translator.js';
import {
  createPromptPlan,
  decideWebSearch,
  verifyAnswerWithThinking,
  formatVerifiedBoard,
  localLiveGuard,
} from './queryPipeline.js';
import {
  appendMemory,
  formatMemoryForPrompt,
  expandFollowUpWithMemory,
  classifyFollowUp,
  getPriorTopicForResearch,
  getMemoryStats,
} from './conversationMemory.js';

/** Whole pipeline hard cap so chat never spins forever */
const PIPELINE_BUDGET_MS = 45000;

function buildVisionSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are BGC Sports AI — a football analyst that can also see images users share in chat.

Today's date (UTC): ${today}.

When an image is provided:
- Describe sports-relevant content (scoreboards, lineups, jersey numbers, stats screens, tables, tickets, stadiums, memes about football).
- If it shows a live scoreboard or TV graphic, read scores/times carefully and say what you see.
- If the image is unrelated to sports, still answer helpfully but briefly.
- Prefer reading text in the image accurately over guessing.
- Do not invent match scores that are not visible unless the user also provided verified board context below.
- Keep answers concise (chat-friendly, 2-4 short paragraphs max).
- Never mention API providers, vision models, or that you "analyzed an upload via tools".`;
}

const BGC_MENTION_REGEX = /@bgc\b/i;
const MAX_RESPONSE_LENGTH = 900;

const userCooldowns = new Map();
const COOLDOWN_MS = 8000;

function buildSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  return `You are BGC Sports AI — an expert football/soccer analyst in the BGC Sports live chat during FIFA World Cup 2026.

YOUR IDENTITY:
- Name: BGC AI
- Role: Expert sports analyst with access to a VERIFIED live match board
- Personality: Knowledgeable, precise, concise, engaging
- Today's real-world date (UTC) is ${today}. Current timestamp: ${now}.

AUTHORITATIVE DATA:
- The block marked "VERIFIED MATCH BOARD" is ground truth from official sports feeds
- LIVE means the match is still being played — NEVER say it ended, finished, or "full time"
- FINISHED means the final score is official
- UPCOMING means kickoff has not happened — do not invent a score
- Web snippets can be wrong or delayed. Prefer the VERIFIED MATCH BOARD when they conflict

CRITICAL TRUTH RULES:
- NEVER invent live scores, fixtures, standings, injuries, or news from memory
- If a match is LIVE at 1-1 in the 80th minute, say it is *currently* 1-1 LIVE — not that it "ended 1-1"
- For past-match questions (cards, coaches, "why…"), use CURRENT CONTEXT / web reports AND any FINISHED board rows
- NEVER say "no information available" or "there is no match" if the board shows a FINISHED game between those teams OR web context discusses it
- If board has FINISHED Argentina 3-2 Egypt but not the yellow-card reason, state the result then explain the incident from web context
- If context is still insufficient after board + web, say what is known and what is unclear — do not invent
- Prefer official board for score/status; prefer web reports for cards, coaches, and "why" incidents

ABSOLUTE PRESENTATION RULES:
- NEVER mention web search, tools, APIs, providers, prompt engineering, or verification steps
- NEVER say "according to my search" or "based on the data provided"
- Answer as a knowledgeable analyst who already knows the current situation

RESPONSE RULES:
- Keep responses CONCISE (max 3-4 short paragraphs)
- For live matches lead with: "LIVE: Team A 1-0 Team B (65')"
- For finished matches: "FT: Team A 2-1 Team B"
- For predictions, state assumptions and current form without inventing scores
- Use *bold* sparingly for key scores/status
- No markdown headers (#)
- Max 1-2 emojis
- Do not repeat the user's question
- Use RECENT CONVERSATION memory for follow-ups (pronouns, "that match", "the coach", "some days ago")
- CONVERSATION / OPINION FOLLOW-UPS (critical):
  * If the user says "I think it was unfair", "harsh", "agree", "lol", etc., they are REACTING to your last answer
  * Engage their opinion: acknowledge + argue for/against with football logic about the SAME incident
  * Do NOT restate only the final score as if they asked "what was the result?"
  * Do NOT restart a full match report — continue the chat naturally
- Respond in English here (localization happens separately)`;
}

function buildOpinionSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are BGC Sports AI in a live chat. Today (UTC): ${today}.

The user is continuing a conversation with an opinion or reaction — NOT asking a brand-new research question.

You MUST:
1. Read RECENT CONVERSATION carefully (what they asked before and what you answered)
2. Respond to THEIR opinion (fair/unfair/harsh/agree/etc.) about that same topic
3. Give a short, natural take — e.g. whether the yellow card looked justified
4. Optionally add 1–2 football-reason points (dissent rules, protesting officials, anti-racism gesture context) if relevant
5. Keep it chatty and concise (2–4 short sentences or 1 short paragraph)

You MUST NOT:
- Answer as if they asked for the final score only
- Ignore their opinion and dump match stats
- Say "no information" or invent new incidents
- Mention tools, memory systems, or APIs`;
}

function scrubMetaMentions(text) {
  if (!text) return text;
  let out = String(text);
  const patterns = [
    /\b(according to|based on|from|via|using)\s+(my\s+)?(live\s+)?(web\s+)?search(es|ing| results?)?\b[,:]?\s*/gi,
    /\b(I|we)\s+(just\s+)?(searched|looked up|found online|checked online|verified|fact[- ]?checked)\b[,:]?\s*/gi,
    /\b(Serper(\.dev)?|Tavily|SearchSpace|Google Search|Bing|ESPN API)\b/gi,
    /\b(as per|from)\s+(the\s+)?(latest\s+)?(web\s+)?(search\s+)?results?\b[,:]?\s*/gi,
    /\b(after|while)\s+searching\s+(the\s+)?web\b[,:]?\s*/gi,
    /\b(online sources?|web sources?|search engines?|prompt creator|verifier)\b/gi,
  ];
  for (const re of patterns) out = out.replace(re, '');
  // Drop board-status chrome that sometimes leaks into chat copy
  out = out
    .replace(/\*{0,2}FINISHED\*{0,2}\s+/gi, '')
    .replace(/\bduring the\s+(FINISHED|LIVE)\s+/gi, 'during the ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
  return out;
}

export function isBgcMention(text) {
  return BGC_MENTION_REGEX.test(text);
}

function extractQuestion(text) {
  return text.replace(BGC_MENTION_REGEX, '').trim();
}

function checkCooldown(userId) {
  const lastQuery = userCooldowns.get(userId);
  if (lastQuery && Date.now() - lastQuery < COOLDOWN_MS) {
    const rem = Math.ceil((COOLDOWN_MS - (Date.now() - lastQuery)) / 1000);
    return { allowed: false, remaining: rem };
  }
  userCooldowns.set(userId, Date.now());
  return { allowed: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of userCooldowns) {
    if (now - ts > COOLDOWN_MS * 10) userCooldowns.delete(key);
  }
}, 60000);

function buildContextString(data, query = '') {
  const parts = [];

  // ── ALWAYS first: verified board (prevents false "ended" claims)
  const verified = formatVerifiedBoard(data.verifiedBoard || [], query);
  if (verified) {
    parts.push('=== VERIFIED MATCH BOARD (GROUND TRUTH FOR SCORES/STATUS) ===');
    parts.push(verified);
  }

  const liveFromBoard = (data.verifiedBoard || []).filter((m) => m.status === 'LIVE');
  if (liveFromBoard.length) {
    parts.push('\n=== LIVE RIGHT NOW (do NOT call these finished) ===');
    for (const m of liveFromBoard) {
      parts.push(
        `LIVE | ${m.home} ${m.homeScore ?? '?'} - ${m.awayScore ?? '?'} ${m.away} | ${m.progress || m.statusDetail || 'in progress'} | ${m.stage || ''} | ${m.venue || ''}`
      );
    }
  }

  if (data.liveMatches?.length > 0) {
    parts.push('\n=== LIVESCORE FEED (secondary) ===');
    for (const m of data.liveMatches) {
      parts.push(
        `${m.home} ${m.homeScore} - ${m.awayScore} ${m.away} (${m.progress || 'LIVE'}) | ${m.venue || 'N/A'}`
      );
    }
  }

  if (data.espnScoreboard?.length > 0) {
    parts.push('\n=== ESPN SCOREBOARD (normalized) ===');
    for (const m of data.espnScoreboard.slice(0, 24)) {
      const code = m.statusCode || m.status;
      const hs = m.home?.score;
      const as = m.away?.score;
      const score =
        hs != null && as != null ? `${hs}-${as}` : 'vs';
      parts.push(
        `${code} | ${m.home?.name} ${score} ${m.away?.name} | ${m.clock || m.statusDetail || ''} | ${m.stage || m.status || ''}`
      );
    }
  }

  if (data.recentResults?.length > 0) {
    parts.push('\n=== RECENT FINISHED RESULTS (not live) ===');
    for (const m of data.recentResults.slice(0, 8)) {
      parts.push(
        `FINISHED | ${m.home} ${m.homeScore} - ${m.awayScore} ${m.away} | ${m.date} | Round ${m.round || '?'}`
      );
    }
  }

  if (data.upcomingFixtures?.length > 0) {
    parts.push('\n=== UPCOMING FIXTURES ===');
    for (const m of data.upcomingFixtures.slice(0, 8)) {
      parts.push(
        `UPCOMING | ${m.home} vs ${m.away} | ${m.date} ${m.time || ''} | ${m.venue || 'TBD'}`
      );
    }
  }

  if (data.standings?.length > 0) {
    parts.push('\n=== STANDINGS ===');
    const groups = {};
    for (const entry of data.standings) {
      const g = entry.group || 'Unknown';
      if (!groups[g]) groups[g] = [];
      groups[g].push(entry);
    }
    for (const [group, teams] of Object.entries(groups)) {
      parts.push(`Group ${group}:`);
      for (const t of teams) {
        parts.push(
          `  ${t.team}: P${t.played} W${t.won} D${t.drawn} L${t.lost} GD${t.goalDifference} Pts${t.points}`
        );
      }
    }
  }

  if (data.teamDetails?.length > 0) {
    parts.push('\n=== TEAM DETAILS ===');
    for (const t of data.teamDetails) {
      parts.push(`${t.name} | Manager: ${t.manager || 'N/A'} | Stadium: ${t.stadium || 'N/A'}`);
      if (t.description) parts.push(`  Info: ${t.description.slice(0, 200)}`);
    }
  }

  if (data.playerDetails?.length > 0) {
    parts.push('\n=== PLAYER DETAILS ===');
    for (const p of data.playerDetails) {
      parts.push(
        `${p.name} | ${p.nationality} | ${p.team} | Position: ${p.position} | Born: ${p.dateBorn || 'N/A'}`
      );
    }
  }

  if (data.commentary?.length > 0) {
    parts.push('\n=== MATCH COMMENTARY / EVENTS ===');
    for (const matchComm of data.commentary) {
      if (!Array.isArray(matchComm)) continue;
      for (const item of matchComm.slice(0, 15)) {
        if (item.type === 'stats') {
          parts.push('Match Stats:');
          for (const team of item.data || []) {
            parts.push(`  ${team.team}:`);
            for (const stat of team.statistics || []) {
              parts.push(`    ${stat.name}: ${stat.displayValue}`);
            }
          }
        } else if (item.type === 'lineup') {
          parts.push(`Lineup - ${item.team} (${item.formation || 'N/A'})`);
        } else if (item.type === 'commentary') {
          parts.push(`  [${item.clock || '?'}] ${item.text}`);
        } else {
          parts.push(
            `  [${item.clock || '?'}] ${item.type}: ${item.text || ''} ${item.player ? `(${item.player})` : ''}`
          );
        }
      }
    }
  }

  if (data.espnNews?.length > 0) {
    parts.push('\n=== NEWS (may lag live scores — board wins on conflicts) ===');
    for (const article of data.espnNews.slice(0, 5)) {
      parts.push(`• ${article.headline}`);
      if (article.description) parts.push(`  ${article.description.slice(0, 150)}`);
    }
  }

  if (data.bbcHeadlines?.length > 0) {
    parts.push('\n=== BBC HEADLINES (secondary) ===');
    for (const h of data.bbcHeadlines.slice(0, 4)) {
      parts.push(`• ${h.title}`);
    }
  }

  return parts.join('\n');
}

/**
 * Merge multiple webSearch payloads (from prompt-creator queries).
 * Max 3 queries for incident coverage without long delays.
 */
async function multiSearch(queries) {
  const list = [...new Set((queries || []).filter(Boolean))].slice(0, 3);
  if (!list.length) {
    return {
      ok: false,
      results: [],
      answers: [],
      providers: [],
      searchedAt: new Date().toISOString(),
    };
  }

  const searchWork = Promise.all(
    list.map((q) =>
      webSearch(q).catch((err) => ({
        ok: false,
        results: [],
        answers: [],
        providers: [],
        error: err.message,
        query: q,
      }))
    )
  );

  // Never block chat more than ~10s on search
  const payloads = await withTimeout(searchWork, 10000, []);
  if (!payloads?.length) {
    return {
      ok: false,
      results: [],
      answers: [],
      providers: [],
      queries: list,
      searchedAt: new Date().toISOString(),
    };
  }

  const seen = new Set();
  const results = [];
  const answers = [];
  const providers = [];

  for (const p of payloads) {
    for (const a of p.answers || []) answers.push(a);
    for (const pr of p.providers || []) providers.push(pr);
    for (const r of p.results || []) {
      const key = (r.url || r.title || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push(r);
      if (results.length >= 14) break;
    }
  }

  return {
    ok: results.length > 0 || answers.length > 0,
    results,
    answers,
    providers,
    queries: list,
    searchedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} text
 * @param {string} userId
 * @param {string} username
 * @param {{ onPhase?: (phase: string) => void, image?: object|string, skipMemory?: boolean }} [hooks]
 */
export async function processQuery(text, userId, username, hooks = {}) {
  const onPhase = typeof hooks.onPhase === 'function' ? hooks.onPhase : () => {};
  const image = hooks.image || null;
  const hasImage = Boolean(image);
  const memoryKey = String(userId || username || 'anon');
  const useMemory = hooks.skipMemory !== true;

  const cooldown = checkCooldown(userId);
  if (!cooldown.allowed) {
    onPhase('idle');
    return {
      success: false,
      error: `Please wait ${cooldown.remaining}s before asking again.`,
    };
  }

  const question = extractQuestion(text);
  if ((!question || question.length < 2) && !hasImage) {
    onPhase('idle');
    return {
      success: true,
      response:
        "Hey! I'm BGC AI — your World Cup analyst. Ask me anything about the FIFA World Cup 2026! You can also attach a photo (scoreboard, lineup, graphic) and I'll read it.",
    };
  }

  // Snapshot memory BEFORE adding this turn (prior context only)
  const memoryBlock = useMemory ? formatMemoryForPrompt(memoryKey) : '';
  const followUp = useMemory
    ? classifyFollowUp(memoryKey, question || '')
    : { kind: 'none', priorUser: '', priorAi: '' };
  const isOpinionFollowUp = followUp.kind === 'opinion' && Boolean(memoryBlock);
  // Capture prior topic BEFORE we append this turn
  const priorTopicSnapshot =
    followUp.priorUser || (useMemory ? getPriorTopicForResearch(memoryKey) : '');
  const expandedForSearch = useMemory
    ? expandFollowUpWithMemory(memoryKey, question || '')
    : question || '';

  try {
    // ── 0) Language: detect + translate user → English when needed
    // Never show "Checking live scores" here — that phase is reserved for board fetch.
    onPhase(hasImage || isOpinionFollowUp ? 'thinking' : 'planning');
    const prepared = await prepareUserMessage(question || 'What is in this image?').catch((err) => {
      console.warn('[BGC-AI] translate-in failed:', err.message);
      return {
        original: question,
        english: question || 'What is in this image?',
        lang: 'en',
        isBanglish: false,
        translatedIn: false,
        translateProvider: 'error',
      };
    });

    // Expand follow-ups after translation too (use English form)
    const questionEnRaw = prepared.english || question || 'What is in this image?';
    // For opinions keep the raw opinion text as the "question"; research uses prior topic
    const questionEn = isOpinionFollowUp
      ? questionEnRaw
      : useMemory
        ? expandFollowUpWithMemory(memoryKey, questionEnRaw) || questionEnRaw
        : questionEnRaw;
    const userLang = prepared.lang || 'en';
    const needsReplyLocalize = userLang !== 'en' || prepared.isBanglish;

    console.log(
      `[BGC-AI] Query from ${username}: "${String(question).slice(0, 80)}" lang=${userLang} image=${hasImage} memory=${memoryBlock ? 'yes' : 'no'} followUp=${followUp.kind} en="${String(questionEn).slice(0, 100)}"`
    );

    // Record user turn early so a crash mid-pipeline still keeps the question
    if (useMemory && question) {
      appendMemory(memoryKey, 'user', question);
    }

    // ── Opinion / reaction path — chat naturally, don't re-report the score
    if (isOpinionFollowUp && !hasImage) {
      onPhase('thinking');
      const priorTopic = priorTopicSnapshot || followUp.priorUser;
      const opinionPrompt = `${memoryBlock}

PRIOR TOPIC (what the chat was about): ${priorTopic || followUp.priorUser || '(see conversation)'}
YOUR PREVIOUS ANSWER (summary they are reacting to): ${(followUp.priorAi || '').slice(0, 500)}

USER'S NEW MESSAGE (opinion/reaction — respond to THIS):
${questionEnRaw}

Reply as a chat partner: acknowledge their take on the prior incident, give your view briefly, stay on that incident. Do not pivot to only restating the match score.`;

      const opinionResult = await queryAI(buildOpinionSystemPrompt(), opinionPrompt, {
        timeoutMs: 12000,
        maxProviders: 3,
        maxTokens: 400,
        temperature: 0.5,
      });

      if (opinionResult.response) {
        let responseEn = scrubMetaMentions(opinionResult.response);
        if (responseEn.length > MAX_RESPONSE_LENGTH) {
          const cutPoint = responseEn.lastIndexOf('.', MAX_RESPONSE_LENGTH);
          responseEn =
            cutPoint > MAX_RESPONSE_LENGTH * 0.6
              ? responseEn.slice(0, cutPoint + 1)
              : responseEn.slice(0, MAX_RESPONSE_LENGTH) + '...';
        }

        let response = responseEn;
        let translateOutProvider = 'identity';
        if (needsReplyLocalize) {
          onPhase('translating');
          const localized = await withTimeout(
            localizeReply(responseEn, userLang, prepared.isBanglish).catch(() => ({
              text: responseEn,
              provider: 'error',
            })),
            8000,
            { text: responseEn, provider: 'timeout' }
          );
          response = scrubMetaMentions(localized.text || responseEn);
          translateOutProvider = localized.provider || 'unknown';
        }

        if (useMemory) appendMemory(memoryKey, 'assistant', responseEn);
        onPhase('idle');
        return {
          success: true,
          response,
          responseEnglish: responseEn,
          provider: opinionResult.provider,
          model: opinionResult.model,
          pipeline: {
            mode: 'opinion_followup',
            memory: true,
          },
          memory: getMemoryStats(),
          language: {
            user: userLang,
            isBanglish: !!prepared.isBanglish,
            translatedIn: !!prepared.translatedIn,
            inProvider: prepared.translateProvider,
            outProvider: translateOutProvider,
          },
          webSearch: {
            ok: false,
            skipped: true,
            skipReason: 'opinion_followup_no_search',
            providers: [],
            resultCount: 0,
            queries: [],
          },
        };
      }
      // If opinion path fails, fall through to full pipeline
      console.warn('[BGC-AI] Opinion path failed, falling through to full pipeline');
    }

    // ── Image path: ZenMux vision (with OpenRouter fallback)
    if (hasImage) {
      onPhase('thinking');
      // Light board context so sports images can be grounded if relevant
      const contextData = await collectContextForQuery(questionEn).catch(() => ({
        verifiedBoard: [],
        collectedAt: new Date().toISOString(),
      }));
      const verifiedBlock = formatVerifiedBoard(contextData.verifiedBoard || []);

      const visionUser = `${memoryBlock ? `${memoryBlock}\n\n` : ''}${questionEn}

${verifiedBlock ? `Optional live board for grounding (prefer image content if it conflicts):\n${verifiedBlock.slice(0, 1500)}` : ''}

Answer based on the attached image. If it is a scoreboard or match graphic, read it carefully.`;

      const vision = await queryVisionAI(buildVisionSystemPrompt(), visionUser, image);
      if (!vision.response) {
        onPhase('idle');
        return {
          success: false,
          error: vision.error || 'Could not analyze that image right now.',
          vision: { provider: vision.provider, details: vision.details },
        };
      }

      let responseEn = scrubMetaMentions(vision.response);
      if (responseEn.length > MAX_RESPONSE_LENGTH) {
        const cutPoint = responseEn.lastIndexOf('.', MAX_RESPONSE_LENGTH);
        responseEn =
          cutPoint > MAX_RESPONSE_LENGTH * 0.6
            ? responseEn.slice(0, cutPoint + 1)
            : responseEn.slice(0, MAX_RESPONSE_LENGTH) + '...';
      }

      let response = responseEn;
      let translateOutProvider = 'identity';
      if (needsReplyLocalize) {
        onPhase('translating');
        const localized = await withTimeout(
          localizeReply(responseEn, userLang, prepared.isBanglish).catch(() => ({
            text: responseEn,
            provider: 'error',
          })),
          8000,
          { text: responseEn, provider: 'timeout' }
        );
        response = scrubMetaMentions(localized.text || responseEn);
        translateOutProvider = localized.provider || 'unknown';
      }

      if (useMemory) appendMemory(memoryKey, 'assistant', responseEn);

      onPhase('idle');
      return {
        success: true,
        response,
        responseEnglish: responseEn,
        provider: vision.provider,
        model: vision.model,
        vision: {
          used: true,
          provider: vision.provider,
          model: vision.model,
          fallbackFrom: vision.fallbackFrom || null,
        },
        memory: getMemoryStats(),
        language: {
          user: userLang,
          isBanglish: !!prepared.isBanglish,
          translatedIn: !!prepared.translatedIn,
          inProvider: prepared.translateProvider,
          outProvider: translateOutProvider,
        },
        webSearch: { ok: false, skipped: true, skipReason: 'image_query' },
      };
    }

    // Sequential pipeline (plan first → tools only if needed):
    //   1) Prompt creator defines intent + which tools to run
    //   2) Live scores / board only if plan.needsLiveScores (or incident grounding)
    //   3) Web search only if decideWebSearch says so
    //   4) Answer model → verify (if scores involved) → localize
    const contextQuery = expandedForSearch || questionEn;

    const pipelineCore = async () => {
      // ── 1) Prompt creator FIRST (no live-score fetch yet)
      onPhase('planning');
      const planSummary = memoryBlock ? memoryBlock.slice(0, 600) : '';
      const plan = await createPromptPlan(questionEn, planSummary);

      const needsIncident =
        plan.intent === 'news' ||
        plan.needsNews === true ||
        /\b(why|card|coach|manager|yellow|red|injury|news|what happened)\b/i.test(questionEn);
      // Scores board only when user wants scores / prediction — not every football chat
      const needsLive =
        plan.needsLiveScores === true ||
        plan.intent === 'live_score' ||
        plan.intent === 'prediction';

      console.log(
        `[BGC-AI] Plan intent=${plan.intent} live=${needsLive} web=? model=${plan.usedModel} timedOut=${!!plan.timedOut}`
      );

      // ── 2) Sports context ONLY if plan needs it
      let contextData = {
        verifiedBoard: [],
        liveMatches: [],
        collectedAt: new Date().toISOString(),
        liveCount: 0,
        skipped: true,
        skipReason: 'plan_skipped_scores',
      };
      if (needsLive || plan.needsStandings || needsIncident) {
        // 'scores' UI label — not the same as open-web search
        onPhase(needsLive ? 'scores' : 'thinking');
        contextData = await collectContextForQuery(contextQuery, {
          needsLiveScores: needsLive,
          needsStandings: plan.needsStandings === true,
          needsNews: plan.needsNews === true || needsIncident,
          needsDeep: plan.needsStandings === true || needsIncident,
          needsIncident,
        }).catch((err) => {
          console.warn('[BGC-AI] sports context failed:', err.message);
          return { collectedAt: new Date().toISOString(), verifiedBoard: [], liveCount: 0 };
        });
      }

      const verifiedBlock = formatVerifiedBoard(
        contextData.verifiedBoard || [],
        contextQuery
      );
      const contextString = buildContextString(contextData || {}, contextQuery);

      // ── 3) Web search ONLY when needed
      const webGate = decideWebSearch(questionEn, plan, contextData);
      console.log(
        `[BGC-AI] Tools liveScores=${needsLive} webSearch=${webGate.needed} reason=${webGate.reason}`
      );

      let searchPayload = {
        ok: false,
        results: [],
        answers: [],
        providers: [],
        queries: [],
        skipped: !webGate.needed,
        skipReason: webGate.reason,
        searchedAt: new Date().toISOString(),
      };
      let webContext = webGate.needed
        ? '=== CURRENT CONTEXT ===\nWeb search pending…'
        : '=== CURRENT CONTEXT ===\nWeb search skipped — not required for this question.';
      let searchOk = false;

      if (webGate.needed) {
        onPhase('searching');
        const searchQueries = webGate.queries.length
          ? webGate.queries
          : (plan.searchQueries || []).slice(0, 3);
        searchPayload = await multiSearch(searchQueries);
        searchPayload.skipped = false;
        searchPayload.skipReason = null;
        webContext = formatSearchContext(
          searchPayload,
          questionEn,
          contextData.verifiedBoard || []
        );
        searchOk = Boolean(searchPayload?.ok);
      } else {
        onPhase('thinking');
      }

      const evidenceLines = searchOk
        ? extractEvidenceFacts(
            searchPayload,
            questionEn,
            contextData.verifiedBoard || []
          )
        : [];
      const evidenceBlock = evidenceLines.length
        ? `=== HARD EVIDENCE (AUTHORITATIVE — answer FROM this; never say unavailable) ===\n${evidenceLines.map((l) => `• ${l}`).join('\n')}`
        : '';

      console.log(
        `[BGC-AI] Context ready — verified=${(contextData.verifiedBoard || []).length} live=${(contextData.verifiedBoard || []).filter((m) => m.status === 'LIVE').length} web=${searchOk ? 'ok' : webGate.needed ? 'empty' : 'skipped'} evidence=${evidenceLines.length}`
      );

      // ── 4) Answer model
      onPhase('thinking');

      const isPrediction = plan.intent === 'prediction';
      const isIncident = needsIncident || webGate.reason?.includes('incident');

      const userMessage = `${memoryBlock ? `${memoryBlock}\n\n` : ''}${evidenceBlock ? `${evidenceBlock}\n\n` : ''}${needsLive || verifiedBlock ? `=== VERIFIED MATCH BOARD (scores/status only) ===\n${verifiedBlock || '(empty)'}\n\n` : ''}${webContext}

=== ADDITIONAL SPORTS CONTEXT (collected ${contextData?.collectedAt || new Date().toISOString()}) ===
${contextString || '(none — not required for this question)'}

=== PROMPT PLAN ===
Intent: ${plan.intent}
Focus: ${plan.answerFocus}
Brief: ${plan.analysisBrief}
LiveScores: ${needsLive ? 'ON' : 'OFF'}
WebSearch: ${webGate.needed ? 'ON — use HARD EVIDENCE + CURRENT CONTEXT' : 'OFF'}

USER QUESTION (from ${username}, English):
${questionEnRaw}
${questionEn !== questionEnRaw ? `\n(Resolved with conversation memory as: ${questionEn})` : ''}

Write a concise expert answer in English.
Answer the USER'S actual question. Do NOT force live scores unless they asked or LiveScores is ON.
If this is a follow-up, use RECENT CONVERSATION memory to know what "it/that/the match/the coach" refers to.
${isPrediction ? 'If a match is LIVE: first state current LIVE score+clock, then give your predicted final score with short reasoning.' : ''}
${isIncident ? `INCIDENT MODE:
- If HARD EVIDENCE has REPORT lines about a yellow/red card or coach, summarize them as the answer.
- Structure: (1) which match + score if known (2) what the card was for (3) brief context.
- FORBIDDEN: "not available", "not specified", "provided information", "no information", "requires further details", "not on the VERIFIED MATCH BOARD".
- HARD EVIDENCE overrides empty board for incident details.` : ''}
If any match is LIVE on the verified board, say LIVE with current score and clock — never that it "ended".
Do not invent facts. Do not mention tools, search, or verification.`;

      const result = await queryAI(buildSystemPrompt(), userMessage, {
        timeoutMs: 14000,
        maxProviders: 3,
        maxTokens: 700,
      });

      if (!result.response) {
        // Deterministic fallback from evidence
        const fromEv = answerFromEvidence(evidenceLines, questionEn);
        if (fromEv) {
          return {
            success: true,
            responseEn: fromEv,
            result: { provider: 'evidence-fallback', model: 'snippets' },
            plan,
            verification: { verified: false, corrected: true, issues: ['llm empty; used evidence'] },
            guard: { changed: false, issues: [] },
            searchPayload,
            searchOk,
            webGate,
            evidenceLines,
          };
        }
        return {
          success: false,
          error: result.error || 'Unable to generate analysis right now. Please try again.',
        };
      }

      let draft = scrubMetaMentions(result.response);
      const fromEvidence = () => answerFromEvidence(evidenceLines, questionEn);

      // If model refused or gave a vague incident answer, replace with evidence synthesis
      if (
        evidenceLines.length &&
        (looksLikeEvidenceRefusal(draft) || looksLikeWeakIncidentAnswer(draft, evidenceLines))
      ) {
        const fromEv = fromEvidence();
        if (fromEv) {
          console.warn(
            looksLikeEvidenceRefusal(draft)
              ? '[BGC-AI] LLM refused with evidence present — using evidence answer'
              : '[BGC-AI] LLM incident answer too weak — using evidence answer'
          );
          draft = fromEv;
        } else if (looksLikeEvidenceRefusal(draft)) {
          // One forced rewrite when we cannot synthesize cleanly
          const rewrite = await queryAI(
            'You answer sports questions using ONLY the evidence list. Never say information is unavailable if evidence exists. Be concise. No tools mentions.',
            `EVIDENCE:\n${evidenceLines.join('\n')}\n\nQUESTION: ${questionEn}\n\nAnswer using the evidence:`,
            { timeoutMs: 10000, maxProviders: 2, maxTokens: 350, temperature: 0.2 }
          );
          if (
            rewrite.response &&
            !looksLikeEvidenceRefusal(rewrite.response) &&
            !looksLikeWeakIncidentAnswer(rewrite.response, evidenceLines)
          ) {
            draft = scrubMetaMentions(rewrite.response);
          }
        }
      }

      // ── 5) Verifier only when live scores were used (or board present)
      const evidenceLocked =
        evidenceLines.length > 0 &&
        !looksLikeEvidenceRefusal(draft) &&
        !looksLikeWeakIncidentAnswer(draft, evidenceLines) &&
        /yellow\s*card|gesture|anti-racism/i.test(draft);

      let verification;
      if (evidenceLocked || !needsLive) {
        const local = localLiveGuard(draft, verifiedBlock || '');
        verification = {
          answer: local.text,
          verified: false,
          corrected: local.changed,
          notes: evidenceLocked
            ? 'skipped verifier — evidence-locked incident answer'
            : 'skipped verifier — no live-score tool used',
          issues: local.issues || [],
        };
      } else {
        onPhase('verifying');
        verification = await verifyAnswerWithThinking({
          userQuestion: questionEn,
          draftAnswer: draft,
          verifiedFactsBlock: [verifiedBlock, evidenceBlock, contextString]
            .filter(Boolean)
            .join('\n\n'),
          plan,
        });
      }

      let responseEn = scrubMetaMentions(verification.answer || draft);
      // Final refusal / weak check after verifier
      if (
        evidenceLines.length &&
        (looksLikeEvidenceRefusal(responseEn) ||
          looksLikeWeakIncidentAnswer(responseEn, evidenceLines))
      ) {
        const fromEv = fromEvidence();
        if (fromEv) responseEn = fromEv;
      }
      const guard = localLiveGuard(responseEn, verifiedBlock || '');
      responseEn = scrubMetaMentions(guard.text);

      if (responseEn.length > MAX_RESPONSE_LENGTH) {
        const cutPoint = responseEn.lastIndexOf('.', MAX_RESPONSE_LENGTH);
        if (cutPoint > MAX_RESPONSE_LENGTH * 0.6) {
          responseEn = responseEn.slice(0, cutPoint + 1);
        } else {
          responseEn = responseEn.slice(0, MAX_RESPONSE_LENGTH) + '...';
        }
      }

      return {
        success: true,
        responseEn,
        result,
        plan,
        verification,
        guard,
        searchPayload,
        searchOk,
        webGate,
        needsLive,
        liveCount: (contextData.verifiedBoard || []).filter((m) => m.status === 'LIVE').length,
      };
    };

    const core = await withTimeout(
      pipelineCore(),
      PIPELINE_BUDGET_MS,
      { success: false, error: 'Analysis took too long. Please try again — live scores are updating fast.', timedOut: true }
    );

    if (!core?.success) {
      onPhase('idle');
      return {
        success: false,
        error: core?.error || 'Unable to generate analysis right now. Please try again.',
      };
    }

    let responseEn = core.responseEn;

    // ── 6) Localize
    let response = responseEn;
    let translateOutProvider = 'identity';
    if (needsReplyLocalize) {
      onPhase('translating');
      const localized = await withTimeout(
        localizeReply(responseEn, userLang, prepared.isBanglish).catch((err) => {
          console.warn('[BGC-AI] translate-out failed:', err.message);
          return { text: responseEn, provider: 'error' };
        }),
        8000,
        { text: responseEn, provider: 'timeout' }
      );
      response = scrubMetaMentions(localized.text || responseEn);
      translateOutProvider = localized.provider || 'unknown';
    }

    if (useMemory && responseEn) {
      appendMemory(memoryKey, 'assistant', responseEn);
    }

    onPhase('idle');
    return {
      success: true,
      response,
      responseEnglish: responseEn,
      provider: core.result.provider,
      model: core.result.model,
      pipeline: {
        promptCreator: {
          usedModel: !!core.plan.usedModel,
          intent: core.plan.intent,
          provider: core.plan.provider || null,
          timedOut: !!core.plan.timedOut,
        },
        tools: {
          liveScores: !!core.needsLive,
          webSearch: !!core.webGate?.needed,
          webReason: core.webGate?.reason || null,
        },
        verifier: {
          verified: !!core.verification.verified,
          corrected: !!(core.verification.corrected || core.guard.changed),
          issues: core.verification.issues || core.guard.issues || [],
          provider: core.verification.provider || null,
        },
        verifiedLiveCount: core.liveCount || 0,
        memory: useMemory,
      },
      memory: getMemoryStats(),
      language: {
        user: userLang,
        isBanglish: !!prepared.isBanglish,
        translatedIn: !!prepared.translatedIn,
        inProvider: prepared.translateProvider,
        outProvider: translateOutProvider,
      },
      webSearch: {
        ok: core.searchOk,
        skipped: Boolean(core.searchPayload?.skipped),
        skipReason: core.searchPayload?.skipReason || null,
        providers: core.searchPayload?.providers || [],
        resultCount: core.searchPayload?.results?.length || 0,
        queries: core.searchPayload?.queries || [],
      },
    };
  } catch (err) {
    console.error('[BGC-AI] Error processing query:', err);
    onPhase('idle');
    return {
      success: false,
      error: 'Something went wrong with the analysis. Please try again in a moment.',
    };
  }
}

export function getAgentInfo() {
  return {
    name: 'BGC AI',
    version: '2.1.0',
    capabilities: [
      'Temporary conversation memory (follow-ups, TTL cleanup)',
      'Verified live scores (ESPN + scores API ground truth)',
      'Prompt-creator AI for intent + search queries',
      'Thinking/verifier AI before delivery',
      'Multi-language (Bangla, Banglish, auto-detect)',
      'Live web search when needed (Serper + Tavily + SearchSpace)',
      'Image understanding (ZenMux / OpenRouter vision)',
      'Live match analysis (never marks LIVE as finished)',
      'Score predictions',
      'Player / team / standings analysis',
    ],
    trigger: '@bgc',
    cooldown: `${COOLDOWN_MS / 1000}s per user`,
    memory: getMemoryStats(),
    pipeline: [
      'translate',
      'conversation-memory',
      'verified-scores',
      'prompt-creator',
      'web-search-if-needed',
      'answer',
      'thinking-verifier',
      'localize',
      'memory-store',
    ],
  };
}
