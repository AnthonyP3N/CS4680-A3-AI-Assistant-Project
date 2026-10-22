// "Type it the way you'd say it": one input, with a live preview of what
// each word became. Chips open "More options" to correct anything.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/data/api';
import { fmtMinutes, fmtWeekday } from '@/lib/format';
import { parseQuickAdd } from '@/lib/quickadd';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';
import { diffDays } from '@/lib/dates';

function dueText(dueDate, today) {
  if (!dueDate) return null;
  const d = diffDays(today, dueDate);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d > 1 && d < 7) return fmtWeekday(dueDate);
  return dueDate;
}

export function QuickAdd() {
  const { boot, mutate } = useApp();
  const inputRef = useRef(null);
  const [text, setText] = useState('');
  const [more, setMore] = useState(false);
  const [over, setOver] = useState({});

  const lastCategory = useMemo(() => {
    const sorted = [...boot.tasks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return sorted[0]?.category || 'Homework';
  }, [boot.tasks]);

  useEffect(() => {
    const on = (e) => {
      if (e.detail?.text) setText(e.detail.text);
      inputRef.current?.focus();
    };
    window.addEventListener('focusflow:quick-add', on);
    return () => window.removeEventListener('focusflow:quick-add', on);
  }, []);

  const parsed = parseQuickAdd(text, boot.today);
  const task = {
    title: parsed.title,
    estimateMinutes: over.estimateMinutes !== undefined ? over.estimateMinutes : parsed.estimateMinutes,
    dueDate: over.dueDate !== undefined ? over.dueDate : parsed.dueDate,
    priority: over.priority || parsed.priority || 'medium',
    category: over.category || parsed.category || lastCategory,
  };
  const has = text.trim().length > 0;
  const canAdd = !!task.title;

  const add = async () => {
    if (!canAdd) return;
    const body = { ...task, estimateMinutes: task.estimateMinutes || null, dueDate: task.dueDate || null };
    const created = await mutate(() => api('/api/tasks', { method: 'POST', body }), { undo: true, success: `Added “${task.title}”` });
    if (created) {
      setText('');
      setOver({});
      inputRef.current?.focus();
    }
  };

  const openMore = (field) => {
    setMore(true);
    setTimeout(() => document.getElementById(`qa-${field}`)?.focus(), 30);
  };

  const chip = (field, kind, label, filled) => (
    <button
      type="button"
      onClick={() => openMore(field)}
      className={cn('inline-flex min-h-8 items-center gap-1 rounded-full border bg-card px-2.5 text-sm', filled ? 'border-rule-strong font-bold' : 'border-dashed border-input text-muted-foreground')}
      aria-label={`${kind}: ${label}. Change`}
    >
      <span className="text-xs font-medium text-muted-foreground">{kind}</span> {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="quick-add">Add a task: type it the way you’d say it</Label>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Input
          id="quick-add"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Physics lab report 90m fri high"
          autoComplete="off"
          className="h-12 border-[1.5px] border-rule-strong text-base"
          aria-describedby="quick-add-preview"
        />
        <Button type="submit" size="lg" className="h-12 px-5" disabled={!canAdd}><PlusIcon aria-hidden="true" />Add</Button>
      </form>

      <div id="quick-add-preview" aria-live="polite">
        {has ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
            <span className="text-xs font-bold text-ink-2">Will add</span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-bold', task.title ? 'bg-primary text-primary-foreground' : 'border border-dashed border-input text-muted-foreground')}>{task.title || 'Type a name'}</span>
            {chip('estimate', 'Estimate', task.estimateMinutes ? fmtMinutes(task.estimateMinutes) : 'none yet', !!task.estimateMinutes)}
            {chip('due', 'Due', dueText(task.dueDate, boot.today) || 'no date', !!task.dueDate)}
            {task.priority !== 'medium' && chip('priority', 'Priority', task.priority === 'high' ? 'High' : 'Low', true)}
            {chip('category', 'Category', task.category, !!(over.category || parsed.category))}
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Press Enter to add</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>Understands</span>
            {['45m or 2h', 'today, tomorrow, fri', 'high or low', '#category'].map((t) => (
              <span key={t} className="rounded-md border border-border bg-card px-2 py-0.5">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div>
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-ink-2 underline underline-offset-2">
          <ChevronDownIcon className={cn('size-4 transition-transform', more && 'rotate-180')} aria-hidden="true" />More options
        </button>
        {more && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-estimate">Estimate (min)</Label>
              <Input id="qa-estimate" type="number" min={5} max={1440} step={5} value={task.estimateMinutes ?? ''} onChange={(e) => setOver((o) => ({ ...o, estimateMinutes: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-due">Due</Label>
              <Input id="qa-due" type="date" value={task.dueDate ?? ''} onChange={(e) => setOver((o) => ({ ...o, dueDate: e.target.value || null }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-priority">Priority</Label>
              <Select value={task.priority} onValueChange={(v) => setOver((o) => ({ ...o, priority: v }))}>
                <SelectTrigger id="qa-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-category">Category</Label>
              <Input id="qa-category" list="qa-categories" maxLength={30} value={task.category} onChange={(e) => setOver((o) => ({ ...o, category: e.target.value }))} />
              <datalist id="qa-categories">{boot.categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
