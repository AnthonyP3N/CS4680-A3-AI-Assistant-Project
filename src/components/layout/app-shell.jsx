import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartColumnIcon, ListTodoIcon, NotebookPenIcon, PauseIcon, PlayIcon, SearchIcon, SettingsIcon, SparklesIcon, TimerIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/misc';
import { api } from '@/data/api';
import { useNow } from '@/hooks/use-now';
import { navigate } from '@/hooks/use-hash-route';
import { fmtClock, fmtDateLong, fmtDayShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useApp } from '@/state/app';
import { UiContext, focusQuickAdd } from '@/state/ui';
import { shortProvider } from '@/components/ai';
import { SettingsDialog } from '@/features/settings/settings-dialog';
import { CommandPalette } from '@/features/command/command-palette';
import { ReflectSheet } from '@/features/focus/reflect-sheet';

export const NAV = [
  { id: 'today', label: 'Today', icon: ListTodoIcon },
  { id: 'focus', label: 'Focus', icon: TimerIcon },
  { id: 'journal', label: 'Journal', icon: NotebookPenIcon },
  { id: 'insights', label: 'Insights', icon: ChartColumnIcon },
  { id: 'history', label: 'AI history', icon: SparklesIcon },
];

export function BrandMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1d2b3a" />
      <rect x="7" y="9" width="18" height="4" rx="2" fill="#f2c94c" />
      <rect x="7" y="16" width="12" height="4" rx="2" fill="#8fb3d9" />
      <rect x="7" y="23" width="7" height="2" rx="1" fill="#8fb3d9" />
    </svg>
  );
}

function TimerPill() {
  const { boot, mutate, elapsedSeconds } = useApp();
  useNow(1000);
  const s = boot.activeSession;
  useEffect(() => {
    document.title = s ? `${fmtClock(elapsedSeconds())} ${s.taskTitle} | FocusFlow` : 'FocusFlow';
  });
  if (!s) return null;
  const running = s.status === 'running';
  const toggle = () => mutate(() => api(`/api/sessions/${s.id}/${running ? 'pause' : 'resume'}`, { method: 'POST' }));
  return (
    <div className={cn('flex min-w-0 items-center gap-1 rounded-full py-1 pr-1 pl-3', running ? 'bg-hl text-[#1d2b3a]' : 'bg-hl-soft text-foreground')}>
      <a href="#focus" className="flex min-w-0 items-center gap-2 font-bold no-underline" aria-label={`${running ? 'Focusing on' : 'Paused:'} ${s.taskTitle}, ${fmtClock(elapsedSeconds())}. Open Focus.`}>
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full bg-current', running && 'animate-pulse')} />
        <span className="hidden max-w-[16ch] truncate font-medium sm:inline">{s.taskTitle}</span>
        <span className="font-mono tabular-nums">{fmtClock(elapsedSeconds())}</span>
      </a>
      <button
        type="button"
        onClick={toggle}
        aria-label={running ? 'Pause timer' : 'Resume timer'}
        className="grid size-9 place-items-center rounded-full bg-[#1d2b3a]/12 hover:bg-[#1d2b3a]/20"
      >
        {running ? <PauseIcon className="size-4" fill="currentColor" /> : <PlayIcon className="size-4" fill="currentColor" />}
      </button>
    </div>
  );
}

