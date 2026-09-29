export function createRefreshGate(intervalMs, now = Date.now) {
  const entries = new Map();
  return (key, run, { force = false } = {}) => {
    const current = entries.get(key);
    if (current?.pending) return current.pending;
    if (!force && current?.completedAt !== undefined && now() - current.completedAt < intervalMs) return Promise.resolve(current.value);
    const entry = {};
    entries.set(key, entry);
    entry.pending = Promise.resolve().then(run).then(value => {
      entry.value = value; entry.completedAt = now(); return value;
    }).catch(error => { entries.delete(key); throw error; }).finally(() => { entry.pending = null; });
    return entry.pending;
  };
}
