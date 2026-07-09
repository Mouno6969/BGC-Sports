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
// The system tries providers in order and falls back on failure.
// ---------------------------------------------------------------------------

const TIMEOUT = 15000; // 15 seconds for AI responses

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
    endpoint: null, // Uses different API format
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
    endpoint: null, // Dynamic based on model
    envKey: 'HUGGINGFACE_API_KEY',
    model: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'HuggingFace',
  },
};

// Provider priority order (configurable via env)
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

// ---------------------------------------------------------------------------
// Provider-specific request functions
// ---------------------------------------------------------------------------

async function askOpenAICompatible(endpoint, apiKey, model, systemPrompt, userMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        max_tokens: 1200,
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

async function askGemini(apiKey, systemPrompt, userMessage) {
  const model = PROVIDERS.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1200,
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

async function askHuggingFace(apiKey, systemPrompt, userMessage) {
  const model = PROVIDERS.huggingface.model;
  const endpoint = `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
  return askOpenAICompatible(endpoint, apiKey, model, systemPrompt, userMessage);
}

// ---------------------------------------------------------------------------
// Main AI query function with provider fallback
// ---------------------------------------------------------------------------

export async function queryAI(systemPrompt, userMessage) {
  const providerOrder = getProviderOrder();
  const errors = [];

  for (const providerName of providerOrder) {
    const apiKey = getApiKey(providerName);
    if (!apiKey) continue;

    const provider = PROVIDERS[providerName];
    if (!provider) continue;

    try {
      let response;

      if (providerName === 'gemini') {
        response = await askGemini(apiKey, systemPrompt, userMessage);
      } else if (providerName === 'huggingface') {
        response = await askHuggingFace(apiKey, systemPrompt, userMessage);
      } else {
        response = await askOpenAICompatible(
          provider.endpoint,
          apiKey,
          provider.model,
          systemPrompt,
          userMessage
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

// ---------------------------------------------------------------------------
// Get configured providers status (for admin/health check)
// ---------------------------------------------------------------------------

export function getProviderStatus() {
  const order = getProviderOrder();
  return order.map((name) => ({
    name,
    displayName: PROVIDERS[name]?.name || name,
    model: PROVIDERS[name]?.model || 'unknown',
    configured: Boolean(getApiKey(name)),
  }));
}
