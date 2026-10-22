import { useCallback, useRef, useState } from 'react';
import { api } from '@/data/api';
import { useApp } from '@/state/app';

/**
 * Runs one AI action and records the live progress events from the
 * refinement loop, so <Pipeline> can show what is really happening.
 */
export function useAiRequest() {
  const { refresh } = useApp();
  const [state, setState] = useState({ status: 'idle', events: [], result: null, error: null });
  const runId = useRef(0);

  const run = useCallback(async (path, body) => {
    const id = ++runId.current;
    setState({ status: 'running', events: [], result: null, error: null });
    try {
      const result = await api(path, {
        method: 'POST',
        body,
        onProgress: (e) => {
          if (runId.current === id) setState((s) => ({ ...s, events: [...s.events, e] }));
        },
      });
      if (runId.current !== id) return null;
      await refresh();
      setState((s) => ({ ...s, status: 'done', result }));
      return result;
    } catch (err) {
      if (runId.current === id) setState((s) => ({ ...s, status: 'error', error: err.message }));
      return null;
    }
  }, [refresh]);

  const reset = useCallback(() => {
    runId.current += 1;
    setState({ status: 'idle', events: [], result: null, error: null });
  }, []);

  const show = useCallback((result) => setState({ status: 'done', events: [{ stage: 'done' }], result, error: null }), []);

  return { ...state, run, reset, show };
}
