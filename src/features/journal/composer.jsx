// New entry: a question to start from, an optional title, the reflection,
// energy and tags. Linked to the last session, autosaved as a draft, with a
// word count and a full-screen writing mode for long entries.

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LockIcon, Maximize2Icon, PenLineIcon, ShuffleIcon, XIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/data/api';
import { fmtDateShort, fmtMinutes } from '@/lib/format';
import { JOURNAL_AI_CHARS, JOURNAL_TITLE_MAX } from '@/lib/inputs';
import { PROMPTS, TAG_OPTIONS } from '@/lib/journal-meta';
import { draftStatus } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';
import { EnergyField, TagsField } from './fields';

const DRAFT_KEY = 'focusflow:journal-draft:v2';
const EMPTY = { title: '', body: '', tags: [], energy: '' };

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || JSON.parse(localStorage.getItem('focusflow:journal-draft:v1') || 'null');
    return {
      title: typeof d?.title === 'string' ? d.title : '',
      body: typeof d?.body === 'string' ? d.body : '',
      tags: Array.isArray(d?.tags) ? d.tags.filter((t) => TAG_OPTIONS.some(([v]) => v === t)) : [],
      energy: d?.energy || '',
    };
  } catch {
    return { ...EMPTY };
  }
}

const hasContent = (d) => !!(d.title.trim() || d.body.trim() || d.tags.length || d.energy);

/** True when an unsaved draft is waiting on this device. */
export const hasSavedDraft = () => hasContent(loadDraft());

/** The session this entry is probably about: the last one, if recent and not yet reflected on. */
function useRecentSession() {
  const { boot } = useApp();
  return useMemo(() => {
    const s = boot.recentSessions[0];
    if (!s || Date.now() - Date.parse(s.endedAt) > 3 * 3600_000) return null;
    if (boot.journal.some((j) => j.sessionId === s.id)) return null;
    return s;
  }, [boot.recentSessions, boot.journal]);
}

function Counter({ status, id, hint }) {
  return (
    <p id={id} aria-live="polite" className={cn('min-h-5 text-sm tabular-nums', status.tone === 'over' ? 'font-bold text-destructive' : status.tone === 'warn' ? 'font-bold text-warn' : 'text-muted-foreground')}>
      {status.text || hint}
    </p>
  );
}

/**
 * Ref exposes focus(): put the cursor in the title.
 * onClose: leave the New entry view (the draft is kept).
 */
