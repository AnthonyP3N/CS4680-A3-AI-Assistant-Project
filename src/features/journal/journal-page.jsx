// Journal: entries on the left, the selected entry in a reading pane, and the
// new-entry composer below it. On narrower screens the list comes after the
// composer and an entry opens in a sheet.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightIcon, PenLineIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { PageHeader } from '@/components/layout/app-shell';
import { useMediaQuery } from '@/hooks/use-media-query';
import { addDays } from '@/lib/dates';
import { fmtDateShort, localDateOf } from '@/lib/format';
import { entryTitle } from '@/lib/journal-meta';
import { cn } from '@/lib/utils';
import { taskById, useApp } from '@/state/app';
import { Composer } from './composer';
import { EntryList, matchesFilter, matchesQuery } from './entry-list';
import { Reader } from './reader';

/** Says whether the journal has ever gone to an AI, and links to a review. */
function Perspective() {
  const { boot } = useApp();
  const shared = boot.plans.filter((p) => p.kind === 'review' && p.includeJournal);
  const last = shared[0];
  return (
    <aside aria-label="AI and your journal" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-5 py-4">
      <SparklesIcon className="size-5 shrink-0 text-ai" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-bold">A little perspective, when you want it</p>
        <p className="text-sm text-ink-2">
          {last
            ? `Last shared ${fmtDateShort(localDateOf(last.createdAt, boot.preferences.timezone))}, in a ${last.input.period.range} review (${last.journalCount ?? last.input.journal?.length ?? 0} entries). You choose again each time.`
            : 'Your journal has never been sent to an AI. A review can include it if you tick “Include my journal”.'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {shared.length > 0 && <Button asChild variant="ghost" size="sm"><a href="#history">AI history</a></Button>}
        <Button asChild variant="outline" size="sm"><a href="#insights">Review<ArrowRightIcon aria-hidden="true" /></a></Button>
      </div>
    </aside>
  );
}

export function JournalPage() {
  const { boot } = useApp();
  const wide = useMediaQuery('(min-width: 1280px)');
  const composerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('new');
  const [selectedId, setSelectedId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const tz = boot.preferences.timezone;

  const all = boot.journal; // newest first
  const q = query.trim();
  const shown = useMemo(() => {
    const list = all.filter((e) => matchesFilter(e, filter) && matchesQuery(e, q, boot));
    return sort === 'new' ? list : [...list].reverse();
  }, [all, filter, q, sort, boot]);

  // Keep a sensible entry selected as the list changes.
  const selected = shown.find((e) => e.id === selectedId) || shown[0] || null;
  useEffect(() => {
    if (!sheetOpen) return;
    if (!all.some((e) => e.id === selectedId)) setSheetOpen(false);
  }, [all, selectedId, sheetOpen]);

  // Older and newer neighbours, by date, among the entries shown.
  const byDate = sort === 'new' ? shown : [...shown].reverse();
  const at = selected ? byDate.findIndex((e) => e.id === selected.id) : -1;
  const older = at >= 0 ? byDate[at + 1] : null;
  const newer = at > 0 ? byDate[at - 1] : null;

  const days = Array.from({ length: 7 }, (_, i) => addDays(boot.today, i - 6));
  const reflectedDays = new Set(all.map((j) => localDateOf(j.createdAt, tz)).filter((d) => d >= days[0])).size;

  const select = (id) => {
    setSelectedId(id);
    if (!wide) setSheetOpen(true);
  };

  const sheetEntry = sheetOpen ? all.find((e) => e.id === selectedId) : null;

  return (
    <>
      <PageHeader
        title="Your journal"
        description={(
          <>
            Look back with clarity. Move forward with intention.
            {all.length > 0 && <span className="mt-1 block text-sm text-muted-foreground">You wrote on {reflectedDays} of the last 7 days.</span>}
          </>
        )}
      >
        <Button onClick={() => composerRef.current?.focus()}><PenLineIcon aria-hidden="true" />New entry</Button>
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,330px)_minmax(0,1fr)]">
        <EntryList
          entries={shown}
          total={all.length}
          selectedId={wide ? selected?.id : null}
          onSelect={select}
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
          sort={sort}
          setSort={setSort}
          className={cn('order-2 xl:order-1', wide && 'sticky top-20 max-h-[calc(100dvh-6.5rem)]')}
        />
        <div className="order-1 flex min-w-0 flex-col gap-5 xl:order-2">
          {wide && selected && (
            <Reader entry={selected} older={older} newer={newer} onSelect={setSelectedId} query={q} onDeleted={() => setSelectedId(null)} />
          )}
          <Composer ref={composerRef} onSaved={(e) => { setQuery(''); setFilter('all'); setSelectedId(e?.id || null); }} />
          {wide && <Perspective />}
        </div>
        {!wide && <div className="order-3"><Perspective /></div>}
      </div>

      <Sheet open={!wide && !!sheetEntry} onOpenChange={(o) => { if (!o) setSheetOpen(false); }}>
        <SheetContent side="right" className="w-full gap-0 p-5 sm:max-w-xl sm:p-7">
          {sheetEntry && (
            <>
              <SheetTitle className="sr-only">{entryTitle(sheetEntry, sheetEntry.taskId && taskById(boot, sheetEntry.taskId)?.title)}</SheetTitle>
              <SheetDescription className="sr-only">Journal entry</SheetDescription>
              <Reader
                bare
                entry={sheetEntry}
                older={sheetEntry.id === selected?.id ? older : null}
                newer={sheetEntry.id === selected?.id ? newer : null}
                onSelect={setSelectedId}
                query={q}
                onDeleted={() => { setSheetOpen(false); setSelectedId(null); }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
