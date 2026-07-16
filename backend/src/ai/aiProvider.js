// ---------------------------------------------------------------------------
// AI Provider — Multi-provider LLM integration for BGC Sports AI Agent.
//
// Supports multiple AI providers with automatic fallback:
//   1. Groq (fast inference, Llama/Mixtral)
//   2. Cerebras (ultra-fast inference)
//   3. Google Gemini (multimodal, large context)
//   4. NVIDIA NIM (DeepSeek, Llama, Qwen)
//   5. OpenRouter (access to many models)
//   6. Mistral AI
//   7. HuggingFace Inference
//
// queryAI()      — full answer path (more tokens, more fallbacks)
// queryAIFast()  — prompt-creator / verifier (short timeout, 1–2 providers)
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT = 12000;
const FAST_TIMEOUT = 6000;

// Provider configurations
const PROVIDERS = {
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    model: 'llama-3.3-70b-versatile',
    name: 'Groq',
  },
  cerebras: {
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    envKey: 'CEREBRAS_API_KEY',
    model: 'gpt-oss-120b',
    name: 'Cerebras',
  },
  gemini: {
    endpoint: null,
    envKey: 'GEMINI_API_KEY',
    model: 'gemini-2.0-flash',
    name: 'Gemini',
  },
  nvidia_deepseek: {
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_DEEPSEEK_API_KEY',
    model: 'deepseek-ai/deepseek-r1-distill-llama-70b',
    name: 'NVIDIA DeepSeek',
  },
  nvidia_llama: {
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_LLAMA_API_KEY',
    model: 'meta/llama-3.3-70b-instruct',
    name: 'NVIDIA Llama',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    model: 'meta-llama/llama-3.3-70b-instruct',
    name: 'OpenRouter',
  },
  mistral: {
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    envKey: 'MISTRAL_API_KEY',
    model: 'mistral-large-latest',
    name: 'Mistral',
  },
  huggingface: {
    endpoint: null,
    envKey: 'HUGGINGFACE_API_KEY',
    model: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'HuggingFace',
  },
};

function getProviderOrder() {
  const orderStr = process.env.AI_PROVIDER_ORDER || '';
  if (orderStr) {
    return orderStr.split(',').map((p) => p.trim()).filter(Boolean);
  }
  return [
    'groq',
    'openrouter',
    'mistral',
    'cerebras',
    'gemini',
    'nvidia_deepseek',
    'nvidia_llama',
    'huggingface',
  ];
}

function getApiKey(provider) {
  const config = PROVIDERS[provider];
  if (!config) return null;
  return (process.env[config.envKey] || '').trim() || null;
}

async function askOpenAICompatible(endpoint, apiKey, model, systemPrompt, userMessage, opts = {}) {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 1200;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
        top_p: 0.9,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function askGemini(apiKey, systemPrompt, userMessage, opts = {}) {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const temperature = opts.temperature ?? 0.4;
  const maxTokens = opts.maxTokens ?? 1200;
  const model = PROVIDERS.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.9,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function askHuggingFace(apiKey, systemPrompt, userMessage, opts = {}) {
  const model = PROVIDERS.huggingface.model;
  const endpoint = `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
  return askOpenAICompatible(endpoint, apiKey, model, systemPrompt, userMessage, opts);
}

/**
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {{
 *   timeoutMs?: number,
 *   maxProviders?: number,
 *   maxTokens?: number,
 *   temperature?: number,
 *   providers?: string[],
 * }} [options]
 */
export async function queryAI(systemPrompt, userMessage, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxProviders = options.maxProviders ?? 99;
  const maxTokens = options.maxTokens ?? 1200;
  const temperature = options.temperature ?? 0.4;
  const providerOrder = options.providers?.length
    ? options.providers
    : getProviderOrder();

  const errors = [];
  let tried = 0;

  for (const providerName of providerOrder) {
    if (tried >= maxProviders) break;
    const apiKey = getApiKey(providerName);
    if (!apiKey) continue;

    const provider = PROVIDERS[providerName];
    if (!provider) continue;
    tried += 1;

    const callOpts = { timeoutMs, maxTokens, temperature };

    try {
      let response;

      if (providerName === 'gemini') {
        response = await askGemini(apiKey, systemPrompt, userMessage, callOpts);
      } else if (providerName === 'huggingface') {
        response = await askHuggingFace(apiKey, systemPrompt, userMessage, callOpts);
      } else {
        response = await askOpenAICompatible(
          provider.endpoint,
          apiKey,
          provider.model,
          systemPrompt,
          userMessage,
          callOpts
        );
      }

      if (response) {
        console.log(`[AI] Response from ${provider.name} (${provider.model})`);
        return { response, provider: provider.name, model: provider.model };
      }
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
      console.warn(`[AI] Provider ${provider.name} failed:`, err.message);
      continue;
    }
  }

  console.error('[AI] All providers failed:', errors.join(' | '));
  return {
    response: null,
    error: 'All AI providers are currently unavailable. Please try again later.',
    details: errors,
  };
}

/**
 * Fast path for prompt-creator + verifier — never block the chat for minutes.
 * Uses only the first 2 configured providers, 6s timeout, small token budget.
 */
export async function queryAIFast(systemPrompt, userMessage, options = {}) {
  return queryAI(systemPrompt, userMessage, {
    timeoutMs: options.timeoutMs ?? FAST_TIMEOUT,
    maxProviders: options.maxProviders ?? 2,
    maxTokens: options.maxTokens ?? 500,
    temperature: options.temperature ?? 0.2,
    providers: options.providers,
  });
}

/** Race a promise against a timeout; returns fallback on timeout. */
export function withTimeout(promise, ms, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Vision (image) analysis — ZenMux primary, OpenRouter fallback
// ---------------------------------------------------------------------------

const VISION_TIMEOUT_MS = 25000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB decoded

/**
 * Normalize a client image payload to a data URL usable by OpenAI-compatible vision APIs.
 * @param {{ dataUrl?: string, base64?: string, mime?: string } | string | null} image
 */
export function normalizeImageDataUrl(image) {
  if (!image) return null;
  if (typeof image === 'string') {
    if (image.startsWith('data:image/')) return image;
    return `data:image/jpeg;base64,${image}`;
  }
  if (image.dataUrl && String(image.dataUrl).startsWith('data:image/')) {
    return String(image.dataUrl);
  }
  const mime = image.mime || 'image/jpeg';
  const b64 = String(image.base64 || '').replace(/\s/g, '');
  if (!b64) return null;
  return `data:${mime};base64,${b64}`;
}

function assertImageSizeOk(dataUrl) {
  const b64 = dataUrl.split(',')[1] || '';
  // base64 is ~4/3 of binary size
  const bytes = Math.floor((b64.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${Math.round(bytes / 1024)}KB). Max 4MB.`);
  }
  return bytes;
}

