// Thin adapters over three hosted LLM APIs. Each takes the shared persona
// (system prompt) plus a list of {role, content} messages and returns the
// model's text and token usage. Only `fetch` is used — no vendor SDKs.

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 45000);

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-flash-latest',
  },
  openai: {
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-5-mini',
  },
  anthropic: {
    label: 'Anthropic Claude',
    keyEnv: 'ANTHROPIC_API_KEY',
    modelEnv: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-haiku-5-5',
  },
};

export class ProviderError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/** Decide which provider to use from env. AI_PROVIDER wins; otherwise first key found; otherwise demo. */
export function resolveProvider(env = process.env) {
  const wanted = (env.AI_PROVIDER || '').toLowerCase().trim();
  if (wanted === 'demo') return { name: 'demo', label: 'Demo mode (offline)', model: 'heuristic' };
  const order = wanted && PROVIDERS[wanted] ? [wanted] : ['gemini', 'openai', 'anthropic'];
  for (const name of order) {
    const p = PROVIDERS[name];
    const key = env[p.keyEnv];
    if (key && key.trim()) return { name, label: p.label, model: env[p.modelEnv] || p.defaultModel, key: key.trim() };
  }
  return { name: 'demo', label: 'Demo mode (offline)', model: 'heuristic' };
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
    throw new ProviderError(timedOut ? 'The AI service took too long to respond.' : `Could not reach the AI service (${err.message}).`, { retryable: true });
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    const detail = data?.error?.message || data?.message || text.slice(0, 200);
    const retryable = res.status === 429 || res.status >= 500;
    let hint = '';
    if (res.status === 401 || res.status === 403) hint = ' Check that your API key is correct.';
    if (res.status === 404) hint = ' The model name may be wrong — set the *_MODEL variable in .env.';
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
