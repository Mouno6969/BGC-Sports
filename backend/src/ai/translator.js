// ---------------------------------------------------------------------------
// Translator — free multi-provider language detect + translate for BGC AI.
//
// Pipeline for non-English (esp. Bangla / Banglish) user messages:
//   1. Detect user language
//   2. Translate user text → English
//   3. (Chat AI answers in English — handled by bgcAgent)
//   4. Translate English reply → user's language
//
// Providers (all free, no credit card required):
//   • Google gtx      — unofficial free endpoint, no key (primary)
//   • MyMemory        — free tier, optional email key for higher quota
//   • LibreTranslate  — free API key from portal.libretranslate.com
//   • LLM fallback    — uses already-configured free LLM keys for Banglish
//                       / edge cases when classic MT fails
//
// Env (optional — system works without keys via gtx + MyMemory):
//   MYMEMORY_API_KEY / MYMEMORY_EMAIL
//   LIBRETRANSLATE_API_KEY
//   LIBRETRANSLATE_URL   (default https://libretranslate.com)
// ---------------------------------------------------------------------------

import { queryAI } from './aiProvider.js';

const GTX_URL = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const DEFAULT_LIBRE_URL = 'https://libretranslate.com';

const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const translateCache = new Map();

// Common Banglish (romanized Bangla) tokens — sports + everyday chat
const BANGLISH_TOKENS = [
  'kemon', 'kotha', 'kore', 'koro', 'korbe', 'korchi', 'korcho', 'ache', 'acho',
  'achi', 'asho', 'ashbe', 'jabo', 'jabe', 'jacchi', 'jaccho', 'hobe', 'hobe?',
  'hoyeche', 'hoyeche', 'hoise', 'hoiche', 'ki', 'keno', 'kothay', 'kothay',
  'ekhon', 'ekhon', 'ajke', 'aajke', 'kalke', 'kalke', 'bhalo', 'valo', 'khub',
  'onek', 'tumi', 'apni', 'amra', 'amader', 'tomar', 'tomar', 'tar', 'tara',
  'eta', 'ota', 'eita', 'sheita', 'naki', 'nah', 'naa', 'haan', 'ha', 'thik',
  'ase', 'ase?', 'acho?', 'kemon acho', 'score koto', 'skore', 'gol', 'match',
  'macch', 'jitchhe', 'jitbe', 'harbe', 'harche', 'ke', 'kar', 'kake', 'dekho',
  'bolo', 'bolchi', 'bollam', 'suncho', 'shuno', 'please', 'plz', 'plzz',
  'world cup e', 'fifa te', 'bangla', 'bd', 'desh', 'team er', 'player er',
  'aaj', 'aj', 'kal', 'parso', 'rate', 'koto', 'koto?', 'koi', 'kotha chilo',
  'bujhte', 'bujhlam', 'pari', 'parbo', 'parbe', 'lagche', 'lagtese', 'lage',
  'dekhe', 'dekhlam', 'gheshe', 'cholo', 'aso', 'asho na', 'jao', 'thako',
  'amake', 'tomake', 'take', 'oder', 'egulo', 'ogulo', 'sotti', 'asole',
  'asolei', 'onek bhalo', 'khub bhalo', 'kharap', 'khub kharap', 'majhe',
];

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    mymemoryKey: process.env.MYMEMORY_API_KEY || process.env.MYMEMORY_EMAIL || '',
    libreKey: process.env.LIBRETRANSLATE_API_KEY || '',
    libreUrl: (process.env.LIBRETRANSLATE_URL || DEFAULT_LIBRE_URL).replace(/\/$/, ''),
  };
}

function cacheKey(kind, a, b, c) {
  return `${kind}|${a}|${b}|${String(c).slice(0, 400)}`;
}

function getCached(key) {
  const e = translateCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) {
    translateCache.delete(key);
    return null;
  }
  return e.data;
}

function setCached(key, data) {
  translateCache.set(key, { data, ts: Date.now() });
  if (translateCache.size > 200) {
    const first = translateCache.keys().next().value;
    translateCache.delete(first);
  }
}