function AiStatusChip({ onOpen }) {
  const { boot } = useApp();
  const p = boot.provider;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-bold whitespace-nowrap hover:border-rule-strong"
          aria-label={p.demo ? 'AI coach: demo mode, no API key. Open AI settings' : `AI coach: ${p.label} connected. Open AI settings`}
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', p.demo ? 'border-2 border-hl bg-transparent' : 'bg-act')} />
          <span>AI<span className="hidden sm:inline">: {p.demo ? 'Demo' : shortProvider(p)}</span></span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{p.demo ? 'Using demo rules. Add your own key to use real AI.' : `Using ${p.label} (${p.model}) with your key.`}</TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ route, children }) {
  const { boot } = useApp();
  const [settings, setSettings] = useState({ open: false, section: null });
  const [commandOpen, setCommandOpen] = useState(false);
  const [reflection, setReflection] = useState(null);

  const openSettings = useCallback((section = null) => setSettings({ open: true, section }), []);
  const openCommand = useCallback(() => setCommandOpen(true), []);
  const openReflection = useCallback((session) => setReflection(session), []);
  const ui = useMemo(() => ({ openSettings, openCommand, openReflection }), [openSettings, openCommand, openReflection]);

  // Keyboard: Ctrl/Cmd+K opens the palette; N adds a task (when not typing).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }
      const t = e.target;
      const typing = t.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]');
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        navigate('today');
        setTimeout(() => focusQuickAdd(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <UiContext.Provider value={ui}>
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-card px-3.5 py-5 md:flex">
          <div className="flex items-center gap-2.5 px-2 text-lg font-extrabold"><BrandMark />FocusFlow</div>
          <nav aria-label="Main">
            <ul className="flex flex-col gap-0.5">
              {NAV.map((n) => (
                <li key={n.id}>
                  <a
                    href={`#${n.id}`}
                    aria-current={route === n.id ? 'page' : undefined}
                    className={cn('flex min-h-11 items-center gap-3 rounded-md px-2.5 no-underline', route === n.id ? 'font-bold text-foreground' : 'text-ink-2 hover:bg-accent hover:text-foreground')}
                  >
                    <n.icon className="size-5" aria-hidden="true" />
                    <span className={cn(route === n.id && 'hl-stroke px-0.5')}>{n.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto flex flex-col gap-0.5">
            <button type="button" onClick={openCommand} className="flex min-h-11 items-center gap-3 rounded-md px-2.5 text-left text-ink-2 hover:bg-accent hover:text-foreground">
              <SearchIcon className="size-5" aria-hidden="true" />
              <span className="flex-1">Search</span>
              <kbd className="rounded border border-border px-1.5 text-xs font-medium text-muted-foreground">Ctrl K</kbd>
            </button>
            <button type="button" onClick={() => openSettings()} className="flex min-h-11 items-center gap-3 rounded-md px-2.5 text-left text-ink-2 hover:bg-accent hover:text-foreground">
              <SettingsIcon className="size-5" aria-hidden="true" />Settings
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-2 backdrop-blur md:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="md:hidden"><BrandMark size={26} /></span>
              <span className="truncate font-medium text-ink-2"><span className="sm:hidden">{fmtDayShort(boot.today)}</span><span className="hidden sm:inline">{fmtDateLong(boot.today)}</span></span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <TimerPill />
              <AiStatusChip onOpen={() => openSettings('ai')} />
              <Button variant="outline" size="icon" className="md:hidden" onClick={openCommand} aria-label="Search and commands"><SearchIcon /></Button>
              <Button variant="outline" size="icon" className="md:hidden" onClick={() => openSettings()} aria-label="Settings"><SettingsIcon /></Button>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="w-full max-w-[1240px] px-4 pt-6 pb-28 outline-none md:px-8 md:pb-16">
            {children}
          </main>
        </div>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            aria-current={route === n.id ? 'page' : undefined}
            className={cn('flex min-h-13 flex-col items-center justify-center gap-0.5 text-xs no-underline', route === n.id ? 'font-extrabold text-foreground' : 'text-ink-2')}
          >
            <n.icon className="size-5" aria-hidden="true" />
            <span className={cn(route === n.id && 'hl-stroke px-0.5')}>{n.label === 'AI history' ? 'AI' : n.label}</span>
          </a>
        ))}
      </nav>

      <SettingsDialog open={settings.open} section={settings.section} onOpenChange={(open) => setSettings((s) => ({ ...s, open }))} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ReflectSheet session={reflection} onClose={() => setReflection(null)} />
    </UiContext.Provider>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[70ch]">
        <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-ink-2">{description}</p>}
      </div>
      {children}
    </div>
  );
}