async function callOpenAIVision({ endpoint, apiKey, model, systemPrompt, userText, dataUrl, extraHeaders = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error?.message || data?.message || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    return { response: text, raw: data };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Analyze an image + question for BGC AI.
 * Primary: ZenMux (ZENMUX_API_KEY). Fallback: OpenRouter vision model.
 *
 * @param {string} systemPrompt
 * @param {string} userText
 * @param {{ dataUrl?: string, base64?: string, mime?: string } | string} image
 */
export async function queryVisionAI(systemPrompt, userText, image) {
  const dataUrl = normalizeImageDataUrl(image);
  if (!dataUrl) {
    return { response: null, error: 'No image provided.', provider: null };
  }

  try {
    assertImageSizeOk(dataUrl);
  } catch (err) {
    return { response: null, error: err.message, provider: null };
  }

  const zenmuxKey = (process.env.ZENMUX_API_KEY || '').trim();
  const zenmuxBase = (process.env.ZENMUX_BASE_URL || 'https://zenmux.ai/api/v1').replace(/\/$/, '');
  const zenmuxModel =
    (process.env.ZENMUX_VISION_MODEL || 'google/gemini-3.5-flash').trim();

  const errors = [];

  if (zenmuxKey) {
    try {
      const result = await callOpenAIVision({
        endpoint: `${zenmuxBase}/chat/completions`,
        apiKey: zenmuxKey,
        model: zenmuxModel,
        systemPrompt,
        userText,
        dataUrl,
        extraHeaders: {
          'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://preview.cryptobgc.eu.cc',
          'X-Title': 'BGC Sports AI',
        },
      });
      if (result.response) {
        console.log(`[AI-Vision] ZenMux ok model=${zenmuxModel}`);
        return {
          response: result.response,
          provider: 'ZenMux',
          model: zenmuxModel,
        };
      }
      errors.push('ZenMux: empty response');
    } catch (err) {
      errors.push(`ZenMux: ${err.message}`);
      console.warn('[AI-Vision] ZenMux failed:', err.message);
    }
  } else {
    errors.push('ZenMux: API key not configured');
  }

  // Fallback — OpenRouter (already used for text; gpt-4o-mini supports vision)
  const orKey = (process.env.OPENROUTER_API_KEY || '').trim();
  const orModel = (process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini').trim();
  if (orKey) {
    try {
      const result = await callOpenAIVision({
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: orKey,
        model: orModel,
        systemPrompt,
        userText,
        dataUrl,
        extraHeaders: {
          'HTTP-Referer': process.env.PUBLIC_SITE_URL || 'https://preview.cryptobgc.eu.cc',
          'X-Title': 'BGC Sports AI',
        },
      });
      if (result.response) {
        console.log(`[AI-Vision] OpenRouter ok model=${orModel}`);
        return {
          response: result.response,
          provider: 'OpenRouter',
          model: orModel,
          fallbackFrom: 'zenmux',
        };
      }
      errors.push('OpenRouter: empty response');
    } catch (err) {
      errors.push(`OpenRouter: ${err.message}`);
      console.warn('[AI-Vision] OpenRouter failed:', err.message);
    }
  }

  console.error('[AI-Vision] All vision providers failed:', errors.join(' | '));
  return {
    response: null,
    error:
      'Image analysis is temporarily unavailable. Please try again, or ask with text only.',
    details: errors,
    provider: null,
  };
}

export function getProviderStatus() {
  const order = getProviderOrder();
  const list = order.map((name) => ({
    name,
    displayName: PROVIDERS[name]?.name || name,
    model: PROVIDERS[name]?.model || 'unknown',
    configured: Boolean(getApiKey(name)),
  }));
  list.push({
    name: 'zenmux_vision',
    displayName: 'ZenMux Vision',
    model: process.env.ZENMUX_VISION_MODEL || 'google/gemini-3.5-flash',
    configured: Boolean((process.env.ZENMUX_API_KEY || '').trim()),
  });
  return list;
}
