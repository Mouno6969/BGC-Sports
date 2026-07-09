// ---------------------------------------------------------------------------
// BGC AI Agent — The core intelligence for World Cup analysis.
//
// This agent:
//   1. Detects @bgc mentions in chat messages
//   2. Extracts the user's question/intent
//   3. Collects relevant sports data from multiple sources
//   4. Builds a rich context for the LLM
//   5. Generates an intelligent, data-driven response
//   6. Formats and delivers the response back to chat
//
// Capabilities:
//   - Live match score predictions based on current form and stats
//   - Player analysis and comparisons
//   - Team analysis (formation, tactics, strengths/weaknesses)
//   - Match predictions with reasoning
//   - Tournament standings and group analysis
//   - Coach and tactical analysis
//   - Live commentary summaries
//   - Head-to-head historical records
// ---------------------------------------------------------------------------

import { queryAI } from './aiProvider.js';
import { collectContextForQuery, collectFullMatchContext } from './sportsDataCollector.js';

const BGC_MENTION_REGEX = /@bgc\b/i;
const MAX_RESPONSE_LENGTH = 800; // Keep chat responses concise

// Rate limiting per user
const userCooldowns = new Map();
const COOLDOWN_MS = 8000; // 8 seconds between AI queries per user

// ---------------------------------------------------------------------------
// System prompt — defines the AI agent's personality and capabilities
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are BGC Sports AI — an expert football/soccer analyst embedded in the BGC Sports live chat platform during the FIFA World Cup 2026.

YOUR IDENTITY:
- Name: BGC AI
- Role: Expert sports analyst, statistician, and prediction engine
- Personality: Knowledgeable, confident, concise, and engaging
- You speak like a professional sports commentator with deep tactical knowledge

YOUR CAPABILITIES:
1. LIVE MATCH ANALYSIS: Analyze ongoing matches using real-time scores, possession, shots, and commentary
2. SCORE PREDICTIONS: Predict match outcomes based on team form, head-to-head records, player availability, and current tournament performance
3. PLAYER ANALYSIS: Provide detailed insights on players — form, stats, strengths, role in team
4. TEAM ANALYSIS: Tactical breakdowns, formation analysis, key players, coaching style
5. TOURNAMENT INSIGHTS: Group standings, qualification scenarios, bracket predictions
6. HISTORICAL CONTEXT: Head-to-head records, past World Cup performances

