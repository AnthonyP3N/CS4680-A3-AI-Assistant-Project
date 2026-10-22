import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, ProviderError, callModel, mayTrainOnPrompts, resolveProvider } from '../src/lib/providers.js';

const realFetch = globalThis.fetch;
const reply = (status, body) => async (url, init) => {
  reply.last = { url, init, body: JSON.parse(init.body) };
  return new Response(JSON.stringify(body), { status });
};

test('OpenRouter: default free model, OpenAI-style request, JSON reply', async () => {
  const p = resolveProvider({ provider: 'openrouter', key: ' sk-or-test ' });
  assert.equal(p.model, PROVIDERS.openrouter.defaultModel);
  assert.ok(p.model.endsWith(':free'));
  globalThis.fetch = reply(200, { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
  try {
    const r = await callModel(p, 'system text', [{ role: 'user', content: 'hi' }]);
    assert.equal(r.text, '{"ok":true}');
    assert.deepEqual(r.usage, { input: 12, output: 3 });
    assert.equal(reply.last.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(reply.last.init.headers.authorization, 'Bearer sk-or-test');
    assert.equal(reply.last.body.model, 'nvidia/nemotron-3-ultra-550b-a55b:free');
    assert.equal(reply.last.body.messages[0].role, 'system');
  } finally { globalThis.fetch = realFetch; }
});

test('OpenRouter: rate limits and upstream errors become clear, retryable messages', async () => {
  const p = resolveProvider({ provider: 'openrouter', key: 'k' });
  try {
    globalThis.fetch = reply(429, { error: { message: 'Rate limit exceeded: free-models-per-day' } });
    await assert.rejects(callModel(p, 's', []), (e) => e instanceof ProviderError && e.retryable && /50 a day/.test(e.message));
    globalThis.fetch = reply(200, { error: { message: 'Provider returned error', code: 502 } });
    await assert.rejects(callModel(p, 's', []), (e) => e instanceof ProviderError && e.retryable && /OpenRouter/.test(e.message));
    globalThis.fetch = reply(402, { error: { message: 'Insufficient credits' } });
    await assert.rejects(callModel(p, 's', []), /:free/);
  } finally { globalThis.fetch = realFetch; }
});

test('free OpenRouter models are flagged so the UI can warn before journal text is sent', () => {
  assert.equal(mayTrainOnPrompts(resolveProvider({ provider: 'openrouter', key: 'k' })), true);
  assert.equal(mayTrainOnPrompts(resolveProvider({ provider: 'openrouter', key: 'k', model: 'openai/gpt-5-mini' })), false);
  assert.equal(mayTrainOnPrompts(resolveProvider({ provider: 'gemini', key: 'k' })), false);
});
