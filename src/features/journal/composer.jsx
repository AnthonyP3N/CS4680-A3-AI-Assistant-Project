// New reflection: linked to the last session, prompt buttons, energy and
// tags, a word count, autosaved drafts and a full-screen writing mode.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LockIcon, Maximize2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { api } from '@/data/api';
import { JOURNAL_AI_CHARS } from '@/lib/inputs';
import { draftStatus } from '@/lib/text';
import { ENERGY_OPTIONS, PROMPTS, TAG_OPTIONS } from '@/lib/journal-meta';
import { fmtMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';

const DRAFT_KEY = 'focusflow:journal-draft:v2';

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || JSON.parse(localStorage.getItem('focusflow:journal-draft:v1') || 'null');
    return { body: typeof d?.body === 'string' ? d.body : '', tags: Array.isArray(d?.tags) ? d.tags.filter((t) => TAG_OPTIONS.some(([v]) => v === t)) : [], energy: d?.energy || '' };
  } catch {
    return { body: '', tags: [], energy: '' };
  }
}

/** The session this reflection is probably about: the last one, if recent and not yet reflected on. */
function useRecentSession() {
  const { boot } = useApp();
  return useMemo(() => {
    const s = boot.recentSessions[0];
    if (!s || Date.now() - Date.parse(s.endedAt) > 3 * 3600_000) return null;
    if (boot.journal.some((j) => j.sessionId === s.id)) return null;
    return s;
  }, [boot.recentSessions, boot.journal]);
}

function Counter({ status, id }) {
  return (
    <p id={id} aria-live="polite" className={cn('min-h-5 text-sm tabular-nums', status.tone === 'over' ? 'font-bold text-destructive' : status.tone === 'warn' ? 'font-bold text-warn' : 'text-muted-foreground')}>
      {status.text}
    </p>
  );
}

