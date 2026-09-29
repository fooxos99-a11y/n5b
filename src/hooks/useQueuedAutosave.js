import { useEffect, useRef } from 'react';

const queues = new Map();

/** Debounce edits, serialize requests and flush the last valid edit when leaving the page. */
export default function useQueuedAutosave({ channel, value, enabled, save, onStatus, onError, delay = 700 }) {
  const pending = useRef(null);
  const revision = useRef(0);
  const callbacks = useRef({ save, onStatus, onError });
  callbacks.current = { save, onStatus, onError };
  const flush = useRef(null);
  flush.current = () => {
    const entry = pending.current;
    if (!entry) return;
    pending.current = null;
    const callback = callbacks.current;
    const request = (queues.get(channel) || Promise.resolve()).catch(() => undefined)
      .then(() => callback.save(entry.value));
    queues.set(channel, request);
    request.then(() => {
      if (entry.revision === revision.current) callback.onStatus?.('saved');
    }, error => { callback.onStatus?.('error'); callback.onError?.(error); });
  };
  useEffect(() => {
    revision.current++;
    pending.current = enabled ? { value, revision: revision.current } : null;
    if (!enabled) return undefined;
    callbacks.current.onStatus?.('saving');
    const timer = setTimeout(() => flush.current(), delay);
    return () => clearTimeout(timer);
  }, [value, enabled, delay]);
  useEffect(() => () => flush.current(), []);
}
