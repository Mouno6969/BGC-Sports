// ---------------------------------------------------------------------------
// AI Module — Central export for BGC Sports AI Agent system.
//
// Architecture:
//   sportsDataCollector.js  — Fetches live data from ESPN, BBC, TheSportsDB
//   aiProvider.js           — Multi-provider LLM integration with fallback
//   bgcAgent.js             — Core intelligence: query processing & analysis
//   index.js (this file)    — Public API for the rest of the application
// ---------------------------------------------------------------------------

export { isBgcMention, processQuery, getAgentInfo } from './bgcAgent.js';
export { queryAI, getProviderStatus } from './aiProvider.js';
export {
  collectFullMatchContext,
  collectContextForQuery,
  getWorldCupLiveScores,
  getWorldCupResults,
  getWorldCupUpcoming,
  getESPNScoreboard,
  getESPNNews,
  getMatchCommentary,
  getWorldCupStandings,
  getBBCSportHeadlines,
  getTeamDetails,
  getPlayerDetails,
} from './sportsDataCollector.js';
