// "Type it the way you'd say it": one input, with a live preview of what
// each word became. Chips open "More options" to correct anything.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CategoryIcon, CategoryPicker } from '@/components/category-picker';
import { api } from '@/data/api';
import { fmtMinutes, fmtWeekday } from '@/lib/format';
import { parseQuickAdd } from '@/lib/quickadd';
import { categoryOptions } from '@/lib/categories';
import { DUE_MAX, DUE_MIN } from '@/lib/inputs';
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

  const knownCategories = useMemo(() => {
    const { suggested, custom } = categoryOptions(boot.categories, boot.tasks);
    return [...suggested, ...custom];
  }, [boot.categories, boot.tasks]);
  const parsed = parseQuickAdd(text, boot.today, knownCategories);
  const task = {
    title: parsed.title,
    estimateMinutes: over.estimateMinutes !== undefined ? over.estimateMinutes : parsed.estimateMinutes,
    dueDate: over.dueDate !== undefined ? over.dueDate : parsed.dueDate,
    priority: over.priority || parsed.priority || 'medium',
    category: over.category || parsed.category || lastCategory,
  };
  const has = text.trim().length > 0;
  const badDue = !!task.dueDate && (task.dueDate < DUE_MIN || task.dueDate > DUE_MAX);
  const canAdd = !!task.title && !badDue;

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
    setTimeout(() => {
      const el = document.getElementById(`qa-${field}`);
      el?.focus();
      if (field === 'category') el?.click();
    }, 30);
  };

  const chip = (field, kind, label, filled, icon = null) => (
    <button
      type="button"
      onClick={() => openMore(field)}
      className={cn('inline-flex min-h-8 items-center gap-1 rounded-full border bg-card px-2.5 text-sm', filled ? 'border-rule-strong font-bold' : 'border-dashed border-input text-muted-foreground', field === 'due' && badDue && 'border-destructive text-destructive')}
      aria-label={`${kind}: ${label}. Change`}
    >
      <span className="text-xs font-medium text-muted-foreground">{kind}</span> {icon}{label}
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
            {chip('due', 'Due', badDue ? `${task.dueDate}: check the year` : dueText(task.dueDate, boot.today) || 'no date', !!task.dueDate)}
            {task.priority !== 'medium' && chip('priority', 'Priority', task.priority === 'high' ? 'High' : 'Low', true)}
            {chip('category', 'Category', task.category, !!(over.category || parsed.category), <CategoryIcon name={task.category} className="size-3.5" />)}
            <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Press Enter to add</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>Understands</span>
            {['45m or 2h', 'today, tomorrow, fri', 'high or low', '#studying'].map((t) => (
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
          <div className="@container mt-2 rounded-lg border border-border p-3"><div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-estimate">Estimate (min)</Label>
              <Input id="qa-estimate" type="number" min={5} max={1440} step={5} value={task.estimateMinutes ?? ''} onChange={(e) => setOver((o) => ({ ...o, estimateMinutes: e.target.value ? Number(e.target.value) : null }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-due">Due</Label>
              <Input id="qa-due" type="date" min={DUE_MIN} max={DUE_MAX} value={task.dueDate ?? ''} onChange={(e) => setOver((o) => ({ ...o, dueDate: e.target.value || null }))} />
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
              <CategoryPicker id="qa-category" value={task.category} onChange={(c) => setOver((o) => ({ ...o, category: c }))} />
            </div>
          </div></div>
        )}
      </div>
    </div>
  );
}
