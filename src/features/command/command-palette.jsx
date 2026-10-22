import { useState } from 'react';
import { ChartColumnIcon, ListTodoIcon, NotebookPenIcon, PlayIcon, PlusIcon, SettingsIcon, SparklesIcon, TimerIcon } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { api } from '@/data/api';
import { navigate } from '@/hooks/use-hash-route';
import { useApp } from '@/state/app';
import { focusQuickAdd, useUi } from '@/state/ui';

export function CommandPalette({ open, onOpenChange }) {
  const { boot, mutate } = useApp();
  const { openSettings } = useUi();
  const [query, setQuery] = useState('');
  const open_ = boot.tasks.filter((t) => t.status !== 'done');

  const run = (fn) => () => {
    onOpenChange(false);
    setQuery('');
    setTimeout(fn, 30);
  };

  const startTimer = (task) => run(async () => {
    const ok = await mutate(() => api('/api/sessions/start', { method: 'POST', body: { taskId: task.id } }), { success: `Timer started for “${task.title}”` });
    if (ok) navigate('focus');
  });

  return (
    <CommandDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(''); }}>
      <CommandInput placeholder="Search tasks, or type an action…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Nothing matches. Press Enter on “Add as a task” to create it.</CommandEmpty>
        {query.trim() && (
          <CommandGroup heading="Add">
            <CommandItem value={`add ${query}`} onSelect={run(() => { navigate('today'); setTimeout(() => focusQuickAdd(query.trim()), 60); })}>
              <PlusIcon />Add “{query.trim()}” as a task
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          <CommandItem onSelect={run(() => navigate('today'))}><ListTodoIcon />Today</CommandItem>
          <CommandItem onSelect={run(() => navigate('focus'))}><TimerIcon />Focus</CommandItem>
          <CommandItem onSelect={run(() => navigate('journal'))}><NotebookPenIcon />Journal</CommandItem>
          <CommandItem onSelect={run(() => navigate('insights'))}><ChartColumnIcon />Insights</CommandItem>
          <CommandItem onSelect={run(() => navigate('history'))}><SparklesIcon />AI history</CommandItem>
          <CommandItem onSelect={run(() => openSettings())}><SettingsIcon />Settings</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(() => { navigate('today'); setTimeout(() => focusQuickAdd(), 60); })}><PlusIcon />New task<CommandShortcut>N</CommandShortcut></CommandItem>
          <CommandItem onSelect={run(() => { navigate('today'); window.dispatchEvent(new CustomEvent('focusflow:plan')); })}><SparklesIcon />Plan the rest of my day</CommandItem>
          <CommandItem onSelect={run(() => { navigate('insights'); })}><SparklesIcon />Review this week</CommandItem>
          <CommandItem onSelect={run(() => navigate('journal'))}><NotebookPenIcon />Write a reflection</CommandItem>
        </CommandGroup>
        {!boot.activeSession && open_.length > 0 && (
          <CommandGroup heading="Start a timer">
            {open_.slice(0, 30).map((t) => (
              <CommandItem key={t.id} value={`start ${t.title}`} onSelect={startTimer(t)}>
                <PlayIcon />{t.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