async function fetchJson(url, options = {}, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 100)}` : ''}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Script / heuristic detection (works offline, no API)
// ---------------------------------------------------------------------------

function countBengaliChars(text) {
  const m = String(text).match(/[\u0980-\u09FF]/g);
  return m ? m.length : 0;
}

function countLatinLetters(text) {
  const m = String(text).match(/[A-Za-z]/g);
  return m ? m.length : 0;
}

function isMostlyEnglish(text) {
  const t = String(text).trim();
  if (!t) return true;
  if (countBengaliChars(t) > 0) return false;
  // Pure digits / punctuation
  if (!/[A-Za-z\u0980-\u09FF]/.test(t)) return true;
  const lower = t.toLowerCase();
  // Banglish often has Latin letters but many local tokens
  if (looksLikeBanglish(lower)) return false;
  // Simple English word ratio
  const words = lower.split(/[^a-z']+/).filter(Boolean);
  if (words.length === 0) return true;
  const common = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'in',
    'that', 'it', 'for', 'on', 'with', 'as', 'at', 'by', 'from', 'or', 'this',
    'who', 'what', 'when', 'where', 'why', 'how', 'will', 'would', 'can', 'could',
    'should', 'vs', 'match', 'score', 'team', 'player', 'world', 'cup', 'fifa',
    'goal', 'win', 'lose', 'live', 'today', 'tomorrow', 'now', 'current',
  ]);
  let hits = 0;
  for (const w of words) if (common.has(w) || w.length <= 2) hits += 1;
  return hits / words.length >= 0.35 && !looksLikeBanglish(lower);
}

export function looksLikeBanglish(text) {
  const lower = String(text).toLowerCase();
  if (countBengaliChars(lower) > 2) return false; // pure Bangla script
  if (countLatinLetters(lower) < 3) return false;
  let hits = 0;
  for (const tok of BANGLISH_TOKENS) {
    if (lower.includes(tok)) hits += 1;
    if (hits >= 2) return true;
  }
  // Single strong multi-word pattern
  if (/\b(kemon acho|ki khobor|score koto|gol koto|ke jitchhe|ajke match|world cup e)\b/i.test(lower)) {
    return true;
  }
  // Phonetic Bangla endings common in banglish: -che, -chi, -be, -bo, -tese
  const phonetic = lower.match(/\b[a-z]*(che|chi|tese|tese|bo|be|lam|cho|chen)\b/g) || [];
  return phonetic.length >= 2 && hits >= 1;
}

/**
 * Local fast detection without network.
 * @returns {{ lang: string, script: 'bengali'|'latin'|'mixed'|'other', isBanglish: boolean, confidence: number }}
 */
export function detectLanguageLocal(text) {
  const t = String(text || '').trim();
  if (!t) return { lang: 'en', script: 'other', isBanglish: false, confidence: 1 };

  const bn = countBengaliChars(t);
  const latin = countLatinLetters(t);
  const total = Math.max(bn + latin, 1);

  if (bn / total >= 0.25) {
    return {
      lang: 'bn',
      script: latin > 2 ? 'mixed' : 'bengali',
      isBanglish: false,
      confidence: Math.min(0.99, 0.55 + bn / total),
    };
  }

  if (looksLikeBanglish(t)) {
    return { lang: 'bn', script: 'latin', isBanglish: true, confidence: 0.75 };
  }

  if (isMostlyEnglish(t)) {
    return { lang: 'en', script: 'latin', isBanglish: false, confidence: 0.7 };
  }

  return { lang: 'auto', script: latin ? 'latin' : 'other', isBanglish: false, confidence: 0.4 };
}

// ---------------------------------------------------------------------------
// Provider: Google gtx (free, no key)
// ---------------------------------------------------------------------------

async function gtxTranslate(text, source, target) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: source || 'auto',
    tl: target,
    dt: 't',
    q: text,
  });
  // Also request language detection detail
  const url = `${GTX_URL}?${params.toString()}`;
  const data = await fetchJson(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BGCSportsBot/1.0)' },
  });

  // Response shape: [ [ [translated, original, ...], ... ], null, detectedLang, ... ]
  let translated = '';
  if (Array.isArray(data?.[0])) {
    translated = data[0].map((part) => (Array.isArray(part) ? part[0] : '')).join('');
  }
  const detected = data?.[2] || (Array.isArray(data?.[8]?.[0]) ? data[8][0][0] : null) || source || 'auto';
  // confidence sometimes at data[6]
  const confidence = typeof data?.[6] === 'number' ? data[6] : null;

  if (!translated) throw new Error('gtx empty translation');
  return {
    text: translated,
    detectedLang: String(detected).toLowerCase().split('-')[0],
    confidence,
    provider: 'gtx',
  };
}

// ---------------------------------------------------------------------------
// Provider: MyMemory (free)
// ---------------------------------------------------------------------------

async function mymemoryTranslate(text, source, target) {
  const cfg = getConfig();
  const langpair = `${source === 'auto' ? 'autodetect' : source}|${target}`;
  // MyMemory uses autodetect differently — if auto, try without and use email
  const params = new URLSearchParams({
    q: text.slice(0, 450), // free tier length limit
    langpair: source === 'auto' ? `en|${target}` : `${source}|${target}`,
  });
  // For auto-detect source→en we need a known source; use local detect first.
  if (source === 'auto') {
    params.set('langpair', `Autodetect|${target}`);
  }
  if (cfg.mymemoryKey) {
    // Email or key boosts daily quota
    params.set('de', cfg.mymemoryKey);
  }

  // Prefer correct langpair for known source
  if (source && source !== 'auto') {
    params.set('langpair', `${source}|${target}`);
  }

  const data = await fetchJson(`${MYMEMORY_URL}?${params.toString()}`);
  const status = Number(data?.responseStatus);
  const translated = data?.responseData?.translatedText;
  if (status !== 200 || !translated) {
    throw new Error(data?.responseDetails || `mymemory status ${status}`);
  }
  // MyMemory sometimes returns error strings as "translatedText"
  if (/INVALID SOURCE LANGUAGE|PLEASE SELECT/i.test(translated)) {
    throw new Error(translated);
  }
  return {
    text: translated,
    detectedLang: source === 'auto' ? null : source,
    confidence: Number(data?.responseData?.match) || null,
    provider: 'mymemory',
  };
}

// ---------------------------------------------------------------------------
// Provider: LibreTranslate (free API key, no card)
// ---------------------------------------------------------------------------

async function libreTranslate(text, source, target) {
  const cfg = getConfig();
  if (!cfg.libreKey) throw new Error('LibreTranslate key not configured');

  const body = {
    q: text,
    source: source === 'auto' ? 'auto' : source,
    target,
    format: 'text',
    api_key: cfg.libreKey,
  };

  const data = await fetchJson(`${cfg.libreUrl}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!data?.translatedText) throw new Error('libre empty translation');
  return {
    text: data.translatedText,
    detectedLang: data.detectedLanguage?.language || source,
    confidence: data.detectedLanguage?.confidence ?? null,
    provider: 'libretranslate',
  };
}