export const Composer = forwardRef(function Composer({ onSaved, onClose }, fwdRef) {
  const { boot, mutate } = useApp();
  const session = useRecentSession();
  const [draft, setDraft] = useState(loadDraft);
  const [linked, setLinked] = useState(true);
  const [full, setFull] = useState(false);
  // Start from a different question each day.
  const [promptIdx, setPromptIdx] = useState(() => Number(boot.today.slice(8, 10)) % PROMPTS.length);
  const titleRef = useRef(null);
  const ref = useRef(null);
  const fullRef = useRef(null);
  const status = draftStatus(draft.body);
  const canSave = hasContent(draft) && status.tone !== 'over';
  const prompt = PROMPTS[promptIdx];
  const others = [1, 2].map((k) => (promptIdx + k) % PROMPTS.length);

  useImperativeHandle(fwdRef, () => ({
    focus() {
      titleRef.current?.focus();
    },
  }));

  // Autosave the draft, so a refresh or closed tab never loses writing.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (hasContent(draft)) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        else localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem('focusflow:journal-draft:v1');
      } catch { /* storage blocked: the draft still lives in memory */ }
    }, 400);
    return () => clearTimeout(id);
  }, [draft]);

  // Grow with the text up to 55% of the screen, then scroll.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(132, Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.55)))}px`;
  }, [draft.body]);

  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!canSave) return;
    const created = await mutate(() => api('/api/journal', {
      method: 'POST',
      body: {
        title: draft.title,
        body: draft.body,
        tags: draft.tags,
        energy: draft.energy || null,
        taskId: linked && session ? session.taskId : null,
        sessionId: linked && session ? session.id : null,
      },
    }), { undo: true, success: 'Reflection saved' });
    if (created) {
      setDraft({ ...EMPTY });
      setFull(false);
      setLinked(true);
      setPromptIdx((i) => (i + 1) % PROMPTS.length);
      onSaved?.(created);
    }
  };

  const openFull = () => {
    setFull(true);
    setTimeout(() => { fullRef.current?.focus(); fullRef.current?.setSelectionRange(draft.body.length, draft.body.length); }, 50);
  };

  const placeholder = linked && session ? `How did “${session.taskTitleSnapshot}” go?` : 'Answer the question above, or write about anything.';

  return (
    <section aria-labelledby="new-h" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="new-h" className="flex items-center gap-2 text-lg font-bold"><PenLineIcon aria-hidden="true" className="size-5" />New entry</h2>
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            Today, {fmtDateShort(boot.today)}
            {session && linked && (
              <span className="inline-flex items-center gap-1">
                · After <strong className="font-bold text-ink-2">{session.taskTitleSnapshot}</strong>, {fmtMinutes(session.durationSeconds / 60)}
                <button type="button" onClick={() => setLinked(false)} aria-label={`Don’t link this entry to ${session.taskTitleSnapshot}`} className="grid size-7 place-items-center rounded-full hover:bg-accent">
                  <XIcon className="size-3.5" strokeWidth={3} />
                </button>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">{hasContent(draft) ? 'Draft saved on this device' : ''}</span>
          {onClose && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={hasContent(draft) ? 'Close. Your draft is kept.' : 'Close'}><XIcon /></Button>
              </TooltipTrigger>
              <TooltipContent>{hasContent(draft) ? 'Close. Your draft is kept.' : 'Close'}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold tracking-wide text-warn uppercase">A place to start</span>
        <p id="prompt-q" className="text-lg leading-snug font-bold">{prompt.q}</p>
        <div className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          {others.map((i) => (
            <button key={i} type="button" onClick={() => setPromptIdx(i)} className="min-h-8 rounded px-1.5 underline-offset-2 hover:bg-accent hover:text-foreground hover:underline">{PROMPTS[i].short}</button>
          ))}
          <button type="button" onClick={() => setPromptIdx((i) => (i + 3) % PROMPTS.length)} aria-label="Show other questions" className="grid size-8 place-items-center rounded hover:bg-accent hover:text-foreground">
            <ShuffleIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(200px,240px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-title">Entry title <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="entry-title" ref={titleRef} value={draft.title} maxLength={JOURNAL_TITLE_MAX} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. Make the first step smaller" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry">Your reflection</Label>
            <textarea
              id="entry"
              ref={ref}
              value={draft.body}
              onChange={(e) => set('body')(e.target.value)}
              placeholder={placeholder}
              aria-describedby="prompt-q entry-count"
              aria-invalid={status.tone === 'over' || undefined}
              className={cn('ruled w-full resize-y rounded-lg border border-input bg-card px-3.5 py-1 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-ring', status.tone === 'over' && 'border-destructive')}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Counter status={status} id="entry-count" hint="A few lines is enough." />
              <Button type="button" variant="ghost" size="sm" onClick={openFull}><Maximize2Icon aria-hidden="true" />Full screen</Button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <EnergyField id="energy-l" value={draft.energy} onChange={set('energy')} />
          <TagsField id="tags-l" value={draft.tags} onChange={set('tags')} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onClose && <Button variant="outline" onClick={onClose}>{hasContent(draft) ? 'Keep as draft' : 'Cancel'}</Button>}
        <Button onClick={save} disabled={!canSave}>Save reflection</Button>
      </div>

      <p className="-mx-5 -mb-5 flex items-start gap-2 rounded-b-xl border-t border-border bg-muted px-5 py-3 text-sm text-ink-2 sm:-mx-6 sm:-mb-6 sm:px-6">
        <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Private to this browser. AI sharing is opt-in per review: only that period’s entries, shortened to the first {JOURNAL_AI_CHARS} characters each.
      </p>

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 sm:max-w-none" showCloseButton={false}>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3 px-5 py-6">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-lg">New entry</DialogTitle>
              <Button variant="outline" onClick={() => setFull(false)}>Exit full screen</Button>
            </div>
            <DialogDescription className="text-ink-2">{prompt.q}</DialogDescription>
            <Input value={draft.title} maxLength={JOURNAL_TITLE_MAX} onChange={(e) => set('title')(e.target.value)} placeholder="Title (optional)" aria-label="Entry title" className="h-12 text-lg font-bold" />
            <textarea
              ref={fullRef}
              value={draft.body}
              onChange={(e) => set('body')(e.target.value)}
              aria-label="Your reflection"
              aria-describedby="entry-count-full"
              placeholder={placeholder}
              className="ruled-lg min-h-0 flex-1 resize-none rounded-lg border border-input bg-card px-4 py-1 text-lg outline-none focus-visible:outline-3 focus-visible:outline-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Counter status={status} id="entry-count-full" hint="Press Escape to go back." />
              <Button onClick={save} disabled={!canSave}>Save reflection</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
});
