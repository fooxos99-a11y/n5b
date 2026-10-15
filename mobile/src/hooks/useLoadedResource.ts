import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeApiError } from '../services/nativeApi';

export function useLoadedResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [value, setValue] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    active.current?.abort(); const request = new AbortController(); active.current = request; setLoading(true); setError('');
    try {
      const next = await loader(request.signal);
      if (request.signal.aborted) return false;
      setValue(next); return true;
    }
    catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : new NativeApiError('network').message); return false; }
    finally { if (!request.signal.aborted) setLoading(false); }
  }, [loader]);
  useEffect(() => { void reload(); return () => { active.current?.abort(); }; }, [reload]);
  return { value, loading, error, reload };
}