async function libreDetect(text) {
  const cfg = getConfig();
  if (!cfg.libreKey) throw new Error('LibreTranslate key not configured');
  const data = await fetchJson(`${cfg.libreUrl}/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, api_key: cfg.libreKey }),
  });
  const hit = Array.isArray(data) ? data[0] : data;
  if (!hit?.language) throw new Error('libre detect failed');
  return {
    lang: String(hit.language).toLowerCase(),
    confidence: Number(hit.confidence) || 0.5,
    provider: 'libretranslate',
  };
}

// ---------------------------------------------------------------------------
// Provider: LLM fallback (uses existing free Groq/etc keys) — great for Banglish
// ---------------------------------------------------------------------------

async function llmTranslate(text, sourceLabel, targetLang) {
  const targetName =
    targetLang === 'en' ? 'English' : targetLang === 'bn' ? 'Bengali (Bangla script)' : targetLang;

  const system = `You are a precise translation engine. Output ONLY the translated text.
No quotes, no explanations, no notes. Preserve names, scores, numbers, and @mentions.
If the input is already in the target language, return it unchanged.
Target language: ${targetName}.`;

  const user =
    sourceLabel === 'banglish'
      ? `Translate this Banglish (romanized Bengali) into clear ${targetName}:\n\n${text}`
      : `Translate into ${targetName}:\n\n${text}`;

  const result = await queryAI(system, user);
  if (!result?.response) throw new Error(result?.error || 'llm translate failed');
  // Strip accidental wrapping quotes
  let out = result.response.trim().replace(/^["'“”]+|["'“”]+$/g, '');
  // Drop preamble lines if the model misbehaves
  if (/^(here is|translation|translated)/i.test(out)) {
    const lines = out.split('\n').filter((l) => l.trim());
    out = lines[lines.length - 1] || out;
  }
  return {
    text: out,
    detectedLang: sourceLabel === 'banglish' ? 'bn' : null,
    confidence: 0.6,
    provider: 'llm',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect language of user text.
 */
export async function detectLanguage(text) {
  const local = detectLanguageLocal(text);
  // Strong local signal for Bengali script or Banglish — trust it
  if (local.lang === 'bn' && local.confidence >= 0.7) {
    return { ...local, provider: 'local' };
  }
  if (local.lang === 'en' && local.confidence >= 0.7) {
    return { ...local, provider: 'local' };
  }

  // Try gtx auto-detect via translate to en
  try {
    const g = await gtxTranslate(text.slice(0, 300), 'auto', 'en');
    if (g.detectedLang) {
      const isBanglish = local.isBanglish || g.detectedLang === 'bn' && local.script === 'latin';
      return {
        lang: isBanglish ? 'bn' : g.detectedLang,
        script: local.script,
        isBanglish,
        confidence: g.confidence ?? 0.65,
        provider: 'gtx',
      };
    }
  } catch (err) {
    console.warn('[translator] gtx detect failed:', err.message);
  }

  // Libre detect if key present
  try {
    const d = await libreDetect(text.slice(0, 400));
    return {
      lang: d.lang,
      script: local.script,
      isBanglish: local.isBanglish,
      confidence: d.confidence,
      provider: d.provider,
    };
  } catch {
    /* optional */
  }

  return { ...local, provider: 'local-fallback' };
}

/**
 * Translate text from source → target using free providers with fallback.
 * @param {string} text
 * @param {string} source  ISO code or 'auto' or 'banglish'
 * @param {string} target  ISO code e.g. 'en' | 'bn'
 */
export async function translateText(text, source = 'auto', target = 'en') {
  const raw = String(text || '').trim();
  if (!raw) return { text: '', provider: 'none', source, target };

  // No-op if same language (except banglish → bn/en still needed)
  if (source === target && source !== 'banglish' && source !== 'auto') {
    return { text: raw, provider: 'identity', source, target };
  }

  const ck = cacheKey('tr', source, target, raw);
  const cached = getCached(ck);
  if (cached) return { ...cached, cached: true };

  const errors = [];
  const src = source === 'banglish' ? 'bn' : source;

  // 1) Google gtx
  try {
    // Banglish often needs LLM; still try gtx first with auto
    const sl = source === 'banglish' ? 'auto' : src || 'auto';
    const r = await gtxTranslate(raw, sl, target);
    // If gtx "translated" banglish by echoing input, treat as failure
    if (source === 'banglish' && normalizeCmp(r.text) === normalizeCmp(raw)) {
      throw new Error('gtx did not translate banglish');
    }
    if (normalizeCmp(r.text) !== normalizeCmp(raw) || source === 'auto' || source === target) {
      const out = { text: r.text, provider: r.provider, source: r.detectedLang || source, target };
      setCached(ck, out);
      return out;
    }
  } catch (err) {
    errors.push(`gtx: ${err.message}`);
  }

  // 2) MyMemory
  try {
    const sl = source === 'banglish' ? 'bn' : source === 'auto' ? 'en' : source;
    // For auto→en we need a real source; skip if auto
    if (source !== 'auto' || target !== 'en') {
      const r = await mymemoryTranslate(raw, sl === 'auto' ? 'en' : sl, target);
      if (normalizeCmp(r.text) !== normalizeCmp(raw) || /match|quality/i.test(String(r.confidence))) {
        const out = { text: r.text, provider: r.provider, source: sl, target };
        setCached(ck, out);
        return out;
      }
    }
    if (source !== 'auto') {
      const r = await mymemoryTranslate(raw, sl, target);
      const out = { text: r.text, provider: r.provider, source: sl, target };
      if (normalizeCmp(out.text) !== normalizeCmp(raw)) {
        setCached(ck, out);
        return out;
      }
    }
  } catch (err) {
    errors.push(`mymemory: ${err.message}`);
  }

  // 3) LibreTranslate
  try {
    const r = await libreTranslate(raw, source === 'banglish' ? 'auto' : source || 'auto', target);
    const out = { text: r.text, provider: r.provider, source: r.detectedLang || source, target };
    setCached(ck, out);
    return out;
  } catch (err) {
    errors.push(`libre: ${err.message}`);
  }

  // 4) LLM fallback (especially Banglish)
  try {
    const label = source === 'banglish' || looksLikeBanglish(raw) ? 'banglish' : source;
    const r = await llmTranslate(raw, label, target);
    const out = { text: r.text, provider: r.provider, source: label, target };
    setCached(ck, out);
    return out;
  } catch (err) {
    errors.push(`llm: ${err.message}`);
  }

  console.warn('[translator] all providers failed:', errors.join(' | '));
  // Last resort: return original so chat still works
  return { text: raw, provider: 'passthrough', source, target, error: errors.join('; ') };
}

function normalizeCmp(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Full round-trip prep for the chat AI:
 *  detect → translate user message to English if needed.
 */
export async function prepareUserMessage(userText) {
  const original = String(userText || '').trim();
  const detection = await detectLanguage(original);

  const needsTranslate =
    detection.isBanglish ||
    (detection.lang && detection.lang !== 'en' && detection.confidence >= 0.45);

  if (!needsTranslate) {
    return {
      original,
      english: original,
      lang: 'en',
      isBanglish: false,
      translatedIn: false,
      detection,
      translateProvider: 'none',
    };
  }

  const source = detection.isBanglish ? 'banglish' : detection.lang || 'auto';
  const tr = await translateText(original, source, 'en');

  // If translation failed / identical and banglish, force LLM path once more
  let english = tr.text;
  let provider = tr.provider;
  if (detection.isBanglish && normalizeCmp(english) === normalizeCmp(original)) {
    try {
      const llm = await llmTranslate(original, 'banglish', 'en');
      english = llm.text;
      provider = llm.provider;
    } catch {
      /* keep */
    }
  }

  console.log(
    `[translator] user ${detection.lang}${detection.isBanglish ? '/banglish' : ''} → en via ${provider}`
  );

  return {
    original,
    english: english || original,
    lang: detection.isBanglish ? 'bn' : detection.lang || 'auto',
    isBanglish: !!detection.isBanglish,
    translatedIn: normalizeCmp(english) !== normalizeCmp(original),
    detection,
    translateProvider: provider,
  };
}

/**
 * Translate AI English reply back to the user's language (if needed).
 */
export async function localizeReply(englishReply, userLang, isBanglish = false) {
  const text = String(englishReply || '').trim();
  if (!text) return { text: '', provider: 'none' };

  // Always return English if user spoke English
  if (!userLang || userLang === 'en') {
    return { text, provider: 'identity' };
  }

  // For Banglish users we reply in proper Bangla script (readable, standard)
  // unless BANGLISH_REPLY=1 is set — then romanized via LLM.
  const preferBanglishReply = process.env.BANGLISH_REPLY === '1' && isBanglish;
  if (preferBanglishReply) {
    try {
      const system = `You are a translator. Convert the English text into natural Banglish (Bengali written with English letters), casual chat style. Output ONLY the Banglish text.`;
      const result = await queryAI(system, text);
      if (result?.response) {
        return {
          text: result.response.trim().replace(/^["']|["']$/g, ''),
          provider: 'llm-banglish',
        };
      }
    } catch (err) {
      console.warn('[translator] banglish reply failed:', err.message);
    }
  }

  const target = userLang === 'bn' || isBanglish ? 'bn' : userLang;
  const tr = await translateText(text, 'en', target);
  console.log(`[translator] reply en → ${target} via ${tr.provider}`);
  return { text: tr.text || text, provider: tr.provider, target };
}

/**
 * Status for /api/ai/status — which free translators are ready.
 */
export function getTranslatorStatus() {
  const cfg = getConfig();
  return {
    enabled: true,
    providers: [
      {
        name: 'gtx',
        displayName: 'Google Translate (free gtx)',
        configured: true, // no key required
        requiresKey: false,
      },
      {
        name: 'mymemory',
        displayName: 'MyMemory',
        configured: true, // works without key; key boosts quota
        requiresKey: false,
        keyConfigured: Boolean(cfg.mymemoryKey),
      },
      {
        name: 'libretranslate',
        displayName: 'LibreTranslate',
        configured: Boolean(cfg.libreKey),
        requiresKey: true,
        signup: 'https://portal.libretranslate.com (free, no card)',
      },
      {
        name: 'llm',
        displayName: 'LLM fallback (Banglish)',
        configured: true, // uses existing AI provider keys
        requiresKey: false,
        note: 'Uses your existing free Groq/OpenRouter/etc keys',
      },
    ],
  };
}
