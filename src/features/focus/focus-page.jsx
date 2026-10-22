import { useMemo, useState } from 'react';
import { PauseIcon, PlayIcon, SquareIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/app-shell';
import { useConfirm } from '@/components/confirm';
import { api } from '@/data/api';
import { useNow } from '@/hooks/use-now';
import { addDays } from '@/lib/dates';
import { fmtClock, fmtDateTime, fmtMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { taskById, useApp } from '@/state/app';
import { useUi } from '@/state/ui';

const R = 104;
const CIRC = 2 * Math.PI * R;

function useOpenTasks() {
  const { boot } = useApp();
  return useMemo(() => {
    const soon = addDays(boot.today, 1);
    const w = { high: 0, medium: 1, low: 2 };
    return boot.tasks.filter((t) => t.status !== 'done').sort((a, b) =>
      ((a.dueDate && a.dueDate <= soon) ? 0 : 1) - ((b.dueDate && b.dueDate <= soon) ? 0 : 1)
      || w[a.priority] - w[b.priority]
      || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  }, [boot.tasks, boot.today]);
}

function Dial({ session }) {
  const { boot, elapsedSeconds } = useApp();
  useNow(1000);
  const block = (boot.preferences.breakEveryMinutes || 45) * 60;
  const secs = elapsedSeconds();
  const frac = session ? Math.min(1, secs / block) : 0;
  const sub = !session ? `${block / 60}-minute focus block`
    : session.status === 'paused' ? 'Paused'
      : secs >= block ? 'Block complete. A break is a good idea.'
        : `${Math.ceil((block - secs) / 60)} min left in this block`;
  return (
    <div className="relative aspect-square w-[min(300px,78vw)]">
      <svg viewBox="0 0 240 240" className="size-full" aria-hidden="true">
        <circle cx="120" cy="120" r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
        <circle
          cx="120" cy="120" r={R} fill="none" strokeWidth="14" strokeLinecap="round" transform="rotate(-90 120 120)"
          stroke={session?.status === 'paused' ? 'var(--rule-strong)' : 'var(--hl)'}
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - frac)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          opacity={session ? 1 : 0}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center gap-1 text-center">
        <div role="timer" aria-live="off" className="font-mono text-[clamp(2.6rem,9vw,3.6rem)] font-semibold tracking-tight tabular-nums">{fmtClock(secs)}</div>
        <div className="mx-auto max-w-[18ch] text-sm text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

function TimerCard() {
  const { boot, mutate } = useApp();
  const { openReflection } = useUi();
  const confirm = useConfirm();
  const tasks = useOpenTasks();
  const s = boot.activeSession;
  const [pick, setPick] = useState('');
  const task = s ? taskById(boot, s.taskId) : null;
  const chosen = pick || tasks[0]?.id || '';

  const start = () => mutate(() => api('/api/sessions/start', { method: 'POST', body: { taskId: chosen } }), {
    success: `Timer started for “${taskById(boot, chosen)?.title}”`,
  });
  const toggle = () => mutate(() => api(`/api/sessions/${s.id}/${s.status === 'running' ? 'pause' : 'resume'}`, { method: 'POST' }));
  const stop = async () => {
    const reflect = boot.preferences.reflectAfterSession !== false;
    const stopped = await mutate(() => api(`/api/sessions/${s.id}/stop`, { method: 'POST', body: {} }), {
      undo: !reflect,
      success: reflect ? null : (r) => `Saved ${fmtMinutes(r.durationSeconds / 60)} on “${s.taskTitle}”`,
    });
    if (stopped && reflect) openReflection(stopped);
  };
  const discard = async () => {
    const ok = await confirm({ title: 'Discard this session?', description: 'The time will not be saved.', confirmLabel: 'Discard', destructive: true });
    if (ok) mutate(() => api(`/api/sessions/${s.id}/discard`, { method: 'POST' }), { undo: true, success: 'Session discarded' });
  };

  return (
    <section aria-label="Focus timer" className="flex min-w-0 flex-[1_1_420px] flex-col items-center gap-6 rounded-xl border border-border bg-card px-5 py-8">
      <Dial session={s} />
      {s ? (
        <>
          <div className="flex max-w-[40ch] flex-col items-center gap-0.5 text-center">
            <span className="text-sm text-muted-foreground">{s.status === 'paused' ? 'Paused on' : 'Focusing on'}</span>
            <strong className="text-xl">{s.taskTitle}</strong>
            {task?.estimateMinutes && <span className="text-sm text-muted-foreground">{fmtMinutes(task.actualMinutes)} tracked before this session, estimate {fmtMinutes(task.estimateMinutes)}</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button variant="outline" size="lg" className="h-12" onClick={toggle}>
              {s.status === 'running' ? <><PauseIcon fill="currentColor" />Pause</> : <><PlayIcon fill="currentColor" />Resume</>}
            </Button>
            <Button size="lg" className="h-12" onClick={stop}><SquareIcon fill="currentColor" />Stop and save</Button>
          </div>
          <button type="button" onClick={discard} className="min-h-9 text-sm text-muted-foreground underline underline-offset-2">Discard this session</button>
        </>
      ) : tasks.length ? (
        <form className="flex w-full max-w-sm flex-col gap-3" onSubmit={(e) => { e.preventDefault(); start(); }}>
          <Label htmlFor="focus-task">What are you working on?</Label>
          <Select value={chosen} onValueChange={setPick}>
            <SelectTrigger id="focus-task" className="h-12"><SelectValue /></SelectTrigger>
            <SelectContent>{tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="submit" size="lg" className="h-12"><PlayIcon fill="currentColor" />Start focus</Button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center text-ink-2">
          <p>Add a task on Today, then start a focus session for it here.</p>
          <Button asChild variant="outline" size="sm"><a href="#today">Go to Today</a></Button>
        </div>
      )}
    </section>
  );
}

function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function LogTime() {
  const { mutate } = useApp();
  const tasks = useOpenTasks();
  const [form, setForm] = useState({ taskId: '', minutes: '', endedAt: nowLocalInput(), done: false });
  const chosen = form.taskId || tasks[0]?.id || '';
  const submit = async (e) => {
    e.preventDefault();
    const ok = await mutate(() => api('/api/sessions/manual', {
      method: 'POST',
      body: { taskId: chosen, minutes: Number(form.minutes), endedAt: new Date(form.endedAt).toISOString(), completeTask: form.done },
    }), { undo: true, success: (r) => `Logged ${fmtMinutes(r.durationSeconds / 60)}` });
    if (ok) setForm({ taskId: '', minutes: '', endedAt: nowLocalInput(), done: false });
  };
  return (
    <section aria-labelledby="log-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 id="log-h" className="text-lg font-bold">Log time by hand</h2>
        <p className="text-sm text-muted-foreground">Forgot to start the timer? Add the time here.</p>
      </div>
      {tasks.length ? (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="log-task">Task</Label>
            <Select value={chosen} onValueChange={(v) => setForm((f) => ({ ...f, taskId: v }))}>
              <SelectTrigger id="log-task"><SelectValue /></SelectTrigger>
              <SelectContent>{tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="log-min">Minutes</Label><Input id="log-min" type="number" min={1} max={720} required placeholder="120" value={form.minutes} onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="log-end">Finished at</Label><Input id="log-end" type="datetime-local" max={nowLocalInput()} value={form.endedAt} onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))} /></div>
          <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={form.done} onCheckedChange={(v) => setForm((f) => ({ ...f, done: !!v }))} />Mark the task done
          </label>
          <Button type="submit" variant="outline" className="col-span-2 justify-self-start">Log time</Button>
        </form>
      ) : <p className="text-sm text-muted-foreground">Add a task first.</p>}
    </section>
  );
}

function RecentSessions() {
  const { boot, mutate } = useApp();
  const list = boot.recentSessions.slice(0, 12);
  return (
    <section aria-labelledby="recent-h" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
      <h2 id="recent-h" className="text-lg font-bold">Recent sessions</h2>
      {!list.length && <p className="text-sm text-muted-foreground">Sessions you finish appear here.</p>}
      <ul>
        {list.map((s) => {
          const title = taskById(boot, s.taskId)?.title || s.taskTitleSnapshot || '(deleted task)';
          return (
            <li key={s.id} className="flex items-start gap-2 border-b border-border py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3 font-bold"><span className="truncate">{title}</span><span className="shrink-0 tabular-nums">{fmtMinutes(s.durationSeconds / 60)}</span></div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>{fmtDateTime(s.endedAt)}</span>
                  {s.source === 'manual' && <Badge variant="secondary" className="font-medium">logged by hand</Badge>}
                  {s.note && <span className="italic">{s.note}</span>}
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete session for ${title}`} onClick={() => mutate(() => api(`/api/sessions/${s.id}`, { method: 'DELETE' }), { undo: true, success: 'Session deleted' })}>
                <Trash2Icon />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FocusPage() {
  return (
    <>
      <PageHeader title="Focus" description="Track the time a task really takes. The timer keeps running if you close or refresh the page." />
      <div className={cn('flex flex-wrap items-start gap-5')}>
        <TimerCard />
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <LogTime />
          <RecentSessions />
        </div>
      </div>
    </>
  );
}
