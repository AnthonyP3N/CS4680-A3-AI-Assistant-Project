// Journal: the main area shows either the entry you're reading or the New
// entry form, never both. Entries sit in a panel on the right that can be
// hidden; on narrower screens they open as a side sheet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightIcon, ListIcon, PanelRightCloseIcon, PanelRightOpenIcon, PenLineIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/misc';
import { PageHeader } from '@/components/layout/app-shell';
import { useMediaQuery } from '@/hooks/use-media-query';
import { addDays } from '@/lib/dates';
import { fmtDateShort, localDateOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';
import { hasNewEntryRequest, takeNewEntryRequest } from '@/state/ui';
import { Composer, hasSavedDraft } from './composer';
import { EntryList, matchesFilter, matchesQuery } from './entry-list';
import { Reader } from './reader';

const PANEL_KEY = 'focusflow:journal-entries-panel';

function loadPanelOpen() {
  try { return localStorage.getItem(PANEL_KEY) !== '0'; } catch { return true; }
}

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
  const all = boot.journal; // newest first

  // Start on New entry when asked to, when a draft is waiting, or when there's nothing to read yet.
  const [view, setView] = useState(() => (hasNewEntryRequest() || hasSavedDraft() || !boot.journal.length ? 'write' : 'read'));
  const [panelOpen, setPanelOpen] = useState(loadPanelOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('new');
  const [selectedId, setSelectedId] = useState(null);
  const tz = boot.preferences.timezone;

  const q = query.trim();
  const shown = useMemo(() => {
    const list = all.filter((e) => matchesFilter(e, filter) && matchesQuery(e, q, boot));
    return sort === 'new' ? list : [...list].reverse();
  }, [all, filter, q, sort, boot]);

  // The entry being read: the one you picked, else the first in the list.
  const selected = all.find((e) => e.id === selectedId) || shown[0] || all[0] || null;
  // Older and newer neighbours by date, among the entries in the list.
  const pool = selected && shown.some((e) => e.id === selected.id) ? shown : all;
  const byDate = sort === 'new' || pool === all ? pool : [...pool].reverse();
  const at = selected ? byDate.findIndex((e) => e.id === selected.id) : -1;
  const older = at >= 0 ? byDate[at + 1] : null;
  const newer = at > 0 ? byDate[at - 1] : null;

  const days = Array.from({ length: 7 }, (_, i) => addDays(boot.today, i - 6));
  const reflectedDays = new Set(all.map((j) => localDateOf(j.createdAt, tz)).filter((d) => d >= days[0])).size;

  const togglePanel = () => {
    setPanelOpen((o) => {
      try { localStorage.setItem(PANEL_KEY, o ? '0' : '1'); } catch { /* remembered for this visit only */ }
      return !o;
    });
  };

  const focusReader = (id) => setTimeout(() => document.getElementById(`rh-${id}`)?.focus(), 60);

  const openEntry = (id) => {
    setSelectedId(id);
    setView('read');
    setSheetOpen(false);
    focusReader(id);
  };

  const startNew = useCallback(() => {
    setView('write');
    setSheetOpen(false);
    setTimeout(() => composerRef.current?.focus(), 60);
  }, []);

  // "New journal entry" from the command palette while already on this page.
  useEffect(() => {
    const on = () => { takeNewEntryRequest(); startNew(); };
    window.addEventListener('focusflow:new-entry', on);
    return () => window.removeEventListener('focusflow:new-entry', on);
  }, [startNew]);

  // Focus the title when the page opens straight into New entry.
  useEffect(() => {
    takeNewEntryRequest();
    if (view === 'write') setTimeout(() => composerRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = (
    <EntryList
      entries={shown}
      total={all.length}
      selectedId={view === 'read' ? selected?.id : null}
      onSelect={openEntry}
      query={query}
      setQuery={setQuery}
      filter={filter}
      setFilter={setFilter}
      sort={sort}
      setSort={setSort}
      className="min-h-0 flex-1"
    />
  );

  const showPanel = wide && panelOpen;

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
        <div className="flex flex-wrap items-center gap-2">
          {wide ? (
            !panelOpen && (
              <Button variant="outline" onClick={togglePanel} aria-expanded={false} aria-controls="entries-panel">
                <PanelRightOpenIcon aria-hidden="true" />Show entries
                <span className="font-medium text-muted-foreground tabular-nums">{all.length}</span>
              </Button>
            )
          ) : (
            <Button variant="outline" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
              <ListIcon aria-hidden="true" />Entries
              <span className="font-medium text-muted-foreground tabular-nums">{all.length}</span>
            </Button>
          )}
          <Button onClick={startNew} aria-pressed={view === 'write'}><PenLineIcon aria-hidden="true" />New entry</Button>
        </div>
      </PageHeader>

      <div className={cn('grid items-start gap-5', showPanel && 'grid-cols-[minmax(0,1fr)_minmax(280px,330px)]')}>
        <div className="flex min-w-0 flex-col gap-5">
          {view === 'write' || !selected ? (
            <Composer
              ref={composerRef}
              onClose={selected ? () => { setView('read'); focusReader(selected.id); } : undefined}
              onSaved={(e) => {
                setQuery('');
                setFilter('all');
                setSelectedId(e?.id || null);
                setView('read');
                if (e?.id) focusReader(e.id);
              }}
            />
          ) : (
            <Reader
              entry={selected}
              older={older}
              newer={newer}
              onSelect={setSelectedId}
              query={q}
              onDeleted={() => setSelectedId(null)}
            />
          )}
          <Perspective />
        </div>

        {showPanel && (
          <aside id="entries-panel" aria-label="Entries" className="sticky top-20 flex max-h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Entries</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={togglePanel} aria-label="Hide entries" aria-expanded aria-controls="entries-panel">
                    <PanelRightCloseIcon aria-hidden="true" />Hide
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hide entries to give the page more room</TooltipContent>
              </Tooltip>
            </div>
            {list}
          </aside>
        )}
      </div>

      <Sheet open={!wide && sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full gap-3 p-5 sm:max-w-md"
          // Focus the current entry, not the search box (which would open the phone keyboard).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const el = e.currentTarget.querySelector('[aria-current="true"]') || e.currentTarget.querySelector('li button');
            el?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Entries</SheetTitle>
            <SheetDescription>Pick one to read it.</SheetDescription>
          </SheetHeader>
          {list}
        </SheetContent>
      </Sheet>
    </>
  );
}