export function Composer() {
  const { mutate } = useApp();
  const session = useRecentSession();
  const [draft, setDraft] = useState(loadDraft);
  const [linked, setLinked] = useState(true);
  const [full, setFull] = useState(false);
  const ref = useRef(null);
  const fullRef = useRef(null);
  const status = draftStatus(draft.body);
  const canSave = (draft.body.trim() || draft.energy || draft.tags.length) && status.tone !== 'over';

  // Autosave the draft, so a refresh or closed tab never loses writing.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (draft.body.trim() || draft.tags.length || draft.energy) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        else localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem('focusflow:journal-draft:v1');
      } catch { /* storage blocked: the draft still lives in memory */ }
    }, 400);
    return () => clearTimeout(id);
  }, [draft]);

  // Grow with the text up to 60% of the screen, then scroll.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(150, Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.6)))}px`;
  }, [draft.body]);

  const setBody = (body) => setDraft((d) => ({ ...d, body }));
  const applyPrompt = (p) => {
    const body = draft.body.trim() ? `${draft.body.replace(/\s+$/, '')}\n${p} ` : `${p} `;
    setBody(body);
    setTimeout(() => {
      const el = full ? fullRef.current : ref.current;
      el?.focus();
      el?.setSelectionRange(body.length, body.length);
    }, 10);
  };

  const save = async () => {
    if (!canSave) return;
    const ok = await mutate(() => api('/api/journal', {
      method: 'POST',
      body: {
        body: draft.body,
        tags: draft.tags,
        energy: draft.energy || null,
        taskId: linked && session ? session.taskId : null,
        sessionId: linked && session ? session.id : null,
      },
    }), { undo: true, success: 'Reflection saved' });
    if (ok) {
      setDraft({ body: '', tags: [], energy: '' });
      setFull(false);
      setLinked(true);
    }
  };

  const placeholder = linked && session ? `How did “${session.taskTitleSnapshot}” go? What took the most time?` : 'What happened in that session? A sentence or two is plenty.';

  return (
    <section aria-labelledby="new-h" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="new-h" className="text-lg font-bold">New reflection</h2>
        {session && linked && (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted py-1 pr-1 pl-3 text-sm">
            After <strong>{session.taskTitleSnapshot}</strong>, {fmtMinutes(session.durationSeconds / 60)}
            <button type="button" onClick={() => setLinked(false)} aria-label={`Don’t link this reflection to ${session.taskTitleSnapshot}`} className="grid size-8 place-items-center rounded-full hover:bg-border">
              <XIcon className="size-3.5" strokeWidth={3} />
            </button>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-ink-2">Need a start?</span>
        {PROMPTS.map((p) => (
          <button key={p} type="button" onClick={() => applyPrompt(p)} className="min-h-9 rounded-full border border-rule-strong bg-card px-3 text-sm hover:bg-accent">{p}</button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="entry" className="sr-only">Reflection</label>
        <textarea
          id="entry"
          ref={ref}
          value={draft.body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          aria-describedby="entry-count"
          aria-invalid={status.tone === 'over' || undefined}
          className={cn('ruled w-full resize-y rounded-lg border border-border border-l-[3px] border-l-rule-strong bg-card px-3.5 py-1 text-base outline-none placeholder:text-muted-foreground focus-visible:outline-3 focus-visible:outline-ring', status.tone === 'over' && 'border-destructive')}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Counter status={status} id="entry-count" />
          <Button type="button" variant="outline" size="sm" onClick={() => { setFull(true); setTimeout(() => { fullRef.current?.focus(); fullRef.current?.setSelectionRange(draft.body.length, draft.body.length); }, 50); }}>
            <Maximize2Icon aria-hidden="true" />Full screen
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-5">
        <div className="flex flex-col gap-2">
          <span id="energy-l" className="text-sm font-bold text-ink-2">Energy</span>
          <ToggleGroup type="single" value={draft.energy} onValueChange={(v) => setDraft((d) => ({ ...d, energy: v }))} aria-labelledby="energy-l">
            {ENERGY_OPTIONS.map(([v, l]) => <ToggleGroupItem key={v} value={v} className="min-w-14">{l}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <div className="flex flex-1 basis-60 flex-col gap-2">
          <span id="tags-l" className="text-sm font-bold text-ink-2">What happened <span className="font-normal text-muted-foreground">(optional)</span></span>
          <ToggleGroup type="multiple" value={draft.tags} onValueChange={(v) => setDraft((d) => ({ ...d, tags: v }))} aria-labelledby="tags-l" className="gap-1.5 border-0 bg-transparent p-0">
            {TAG_OPTIONS.map(([v, l]) => (
              <ToggleGroupItem key={v} value={v} className="rounded-full border border-border bg-card px-3.5 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{l}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="inline-flex items-start gap-2 text-sm text-ink-2">
          <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Private to this browser. Shared with AI only if you choose to, per review, and only the first {JOURNAL_AI_CHARS} characters of each entry.
        </span>
        <span className="flex items-center gap-3">
          {(draft.body.trim() || draft.energy || draft.tags.length > 0) && <span className="text-xs text-muted-foreground">Draft saved on this device</span>}
          <Button onClick={save} disabled={!canSave}>Save reflection</Button>
        </span>
      </div>

      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 sm:max-w-none" showCloseButton={false}>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3 px-5 py-6">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-lg">New reflection</DialogTitle>
              <Button variant="outline" onClick={() => setFull(false)}>Exit full screen</Button>
            </div>
            <DialogDescription className="sr-only">Distraction-free writing. Press Escape to exit.</DialogDescription>
            <textarea
              ref={fullRef}
              value={draft.body}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Reflection"
              aria-describedby="entry-count-full"
              placeholder={placeholder}
              className="ruled-lg min-h-0 flex-1 resize-none rounded-lg border border-border border-l-[3px] border-l-rule-strong bg-card px-4 py-1 text-lg outline-none focus-visible:outline-3 focus-visible:outline-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Counter status={status} id="entry-count-full" />
              <Button onClick={save} disabled={!canSave}>Save reflection</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
