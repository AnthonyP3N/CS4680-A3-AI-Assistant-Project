// Thin adapters over three hosted LLM APIs, called straight from the
// visitor's browser with the visitor's own API key. Each takes the shared
// persona (system prompt) plus a list of {role, content} messages and returns
// the model's text and token usage. Only `fetch` is used — no vendor SDKs.

const TIMEOUT_MS = 60000;

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-flash-latest',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'Free tier available',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'Paid, pay as you go',
  },
  anthropic: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-haiku-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'Paid, pay as you go',
  },
};

export const DEMO_PROVIDER = Object.freeze({ name: 'demo', label: 'Demo mode (offline)', model: 'heuristic' });

export class ProviderError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Turn the visitor's saved AI settings ({ provider, key, model }) into a
 * provider to call. No key (or provider "demo") means offline demo mode.
 */
export function resolveProvider(settings = {}) {
  const name = settings.provider;
  const key = typeof settings.key === 'string' ? settings.key.trim() : '';
  if (!PROVIDERS[name] || !key) return { ...DEMO_PROVIDER };
  const model = (typeof settings.model === 'string' && settings.model.trim()) || PROVIDERS[name].defaultModel;
  return { name, label: PROVIDERS[name].label, model, key };
}

async function postJson(url, headers, body) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw new ProviderError(timedOut ? 'The AI service took too long to respond.' : 'Could not reach the AI service. Check your internet connection.', { retryable: true });
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    const detail = data?.error?.message || data?.message || text.slice(0, 200);
    const retryable = res.status === 429 || res.status >= 500;
    let hint = '';
    if (res.status === 401 || res.status === 403) hint = ' Check the API key in Settings.';
    if (res.status === 404) hint = ' The model name may be out of date. Change it in Settings.';
    if (res.status === 429) hint = ' Rate limit or quota reached.';
    throw new ProviderError(`AI service error ${res.status}: ${detail}${hint}`, { status: res.status, retryable });
  }
  return data;
}

async function callGemini({ key, model }, system, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const data = await postJson(url, { 'x-goog-api-key': key }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  });
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new ProviderError(`The model returned no text (${data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'unknown reason'}).`, { retryable: true });
  return { text, usage: { input: data.usageMetadata?.promptTokenCount, output: data.usageMetadata?.candidatesTokenCount } };
}

async function callOpenAI({ key, model }, system, messages) {
  const data = await postJson('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${key}` }, {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    response_format: { type: 'json_object' },
  });
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new ProviderError('The model returned no text.', { retryable: true });
  return { text, usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens } };
}

async function callAnthropic({ key, model }, system, messages) {
  const data = await postJson('https://api.anthropic.com/v1/messages', {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    // Required by Anthropic for calls made directly from a web page.
    'anthropic-dangerous-direct-browser-access': 'true',
  }, {
    model,
    max_tokens: 2500,
    system,
    messages,
  });
  const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new ProviderError('The model returned no text.', { retryable: true });
  return { text, usage: { input: data.usage?.input_tokens, output: data.usage?.output_tokens } };
}

const CALLERS = { gemini: callGemini, openai: callOpenAI, anthropic: callAnthropic };

export async function callModel(provider, system, messages) {
  const fn = CALLERS[provider.name];
  if (!fn) throw new ProviderError(`Unknown provider ${provider.name}`);
  return fn(provider, system, messages);
}

/** Pull the first JSON object out of model text (handles stray code fences). */
export function extractJson(text) {
  if (typeof text !== 'string') throw new Error('No text to parse');
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}
