import { useEffect, useMemo, useState } from 'react';
import { PauseIcon, PlayIcon, PlusIcon, SquareIcon, TimerIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/misc';
import { PageHeader } from '@/components/layout/app-shell';
import { useConfirm } from '@/components/confirm';
import { api } from '@/data/api';
import { useNow } from '@/hooks/use-now';
import { addDays } from '@/lib/dates';
import { fmtClock, fmtDateTime, fmtMinutes } from '@/lib/format';
import { FOCUS_CATEGORY, FOCUS_LABEL_MAX, FOCUS_MAX, FOCUS_MIN, FOCUS_PRESETS, blockMinutes, focusMinutesOrNull, timerFace } from '@/lib/focus';
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

const FOCUS = 'focus'; // the "Just focus (no task)" choice

function Dial({ session, idleMinutes }) {
  const { boot, elapsedSeconds } = useApp();
  useNow(1000);
  const target = session ? blockMinutes(session, boot.preferences) : idleMinutes;
  const secs = session ? elapsedSeconds() : 0;
  const face = timerFace(secs, target);
  const paused = session?.status === 'paused';
  const main = !session ? fmtClock(target * 60) : face.done ? `+${fmtClock(face.over)}` : fmtClock(face.left);
  const sub = !session ? `${target}-minute focus block`
    : face.done ? `Block done. ${fmtClock(secs)} in total.`
      : paused ? `Paused, ${fmtClock(face.left)} left`
        : `left of ${fmtMinutes(target)}`;
  return (
    <div className="relative aspect-square w-[min(300px,78vw)]">
      <svg viewBox="0 0 240 240" className="size-full" aria-hidden="true">
        <circle cx="120" cy="120" r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
        <circle
          cx="120" cy="120" r={R} fill="none" strokeWidth="14" strokeLinecap="round" transform="rotate(-90 120 120)"
          stroke={paused ? 'var(--rule-strong)' : face.done ? 'var(--act)' : 'var(--hl)'}
          strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - face.frac)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          opacity={session ? 1 : 0}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center gap-1 text-center">
        <div role="timer" aria-live="off" aria-label={session ? (face.done ? `${fmtClock(face.over)} over the block` : `${fmtClock(face.left)} left`) : `${target} minute block`} className={cn('font-mono text-[clamp(2.6rem,9vw,3.6rem)] font-semibold tracking-tight tabular-nums', face.done && 'text-act-strong')}>{main}</div>
        <div className="mx-auto max-w-[20ch] text-sm text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

/** Presets plus a custom number. Saved as the default for next time. */
function FocusLength({ value, onChange }) {
  const preset = FOCUS_PRESETS.includes(value);
  const [custom, setCustom] = useState(!preset);
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = focusMinutesOrNull(text);
    if (n) onChange(n); else setText(String(value));
  };
  return (
    <div className="flex flex-col gap-2">
      <span id="focus-len" className="text-sm font-bold">Focus length</span>
      <ToggleGroup
        type="single"
        value={custom ? 'custom' : String(value)}
        onValueChange={(v) => {
          if (!v) return;
          if (v === 'custom') { setCustom(true); setTimeout(() => document.getElementById('focus-custom')?.focus(), 30); return; }
          setCustom(false);
          onChange(Number(v));
        }}
        aria-labelledby="focus-len"
        className="grid w-full grid-cols-6"
      >
        {FOCUS_PRESETS.map((m) => <ToggleGroupItem key={m} value={String(m)} aria-label={`${m} minutes`} className="px-0 tabular-nums">{m}</ToggleGroupItem>)}
        <ToggleGroupItem value="custom" className="px-0">Custom</ToggleGroupItem>
      </ToggleGroup>
      {custom && (
        <div className="flex items-center gap-2">
          <Input
            id="focus-custom"
            type="number"
            inputMode="numeric"
            min={FOCUS_MIN}
            max={FOCUS_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
            aria-label="Custom focus length in minutes"
            aria-describedby="focus-custom-hint"
            className="w-24"
          />
          <span id="focus-custom-hint" className="text-sm text-muted-foreground">minutes ({FOCUS_MIN} to {FOCUS_MAX})</span>
        </div>
      )}
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
  const [label, setLabel] = useState('');
  const [length, setLength] = useState(boot.preferences.focusMinutes || 45);
  useEffect(() => { setLength(boot.preferences.focusMinutes || 45); }, [boot.preferences.focusMinutes]);
  const task = s ? taskById(boot, s.taskId) : null;
  const chosen = pick && (pick === FOCUS || tasks.some((t) => t.id === pick)) ? pick : tasks[0]?.id || FOCUS;
  const target = s ? blockMinutes(s, boot.preferences) : length;

  const saveLength = (n) => {
    setLength(n);
    if (n !== boot.preferences.focusMinutes) mutate(() => api('/api/preferences', { method: 'PUT', body: { focusMinutes: n } }));
  };
  const start = () => mutate(() => api('/api/sessions/start', {
    method: 'POST',
    body: chosen === FOCUS ? { label, targetMinutes: length } : { taskId: chosen, targetMinutes: length },
  }), {
    success: chosen === FOCUS ? `Started a ${length}-minute focus block` : `Timer started for “${taskById(boot, chosen)?.title}”`,
  }).then((ok) => { if (ok) setLabel(''); });
  const toggle = () => mutate(() => api(`/api/sessions/${s.id}/${s.status === 'running' ? 'pause' : 'resume'}`, { method: 'POST' }));
  const extend = () => mutate(() => api(`/api/sessions/${s.id}`, { method: 'PATCH', body: { targetMinutes: Math.min(FOCUS_MAX, target + 5) } }), { success: `Block is now ${fmtMinutes(Math.min(FOCUS_MAX, target + 5))}` });
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
      <Dial session={s} idleMinutes={length} />
      {s ? (
        <>
          <div className="flex max-w-[40ch] flex-col items-center gap-1 text-center">
            <span className="text-sm text-muted-foreground">{s.status === 'paused' ? 'Paused on' : 'Focusing on'}</span>
            <strong className="text-xl">{s.taskTitle}</strong>
            {!s.taskId && <Badge variant="secondary" className="gap-1 font-medium"><TimerIcon className="size-3.5" aria-hidden="true" />Counts as {FOCUS_CATEGORY} in Insights</Badge>}
            {task?.estimateMinutes && <span className="text-sm text-muted-foreground">{fmtMinutes(task.actualMinutes)} tracked before this session, estimate {fmtMinutes(task.estimateMinutes)}</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button variant="outline" size="lg" className="h-12" onClick={toggle}>
              {s.status === 'running' ? <><PauseIcon fill="currentColor" />Pause</> : <><PlayIcon fill="currentColor" />Resume</>}
            </Button>
            <Button size="lg" className="h-12" onClick={stop}><SquareIcon fill="currentColor" />Stop and save</Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Button variant="ghost" size="sm" onClick={extend} disabled={target >= FOCUS_MAX}><PlusIcon aria-hidden="true" />5 min</Button>
            <button type="button" onClick={discard} className="min-h-9 text-sm text-muted-foreground underline underline-offset-2">Discard this session</button>
          </div>
        </>
      ) : (
        <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={(e) => { e.preventDefault(); start(); }}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="focus-task">What are you working on?</Label>
            <Select value={chosen} onValueChange={setPick}>
              <SelectTrigger id="focus-task" className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FOCUS}>Just focus (no task)</SelectItem>
                {tasks.length > 0 && <SelectSeparator />}
                {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {chosen === FOCUS && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="focus-label">What’s it for? <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="focus-label" value={label} maxLength={FOCUS_LABEL_MAX} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Reading, deep work" />
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><TimerIcon className="size-3.5" aria-hidden="true" />Counts as {FOCUS_CATEGORY} in Insights.</p>
            </div>
          )}
          <FocusLength value={length} onChange={saveLength} />
          <Button type="submit" size="lg" className="h-12"><PlayIcon fill="currentColor" />Start {length}-min focus</Button>
        </form>
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
  const [form, setForm] = useState({ taskId: '', label: '', minutes: '', endedAt: nowLocalInput(), done: false });
  const chosen = form.taskId && (form.taskId === FOCUS || tasks.some((t) => t.id === form.taskId)) ? form.taskId : tasks[0]?.id || FOCUS;
  const submit = async (e) => {
    e.preventDefault();
    const ok = await mutate(() => api('/api/sessions/manual', {
      method: 'POST',
      body: {
        ...(chosen === FOCUS ? { label: form.label } : { taskId: chosen, completeTask: form.done }),
        minutes: Number(form.minutes),
        endedAt: new Date(form.endedAt).toISOString(),
      },
    }), { undo: true, success: (r) => `Logged ${fmtMinutes(r.durationSeconds / 60)}${r.taskId ? '' : ` as ${FOCUS_CATEGORY}`}` });
    if (ok) setForm({ taskId: '', label: '', minutes: '', endedAt: nowLocalInput(), done: false });
  };
  return (
    <section aria-labelledby="log-h" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 id="log-h" className="text-lg font-bold">Log time by hand</h2>
        <p className="text-sm text-muted-foreground">Forgot to start the timer? Add the time here.</p>
      </div>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="log-task">Task</Label>
          <Select value={chosen} onValueChange={(v) => setForm((f) => ({ ...f, taskId: v }))}>
            <SelectTrigger id="log-task"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FOCUS}>Just focus (no task)</SelectItem>
              {tasks.length > 0 && <SelectSeparator />}
              {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {chosen === FOCUS && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="log-label">What was it for? <span className="font-normal text-muted-foreground">(optional, counts as {FOCUS_CATEGORY})</span></Label>
            <Input id="log-label" value={form.label} maxLength={FOCUS_LABEL_MAX} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Reading" />
          </div>
        )}
        <div className="flex flex-col gap-1.5"><Label htmlFor="log-min">Minutes</Label><Input id="log-min" type="number" min={1} max={720} required placeholder="120" value={form.minutes} onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))} /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="log-end">Finished at</Label><Input id="log-end" type="datetime-local" max={nowLocalInput()} value={form.endedAt} onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))} /></div>
        {chosen !== FOCUS && (
          <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={form.done} onCheckedChange={(v) => setForm((f) => ({ ...f, done: !!v }))} />Mark the task done
          </label>
        )}
        <Button type="submit" variant="outline" className="col-span-2 justify-self-start">Log time</Button>
      </form>
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
                  {!s.taskId && s.categorySnapshot === FOCUS_CATEGORY && <Badge variant="secondary" className="gap-1 font-medium"><TimerIcon className="size-3" aria-hidden="true" />{FOCUS_CATEGORY}</Badge>}
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
      <PageHeader title="Focus" description="Set a focus length and start the timer, for a task or just to focus. It keeps running if you close or refresh the page." />
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
