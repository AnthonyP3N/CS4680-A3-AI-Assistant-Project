import { useState } from 'react';
import { ChevronRightIcon, MoreHorizontalIcon, PencilIcon, PlayIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/misc';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/data/api';
import { navigate } from '@/hooks/use-hash-route';
import { addDays, diffDays } from '@/lib/dates';
import { dueLabel, fmtMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';
import { CategoryIcon } from '@/components/category-picker';
import { SplitPanel } from './split-panel';
import { EditTaskDialog } from './edit-task-dialog';

export function MiniLedger({ estimate, actual, className }) {
  if (!actual) return null;
  const scale = Math.max(estimate || 0, actual, 1);
  return (
    <div aria-hidden="true" className={cn('relative mt-2 h-1.5 max-w-60', className)}>
      {!!estimate && <span className="absolute inset-0 rounded-[3px] border-[1.5px] border-dashed border-muted-foreground/70" style={{ width: `${(estimate / scale) * 100}%` }} />}
      <span className="absolute inset-y-px left-0 rounded-[3px] bg-act" style={{ width: `${(Math.min(actual, estimate || actual) / scale) * 100}%` }} />
      {!!estimate && actual > estimate && (
        <span className="absolute inset-y-px rounded-r-[3px] border border-act" style={{ left: `${(estimate / scale) * 100}%`, width: `${((actual - estimate) / scale) * 100}%`, backgroundImage: 'repeating-linear-gradient(135deg, var(--act) 0 2px, transparent 2px 5px)' }} />
      )}
    </div>
  );
}

function TaskRow({ task, depth = 0, childCount = 0 }) {
  const { boot, mutate } = useApp();
  const [splitting, setSplitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const done = task.status === 'done';
  const active = boot.activeSession?.taskId === task.id;
  const due = dueLabel(task.dueDate, boot.today);
  const overdue = !done && task.dueDate && task.dueDate < boot.today;
  // Any open top-level task can be split from the menu; big ones also get a visible button.
  const canSplit = !done && depth === 0 && !childCount;
  const suggestSplit = canSplit && task.estimateMinutes >= 90 && task.actualMinutes < task.estimateMinutes / 2;

  const toggle = (v) => mutate(() => api(`/api/tasks/${task.id}`, { method: 'PATCH', body: { status: v ? 'done' : 'todo' } }), {
    undo: true,
    success: v ? `Marked “${task.title}” done` : `Marked “${task.title}” not done`,
  });
  const start = async () => {
    const ok = await mutate(() => api('/api/sessions/start', { method: 'POST', body: { taskId: task.id } }), { success: `Timer started for “${task.title}”` });
    if (ok) navigate('focus');
  };
  const remove = () => mutate(() => api(`/api/tasks/${task.id}`, { method: 'DELETE' }), { undo: true, success: `Deleted “${task.title}”` });

  const time = task.estimateMinutes
    ? (task.actualMinutes ? `${fmtMinutes(task.actualMinutes)} of ${fmtMinutes(task.estimateMinutes)} tracked` : `${fmtMinutes(task.estimateMinutes)} estimate`)
    : task.actualMinutes ? `${fmtMinutes(task.actualMinutes)} tracked` : 'No estimate';

  return (
    <li className={cn('border-b border-border last:border-b-0', depth && 'ml-8 sm:ml-10')}>
      <div className={cn('flex items-start gap-1 py-2.5', active && 'rounded-md bg-gradient-to-r from-hl-soft to-transparent')}>
        <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
          <Checkbox checked={done} onCheckedChange={toggle} aria-label={`Mark “${task.title}” ${done ? 'not done' : 'done'}`} />
        </label>
        <div className="min-w-0 flex-1 pt-2">
          <div className={cn('font-bold break-words', done && 'text-muted-foreground line-through')}>{task.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {task.priority === 'high' && !done && <span className="font-bold text-foreground">High priority</span>}
            {task.category && <Badge variant="secondary" className="gap-1 font-medium"><CategoryIcon name={task.category} className="size-3.5" />{task.category}</Badge>}
            {!done && <span className={cn(overdue && 'font-bold text-destructive', task.dueDate === boot.today && 'font-bold text-foreground')}>{due}</span>}
            <span>{time}</span>
            {active && <Badge variant="warn" className="bg-hl text-[#1d2b3a]">Timer running</Badge>}
            {childCount > 0 && <span>{childCount} {childCount === 1 ? 'step' : 'steps'}</span>}
          </div>
          <MiniLedger estimate={task.estimateMinutes} actual={task.actualMinutes} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 pt-1">
          {suggestSplit && !splitting && (
            <Button variant="ai" size="sm" onClick={() => setSplitting(true)} className="hidden sm:inline-flex">
              <SparklesIcon aria-hidden="true" />Split into steps
            </Button>
          )}
          {!done && !boot.activeSession && (
            <Button variant="start" size="sm" onClick={start} aria-label={`Start timer for ${task.title}`}><PlayIcon fill="currentColor" aria-hidden="true" /><span className="hidden sm:inline">Start</span></Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${task.title}`}><MoreHorizontalIcon /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}><PencilIcon />Edit</DropdownMenuItem>
              {canSplit && <DropdownMenuItem onSelect={() => setSplitting(true)}><SparklesIcon className="text-ai" />Split into steps with AI</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={remove} disabled={active}><Trash2Icon />Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {splitting && <SplitPanel task={task} onClose={() => setSplitting(false)} />}
      <EditTaskDialog task={editing ? task : null} onClose={() => setEditing(false)} />
    </li>
  );
}

function groupOf(task, today) {
  if (!task.dueDate) return 'later';
  const d = diffDays(today, task.dueDate);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 7) return 'week';
  return 'later';
}

const GROUPS = [
  ['overdue', 'Overdue'],
  ['today', 'Due today'],
  ['week', 'This week'],
  ['later', 'Later'],
];

export function TaskList() {
  const { boot } = useApp();
  const [showDone, setShowDone] = useState(false);
  const weight = { high: 0, medium: 1, low: 2 };
  const byParent = {};
  for (const t of boot.tasks) if (t.parentId) (byParent[t.parentId] ||= []).push(t);
  const ids = new Set(boot.tasks.map((t) => t.id));
  const roots = boot.tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
  const sort = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || weight[a.priority] - weight[b.priority] || (a.createdAt || '').localeCompare(b.createdAt || '');
  const open = roots.filter((t) => t.status !== 'done').sort(sort);
  const weekAgo = addDays(boot.today, -7);
  const done = roots.filter((t) => t.status === 'done' && (t.completedAt || '').slice(0, 10) >= weekAgo)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const renderTask = (t) => {
    const kids = (byParent[t.id] || []).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return [
      <TaskRow key={t.id} task={t} childCount={kids.length} />,
      ...kids.map((k) => <TaskRow key={k.id} task={k} depth={1} />),
    ];
  };

  if (!boot.tasks.length) return null;
  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map(([key, name]) => {
        const items = open.filter((t) => groupOf(t, boot.today) === key);
        if (!items.length) return null;
        return (
          <section key={key} aria-labelledby={`grp-${key}`}>
            <h3 id={`grp-${key}`} className={cn('mb-1 flex items-baseline gap-2 text-sm font-bold', key === 'overdue' ? 'text-destructive' : 'text-ink-2')}>
              {name} <span className="font-medium text-muted-foreground">{items.length} open</span>
            </h3>
            <ul>{items.flatMap(renderTask)}</ul>
          </section>
        );
      })}
      {!open.length && <p className="rounded-lg border-[1.5px] border-dashed border-border p-4 text-ink-2">Everything is done. Add the next task above.</p>}
      {done.length > 0 && (
        <Collapsible open={showDone} onOpenChange={setShowDone}>
          <CollapsibleTrigger className="flex min-h-11 items-center gap-2 text-sm font-bold text-ink-2">
            <ChevronRightIcon className={cn('size-4 transition-transform', showDone && 'rotate-90')} aria-hidden="true" />
            Done in the last 7 days <span className="font-medium text-muted-foreground">{done.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent><ul>{done.flatMap(renderTask)}</ul></CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
