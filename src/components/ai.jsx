// Everything that explains the AI: provenance labels, the live 5-step
// pipeline, the check log, and the "exact data" preview.

import { useState } from 'react';
import { AlertTriangleIcon, CalculatorIcon, CheckIcon, ChevronRightIcon, LoaderIcon, SparklesIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/misc';
import { useUi } from '@/state/ui';
import { cn } from '@/lib/utils';
import { fmtNum } from '@/lib/format';

export function shortProvider(p) {
  const name = p?.name;
  if (name === 'gemini') return 'Gemini';
  if (name === 'openai') return 'OpenAI';
  if (name === 'anthropic') return 'Claude';
  return 'Demo rules';
}

/** Violet label: the AI wrote this. */
export function AiBadge({ provider, className }) {
  const demo = !provider || provider.name === 'demo' || provider.demo;
  return (
    <Badge variant="ai" className={className}>
      <SparklesIcon aria-hidden="true" />
      {demo ? 'Demo suggestion' : `AI suggestion: ${shortProvider(provider)}`}
    </Badge>
  );
}

/** Gray label: FocusFlow calculated this in code. */
export function CalculatedBadge({ className }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="calculated" className={cn('cursor-help', className)} tabIndex={0}>
          <CalculatorIcon aria-hidden="true" />Calculated
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Calculated by FocusFlow from your saved sessions and tasks. The AI never does this math.</TooltipContent>
    </Tooltip>
  );
}

/**
 * The five steps of every AI request, driven by real progress events:
 * You asked → Sent → Drafted → Checked → Your call.
 */
export function Pipeline({ events = [], status, provider, sentLabel = 'your data', className }) {
  const who = shortProvider(provider);
  const has = (stage) => events.some((e) => e.stage === stage);
  const checks = events.filter((e) => e.stage === 'checked');
  const failed = checks.filter((e) => e.problems > 0).length;
  const last = events[events.length - 1];
  const done = status === 'done' || has('done');
  const revising = last?.stage === 'revising';

  const steps = [
    { label: 'You asked', state: 'done' },
    { label: `Sent ${sentLabel}`, state: has('sent') ? 'done' : 'active' },
    {
      label: revising ? `${who} is revising` : `${who} ${done || checks.length ? 'drafted' : 'is drafting'}`,
      state: checks.length && !revising ? 'done' : has('sent') ? 'active' : 'todo',
    },
    {
      label: !checks.length ? 'FocusFlow checks it' : failed ? `FocusFlow checked, sent back ${failed}×` : 'FocusFlow checked it',
      state: done ? 'done' : checks.length ? 'active' : 'todo',
    },
    { label: 'Your call', state: done ? 'active' : 'todo' },
  ];

  return (
    <ol aria-label="How this AI request is going" className={cn('flex flex-wrap gap-1.5', className)}>
      {steps.map((s, i) => (
        <li
          key={i}
          aria-current={s.state === 'active' ? 'step' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px]',
            s.state === 'done' && 'bg-act-soft text-act-strong',
            s.state === 'active' && 'bg-ai-soft text-ai ring-[1.5px] ring-ai',
            s.state === 'todo' && 'bg-muted text-muted-foreground',
          )}
        >
          {s.state === 'done' ? <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" />
            : s.state === 'active' && i < 4 ? <LoaderIcon className="size-3.5 animate-spin" aria-hidden="true" />
              : <span className="font-extrabold" aria-hidden="true">{i + 1}</span>}
          <span>{s.label}</span>
          <span className="sr-only">{s.state === 'done' ? '(done)' : s.state === 'active' ? '(in progress)' : '(not started)'}</span>
        </li>
      ))}
    </ol>
  );
}

/** What FocusFlow checked, and what it sent back for revision. */
export function CheckLog({ attempts = [], defaultOpen }) {
  const problems = attempts.reduce((a, s) => a + (s.problems?.length || 0), 0);
  const [open, setOpen] = useState(defaultOpen ?? problems > 0);
  const fixed = attempts.filter((a) => !a.passed).length;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-bold">
        <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        {fixed ? `Checked by FocusFlow: ${fixed === 1 ? '1 draft' : `${fixed} drafts`} sent back, then passed` : 'Checked by FocusFlow: passed every check'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="flex flex-col gap-3 px-3 pb-3 text-sm">
          {attempts.map((s, i) => (
            <li key={i} className="grid grid-cols-[22px_1fr] gap-2">
              <span className={cn('grid size-5 place-items-center rounded-full text-xs font-extrabold', s.passed ? 'bg-act-soft text-act-strong' : 'bg-warn-soft text-warn')} aria-hidden="true">
                {s.passed ? <CheckIcon className="size-3" strokeWidth={3} /> : '!'}
              </span>
              <div>
                <strong>{s.step}</strong>{' '}
                {s.passed ? 'passed every check.' : `had ${s.problems.length} ${s.problems.length === 1 ? 'problem' : 'problems'}, sent back with this list:`}
                {s.note && <span className="text-muted-foreground"> {s.note}</span>}
                {!!s.problems?.length && (
                  <ul className="mt-1 list-disc pl-5 text-ink-2">
                    {s.problems.map((p, k) => <li key={k}>{p}</li>)}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The exact JSON sent (or about to be sent) to the AI provider. */
export function DataPreview({ data, label = 'See the exact data' }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="link" size="sm" className="h-8 text-sm font-medium text-ink-2">{open ? 'Hide the exact data' : label}</Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** "Sends …" summary box shown before every AI request. */
export function SendSummary({ provider, items, data }) {
  const who = provider?.demo ? 'FocusFlow’s demo rules (nothing leaves your browser)' : shortProvider(provider);
  return (
    <div className="rounded-lg bg-muted p-3 text-sm">
      <div className="font-bold">What gets sent to {who}</div>
      <ul className="mt-1 list-disc pl-5 text-ink-2">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
      {data && <DataPreview data={data} />}
    </div>
  );
}

/** Shown on results from demo mode, so nobody mistakes them for AI. */
export function DemoNote() {
  const { openSettings } = useUi();
  return (
    <p className="rounded-md bg-hl-soft px-3 py-2 text-sm text-ink-2">
      <strong className="text-foreground">Demo mode.</strong> FocusFlow’s built-in rules made this, not an AI model.{' '}
      <button type="button" onClick={() => openSettings('ai')} className="font-bold text-foreground underline underline-offset-2">Add your own API key</button> for real AI.
    </p>
  );
}

export function TokenNote({ revision }) {
  if (!revision) return null;
  if (revision.provider?.name === 'demo') return <p className="text-xs text-muted-foreground">Made offline by demo rules. No tokens used.</p>;
  return (
    <p className="text-xs text-muted-foreground">
      {revision.tokens ? `${fmtNum(revision.tokens)} tokens used on your ${shortProvider(revision.provider)} key.` : `Made with your ${shortProvider(revision.provider)} key.`}
    </p>
  );
}

export function ErrorNote({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-destructive bg-danger-soft p-3 text-sm">
      <p className="flex gap-2"><AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /><span><strong>The AI couldn’t finish.</strong> {message}</span></p>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
