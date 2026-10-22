// The reading pane: one entry in full, with edit in place, older/newer
// navigation, copy, and delete with Undo.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CopyIcon, DownloadIcon, LinkIcon, MoreHorizontalIcon, PencilIcon, TimerIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/data/api';
import { fmtDateTime, fmtMinutes, fmtNum, localDateOf, pluralize } from '@/lib/format';
import { JOURNAL_AI_CHARS, JOURNAL_TITLE_MAX } from '@/lib/inputs';
import { entryTitle } from '@/lib/journal-meta';
import { draftStatus, wordCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { taskById, useApp } from '@/state/app';
import { exportData } from '@/features/settings/settings-dialog';
import { EnergyChip, EnergyField, Highlighted, TagChip, TagsField, sessionsFor } from './fields';

const fullDate = (iso, tz) => {
  const d = localDateOf(iso, tz);
  const date = new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const time = new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
};

function Editor({ entry, onDone }) {
  const { mutate } = useApp();
  const [form, setForm] = useState({ title: entry.title || '', body: entry.body, energy: entry.energy || '', tags: entry.tags.filter((t) => t !== 'reflection') });
  const ref = useRef(null);
  const status = draftStatus(form.body);
  const canSave = status.tone !== 'over' && (form.body.trim() || form.title.trim() || form.energy || form.tags.length);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(160, Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.6)))}px`;
  }, [form.body]);

  const save = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    // Keep the old "reflection" tag (from earlier versions) if it was there.
    const tags = entry.tags.includes('reflection') ? [...form.tags, 'reflection'] : form.tags;
    const ok = await mutate(() => api(`/api/journal/${entry.id}`, { method: 'PATCH', body: { ...form, tags, energy: form.energy || null } }), { undo: true, success: 'Reflection updated' });
    if (ok) onDone();
  };

  return (
    <form onSubmit={save} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`et-${entry.id}`}>Title</Label>
        <Input id={`et-${entry.id}`} value={form.title} maxLength={JOURNAL_TITLE_MAX} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Optional" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`eb-${entry.id}`}>Reflection</Label>
        <textarea
          id={`eb-${entry.id}`}
          ref={ref}
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          aria-invalid={status.tone === 'over' || undefined}
          className={cn('w-full resize-y rounded-lg border border-input bg-card px-3.5 py-2.5 text-base leading-relaxed outline-none focus-visible:outline-3 focus-visible:outline-ring', status.tone === 'over' && 'border-destructive')}
        />
        <p aria-live="polite" className={cn('min-h-5 text-sm', status.tone === 'over' ? 'font-bold text-destructive' : status.tone === 'warn' ? 'font-bold text-warn' : 'text-muted-foreground')}>{status.text}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <EnergyField id={`ee-${entry.id}`} value={form.energy} onChange={(energy) => setForm((f) => ({ ...f, energy }))} />
        <TagsField id={`etg-${entry.id}`} value={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={!canSave}>Save changes</Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

/**
 * entry: the entry to show. older / newer: neighbouring entries (by date) for
 * the navigation at the bottom. query: search text to highlight.
 * bare: no card around it (inside the phone sheet).
 */
export function Reader({ entry, older, newer, onSelect, query, bare = false, onDeleted }) {
  const { boot, mutate } = useApp();
  const [editing, setEditing] = useState(false);
  const headingRef = useRef(null);
  useEffect(() => { setEditing(false); }, [entry.id]);

  const tz = boot.preferences.timezone;
  const task = entry.taskId ? taskById(boot, entry.taskId) : null;
  const title = entryTitle(entry, task?.title);
  const sessions = sessionsFor(entry, boot);
  const words = wordCount(entry.body);
  const tags = entry.tags?.filter((t) => t !== 'reflection') || [];
  const paragraphs = entry.body.split(/\n{2,}/).filter(Boolean);

  const remove = async () => {
    const ok = await mutate(() => api(`/api/journal/${entry.id}`, { method: 'DELETE' }), { undo: true, success: 'Reflection deleted' });
    if (ok) onDeleted?.(entry.id);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([entry.title, entry.body].filter(Boolean).join('\n\n'));
      toast('Copied to the clipboard', { duration: 2500 });
    } catch {
      toast('Your browser blocked copying. Select the text and copy it instead.', { duration: 5000 });
    }
  };
  const go = (e) => { onSelect(e.id); setTimeout(() => headingRef.current?.focus(), 30); };

  return (
    <article aria-labelledby={`rh-${entry.id}`} className={cn('flex flex-col gap-4', !bare && 'rounded-xl border border-border bg-card p-5 sm:p-7')}>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
          <time dateTime={entry.createdAt}>{fullDate(entry.createdAt, tz)}</time>
        </p>
        {!editing && (
          <div className={cn('flex shrink-0 items-center gap-1', bare && 'mr-10')}>
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><PencilIcon aria-hidden="true" />Edit</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions for this entry"><MoreHorizontalIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={copy}><CopyIcon />Copy text</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportData(boot.today)}><DownloadIcon />Export all my data</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={remove}><Trash2Icon />Delete entry</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {editing ? <Editor entry={entry} onDone={() => setEditing(false)} /> : (
        <>
          <div className="flex flex-col gap-3">
            <h2 id={`rh-${entry.id}`} ref={headingRef} tabIndex={-1} className="text-[26px] leading-tight font-extrabold tracking-tight outline-none sm:text-[28px]">
              <Highlighted text={title} query={query} />
            </h2>
            {(tags.length > 0 || entry.energy || task) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {tags.map((t) => <TagChip key={t} tag={t} />)}
                <EnergyChip energy={entry.energy} className="text-sm" />
                {task && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-ink-2">
                    <LinkIcon aria-hidden="true" className="size-3" />{task.title}
                  </span>
                )}
              </div>
            )}
          </div>

          {paragraphs.length > 0 ? (
            <div className="flex max-w-[68ch] flex-col gap-4 text-[17px] leading-relaxed">
              {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line"><Highlighted text={p} query={query} /></p>)}
            </div>
          ) : (
            <p className="text-ink-2">A quick check-in, with no words. That counts too.</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
            {sessions && (
              <span className="inline-flex items-center gap-1.5">
                <TimerIcon aria-hidden="true" className="size-4" />
                {pluralize(sessions.count, 'focus session')} · {fmtMinutes(sessions.minutes)}
              </span>
            )}
            {words > 150 && <span>{fmtNum(words)} words</span>}
            <span>Saved in this browser{entry.updatedAt ? `, edited ${fmtDateTime(entry.updatedAt)}` : ''}</span>
          </div>
          {entry.body.length > JOURNAL_AI_CHARS && (
            <p className="-mt-2 text-xs text-muted-foreground">If you include your journal in an AI review, only the first {JOURNAL_AI_CHARS} characters of this entry are sent.</p>
          )}
        </>
      )}

      {(older || newer) && !editing && (
        <nav aria-label="Other entries" className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          {older ? (
            <button type="button" onClick={() => go(older)} className="flex min-w-0 flex-col items-start rounded-md p-2 text-left hover:bg-accent">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground uppercase"><ArrowLeftIcon aria-hidden="true" className="size-3.5" />Older · {new Date(`${localDateOf(older.createdAt, tz)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className="w-full truncate text-sm font-bold">{entryTitle(older, older.taskId && taskById(boot, older.taskId)?.title)}</span>
            </button>
          ) : <span />}
          {newer ? (
            <button type="button" onClick={() => go(newer)} className="flex min-w-0 flex-col items-end rounded-md p-2 text-right hover:bg-accent">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground uppercase">Newer · {new Date(`${localDateOf(newer.createdAt, tz)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}<ArrowRightIcon aria-hidden="true" className="size-3.5" /></span>
              <span className="w-full truncate text-sm font-bold">{entryTitle(newer, newer.taskId && taskById(boot, newer.taskId)?.title)}</span>
            </button>
          ) : <span className="self-center text-right text-sm text-muted-foreground">Latest entry</span>}
        </nav>
      )}
    </article>
  );
}
