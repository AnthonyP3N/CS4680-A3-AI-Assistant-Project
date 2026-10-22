import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/app-shell';
import { api } from '@/data/api';
import { addDays } from '@/lib/dates';
import { useApp } from '@/state/app';
import { QuickAdd } from './quick-add';
import { TaskList } from './task-list';
import { PlanPanel } from './plan-panel';

export function TodayPage() {
  const { boot, mutate } = useApp();
  const open = boot.tasks.filter((t) => t.status !== 'done');
  const soon = open.filter((t) => t.dueDate && t.dueDate <= addDays(boot.today, 1)).length;

  return (
    <>
      <PageHeader
        title="Today"
        description={open.length ? `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}${soon ? `. ${soon} due by tomorrow.` : '.'}` : 'Add a task to get started.'}
      />
      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="tasks-h" className="flex min-w-0 flex-[13_1_480px] flex-col gap-5 rounded-xl border border-border bg-card p-5">
          <h2 id="tasks-h" className="text-lg font-bold">Tasks</h2>
          <QuickAdd />
          {boot.tasks.length ? <TaskList /> : (
            <div className="flex flex-col items-start gap-3 rounded-lg border-[1.5px] border-dashed border-border p-5 text-ink-2">
              <p><strong className="text-foreground">No tasks yet.</strong> Add what you need to get done, with a rough time estimate. FocusFlow compares that estimate with the time you actually spend.</p>
              <Button variant="outline" size="sm" onClick={() => mutate(() => api('/api/demo/seed', { method: 'POST' }), { success: 'Sample week loaded', undo: true })}>Load a sample week instead</Button>
            </div>
          )}
          {boot.tasks.some((t) => t.actualMinutes) && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
              <span className="inline-block h-2 w-4 rounded-sm border-[1.5px] border-dashed border-muted-foreground" />estimate
              <span className="ml-2 inline-block h-2 w-4 rounded-sm bg-act" />time tracked
            </p>
          )}
        </section>
        <PlanPanel />
      </div>
    </>
  );
}
