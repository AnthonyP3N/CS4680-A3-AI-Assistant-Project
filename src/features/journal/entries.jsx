// Past reflections: search with highlighted excerpts, filters, collapsed
// long entries, inline editing, and delete with Undo.

import { useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { api } from '@/data/api';
import { addDays } from '@/lib/dates';
import { fmtDateLong, fmtNum, fmtTimeOfDay, localDateOf } from '@/lib/format';
import { JOURNAL_AI_CHARS } from '@/lib/inputs';
import { energyLabel, tagLabel } from '@/lib/journal-meta';
import { draftStatus, wordCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { taskById, useApp } from '@/state/app';

const FILTERS = [
  ['all', 'All'],
  ['session', 'After a session'],
  ['win', 'Wins'],
  ['stuck', 'Stuck'],
  ['distraction', 'Distractions'],
  ['low', 'Low energy'],
];

const isLong = (body) => body.length > 500 || body.split('\n').length > 6;

function Highlighted({ text, query }) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out = [];
  let last = 0;
  let i = lower.indexOf(q);
  while (i !== -1) {
    if (i > last) out.push(text.slice(last, i));
    out.push(<mark key={i} className="rounded-sm bg-hl-soft px-px text-inherit">{text.slice(i, i + q.length)}</mark>);
    last = i + q.length;
    i = lower.indexOf(q, last);
  }
  out.push(text.slice(last));
  return out;
}

/** Up to two short excerpts around matches, instead of a 1,000-word wall. */
function Snippets({ body, query }) {
  const lower = body.toLowerCase();
  const q = query.toLowerCase();
  const out = [];
  let from = 0;
  while (out.length < 2) {
    const i = lower.indexOf(q, from);
    if (i === -1) break;
    let a = Math.max(0, i - 90);
    let b = Math.min(body.length, i + q.length + 90);
    if (a > 0) a = body.indexOf(' ', a) + 1 || a;
    if (b < body.length) { const sp = body.lastIndexOf(' ', b); if (sp > i + q.length) b = sp; }
    out.push({ text: body.slice(a, b).replace(/\s*\n\s*/g, ' '), pre: a > 0, post: b < body.length });
    from = b;
  }
  return out.map((s, k) => (
    <span key={k} className="block text-ink-2 [&+&]:mt-1.5">{s.pre && '…'}<Highlighted text={s.text} query={query} />{s.post && '…'}</span>
  ));
}

function EntryCard({ entry, query }) {
  const { boot, mutate } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.body);
  const task = entry.taskId ? taskById(boot, entry.taskId) : null;
  const long = isLong(entry.body);
  const matches = !!query && entry.body.toLowerCase().includes(query.toLowerCase());
  const mode = !long || expanded ? 'full' : matches ? 'snippets' : 'clamped';
  const words = wordCount(entry.body);
  const editStatus = draftStatus(text);

  const saveEdit = async () => {
    const ok = await mutate(() => api(`/api/journal/${entry.id}`, { method: 'PATCH', body: { body: text, tags: entry.tags, energy: entry.energy } }), { undo: true, success: 'Reflection updated' });
    if (ok) setEditing(false);
  };
  const remove = () => mutate(() => api(`/api/journal/${entry.id}`, { method: 'DELETE' }), { undo: true, success: 'Reflection deleted' });

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <time dateTime={entry.createdAt}>{fmtTimeOfDay(entry.createdAt)}</time>
        {task && <span>After <strong className="text-foreground">{task.title}</strong></span>}
        {entry.energy && <Badge variant={entry.energy === 'high' ? 'success' : entry.energy === 'low' ? 'warn' : 'secondary'}>{energyLabel(entry.energy)}</Badge>}
        {long && <span>{fmtNum(words)} words</span>}
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 font-medium underline underline-offset-2" onClick={() => { setText(entry.body); setEditing(true); }}>Edit</Button>
          <Button variant="ghost" size="sm" className="h-8 font-medium underline underline-offset-2" onClick={remove}>Delete</Button>
        </span>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(14, Math.max(3, Math.ceil(text.length / 80)))} aria-label="Edit reflection" aria-invalid={editStatus.tone === 'over' || undefined} />
          <p className={cn('text-sm', editStatus.tone === 'over' ? 'font-bold text-destructive' : 'text-muted-foreground')}>{editStatus.text}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} disabled={editStatus.tone === 'over' || (!text.trim() && !entry.energy && !entry.tags.length)}>Save changes</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          {entry.body && (
            <p id={`body-${entry.id}`} className={cn('max-w-[68ch] whitespace-pre-line', mode === 'clamped' && 'line-clamp-4')}>
              {mode === 'snippets' ? <Snippets body={entry.body} query={query} /> : <Highlighted text={entry.body} query={query} />}
            </p>
          )}
          {long && (
            <button type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded} aria-controls={`body-${entry.id}`} className="self-start text-sm font-bold underline underline-offset-2">
              {expanded ? 'Show less' : `${mode === 'snippets' ? 'Show full entry' : 'Show more'} (${fmtNum(words)} words)`}
            </button>
          )}
        </>
      )}

      {entry.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{entry.tags.map((t) => <Badge key={t} variant="secondary" className="font-medium">{tagLabel(t)}</Badge>)}</div>}
      {entry.body.length > JOURNAL_AI_CHARS && <p className="text-xs text-muted-foreground">If you share your journal with an AI review, only the first {JOURNAL_AI_CHARS} characters of this entry are sent.</p>}
    </article>
  );
}

