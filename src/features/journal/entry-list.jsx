// The left column: search, a filter and sort, and entries grouped by month.
// Picking an entry shows it in the reader.

import { ArrowDownUpIcon, SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtDayShort, fmtTimeOfDay, localDateOf } from '@/lib/format';
import { entryTitle } from '@/lib/journal-meta';
import { cn } from '@/lib/utils';
import { taskById, useApp } from '@/state/app';
import { EnergyChip, Highlighted, TagChip, excerptAround } from './fields';

export const FILTERS = [
  ['all', 'All entries'],
  ['session', 'After a session'],
  ['win', 'Wins'],
  ['stuck', 'Stuck'],
  ['distraction', 'Distractions'],
  ['idea', 'Ideas'],
  ['low', 'Low energy'],
  ['high', 'High energy'],
];

export function matchesFilter(e, filter) {
  if (filter === 'all') return true;
  if (filter === 'session') return !!e.taskId;
  if (filter === 'low' || filter === 'high') return e.energy === filter;
  return e.tags?.includes(filter);
}

export function matchesQuery(e, q, boot) {
  if (!q) return true;
  const ql = q.toLowerCase();
  const task = e.taskId ? taskById(boot, e.taskId) : null;
  return [e.title, e.body, task?.title].some((s) => s && s.toLowerCase().includes(ql));
}

const monthLabel = (ym) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

function EntryCard({ entry, selected, query, onSelect }) {
  const { boot } = useApp();
  const task = entry.taskId ? taskById(boot, entry.taskId) : null;
  const day = localDateOf(entry.createdAt, boot.preferences.timezone);
  const title = entryTitle(entry, task?.title);
  // Without a title, the first sentence is the title; don't repeat it below.
  const text = entry.title ? entry.body : entry.body.slice(title.replace(/…$/, '').length).replace(/^[.!?]?\s*/, '');
  const firstTag = entry.tags?.find((t) => t !== 'reflection');

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors',
          selected ? 'border-hl bg-hl-soft' : 'border-border bg-card hover:border-rule-strong',
        )}
      >
        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={cn(selected && 'font-bold text-foreground')}>{day === boot.today ? 'Today' : fmtDayShort(day)}</span>
          <time dateTime={entry.createdAt}>{fmtTimeOfDay(entry.createdAt)}</time>
        </span>
        <span className="font-bold leading-snug"><Highlighted text={title} query={query} /></span>
        {text && (
          <span className="line-clamp-3 text-sm text-ink-2">
            <Highlighted text={excerptAround(text, query)} query={query} />
          </span>
        )}
        {(firstTag || entry.energy) && (
          <span className="mt-1 flex items-center justify-between gap-2">
            {firstTag ? <TagChip tag={firstTag} /> : <span />}
            <EnergyChip energy={entry.energy} />
          </span>
        )}
      </button>
    </li>
  );
}

export function EntryList({ entries, total, selectedId, onSelect, query, setQuery, filter, setFilter, sort, setSort, className }) {
  const { boot } = useApp();
  const tz = boot.preferences.timezone;
  const months = [];
  for (const e of entries) {
    const ym = localDateOf(e.createdAt, tz).slice(0, 7);
    if (!months.length || months[months.length - 1].ym !== ym) months.push({ ym, items: [] });
    months[months.length - 1].items.push(e);
  }
  const filtered = entries.length !== total;

  return (
    <section aria-labelledby="entries-h" className={cn('flex min-h-0 flex-col gap-3', className)}>
      <h2 id="entries-h" className="sr-only">Past entries</h2>
      <label className="flex h-11 items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:outline-3 focus-within:outline-ring">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search your reflections</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your reflections" className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent"><XIcon className="size-4" /></button>
        )}
      </label>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger aria-label="Show" className="h-9 w-auto gap-1.5 border-0 bg-transparent px-2 font-bold shadow-none hover:bg-accent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{filtered ? `${entries.length} of ${total}` : total}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSort(sort === 'new' ? 'old' : 'new')} aria-label={`Sorted ${sort === 'new' ? 'newest' : 'oldest'} first. Change order`} className="font-medium">
          {sort === 'new' ? 'Newest first' : 'Oldest first'}<ArrowDownUpIcon aria-hidden="true" />
        </Button>
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {!total && (
          <p className="rounded-xl border-[1.5px] border-dashed border-border p-4 text-sm text-ink-2">
            No reflections yet. A couple of lines after a focus session is enough. Over a week, they explain what the numbers can’t.
          </p>
        )}
        {total > 0 && !entries.length && (
          <div className="flex flex-col items-start gap-1 rounded-xl border-[1.5px] border-dashed border-border p-4 text-sm text-ink-2">
            Nothing matches{query ? ` “${query}”` : ''}.
            <Button variant="link" size="sm" onClick={() => { setQuery(''); setFilter('all'); }}>Show all entries</Button>
          </div>
        )}
        {months.map((m) => (
          <div key={m.ym} className="mb-3">
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">{monthLabel(m.ym)}</h3>
            <ul className="flex flex-col gap-2.5">
              {m.items.map((e) => <EntryCard key={e.id} entry={e} selected={e.id === selectedId} query={query.trim()} onSelect={onSelect} />)}
            </ul>
          </div>
        ))}
        {entries.length > 0 && !filtered && (
          <p className="py-3 text-center text-sm text-muted-foreground">{sort === 'new' ? 'The beginning of your journal.' : 'Your latest entry.'}</p>
        )}
      </div>
    </section>
  );
}
