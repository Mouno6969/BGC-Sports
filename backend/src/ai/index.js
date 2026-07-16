// ---------------------------------------------------------------------------
// AI Module — Central export for BGC Sports AI Agent system.
//
// Architecture:
//   sportsDataCollector.js  — Fetches live data from ESPN, BBC, TheSportsDB
//   webSearch.js            — Live multi-provider web search (Serper/Tavily/SearchSpace)
//   translator.js           — Free multi-language detect + translate (Bangla/Banglish)
//   aiProvider.js           — Multi-provider LLM integration with fallback
//   bgcAgent.js             — Core intelligence: query processing & analysis
//   index.js (this file)    — Public API for the rest of the application
// ---------------------------------------------------------------------------

export { isBgcMention, processQuery, getAgentInfo } from './bgcAgent.js';
export { queryAI, queryVisionAI, getProviderStatus, normalizeImageDataUrl } from './aiProvider.js';
export {
  appendMemory,
  getMemoryTurns,
  formatMemoryForPrompt,
  expandFollowUpWithMemory,
  classifyFollowUp,
  getPriorTopicForResearch,
  clearMemory,
  purgeExpired,
  getMemoryStats,
} from './conversationMemory.js';
export {
  webSearch,
  formatSearchContext,
  extractEvidenceFacts,
  looksLikeEvidenceRefusal,
  looksLikeWeakIncidentAnswer,
  answerFromEvidence,
  getWebSearchStatus,
} from './webSearch.js';
export {
  detectLanguage,
  detectLanguageLocal,
  translateText,
  prepareUserMessage,
  localizeReply,
  getTranslatorStatus,
} from './translator.js';
export {
  collectFullMatchContext,
  collectContextForQuery,
  getWorldCupLiveScores,
  getWorldCupResults,
  getWorldCupUpcoming,
  getESPNScoreboard,
  getVerifiedWorldCupBoard,
  getESPNNews,
  getMatchCommentary,
  getWorldCupStandings,
  getBBCSportHeadlines,
  getTeamDetails,
  getPlayerDetails,
  mapEspnMatchStatus,
} from './sportsDataCollector.js';
export {
  createPromptPlan,
  decideWebSearch,
  verifyAnswerWithThinking,
  formatVerifiedBoard,
  localLiveGuard,
} from './queryPipeline.js';