export function Entries() {
  const { boot } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const tz = boot.preferences.timezone;
  const all = boot.journal;
  const q = query.trim();
  const ql = q.toLowerCase();
  const shown = all.filter((e) => {
    if (q && !(e.body.toLowerCase().includes(ql) || (e.taskId && taskById(boot, e.taskId)?.title.toLowerCase().includes(ql)))) return false;
    if (filter === 'all') return true;
    if (filter === 'session') return !!e.taskId;
    if (filter === 'low') return e.energy === 'low';
    return e.tags?.includes(filter);
  });
  const groups = [];
  for (const e of shown) {
    const d = localDateOf(e.createdAt, tz);
    if (!groups.length || groups[groups.length - 1].date !== d) groups.push({ date: d, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  const dayLabel = (d) => (d === boot.today ? 'Today' : d === addDays(boot.today, -1) ? 'Yesterday' : fmtDateLong(d));

  return (
    <section aria-labelledby="past-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="past-h" className="text-lg font-bold">Past reflections <span className="text-base font-medium text-muted-foreground">{shown.length === all.length ? all.length : `${shown.length} of ${all.length}`}</span></h2>
        {all.length > 0 && (
          <label className="flex h-11 flex-[0_1_300px] items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:outline-3 focus-within:outline-ring">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search reflections</span>
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. phone or library" className="h-9 border-0 px-0 shadow-none focus-visible:outline-none" />
          </label>
        )}
      </div>
      {all.length > 0 && (
        <ToggleGroup type="single" value={filter} onValueChange={(v) => setFilter(v || 'all')} aria-label="Filter reflections" className="gap-1.5 border-0 bg-transparent p-0">
          {FILTERS.map(([v, l]) => (
            <ToggleGroupItem key={v} value={v} className="rounded-full border border-border bg-card px-3.5 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {q && <p className="text-sm text-muted-foreground" role="status">{shown.length} of {all.length} reflections match “{q}”</p>}

      {!all.length && <p className="rounded-xl border-[1.5px] border-dashed border-border p-5 text-ink-2">No reflections yet. A two-line note after a focus session is enough. Over a week, these notes explain what the numbers can’t.</p>}
      {all.length > 0 && !shown.length && (
        <div className="flex flex-col items-start gap-2 rounded-xl border-[1.5px] border-dashed border-border p-5 text-ink-2">
          No reflections match.
          <Button variant="link" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search and filters</Button>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.date} className="flex flex-col gap-2">
          <h3 className="mt-2 ml-1 text-sm font-bold text-ink-2">{dayLabel(g.date)}</h3>
          {g.items.map((e) => <EntryCard key={e.id} entry={e} query={q} />)}
        </div>
      ))}
    </section>
  );
}
