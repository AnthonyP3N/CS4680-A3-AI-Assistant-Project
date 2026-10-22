// "Split into steps": the AI suggests small steps inline, under the task.
// The user picks which steps become subtasks. Nothing is added until then.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { AiBadge, CheckLog, DataPreview, DemoNote, ErrorNote, Pipeline, TokenNote } from '@/components/ai';
import { api } from '@/data/api';
import { useAiRequest } from '@/hooks/use-ai-request';
import { buildBreakdownInput } from '@/lib/ai';
import { fmtMinutes } from '@/lib/format';
import { useApp } from '@/state/app';

export function SplitPanel({ task, onClose }) {
  const { boot, mutate } = useApp();
  const req = useAiRequest();
  const [steps, setSteps] = useState([]);
  const input = useMemo(() => buildBreakdownInput(task), [task]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // React's dev double-run would otherwise send two requests
    started.current = true;
    req.run('/api/ai/breakdown', { taskId: task.id });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rev = req.result;
  useEffect(() => {
    if (rev) setSteps(rev.output.steps.map((s) => ({ ...s, include: true })));
  }, [rev]);

  const chosen = steps.filter((s) => s.include);
  const total = chosen.reduce((a, s) => a + (Number(s.estimateMinutes) || 0), 0);
  const update = (i, patch) => setSteps((list) => list.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const accept = async () => {
    const ok = await mutate(() => api(`/api/plans/${rev.id}/accept`, { method: 'POST', body: { steps: chosen } }), {
      undo: true,
      success: `Added ${chosen.length} ${chosen.length === 1 ? 'step' : 'steps'} under “${task.title}”`,
    });
    if (ok) onClose();
  };
  const dismiss = async () => {
    if (rev) await api(`/api/plans/${rev.id}/reject`, { method: 'POST' }).catch(() => {});
    onClose();
  };

  return (
    <div className="mb-3 ml-0 flex flex-col gap-3 rounded-xl border-[1.5px] border-dashed border-ai bg-ai-soft p-4 sm:ml-11">
      {req.status === 'running' && (
        <>
          <Pipeline events={req.events} status={req.status} provider={boot.provider} sentLabel="this task" />
          <p className="text-sm text-ink-2" role="status">Breaking “{task.title}” into steps, then checking the times add up.</p>
        </>
      )}
      {req.status === 'error' && <ErrorNote message={req.error} onRetry={() => req.run('/api/ai/breakdown', { taskId: task.id })} />}
      {req.status === 'error' && <Button variant="outline" size="sm" className="self-start" onClick={onClose}>Close</Button>}
      {rev && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <AiBadge provider={rev.provider} />
            <span className="text-sm text-ink-2">
              Selected steps add up to {fmtMinutes(total)}{task.estimateMinutes ? `; your estimate is ${fmtMinutes(task.estimateMinutes)}` : ''}.
            </span>
          </div>
          {rev.provider.name === 'demo' && <DemoNote />}
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={i} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 ${s.include ? '' : 'opacity-50'}`}>
                <Checkbox checked={s.include} onCheckedChange={(v) => update(i, { include: !!v })} aria-label={`Include step ${i + 1}`} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Input value={s.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={120} aria-label={`Step ${i + 1} title`} className="h-9 border-transparent px-1.5 font-bold shadow-none hover:border-input" />
                  {s.doneWhen && <span className="px-1.5 text-xs text-muted-foreground">Done when: {s.doneWhen}</span>}
                </div>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Input type="number" min={5} max={240} step={5} value={s.estimateMinutes} onChange={(e) => update(i, { estimateMinutes: Number(e.target.value) })} aria-label={`Step ${i + 1} minutes`} className="h-9 w-18 px-2" />min
                </label>
              </li>
            ))}
          </ol>
          {!!rev.output.warnings?.length && (
            <ul className="list-disc rounded-md bg-warn-soft py-2 pr-3 pl-7 text-sm text-warn">{rev.output.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={accept} disabled={!chosen.length}>Add {chosen.length} {chosen.length === 1 ? 'step' : 'steps'} as subtasks</Button>
            <Button variant="outline" onClick={dismiss}>Not now</Button>
          </div>
          <CheckLog attempts={rev.attempts} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TokenNote revision={rev} />
            <DataPreview data={input} label="See what was sent" />
          </div>
        </>
      )}
    </div>
  );
}
