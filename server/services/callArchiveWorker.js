import { db, getDatabaseContext, runWithDatabase } from '../db.js';
import { processCallArchiveBatch } from './callArchive.js';
import { getCallArchiveConfig } from './callArchiveConfig.js';

const running = new Set();
/** Start once per initialized tenant, preserving its database context. */
export function startCallArchiveWorker({ intervalMs = 3000, reportIntervalMs = 5000, processBatch = processCallArchiveBatch } = {}) {
  if (!getCallArchiveConfig().enabled) return () => {};
  const context = getDatabaseContext();
  if (running.has(context.databaseName)) return () => {};
  running.add(context.databaseName);
  let stopped = false;
  const lanes = [
    { kinds: ['capture', 'stop'], reconcile: true, intervalMs, busy: false },
    { kinds: ['report'], reconcile: false, intervalMs: reportIntervalMs, busy: false },
  ];
  const tick = async lane => {
    if (lane.busy || stopped) return;
    lane.busy = true;
    try { await runWithDatabase(context.databaseName, { tenant: context.tenant }, () => processBatch({ pool: db(), kinds: lane.kinds, reconcile: lane.reconcile })); }
    catch { console.error('Call archive worker could not reconcile its configured database.'); }
    finally { lane.busy = false; }
  };
  const timers = lanes.map(lane => {
    const timer = setInterval(() => { void tick(lane); }, lane.intervalMs);
    timer.unref();
    void tick(lane);
    return timer;
  });
  return () => { stopped = true; timers.forEach(clearInterval); running.delete(context.databaseName); };
}
