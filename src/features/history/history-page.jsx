// AI history: every request sent to an AI provider, what was sent, how
// FocusFlow checked the answer, and what you did with it.

import { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { CheckLog, DataPreview, TokenNote, shortProvider } from '@/components/ai';
import { PageHeader } from '@/components/layout/app-shell';
import { fmtDateShort, fmtDateTime, fmtMinutes, fmtTime12 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { taskById, useApp } from '@/state/app';

const KIND = { plan: 'Day plan', review: 'Review', breakdown: 'Task steps' };
const STATUS = {
  proposed: ['No decision', 'secondary'],
  accepted: ['Accepted', 'success'],
  'partially accepted': ['Partly accepted', 'success'],
  rejected: ['Rejected', 'secondary'],
  info: ['Read', 'secondary'],
};

function title(rev, boot) {
  if (rev.kind === 'plan') return `${KIND.plan} for ${rev.date === boot.today ? 'today' : fmtDateShort(rev.date)}`;
  if (rev.kind === 'breakdown') return `Steps for “${taskById(boot, rev.taskId)?.title || rev.input.task.title}”`;
  const p = rev.input.period;
  return `${p.range[0].toUpperCase()}${p.range.slice(1)} review, ${fmtDateShort(p.start)}${p.end !== p.start ? ` to ${fmtDateShort(p.end)}` : ''}`;
}

function Output({ rev }) {
  const o = rev.output;
  if (rev.kind === 'plan') {
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <p>{o.summary}</p>
        <ul className="flex flex-col gap-0.5 text-ink-2">
          {o.schedule.map((b, i) => <li key={i}>{fmtTime12(b.start)}: {b.type === 'break' ? 'Break' : b.title}, {fmtMinutes(b.durationMinutes)}</li>)}
        </ul>
      </div>
    );
  }
  if (rev.kind === 'breakdown') {
    return <ol className="list-decimal pl-5 text-sm text-ink-2">{o.steps.map((s, i) => <li key={i}>{s.title}, {fmtMinutes(s.estimateMinutes)}</li>)}</ol>;
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p>{o.summary}</p>
      <ul className="list-disc pl-5 text-ink-2">{o.suggestions.map((s, i) => <li key={i}>{s.action}</li>)}</ul>
    </div>
  );
}

function Item({ rev }) {
  const { boot } = useApp();
  const [open, setOpen] = useState(false);
  const [label, tone] = STATUS[rev.status] || STATUS.info;
  const demo = rev.provider?.name === 'demo';
  return (
    <li className="rounded-xl border border-border bg-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left">
          <ChevronRightIcon className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden="true" />
          <span className="min-w-0 flex-1 font-bold">{title(rev, boot)}</span>
          {rev.kind === 'review' && rev.includeJournal && <Badge variant="warn">Journal shared</Badge>}
          <Badge variant={tone}>{label}</Badge>
          <span className="w-full pl-7 text-sm text-muted-foreground sm:w-auto sm:pl-0">{fmtDateTime(rev.createdAt)}, {demo ? 'demo rules' : `${shortProvider(rev.provider)} (${rev.provider.model})`}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
            <div>
              <h3 className="mb-1 text-sm font-bold">What came back</h3>
              <Output rev={rev} />
            </div>
            <CheckLog attempts={rev.attempts} defaultOpen={false} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TokenNote revision={rev} />
              <DataPreview data={rev.input} label="See exactly what was sent" />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function HistoryPage() {
  const { boot } = useApp();
  const [kind, setKind] = useState('all');
  const list = boot.plans.filter((p) => kind === 'all' || p.kind === kind);
  const real = boot.plans.filter((p) => p.provider?.name !== 'demo');
  const tokens = real.reduce((a, p) => a + (p.tokens || 0), 0);
  const journalShares = boot.plans.filter((p) => p.kind === 'review' && p.includeJournal).length;

  return (
    <>
      <PageHeader title="AI history" description="Every request FocusFlow made to an AI: what was sent, how the answer was checked, and what you did with it. Nothing here leaves your browser." />
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3"><div className="text-sm font-bold text-ink-2">Requests</div><div className="text-2xl font-extrabold tabular-nums">{boot.plans.length}</div><div className="text-sm text-muted-foreground">{real.length} to a real AI, {boot.plans.length - real.length} demo</div></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><div className="text-sm font-bold text-ink-2">Tokens used</div><div className="text-2xl font-extrabold tabular-nums">{tokens.toLocaleString('en-US')}</div><div className="text-sm text-muted-foreground">On your own API key</div></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><div className="text-sm font-bold text-ink-2">Journal shared</div><div className="text-2xl font-extrabold tabular-nums">{journalShares}</div><div className="text-sm text-muted-foreground">{journalShares === 1 ? 'time' : 'times'}, only when you opted in</div></div>
      </div>
      <ToggleGroup type="single" value={kind} onValueChange={(v) => setKind(v || 'all')} aria-label="Show" className="mb-4">
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="plan">Day plans</ToggleGroupItem>
        <ToggleGroupItem value="review">Reviews</ToggleGroupItem>
        <ToggleGroupItem value="breakdown">Task steps</ToggleGroupItem>
      </ToggleGroup>
      {list.length ? <ul className="flex flex-col gap-2.5">{list.map((r) => <Item key={r.id} rev={r} />)}</ul> : (
        <p className="rounded-xl border-[1.5px] border-dashed border-border p-5 text-ink-2">No AI requests yet. Try “Plan the rest of my day” on Today, or a review on Insights.</p>
      )}
    </>
  );
}
