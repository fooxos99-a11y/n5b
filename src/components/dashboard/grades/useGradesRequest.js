import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads grading data for the current filters. Stale responses are ignored,
 * and `reload({ silent: true })` refreshes without replacing the view with a loader.
 */
export default function useGradesRequest(fetcher) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const requestId = useRef(0);

  const reload = useCallback(async ({ silent = false } = {}) => {
    const id = requestId.current + 1;
    requestId.current = id;
    if (!silent) setState((current) => ({ ...current, status: 'loading', error: '' }));
    try {
      const data = await fetcher();
      if (requestId.current === id) setState({ status: 'ready', data, error: '' });
      return data;
    } catch (error) {
      if (requestId.current === id && !silent) setState({ status: 'error', data: null, error: error.message });
      throw error;
    }
  }, [fetcher]);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  return { ...state, reload };
}
