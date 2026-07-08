const SENSITIVE = /cookie|authorization|token|password|signature|client-api-header/i;

function redactValue(key, value) {
  if (!value) return value;
  if (SENSITIVE.test(key)) return '[redacted]';
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 80)}…` : text;
}

function redactHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

export function createToffeeLogger(baseMeta = {}) {
  return {
    info(event, meta = {}) {
      console.log(JSON.stringify({
        level: 'info',
        component: 'toffee-pipeline',
        event,
        at: new Date().toISOString(),
        ...baseMeta,
        ...meta,
      }));
    },
    error(event, meta = {}) {
      const payload = { ...meta };
      if (payload.headers) payload.headers = redactHeaders(payload.headers);
      console.error(JSON.stringify({
        level: 'error',
        component: 'toffee-pipeline',
        event,
        at: new Date().toISOString(),
        ...baseMeta,
        ...payload,
      }));
    },
  };
}