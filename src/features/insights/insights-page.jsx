import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { AiBadge, CalculatedBadge, CheckLog, DemoNote, ErrorNote, Pipeline, SendSummary, TokenNote } from '@/components/ai';
import { PageHeader } from '@/components/layout/app-shell';
import { api } from '@/data/api';
import { store } from '@/data/backend';
import { useAiRequest } from '@/hooks/use-ai-request';
import { buildReviewInput } from '@/lib/ai';
import { addDays, rangeFor } from '@/lib/dates';
import { fmtDateLong, fmtDateShort, fmtDayShort, fmtMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { showError, useApp } from '@/state/app';

const RANGE_WORD = { day: 'day', week: 'week', month: 'month' };

function previousAnchor(range, date) {
  if (range === 'day') return addDays(date, -1);
  if (range === 'week') return addDays(date, -7);
  return addDays(rangeFor('month', date).start, -1);
}

function step(range, date, dir) {
  if (range === 'day') return addDays(date, dir);
  if (range === 'week') return addDays(date, 7 * dir);
  const d = new Date(`${date.slice(0, 7)}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
}

function periodLabel(s) {
  if (s.range === 'day') return fmtDateLong(s.start);
  if (s.range === 'month') return new Date(`${s.start}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `${fmtDateShort(s.start)} to ${fmtDateShort(s.end)}`;
}

function Tile({ label, value, sub, delta, deltaTone, how }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-center justify-between gap-2"><span className="text-[15px] font-bold text-ink-2">{label}</span><CalculatedBadge /></div>
      <div className="text-4xl leading-tight font-extrabold tracking-tight tabular-nums">{value}</div>
      <div className="text-sm text-ink-2">{sub}</div>
      {delta && <div className={cn('text-sm', deltaTone === 'up' ? 'font-bold text-act-strong' : 'text-ink-2')}>{delta}</div>}
      <Collapsible className="mt-2 text-sm text-ink-2">
        <CollapsibleTrigger className="min-h-8 text-muted-foreground underline underline-offset-2">How it’s calculated</CollapsibleTrigger>
        <CollapsibleContent><p className="mt-1">{how}</p></CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function Tiles({ s, prev }) {
  const word = RANGE_WORD[s.range];
  const diff = s.focusedMinutes - (prev?.focusedMinutes ?? 0);
  const delta = !prev ? null
    : Math.abs(diff) < 1 ? `Same as the previous ${word}`
      : `${diff > 0 ? 'Up' : 'Down'} ${fmtMinutes(Math.abs(diff))} from the previous ${word}`;
  const c = s.completion;
  const e = s.estimate;
  const over = e.perTask.filter((t) => t.direction === 'over').length;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
      <Tile label="Focused time" value={fmtMinutes(s.focusedMinutes)} sub={`${s.sessionsCount} ${s.sessionsCount === 1 ? 'session' : 'sessions'}`} delta={delta} deltaTone={diff > 0 ? 'up' : ''}
        how={`The sum of every saved focus session that ended this ${word}, including time logged by hand.`} />
      <Tile label="Tasks completed" value={c.rate === null ? '—' : `${Math.round(c.rate * 100)}%`} sub={c.planned ? `${c.completed} of ${c.planned} tasks` : `No tasks due this ${word}`}
        delta={c.planned > c.completed ? `${c.planned - c.completed} still open` : null} how={c.definition} />
      <Tile label="Estimate accuracy" value={e.accuracy === null ? '—' : `${Math.round(e.accuracy * 100)}%`}
        sub={e.actualToEstimateRatio === null ? 'Finish a task with an estimate and tracked time to see this' : e.actualToEstimateRatio > 1.05 ? `Tasks took ${e.actualToEstimateRatio}× your estimates` : e.actualToEstimateRatio < 0.95 ? `Tasks took ${e.actualToEstimateRatio}× your estimates (faster than planned)` : 'Your estimates matched closely'}
        delta={e.tasksCompared ? `${over} of ${e.tasksCompared} tasks ran over` : null}
        how={`${e.definition}${e.tasksCompared ? ` Based on ${e.tasksCompared} ${e.tasksCompared === 1 ? 'task' : 'tasks'}: ${fmtMinutes(e.totalEstimated)} estimated, ${fmtMinutes(e.totalActual)} tracked.` : ''}`} />
    </div>
  );
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <div className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background shadow-lg">{fmtDayShort(d.date)}: {fmtMinutes(d.minutes)}</div>;
}

function DayChart({ s }) {
  const [table, setTable] = useState(false);
  const data = s.byDay.map((d) => ({ ...d, tick: s.range === 'month' ? String(Number(d.date.slice(8))) : d.label }));
  const max = Math.max(...data.map((d) => d.minutes), 0);
  const stepM = max <= 240 ? 60 : max <= 600 ? 120 : 240;
  const top = Math.max(60, Math.ceil(max / stepM) * stepM);
  const ticks = [];
  for (let t = 0; t <= top; t += stepM) ticks.push(t);
  return (
    <section aria-labelledby="days-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2"><h2 id="days-h" className="text-lg font-bold">Focused time by day</h2><CalculatedBadge /></div>
      <figure className="m-0" aria-label={`Bar chart of focused minutes per day. Highest: ${fmtMinutes(max)}.`}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: -12 }} barCategoryGap={s.range === 'month' ? '15%' : '30%'}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="tick" tickLine={false} axisLine={{ stroke: 'var(--muted-foreground)' }} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} interval={s.range === 'month' ? 4 : 0} />
              <YAxis ticks={ticks} domain={[0, top]} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(m) => (m === 0 ? '0' : m % 60 === 0 ? `${m / 60} h` : `${m} m`)} width={44} />
              <ChartTooltip content={<ChartTip />} cursor={{ fill: 'var(--muted)' }} />
              <Bar dataKey="minutes" radius={[4, 4, 0, 0]} isAnimationActive={false} label={({ x, y, width, value }) => (value === max && value > 0 ? <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--foreground)">{fmtMinutes(value)}</text> : null)}>
                {data.map((d) => <Cell key={d.date} fill="var(--act)" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <Collapsible open={table} onOpenChange={setTable}>
        <CollapsibleTrigger className="min-h-8 text-sm text-muted-foreground underline underline-offset-2">{table ? 'Hide table' : 'Show as table'}</CollapsibleTrigger>
        <CollapsibleContent>
          <table className="mt-2 text-sm">
            <thead><tr><th scope="col" className="pr-6 text-left">Day</th><th scope="col" className="text-left">Focused</th></tr></thead>
            <tbody>{s.byDay.map((d) => <tr key={d.date} className="border-t border-border"><td className="py-1 pr-6">{fmtDayShort(d.date)}</td><td>{fmtMinutes(d.minutes)}</td></tr>)}</tbody>
          </table>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function Categories({ s }) {
  const max = s.byCategory[0]?.minutes || 1;
  return (
    <section aria-labelledby="cat-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2"><h2 id="cat-h" className="text-lg font-bold">Where the time went</h2><CalculatedBadge /></div>
      {!s.byCategory.length && <p className="text-sm text-muted-foreground">No tracked time in this period.</p>}
      <ul className="flex flex-col gap-3">
        {s.byCategory.map((c) => (
          <li key={c.category} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
            <span className="truncate font-bold">{c.category}</span>
            <span className="h-3" aria-hidden="true"><span className="block h-full min-w-0.5 rounded-r-[4px] bg-act" style={{ width: `${(c.minutes / max) * 100}%` }} /></span>
            <span className="text-sm whitespace-nowrap tabular-nums">{fmtMinutes(c.minutes)} <span className="text-muted-foreground">{Math.round(c.share)}%</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ledger({ s }) {
  const rows = [...s.estimate.perTask].sort((a, b) => Math.abs(b.actualMinutes - b.estimateMinutes) - Math.abs(a.actualMinutes - a.estimateMinutes));
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.estimateMinutes, r.actualMinutes)));
  return (
    <section aria-labelledby="ledger-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2"><h2 id="ledger-h" className="text-lg font-bold">Estimates compared with reality</h2><CalculatedBadge /></div>
      {!rows.length && <p className="text-sm text-muted-foreground">When you finish a task that has an estimate and tracked time, it appears here so you can compare your guesses with reality.</p>}
      <ul className="flex flex-col gap-4">
        {rows.map((r) => {
          const diff = Math.round(r.actualMinutes - r.estimateMinutes);
          const on = Math.abs(diff) <= Math.max(5, r.estimateMinutes * 0.1);
          return (
            <li key={r.taskId}>
              <div className="flex justify-between gap-3"><strong>{r.title}</strong><span className={cn('text-sm whitespace-nowrap', !on && diff > 0 ? 'font-bold' : 'text-muted-foreground')}>{on ? 'On target' : diff > 0 ? `${fmtMinutes(diff)} over` : `${fmtMinutes(-diff)} under`}</span></div>
              <div className="relative mt-1 h-4" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-[4px] border-[1.5px] border-dashed border-muted-foreground" style={{ width: `${(r.estimateMinutes / scale) * 100}%` }} />
                <span className="absolute inset-y-[3px] left-[3px] rounded-[3px] bg-act" style={{ width: `calc(${(Math.min(r.actualMinutes, r.estimateMinutes) / scale) * 100}% - 3px)` }} />
                {r.actualMinutes > r.estimateMinutes && <span className="absolute inset-y-[3px] rounded-r-[4px] border-[1.5px] border-l-0 border-act" style={{ left: `${(r.estimateMinutes / scale) * 100}%`, width: `${((r.actualMinutes - r.estimateMinutes) / scale) * 100}%`, backgroundImage: 'repeating-linear-gradient(135deg, var(--act) 0 2px, transparent 2px 5px)' }} />}
              </div>
              <div className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">Estimated {fmtMinutes(r.estimateMinutes)}, took {fmtMinutes(r.actualMinutes)}</div>
            </li>
          );
        })}
      </ul>
      {rows.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
          <span className="inline-block h-2 w-4 rounded-sm border-[1.5px] border-dashed border-muted-foreground" />estimate
          <span className="ml-2 inline-block h-2 w-4 rounded-sm bg-act" />tracked
          <span className="ml-2 inline-block h-2 w-4 rounded-sm border border-act" style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--act) 0 2px, transparent 2px 5px)' }} />beyond the estimate
        </p>
      )}
    </section>
  );
}

function ReviewResult({ rev, onAgain }) {
  const { boot, mutate } = useApp();
  const [added, setAdded] = useState({});
  const o = rev.output;
  const addTask = async (i, action) => {
    const ok = await mutate(() => api('/api/tasks', { method: 'POST', body: { title: action.slice(0, 120), dueDate: addDays(boot.today, 1), priority: 'medium', category: 'Personal', estimateMinutes: null } }), { undo: true, success: 'Added as a task for tomorrow' });
    if (ok) setAdded((a) => ({ ...a, [i]: true }));
  };
  return (
    <div className="flex flex-col gap-4">
      {rev.provider.name === 'demo' && <DemoNote />}
      <p className="text-[17px]">{o.summary}</p>
      {!!o.highlights?.length && (
        <div className="rounded-md bg-act-soft px-3.5 py-2.5">
          <h3 className="text-sm font-bold">Went well</h3>
          <ul className="mt-1 list-disc pl-5">{o.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">Observed patterns</h3>
        {o.patterns.map((p, i) => (
          <div key={i} className="rounded-md bg-muted px-3.5 py-2.5">
            <div className="font-bold">{p.observation}</div>
            <div className="text-sm text-ink-2">Evidence: {p.evidence}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">Try next {RANGE_WORD[rev.input.period.range] === 'day' ? 'time' : RANGE_WORD[rev.input.period.range]}</h3>
        {o.suggestions.map((sg, i) => (
          <div key={i} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border px-3.5 py-3">
            <div className="min-w-0 flex-[1_1_200px]"><div className="font-bold">{sg.action}</div>{sg.why && <div className="text-sm text-ink-2">{sg.why}</div>}</div>
            <Button variant={added[i] ? 'secondary' : 'outline'} size="sm" disabled={added[i]} onClick={() => addTask(i, sg.action)}>
              {added[i] ? <><CheckIcon />Added</> : <><PlusIcon />Add as a task</>}
            </Button>
          </div>
        ))}
      </div>
      {!!o.journalThemes?.length && (
        <div><h3 className="text-sm font-bold">From your journal</h3><ul className="mt-1 list-disc pl-5 text-ink-2">{o.journalThemes.map((t) => <li key={t}>{t}</li>)}</ul></div>
      )}
      {!!o.warnings?.length && <ul className="list-disc rounded-md bg-warn-soft py-2 pr-3 pl-7 text-sm text-warn">{o.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <CheckLog attempts={rev.attempts} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <TokenNote revision={rev} />
        <Button variant="link" size="sm" onClick={onAgain}>Write a new review</Button>
      </div>
    </div>
  );
}

function ReviewPanel({ s, range, date }) {
  const { boot } = useApp();
  const req = useAiRequest();
  const [includeJournal, setIncludeJournal] = useState(false);
  const [fresh, setFresh] = useState(false);
  const saved = boot.plans.find((p) => p.kind === 'review' && p.input?.period?.range === range && p.input?.period?.start === s.start);
  useEffect(() => { req.reset(); setFresh(false); }, [range, s.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const input = useMemo(() => buildReviewInput(store.db, { range, date, includeJournal }).input, [range, date, includeJournal, boot]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = req.result || (!fresh && saved) || null;
  const run = () => req.run('/api/ai/review', { range, date, includeJournal });
  const word = RANGE_WORD[range];
  const nJournal = s.journal.entries;

  return (
    <section aria-labelledby="review-h" className="flex min-w-0 flex-[10_1_360px] flex-col gap-4 rounded-xl border-[1.5px] border-ai bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-h" className="text-lg font-bold">{word === 'day' ? 'Daily' : word === 'week' ? 'Weekly' : 'Monthly'} review</h2>
        <AiBadge provider={shown?.provider || boot.provider} />
      </div>

      {req.status === 'running' && (
        <>
          <Pipeline events={req.events} status={req.status} provider={boot.provider} sentLabel="this page’s totals" />
          <p role="status" className="rounded-lg bg-ai-soft p-3 text-sm text-ink-2">Writing your review. FocusFlow then checks that every number in it matches your data.</p>
        </>
      )}
      {req.status === 'error' && <ErrorNote message={req.error} onRetry={run} />}

      {req.status !== 'running' && shown && (
        <>
          {!req.result && <p className="text-xs text-muted-foreground">Written {new Date(shown.createdAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{shown.includeJournal ? ', journal included' : ', journal not shared'}</p>}
          <ReviewResult rev={shown} onAgain={() => { req.reset(); setFresh(true); }} />
        </>
      )}

      {req.status !== 'running' && !shown && (
        <div className="flex flex-col gap-4">
          <p className="text-ink-2">A short read of this {word}: what went well, patterns with the numbers behind them, and two things to try next.</p>
          <SendSummary
            provider={boot.provider}
            items={['The calculated totals on this page', includeJournal ? `Your ${nJournal} journal ${nJournal === 1 ? 'entry' : 'entries'} from this ${word}, up to 400 characters each` : 'Not your journal']}
            data={input}
          />
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox checked={includeJournal} onCheckedChange={(v) => setIncludeJournal(!!v)} className="mt-0.5" disabled={!nJournal} />
            <span>
              <strong>Include my journal</strong>
              <span className="block text-sm text-ink-2">{nJournal ? `Sends this ${word}’s ${nJournal} ${nJournal === 1 ? 'entry' : 'entries'} with this one request, so the review can mention themes. Long entries are shortened to their first 400 characters. Off by default.` : `No journal entries this ${word}.`}</span>
              {nJournal > 0 && boot.provider.mayTrain && <span className="mt-1 block text-sm font-bold text-warn">Your model ({boot.provider.model}) is a free one whose host may keep or train on what you send.</span>}
            </span>
          </label>
          <Button className="self-start" onClick={run} disabled={!s.sessionsCount && !s.completion.planned}><SparklesIcon />Write my review</Button>
          {!s.sessionsCount && !s.completion.planned && <p className="text-sm text-muted-foreground">Track some time first; there’s nothing to review yet.</p>}
        </div>
      )}
    </section>
  );
}

export function InsightsPage() {
  const { boot } = useApp();
  const [range, setRange] = useState('week');
  const [date, setDate] = useState(boot.today);
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [s, prev] = await Promise.all([
          api(`/api/stats?range=${range}&date=${date}`),
          api(`/api/stats?range=${range}&date=${previousAnchor(range, date)}`),
        ]);
        if (live) setData({ s, prev });
      } catch (err) {
        showError(err.message);
      }
    })();
    return () => { live = false; };
  }, [range, date, boot]);

  const next = step(range, date, 1);
  const atNow = rangeFor(range, date).end >= boot.today; // the current period: nothing later to show
  const s = data?.s;

  return (
    <>
      <PageHeader
        title="Insights"
        description={<>Numbers marked <strong>Calculated</strong> come from your saved sessions and tasks. Text marked <strong className="text-ai">AI suggestion</strong> was written by your AI provider and checked against those numbers.</>}
      >
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v)} aria-label="Period">
            <ToggleGroupItem value="day">Day</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label={`Previous ${range}`} onClick={() => setDate(step(range, date, -1))}><ChevronLeftIcon /></Button>
            <span className="min-w-[14ch] text-center font-bold" aria-live="polite">{s ? periodLabel(s) : ''}</span>
            <Button variant="outline" size="icon" aria-label={`Next ${range}`} disabled={atNow} onClick={() => setDate(next > boot.today ? boot.today : next)}><ChevronRightIcon /></Button>
          </div>
        </div>
      </PageHeader>

      {!s ? <p className="text-muted-foreground">Loading your numbers…</p> : (
        <div className="flex flex-col gap-5">
          <Tiles s={s} prev={data.prev} />
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex min-w-0 flex-[13_1_460px] flex-col gap-5">
              {!s.sessionsCount && !s.completion.planned ? (
                <div className="flex flex-col items-start gap-2 rounded-xl border-[1.5px] border-dashed border-border p-5 text-ink-2">
                  <p><strong className="text-foreground">Nothing tracked this {RANGE_WORD[range]}.</strong> Start a focus session or log time by hand, and your totals appear here.</p>
                  <Button asChild variant="outline" size="sm"><a href="#focus">Go to Focus</a></Button>
                </div>
              ) : (
                <>
                  {range !== 'day' && <DayChart s={s} />}
                  <Categories s={s} />
                  <Ledger s={s} />
                </>
              )}
            </div>
            <ReviewPanel s={s} range={range} date={date} />
          </div>
        </div>
      )}
    </>
  );
}
