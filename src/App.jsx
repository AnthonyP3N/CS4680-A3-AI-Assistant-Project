import { Suspense, lazy, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/misc';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmProvider } from '@/components/confirm';
import { AppShell } from '@/components/layout/app-shell';
import { navigate, useHashRoute } from '@/hooks/use-hash-route';
import { AppProvider, useApp } from '@/state/app';
import { SetupPage, isOnboarded } from '@/features/setup/setup-page';
import { TodayPage } from '@/features/today/today-page';
import { FocusPage } from '@/features/focus/focus-page';
import { JournalPage } from '@/features/journal/journal-page';
// Insights carries the chart library, so it loads only when opened.
const InsightsPage = lazy(() => import('@/features/insights/insights-page').then((m) => ({ default: m.InsightsPage })));
import { HistoryPage } from '@/features/history/history-page';

const PAGES = {
  today: TodayPage,
  focus: FocusPage,
  journal: JournalPage,
  insights: InsightsPage,
  history: HistoryPage,
};

function Root() {
  const { boot, loadError } = useApp();
  const route = useHashRoute();

  // First visit with no key: start with the guided AI setup.
  useEffect(() => {
    if (boot && boot.provider.demo && !isOnboarded() && route !== 'setup') navigate('setup');
  }, [boot, route]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route]);

  if (loadError) {
    return (
      <div role="alert" className="mx-auto mt-16 flex max-w-lg flex-col items-start gap-3 rounded-xl border border-destructive bg-danger-soft p-6">
        <h1 className="text-xl font-bold">FocusFlow couldn’t load your data</h1>
        <p>{loadError}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
  if (!boot) return <p className="p-8 text-muted-foreground">Loading…</p>;
  if (route === 'setup') return <SetupPage />;

  const Page = PAGES[route] || TodayPage;
  return (
    <AppShell route={route}>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Page />
      </Suspense>
    </AppShell>
  );
}

export function App() {
  return (
    <AppProvider>
      <TooltipProvider>
        <ConfirmProvider>
          <Root />
          <Toaster />
        </ConfirmProvider>
      </TooltipProvider>
    </AppProvider>
  );
}