RESPONSE RULES:
- Keep responses CONCISE (max 3-4 short paragraphs for chat readability)
- Use football terminology naturally
- When predicting scores, always explain your reasoning briefly
- Include specific stats/data when available
- If data is limited, acknowledge it but still provide your best analysis
- Use bold markers (*text*) for emphasis on key points
- Never use markdown headers (#) — this is a chat, not a document
- Be confident in predictions but acknowledge uncertainty
- If a match is LIVE, prioritize current match state over historical data
- Format predicted scores clearly: "Predicted Score: Team A 2-1 Team B"
- For live matches, give current score context: "Current: Team A 1-0 Team B (65')"
- DO NOT use emojis excessively — max 1-2 per response
- DO NOT repeat the user's question back to them
- DO NOT say "based on the data provided" — just give the analysis naturally
- Respond in the same language the user asks in (default: English)`;

// ---------------------------------------------------------------------------
// Detect if a message contains @bgc mention
// ---------------------------------------------------------------------------

export function isBgcMention(text) {
  return BGC_MENTION_REGEX.test(text);
}

// ---------------------------------------------------------------------------
// Extract the actual question from the message (remove @bgc prefix)
// ---------------------------------------------------------------------------

function extractQuestion(text) {
  return text.replace(BGC_MENTION_REGEX, '').trim();
}

// ---------------------------------------------------------------------------
// Check rate limiting
// ---------------------------------------------------------------------------

function checkCooldown(userId) {
  const lastQuery = userCooldowns.get(userId);
  if (lastQuery && Date.now() - lastQuery < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (Date.now() - lastQuery)) / 1000);
    return { allowed: false, remaining };
  }
  userCooldowns.set(userId, Date.now());
  return { allowed: true };
}

// Clean up old cooldown entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of userCooldowns) {
    if (now - ts > COOLDOWN_MS * 10) userCooldowns.delete(key);
  }
}, 60000);

// ---------------------------------------------------------------------------
// Build context string from collected data
// ---------------------------------------------------------------------------

function buildContextString(data) {
  const parts = [];

  // Live matches
  if (data.liveMatches?.length > 0) {
    parts.push('=== LIVE WORLD CUP MATCHES ===');
    for (const m of data.liveMatches) {
      parts.push(
        `${m.home} ${m.homeScore} - ${m.awayScore} ${m.away} (${m.progress || 'LIVE'}) | Venue: ${m.venue || 'N/A'}`
      );
    }
  }

  // ESPN live data (more detailed)
  if (data.espnScoreboard?.length > 0) {
    const liveESPN = data.espnScoreboard.filter(
      (m) => m.status === 'In Progress' || m.status === 'Halftime'
    );
    if (liveESPN.length > 0) {
      parts.push('\n=== ESPN LIVE DATA ===');
      for (const m of liveESPN) {
        parts.push(
          `${m.home.name} ${m.home.score} - ${m.away.score} ${m.away.name} | ${m.statusDetail || m.status} | Clock: ${m.clock || 'N/A'} | Venue: ${m.venue || 'N/A'}`
        );
      }
    }
  }

  // Recent results
  if (data.recentResults?.length > 0) {
    parts.push('\n=== RECENT WORLD CUP RESULTS ===');
    for (const m of data.recentResults.slice(0, 8)) {
      parts.push(
        `${m.home} ${m.homeScore} - ${m.awayScore} ${m.away} | ${m.date} | Round ${m.round || '?'}`
      );
    }
  }

  // Upcoming fixtures
  if (data.upcomingFixtures?.length > 0) {
    parts.push('\n=== UPCOMING WORLD CUP FIXTURES ===');
    for (const m of data.upcomingFixtures.slice(0, 8)) {
      parts.push(
        `${m.home} vs ${m.away} | ${m.date} ${m.time || ''} | Venue: ${m.venue || 'TBD'} | Round ${m.round || '?'}`
      );
    }
  }

  // Standings
  if (data.standings?.length > 0) {
    parts.push('\n=== WORLD CUP STANDINGS ===');
    const groups = {};
    for (const entry of data.standings) {
      const g = entry.group || 'Unknown';
      if (!groups[g]) groups[g] = [];
      groups[g].push(entry);
    }
    for (const [group, teams] of Object.entries(groups)) {
      parts.push(`\nGroup ${group}:`);
      for (const t of teams) {
        parts.push(
          `  ${t.team}: P${t.played} W${t.won} D${t.drawn} L${t.lost} GD${t.goalDifference} Pts${t.points}`
        );
      }
    }
  }

  // Team details
  if (data.teamDetails?.length > 0) {
    parts.push('\n=== TEAM DETAILS ===');
    for (const t of data.teamDetails) {
      parts.push(
        `${t.name} | Manager: ${t.manager || 'N/A'} | Stadium: ${t.stadium || 'N/A'}`
      );
      if (t.description) parts.push(`  Info: ${t.description.slice(0, 200)}`);
    }
  }

  // Player details
  if (data.playerDetails?.length > 0) {
    parts.push('\n=== PLAYER DETAILS ===');
    for (const p of data.playerDetails) {
      parts.push(
        `${p.name} | ${p.nationality} | ${p.team} | Position: ${p.position} | Born: ${p.dateBorn || 'N/A'}`
      );
      if (p.description) parts.push(`  Bio: ${p.description.slice(0, 200)}`);
    }
  }

  // Commentary
  if (data.commentary?.length > 0) {
    parts.push('\n=== MATCH COMMENTARY ===');
    for (const matchComm of data.commentary) {
      if (Array.isArray(matchComm)) {
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
            parts.push(`Lineup - ${item.team} (${item.formation || 'N/A'}):`);
            const starters = (item.players || []).filter((p) => p.starter);
            parts.push(`  Starters: ${starters.map((p) => `${p.name} (${p.position})`).join(', ')}`);
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
  }

  // ESPN News
  if (data.espnNews?.length > 0) {
    parts.push('\n=== LATEST WORLD CUP NEWS (ESPN) ===');
    for (const article of data.espnNews.slice(0, 5)) {
      parts.push(`• ${article.headline}`);
      if (article.description) parts.push(`  ${article.description.slice(0, 150)}`);
    }
  }

  // BBC Headlines
  if (data.bbcHeadlines?.length > 0) {
    parts.push('\n=== BBC SPORT HEADLINES ===');
    for (const h of data.bbcHeadlines.slice(0, 4)) {
      parts.push(`• ${h.title}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Process a @bgc mention and generate AI response
// ---------------------------------------------------------------------------

export async function processQuery(text, userId, username) {
  // Check rate limit
  const cooldown = checkCooldown(userId);
  if (!cooldown.allowed) {
    return {
      success: false,
      error: `Please wait ${cooldown.remaining}s before asking again.`,
    };
  }

  const question = extractQuestion(text);
  if (!question || question.length < 2) {
    return {
      success: true,
      response:
        "Hey! I'm BGC AI — your World Cup analyst. Ask me anything about the FIFA World Cup 2026! Try: \"@bgc who will win Argentina vs France?\" or \"@bgc what's the current score?\"",
    };
  }

  try {
    // Collect relevant sports data based on the query
    console.log(`[BGC-AI] Processing query from ${username}: "${question}"`);
    const contextData = await collectContextForQuery(question);
    const contextString = buildContextString(contextData);

    // Build the user message with context
    const userMessage = `CURRENT WORLD CUP DATA (collected at ${contextData.collectedAt}):
${contextString}

USER QUESTION (from ${username} in World Cup chat):
${question}

Provide a concise, expert analysis. If predicting a score, explain your reasoning.`;

    // Query the AI
    const result = await queryAI(SYSTEM_PROMPT, userMessage);

    if (result.response) {
      // Trim response if too long for chat
      let response = result.response;
      if (response.length > MAX_RESPONSE_LENGTH) {
        // Try to cut at a sentence boundary
        const cutPoint = response.lastIndexOf('.', MAX_RESPONSE_LENGTH);
        if (cutPoint > MAX_RESPONSE_LENGTH * 0.6) {
          response = response.slice(0, cutPoint + 1);
        } else {
          response = response.slice(0, MAX_RESPONSE_LENGTH) + '...';
        }
      }

      return {
        success: true,
        response,
        provider: result.provider,
        model: result.model,
      };
    }

    return {
      success: false,
      error: result.error || 'Unable to generate analysis right now. Please try again.',
    };
  } catch (err) {
    console.error('[BGC-AI] Error processing query:', err);
    return {
      success: false,
      error: 'Something went wrong with the analysis. Please try again in a moment.',
    };
  }
}

// ---------------------------------------------------------------------------
// Get AI agent status/info
// ---------------------------------------------------------------------------

export function getAgentInfo() {
  return {
    name: 'BGC AI',
    version: '1.0.0',
    capabilities: [
      'Live match analysis',
      'Score predictions',
      'Player analysis',
      'Team tactics breakdown',
      'Tournament standings',
      'Match commentary summaries',
      'Head-to-head records',
      'Coach analysis',
    ],
    trigger: '@bgc',
    cooldown: `${COOLDOWN_MS / 1000}s per user`,
  };
}
