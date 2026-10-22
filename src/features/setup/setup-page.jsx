// First-run setup: choose real AI (your own key) or demo mode, get a key,
// paste and test it. A side panel explains what happens on every AI request.

import { useState } from 'react';
import { ArrowRightIcon, ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { getAiSettings, saveAiSettings, testConnection } from '@/data/backend';
import { navigate } from '@/hooks/use-hash-route';
import { PROVIDERS } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { showError, useApp } from '@/state/app';
import { BrandMark } from '@/components/layout/app-shell';
import { shortProvider } from '@/components/ai';

const ONBOARDED_KEY = 'focusflow:onboarded:v1';
export function isOnboarded() {
  try { return localStorage.getItem(ONBOARDED_KEY) === '1'; } catch { return true; }
}
function markOnboarded() {
  try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch { /* ignore */ }
}

const STEPS = {
  gemini: ['Open Google AI Studio and sign in with your Google account.', 'Click “Create API key”.', 'Copy the key and paste it below.'],
  openai: ['Open the OpenAI API keys page and sign in.', 'Add a payment method or credits if asked.', 'Click “Create new secret key”, copy it and paste it below.'],
  anthropic: ['Open the Anthropic Console and sign in.', 'Add credits if asked.', 'Click “Create Key”, copy it and paste it below.'],
};
const LINK_LABEL = { gemini: 'Open Google AI Studio', openai: 'Open OpenAI API keys', anthropic: 'Open the Anthropic Console' };
const COST = { gemini: 'Free tier', openai: 'Paid', anthropic: 'Paid' };

function StepCard({ n, title, children }) {
  return (
    <section aria-labelledby={`step-${n}`} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-lg font-bold">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-primary text-sm text-primary-foreground">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SetupPage() {
  const { refresh } = useApp();
  const saved = getAiSettings();
  const [mode, setMode] = useState('key');
  const [provider, setProvider] = useState(saved.provider || 'gemini');
  const [key, setKey] = useState(saved.key);
  const [status, setStatus] = useState(saved.key ? 'ok' : 'idle');
  const [message, setMessage] = useState('');
  const p = PROVIDERS[provider];

  const test = async () => {
    setStatus('testing');
    setMessage('');
    try {
      const r = await testConnection({ provider, key, model: '' });
      setStatus('ok');
      setMessage(`Connected to ${r.label} (${r.model}). You're ready.`);
    } catch (err) {
      setStatus('bad');
      setMessage(err.message);
    }
  };

  const finish = async () => {
    try {
      if (mode === 'key') saveAiSettings({ provider, key, model: saved.provider === provider ? saved.model : '' });
      markOnboarded();
      await refresh();
      navigate('today');
    } catch (err) {
      showError(err.message);
    }
  };

  const ready = mode === 'demo' || status === 'ok';
  const card = (on) => cn('flex flex-1 basis-64 cursor-pointer items-start gap-3 rounded-xl p-4 text-left', on ? 'border-2 border-primary bg-card' : 'border border-border bg-muted');

  return (
    <div className="min-h-dvh px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-lg font-extrabold"><BrandMark />FocusFlow</div>
          <button type="button" onClick={() => { markOnboarded(); navigate('today'); }} className="min-h-11 font-bold underline underline-offset-2">Skip for now</button>
        </div>
        <div>
          <h1 className="text-[34px] leading-tight font-extrabold tracking-tight">Set up the AI coach</h1>
          <p className="mt-1.5 max-w-[64ch] text-ink-2">The coach turns your tasks and tracked time into realistic plans and weekly reviews. It takes about two minutes, and you can change it any time in Settings.</p>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[14_1_520px] flex-col gap-4">
            <StepCard n={1} title="Choose how the coach works">
              <div role="radiogroup" aria-labelledby="step-1" className="flex flex-wrap gap-3">
                <button type="button" role="radio" aria-checked={mode === 'key'} onClick={() => setMode('key')} className={card(mode === 'key')}>
                  <span aria-hidden="true" className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', mode === 'key' ? 'border-primary' : 'border-input')}>{mode === 'key' && <span className="size-2.5 rounded-full bg-primary" />}</span>
                  <span className="flex flex-col gap-1">
                    <strong>Use real AI with your own key</strong>
                    <span className="text-sm text-ink-2">Plans and reviews written by Gemini, ChatGPT or Claude. Usage is billed to your own account; Gemini has a free tier.</span>
                  </span>
                </button>
                <button type="button" role="radio" aria-checked={mode === 'demo'} onClick={() => setMode('demo')} className={card(mode === 'demo')}>
                  <span aria-hidden="true" className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', mode === 'demo' ? 'border-primary' : 'border-input')}>{mode === 'demo' && <span className="size-2.5 rounded-full bg-primary" />}</span>
                  <span className="flex flex-col gap-1">
                    <strong>Try demo mode</strong>
                    <span className="text-sm text-ink-2">Simple built-in rules, no account needed. Not real AI: plans are generic and reviews only restate your numbers.</span>
                  </span>
                </button>
              </div>
            </StepCard>

            {mode === 'key' && (
              <>
                <StepCard n={2} title="Get a key from a provider">
                  <ToggleGroup type="single" value={provider} onValueChange={(v) => { if (v) { setProvider(v); setKey(v === saved.provider ? saved.key : ''); setStatus(v === saved.provider && saved.key ? 'ok' : 'idle'); setMessage(''); } }} aria-label="Provider">
                    {Object.entries(PROVIDERS).map(([id, pr]) => (
                      <ToggleGroupItem key={id} value={id} className="h-10">{pr.label} <span className="font-medium text-muted-foreground">{COST[id]}</span></ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <ol className="flex list-decimal flex-col gap-1.5 pl-6">
                    {STEPS[provider].map((s) => <li key={s}>{s}</li>)}
                  </ol>
                  <Button asChild variant="outline" className="self-start">
                    <a href={p.keyUrl} target="_blank" rel="noopener noreferrer">{LINK_LABEL[provider]}<ExternalLinkIcon aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>
                  </Button>
                </StepCard>

                <StepCard n={3} title="Paste it and test">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="setup-key">{p.label} API key</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input id="setup-key" type="password" value={key} onChange={(e) => { setKey(e.target.value); setStatus('idle'); setMessage(''); }} autoComplete="off" spellCheck={false} placeholder="Paste your key" className="h-12 flex-[1_1_260px] font-mono text-sm" aria-describedby="setup-help setup-status" />
                      <Button variant="outline" className="h-12" onClick={test} disabled={!key.trim() || status === 'testing'}>{status === 'testing' ? 'Testing…' : 'Test key'}</Button>
                    </div>
                    <p id="setup-help" className="text-sm text-muted-foreground">FocusFlow sends one tiny request to check the key works. It costs a few tokens.</p>
                  </div>
                  <div id="setup-status" role="status" aria-live="polite">
                    {status === 'ok' && <p className="rounded-md bg-act-soft px-3 py-2.5 font-bold text-act-strong">{message || `Key saved for ${p.label}. You're ready.`}</p>}
                    {status === 'bad' && <p className="rounded-md bg-danger-soft px-3 py-2.5 font-bold text-destructive">{message} Copy the key again from the provider’s page, with no spaces, and test again.</p>}
                  </div>
                </StepCard>
              </>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="h-12 px-6" onClick={finish} disabled={!ready}>
                {mode === 'key' ? 'Save and start planning' : 'Start in demo mode'}<ArrowRightIcon aria-hidden="true" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {ready ? (mode === 'key' ? 'Your key will be saved in this browser.' : 'You can add a key later in Settings.') : 'Test your key first.'}
              </span>
            </div>
          </div>

          <aside className="flex min-w-0 flex-[10_1_320px] flex-col gap-4">
            <section aria-labelledby="how-h" className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <h2 id="how-h" className="mb-3 text-lg font-bold">What happens when you ask the coach</h2>
              <ol className="flex flex-col gap-3">
                {[
                  ['You ask', 'for example “Plan the rest of my day”.'],
                  ['FocusFlow calculates', 'your totals and builds the request: open tasks and recent numbers. You can see the exact data before it is sent.'],
                  ['The AI drafts', 'a plan or review from that data, following FocusFlow’s instructions and a worked example.'],
                  ['FocusFlow checks it', ': does it fit your time, include breaks, and use only real numbers? If not, it sends the problems back for a fix, up to twice.'],
                  ['You decide.', 'Nothing changes until you accept, edit or discard it.'],
                ].map(([a, b], i) => (
                  <li key={a} className="grid grid-cols-[24px_1fr] gap-2">
                    <span className="font-extrabold text-ai">{i + 1}</span>
                    <span><strong>{a}</strong>{b.startsWith(':') ? b : ` ${b}`}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section aria-labelledby="key-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 sm:p-6">
              <h2 id="key-h" className="text-lg font-bold">Where your key goes</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 basis-32 rounded-lg border border-border bg-muted p-3"><div className="font-bold">Your browser</div><div className="text-sm text-ink-2">Key saved here only</div></div>
                <ArrowRightIcon className="size-6 shrink-0" aria-hidden="true" />
                <div className="flex-1 basis-32 rounded-lg border border-ai bg-ai-soft p-3"><div className="font-bold">{mode === 'demo' ? 'Nowhere' : p.label}</div><div className="text-sm text-ink-2">{mode === 'demo' ? 'Demo mode stays offline' : 'Receives each request'}</div></div>
              </div>
              <p className="text-sm text-ink-2">FocusFlow has no server, so it never sees your key. It’s left out of data exports. Remove it any time in Settings, and don’t save it on a shared computer.</p>
            </section>
            <p className="px-1 text-sm text-muted-foreground">Currently: {saved.key ? `${shortProvider({ name: saved.provider })} key saved` : 'no key saved'}.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
