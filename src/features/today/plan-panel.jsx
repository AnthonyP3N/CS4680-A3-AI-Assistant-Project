// Today's plan, and "Plan the rest of my day" right next to the tasks.
// Flow: choose a window → see what gets sent → live pipeline → pick blocks → add.

import { useEffect, useMemo, useState } from 'react';
import { CheckIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { AiBadge, CheckLog, DemoNote, ErrorNote, Pipeline, SendSummary, TokenNote } from '@/components/ai';
import { api } from '@/data/api';
import { store } from '@/data/backend';
import { useAiRequest } from '@/hooks/use-ai-request';
import { useNow } from '@/hooks/use-now';
import { navigate } from '@/hooks/use-hash-route';
import { buildPlanInput } from '@/lib/ai';
import { addDays } from '@/lib/dates';
import { fmtMinutes, fmtTime12, minutesToTime, nowMinutesIn, timeToMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { taskById, useApp } from '@/state/app';
import { useConfirm } from '@/components/confirm';

const TIME_OPTIONS = [];
for (let m = 5 * 60; m <= 23 * 60 + 45; m += 15) TIME_OPTIONS.push(minutesToTime(m));

function Timeline({ blocks, date }) {
  const { boot, mutate } = useApp();
  useNow(30_000);
  const isToday = date === boot.today;
  const now = nowMinutesIn(boot.preferences.timezone);
  const start = async (taskId, title) => {
    const ok = await mutate(() => api('/api/sessions/start', { method: 'POST', body: { taskId } }), { success: `Timer started for “${title}”` });
    if (ok) navigate('focus');
  };
  return (
    <ol className="flex flex-col gap-1.5">
      {blocks.map((b, i) => {
        const s = timeToMinutes(b.start);
        const e = s + b.durationMinutes;
        const isNow = isToday && now >= s && now < e;
        const past = isToday && now >= e;
        const task = b.taskId ? taskById(boot, b.taskId) : null;
        const brk = b.type === 'break';
        return (
          <li key={i} className="grid grid-cols-[62px_1fr] gap-2.5">
            <time className={cn('pt-2.5 text-right text-[13px] tabular-nums', isNow ? 'font-bold text-foreground' : 'text-muted-foreground')}>{fmtTime12(b.start)}</time>
            <div
              className={cn(
                'relative flex flex-col gap-0.5 rounded-md px-3 py-2',
                brk ? 'hatched text-ink-2' : 'border-l-[3px] border-rule-strong bg-muted',
                isNow && !brk && 'border-hl bg-hl-soft',
                isNow && brk && 'ring-2 ring-hl',
                (past || task?.status === 'done') && 'opacity-55',
              )}
              style={{ minHeight: Math.max(40, b.durationMinutes * 1.05) }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn('min-w-0 font-bold', task?.status === 'done' && 'line-through')}>{brk ? 'Break' : task?.title || b.title}</span>
                {isToday && !brk && task && task.status !== 'done' && !boot.activeSession && !past && (
                  <Button size="sm" variant="start" className="-my-0.5 h-8 shrink-0" onClick={() => start(task.id, task.title)} aria-label={`Start timer for ${task.title}`}>Start</Button>
                )}
              </div>
              <span className="text-[13px] text-muted-foreground">{fmtMinutes(b.durationMinutes)}{isNow && ', now'}</span>
              {!brk && b.reason && <span className="text-[13px] text-muted-foreground">{b.reason}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function defaultWindow(boot, date) {
  const prefs = boot.preferences;
  let from = timeToMinutes(prefs.dayStart);
  if (date === boot.today) {
    const next = Math.ceil((nowMinutesIn(prefs.timezone) + 5) / 15) * 15;
    from = Math.max(from, next);
  }
  from = Math.min(from, 22 * 60);
  const to = Math.min(from + prefs.availableMinutes, 23 * 60 + 45);
  return { from: minutesToTime(from), to: minutesToTime(to) };
}

function PlanSetup({ date, setDate, onCancel, onDraft }) {
  const { boot } = useApp();
  const [win, setWin] = useState(() => defaultWindow(boot, date));
  const [note, setNote] = useState('');
  useEffect(() => { setWin(defaultWindow(boot, date)); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = timeToMinutes(win.to) - timeToMinutes(win.from);
  const valid = minutes >= 15;
  const input = useMemo(
    () => (valid ? buildPlanInput(store.db, { date, dayStart: win.from, availableMinutes: minutes, userNote: note }) : null),
    [date, win.from, minutes, note, valid, boot], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rs = input?.recentStats;
  const items = input ? [
    `${input.tasks.length} open ${input.tasks.length === 1 ? 'task' : 'tasks'}: titles, deadlines, estimates, time tracked`,
    `Your last 7 days: ${fmtMinutes(rs.focusedMinutesLast7Days)} focused${rs.actualToEstimateRatio ? `, tasks took ${rs.actualToEstimateRatio}× their estimates` : ''}`,
    note.trim() ? 'Your note about what to plan around' : null,
    'Not your journal',
  ].filter(Boolean) : [];

  return (
    <form className="flex flex-col gap-4 rounded-xl border-[1.5px] border-ai p-4" onSubmit={(e) => { e.preventDefault(); if (valid) onDraft({ date, dayStart: win.from, availableMinutes: minutes, userNote: note }); }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">Plan with AI</span>
        <ToggleGroup type="single" value={date} onValueChange={(v) => v && setDate(v)} aria-label="Day to plan">
          <ToggleGroupItem value={boot.today}>Rest of today</ToggleGroupItem>
          <ToggleGroupItem value={addDays(boot.today, 1)}>Tomorrow</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pl-from">From</Label>
          <Select value={win.from} onValueChange={(v) => setWin((w) => ({ ...w, from: v }))}>
            <SelectTrigger id="pl-from"><SelectValue /></SelectTrigger>
            <SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{fmtTime12(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pl-to">Until</Label>
          <Select value={win.to} onValueChange={(v) => setWin((w) => ({ ...w, to: v }))}>
            <SelectTrigger id="pl-to"><SelectValue /></SelectTrigger>
            <SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{fmtTime12(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <p className={cn('-mt-2 text-sm', valid ? 'text-ink-2' : 'font-bold text-destructive')}>
        {valid ? `${fmtMinutes(minutes)} available, with a ${boot.preferences.breakMinutes}-minute break every ${boot.preferences.breakEveryMinutes} minutes.` : 'Choose an end time at least 15 minutes after the start.'}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pl-note">Anything to plan around? <span className="font-normal text-muted-foreground">Optional</span></Label>
        <Input id="pl-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Club meeting 4:00 to 4:30, low energy after work" />
      </div>
      {input && <SendSummary provider={boot.provider} items={items} data={input} />}
      {input && !input.tasks.length && <p className="text-sm font-bold text-destructive">Add a task first; there’s nothing open to plan.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!valid || !input?.tasks.length}>Draft plan</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <span className="text-xs text-muted-foreground">{boot.provider.demo ? 'Demo mode: runs offline' : `Uses your own ${boot.provider.label} key`}</span>
      </div>
    </form>
  );
}

function PlanResult({ rev, onAccept, onDiscard, onRetry }) {
  const { boot } = useApp();
  const [selected, setSelected] = useState(() => rev.output.schedule.map(() => true));
  const [showAll, setShowAll] = useState(false);
  const blocks = rev.output.schedule;
  const used = blocks.reduce((a, b, i) => a + (selected[i] ? b.durationMinutes : 0), 0);
  const n = selected.filter(Boolean).length;
  const avail = rev.input.availableMinutes;
  const unsched = (rev.output.unscheduled || []).map((u) => ({ ...u, title: taskById(boot, u.taskId)?.title || rev.input.tasks.find((t) => t.id === u.taskId)?.title || 'Task' }));
  const replaces = !!boot.schedules[rev.date];
  const dayWord = rev.date === boot.today ? 'today' : 'tomorrow';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <AiBadge provider={rev.provider} />
        <span className="text-sm text-ink-2">{rev.output.summary}</span>
      </div>
      {rev.provider.name === 'demo' && <DemoNote />}
      <CheckLog attempts={rev.attempts} />
      <ol className="flex flex-col gap-1.5" aria-label="Proposed blocks">
        {blocks.map((b, i) => {
          const brk = b.type === 'break';
          return (
            <li key={i} className="grid grid-cols-[62px_1fr] gap-2.5">
              <span className="pt-2.5 text-right text-[13px] text-muted-foreground tabular-nums">{fmtTime12(b.start)}</span>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-md px-3 py-2',
                  brk ? 'hatched text-ink-2' : 'border-[1.5px] border-dashed border-ai bg-ai-soft',
                  !selected[i] && 'opacity-45',
                )}
                style={{ minHeight: Math.max(44, b.durationMinutes * 1.05) }}
              >
                <Checkbox checked={selected[i]} onCheckedChange={(v) => setSelected((s) => s.map((x, k) => (k === i ? !!v : x)))} aria-label={`Include ${brk ? 'break' : b.title} at ${fmtTime12(b.start)}`} className="mt-0.5 size-5" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">{brk ? 'Break' : b.title}</span>
                  <span className="text-[13px] text-muted-foreground">{fmtMinutes(b.durationMinutes)}{b.reason ? `. ${b.reason}` : ''}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      <p className={cn('text-sm', used > avail ? 'font-bold text-destructive' : 'text-ink-2')} aria-live="polite">
        Selected blocks use <strong className="text-foreground">{used}</strong> of {avail} minutes{used > avail ? ', more than you have.' : '.'}
      </p>
      {unsched.length > 0 && (
        <div className="text-sm text-ink-2">
          <div className="font-bold text-foreground">Not in this plan</div>
          <ul className="mt-1 flex flex-col gap-0.5">{unsched.slice(0, showAll ? undefined : 4).map((u, i) => <li key={i}><strong className="text-foreground">{u.title}</strong>: {u.reason}</li>)}</ul>
          {unsched.length > 4 && <button type="button" className="mt-1 min-h-8 underline underline-offset-2" onClick={() => setShowAll((x) => !x)}>{showAll ? 'Show fewer' : `and ${unsched.length - 4} more`}</button>}
        </div>
      )}
      {!!rev.output.warnings?.length && <ul className="list-disc rounded-md bg-warn-soft py-2 pr-3 pl-7 text-sm text-warn">{rev.output.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {!!rev.output.suggestions?.length && (
        <div className="text-sm text-ink-2"><div className="font-bold text-foreground">Suggestions</div><ul className="mt-1 list-disc pl-5">{rev.output.suggestions.map((w) => <li key={w}>{w}</li>)}</ul></div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onAccept(blocks.filter((_, i) => selected[i]))} disabled={!n}>Add {n} {n === 1 ? 'block' : 'blocks'} to {dayWord}</Button>
        <Button variant="outline" onClick={onDiscard}>Discard</Button>
        <Button variant="outline" onClick={onRetry}>Try again</Button>
      </div>
      <p className="text-xs text-muted-foreground">Nothing changes until you add blocks.{replaces ? ` This replaces the plan you already have for ${dayWord}.` : ''}</p>
      <TokenNote revision={rev} />
    </div>
  );
}

export function PlanPanel() {
  const { boot, mutate } = useApp();
  const confirm = useConfirm();
  const req = useAiRequest();
  const [stage, setStage] = useState('idle'); // idle | setup | ai
  const [date, setDate] = useState(boot.today);
  const [lastBody, setLastBody] = useState(null);
  useNow(60_000);

  useEffect(() => {
    const on = () => { setDate(boot.today); setStage('setup'); };
    window.addEventListener('focusflow:plan', on);
    return () => window.removeEventListener('focusflow:plan', on);
  }, [boot.today]);

  const today = boot.schedules[boot.today];
  const tomorrow = boot.schedules[addDays(boot.today, 1)];
  const doneBlocks = today ? today.blocks.filter((b) => timeToMinutes(b.start) + b.durationMinutes <= nowMinutesIn(boot.preferences.timezone)).length : 0;

  const draft = (body) => { setLastBody(body); setStage('ai'); req.run('/api/ai/plan', body); };
  const accept = async (blocks) => {
    const ok = await mutate(() => api(`/api/plans/${req.result.id}/accept`, { method: 'POST', body: { blocks } }), {
      undo: true,
      success: `Added ${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'} to ${req.result.date === boot.today ? 'today' : 'tomorrow'}`,
    });
    if (ok) { req.reset(); setStage('idle'); }
  };
  const discard = async () => {
    if (req.result) await api(`/api/plans/${req.result.id}/reject`, { method: 'POST' }).catch(() => {});
    req.reset();
    setStage('idle');
  };
  const clearPlan = async (d) => {
    const ok = await confirm({ title: 'Clear this plan?', description: 'Your tasks are not affected. You can undo right after.', confirmLabel: 'Clear plan' });
    if (ok) mutate(() => api(`/api/schedules/${d}`, { method: 'DELETE' }), { undo: true, success: 'Plan cleared' });
  };

  return (
    <section aria-labelledby="plan-h" className="flex min-w-0 flex-[10_1_360px] flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="plan-h" className="text-lg font-bold">Today’s plan</h2>
        <span className="text-sm text-muted-foreground">Now {fmtTime12(minutesToTime(nowMinutesIn(boot.preferences.timezone)))}</span>
      </div>

      {today ? (
        <>
          {doneBlocks > 0 && (
            <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-ink-2">
              <CheckIcon className="size-4 text-act" strokeWidth={3} aria-hidden="true" />{doneBlocks} {doneBlocks === 1 ? 'block' : 'blocks'} already behind you
            </p>
          )}
          <Timeline blocks={today.blocks} date={boot.today} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Plan version {today.version}</span>
            <button type="button" className="min-h-9 underline underline-offset-2" onClick={() => clearPlan(boot.today)}>Clear plan</button>
          </div>
        </>
      ) : stage === 'idle' && (
        <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-dashed border-border p-4">
          <p className="text-ink-2">Nothing planned yet. The AI can turn your open tasks into time blocks that fit the hours you actually have, with breaks. You review every block before anything is saved.</p>
        </div>
      )}

      {stage === 'idle' && (
        <Button variant="ai" size="lg" className="self-start" onClick={() => { setDate(boot.today); setStage('setup'); }} disabled={!boot.tasks.some((t) => t.status !== 'done')}>
          <SparklesIcon aria-hidden="true" />{today ? 'Re-plan the rest of my day' : 'Plan the rest of my day'}
        </Button>
      )}
      {stage === 'setup' && <PlanSetup date={date} setDate={setDate} onCancel={() => setStage('idle')} onDraft={draft} />}
      {stage === 'ai' && (
        <div className="flex flex-col gap-3">
          <Pipeline events={req.events} status={req.status} provider={boot.provider} sentLabel="your tasks and totals" />
          {req.status === 'running' && <p role="status" className="rounded-lg bg-ai-soft p-3 text-sm text-ink-2">Drafting your plan. FocusFlow checks the draft against your time window, breaks and deadlines before you see it.</p>}
          {req.status === 'error' && <ErrorNote message={req.error} onRetry={() => draft(lastBody)} />}
          {req.status === 'error' && <Button variant="outline" className="self-start" onClick={() => { req.reset(); setStage('setup'); }}>Back</Button>}
          {req.result && <PlanResult key={req.result.id} rev={req.result} onAccept={accept} onDiscard={discard} onRetry={() => draft(lastBody)} />}
        </div>
      )}

      {tomorrow && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-bold">Tomorrow</h3>
            <button type="button" className="min-h-9 text-xs text-muted-foreground underline underline-offset-2" onClick={() => clearPlan(addDays(boot.today, 1))}>Clear</button>
          </div>
          <Timeline blocks={tomorrow.blocks} date={addDays(boot.today, 1)} />
        </div>
      )}
    </section>
  );
}
