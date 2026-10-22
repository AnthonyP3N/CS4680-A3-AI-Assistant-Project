// App-wide state: the data snapshot from the in-browser backend, plus
// helpers to change it with toasts and Undo.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/data/api';
import { onExternalChange, restore, snapshot } from '@/data/backend';

const AppContext = createContext(null);

const ERROR_TOAST = { duration: Infinity, closeButton: true };

export function showError(message) {
  // Errors stay until dismissed, so nobody misses them.
  toast.error(message || 'Something went wrong.', ERROR_TOAST);
}

export function AppProvider({ children }) {
  const [boot, setBoot] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const bootAt = useRef(Date.now());
  const lastUndoToast = useRef(null);

  const refresh = useCallback(async () => {
    const b = await api('/api/bootstrap');
    bootAt.current = Date.now();
    setBoot(b);
    return b;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const b = await refresh();
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && tz !== b.preferences.timezone) {
          await api('/api/preferences', { method: 'PUT', body: { timezone: tz } });
          await refresh();
        }
      } catch (err) {
        setLoadError(err.message);
      }
    })();
    const unsubscribe = onExternalChange(() => { refresh().catch(() => {}); });
    const onVisible = () => { if (document.visibilityState === 'visible') refresh().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  /**
   * Run a change, refresh, and confirm it.
   * With { undo: true }, the toast offers Undo, which restores the data from
   * just before the change. Only the latest change can be undone.
   */
  const mutate = useCallback(async (fn, { success, undo = false } = {}) => {
    const snap = undo ? snapshot() : null;
    try {
      const result = await fn();
      await refresh();
      if (success) {
        const msg = typeof success === 'function' ? success(result) : success;
        if (lastUndoToast.current) toast.dismiss(lastUndoToast.current);
        if (snap) {
          lastUndoToast.current = toast(msg, {
            duration: 8000,
            action: {
              label: 'Undo',
              onClick: async () => {
                restore(snap);
                await refresh();
                toast('Undone', { duration: 2500 });
              },
            },
          });
        } else {
          toast(msg, { duration: 3500 });
        }
      }
      return result ?? true;
    } catch (err) {
      showError(err.message);
      return undefined;
    }
  }, [refresh]);

  /** Seconds on the running timer, counted from the last snapshot. */
  const elapsedSeconds = useCallback(() => {
    const s = boot?.activeSession;
    if (!s) return 0;
    const base = s.elapsedSeconds || 0;
    return s.status === 'running' ? base + (Date.now() - bootAt.current) / 1000 : base;
  }, [boot]);

  const value = useMemo(() => ({ boot, loadError, refresh, mutate, elapsedSeconds }), [boot, loadError, refresh, mutate, elapsedSeconds]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export const taskById = (boot, id) => boot?.tasks.find((t) => t.id === id) || null;
