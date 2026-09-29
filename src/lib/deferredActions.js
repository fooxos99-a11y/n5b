export const UNDO_WINDOW_MS = 10_000;
export const ACTION_CANCELLED_MESSAGE = 'تم التراجع عن الأمر';
export const isActionCancelled = error => error?.code === 'ACTION_CANCELLED';

export function createDeferredActions({ now = Date.now, schedule = setTimeout, clear = clearTimeout } = {}) {
  const pending = new Map();
  const listeners = new Set();
  let snapshot = [];
  let sequence = 0;
  const publish = () => {
    snapshot = [...pending.values()].map(({ id, label, expiresAt, busy }) => ({ id, label, expiresAt, busy }));
    listeners.forEach(listener => listener());
  };
  const dismiss = id => {
    const action = pending.get(id);
    if (!action) return;
    clear(action.timer);
    pending.delete(id);
    publish();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dismiss,
    cancelAll: () => [...pending.keys()].forEach(dismiss),
    register(label, undo, durationMs = UNDO_WINDOW_MS) {
      const id = ++sequence;
      const duration = Math.max(0, Math.min(UNDO_WINDOW_MS, durationMs));
      if (!duration) return null;
      const timer = schedule(() => { if (!pending.get(id)?.busy) dismiss(id); }, duration);
      pending.set(id, { id, label, undo, timer, expiresAt: now() + duration, busy: false });
      publish();
      return id;
    },
    async cancel(id) {
      const action = pending.get(id);
      if (!action || action.busy) return false;
      if (action.expiresAt <= now()) { dismiss(id); return false; }
      action.busy = true;
      publish();
      try { await action.undo(); return true; }
      finally { dismiss(id); }
    },
  };
}

export const deferredActions = createDeferredActions();
let dashboardActive = false;
export const isDashboardUndoActive = () => dashboardActive;
export function enableDashboardUndo(active) {
  dashboardActive = active;
  if (!active) deferredActions.cancelAll();
}

export function isDeferredMutation(path, options = {}) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(options.method || 'GET').toUpperCase())) return false;
  return !['/auth/', '/dashboard-undo/', '/notifications/', '/student-notifications/']
    .some(prefix => path.startsWith(prefix));
}
