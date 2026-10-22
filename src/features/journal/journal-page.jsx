import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalculatedBadge, shortProvider } from '@/components/ai';
import { PageHeader } from '@/components/layout/app-shell';
import { addDays, weekdayName } from '@/lib/dates';
import { fmtDateShort, localDateOf } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';
import { exportData } from '@/features/settings/settings-dialog';
import { Composer } from './composer';
import { Entries } from './entries';

function LastSevenDays() {
  const { boot } = useApp();
  const tz = boot.preferences.timezone;
  const days = Array.from({ length: 7 }, (_, i) => addDays(boot.today, i - 6));
  const recent = boot.journal.filter((j) => localDateOf(j.createdAt, tz) >= days[0]);
  const withEntry = new Set(recent.map((j) => localDateOf(j.createdAt, tz)));
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  for (const j of recent) {
    for (const t of j.tags || []) bump({ win: 'Wins', stuck: 'Stuck', distraction: 'Distractions', idea: 'Ideas', reflection: 'Reflections' }[t] || t);
    if (j.energy === 'low') bump('Low energy');
    if (j.energy === 'high') bump('High energy');
  }
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const n = withEntry.size;

  return (
    <section aria-labelledby="week-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="week-h" className="text-lg font-bold">Last 7 days</h2>
        <CalculatedBadge />
      </div>
      <div role="img" aria-label={`Reflected on ${n} of the last 7 days`} className="flex gap-1.5">
        {days.map((d) => (
          <div key={d} className="flex flex-1 flex-col items-center gap-1">
            <span className={cn('size-6 rounded-full', withEntry.has(d) ? 'bg-primary' : 'border-[1.5px] border-dashed border-input')} />
            <span className="text-xs text-muted-foreground">{weekdayName(d)}</span>
          </div>
        ))}
      </div>
      <p>You reflected on {n} of the last 7 days.</p>
      {rows.length > 0 && (
        <dl className="flex flex-col gap-1.5">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt>{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>)}
        </dl>
      )}
      <p className="text-xs text-muted-foreground">Counts only. Your words stay here.</p>
    </section>
  );
}

function SharedWithAi() {
  const { boot } = useApp();
  const shared = boot.plans.filter((p) => p.kind === 'review' && p.includeJournal);
  return (
    <section aria-labelledby="ai-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <h2 id="ai-h" className="text-lg font-bold">Shared with AI</h2>
      <p className="text-sm text-ink-2">Your journal is sent only when you tick “Include my journal” on a review, and only that period’s entries, shortened to their first 400 characters.</p>
      {shared.length ? (
        <ul className="flex flex-col gap-2">
          {shared.slice(0, 6).map((p) => (
            <li key={p.id} className="flex gap-2.5 rounded-md bg-muted px-3 py-2 text-sm">
              <SparklesIcon className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden="true" />
              <span>
                <strong>{fmtDateShort(localDateOf(p.createdAt, boot.preferences.timezone))}, {p.input.period.range} review ({shortProvider(p.provider)})</strong>
                <br />{p.journalCount ?? p.input.journal?.length ?? 0} {(p.journalCount ?? p.input.journal?.length) === 1 ? 'entry' : 'entries'} from {fmtDateShort(p.input.period.start)}{p.input.period.end !== p.input.period.start ? ` to ${fmtDateShort(p.input.period.end)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-muted px-3 py-2 text-sm"><strong>Never.</strong> Your journal hasn’t been sent to any AI.</p>
      )}
      <a href="#history" className="text-sm font-bold underline underline-offset-2">See all AI requests</a>
    </section>
  );
}

export function JournalPage() {
  const { boot } = useApp();
  return (
    <>
      <PageHeader title="Journal" description="A minute of reflection after you work. Over a week, these notes explain what the numbers can’t." />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[14_1_520px] flex-col gap-6">
          <Composer />
          <Entries />
        </div>
        <aside className="flex min-w-0 flex-[10_1_300px] flex-col gap-4">
          <LastSevenDays />
          <SharedWithAi />
          <section aria-labelledby="copy-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <h2 id="copy-h" className="text-lg font-bold">Keep a copy</h2>
            <p className="text-sm text-ink-2">Reflections live in this browser only. Export now and then, especially before clearing browser data.</p>
            <Button variant="outline" className="self-start" onClick={() => exportData(boot.today)}>Export my data</Button>
          </section>
        </aside>
      </div>
    </>
  );
}
