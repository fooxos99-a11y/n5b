import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID, createHash } from 'node:crypto';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import os from 'node:os';

const context = new AsyncLocalStorage();
const measured = new WeakSet();
const rounded = (value) => Math.round(value * 100) / 100;
const write = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
let eventLoop;
const routeMetrics = new Map();
const latencyBoundsMs = [100, 300, 1_000, 3_000, 10_000, 30_000, 60_000];

export function requestDiagnostics(req, res, next) {
  const incomingId = String(req.get?.('X-Request-Id') || '');
  const requestId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(incomingId) ? incomingId : randomUUID();
  const state = { requestId, started: performance.now(), sqlMs: 0, poolWaitMs: 0, sqlCount: 0, slowQueries: [] };
  req.traceId = state.requestId;
  res.setHeader('X-Request-Id', state.requestId);
  if (typeof res.writeHead === 'function') {
    const original = res.writeHead.bind(res);
    res.writeHead = (...args) => {
      state.route = typeof req.route?.path === 'string' ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched';
      return original(...args);
    };
  }
  let finished = false;
  const record = () => {
    if (finished) return;
    finished = true;
    const durationMs = performance.now() - state.started;
    const route = state.route || (typeof req.route?.path === 'string' ? req.route.path : 'unmatched');
    const key = `${req.method} ${route}`;
    const metricKey = routeMetrics.has(key) || routeMetrics.size < 256 ? key : 'other';
    const metric = routeMetrics.get(metricKey) || { count: 0, errors: 0, aborted: 0, totalMs: 0,
      maxMs: 0, sqlMs: 0, poolWaitMs: 0, histogram: new Array(latencyBoundsMs.length + 1).fill(0) };
    metric.count += 1;
    metric.errors += Number(res.statusCode >= 500);
    metric.aborted += Number(!res.writableFinished);
    metric.totalMs += durationMs;
    metric.maxMs = Math.max(metric.maxMs, durationMs);
    metric.sqlMs += state.sqlMs;
    metric.poolWaitMs += state.poolWaitMs;
    const bucket = latencyBoundsMs.findIndex((bound) => durationMs <= bound);
    metric.histogram[bucket < 0 ? latencyBoundsMs.length : bucket] += 1;
    routeMetrics.set(metricKey, metric);
    if (durationMs < 1_000 && res.statusCode < 500 && res.statusCode !== 429 && res.writableFinished) return;
    write({ event: 'http_request', requestId: state.requestId, method: req.method,
      route,
      status: res.statusCode, rateLimitScope: res.getHeader?.('X-RateLimit-Scope') || null, aborted: !res.writableFinished, durationMs: rounded(durationMs),
      sqlMs: rounded(state.sqlMs), poolWaitMs: rounded(state.poolWaitMs), sqlCount: state.sqlCount,
      slowQueries: state.slowQueries });
  };
  res.once('finish', record);
  res.once('close', record);
  context.run(state, next);
}

export function instrumentDatabase(target, databaseName, { pool = false } = {}) {
  if (measured.has(target)) return target;
  measured.add(target);
  for (const method of ['query', 'execute', ...(pool ? ['getConnection'] : [])]) {
    if (typeof target[method] !== 'function') continue;
    if (pool && method !== 'getConnection') {
      target[method] = async (...args) => {
        const connection = await target.getConnection();
        try { return await connection[method](...args); }
        finally { connection.release(); }
      };
      continue;
    }
    const original = target[method].bind(target);
    target[method] = async (...args) => {
      const state = context.getStore();
      const start = performance.now();
      try {
        const result = await original(...args);
        return method === 'getConnection' ? instrumentDatabase(result, databaseName) : result;
      } finally {
        const durationMs = performance.now() - start;
        if (state) {
          if (method === 'getConnection') state.poolWaitMs += durationMs;
          else {
            state.sqlMs += durationMs;
            state.sqlCount += 1;
          }
        }
        if (method !== 'getConnection' && durationMs >= 500) {
          // Log only a fingerprint, never SQL literals, parameters or errors.
          const fingerprint = createHash('sha256').update(String(args[0]?.sql || args[0])).digest('hex').slice(0, 16);
          const query = { fingerprint, durationMs: rounded(durationMs) };
          if (state && state.slowQueries.length < 8) state.slowQueries.push(query);
          write({ event: 'slow_query', database: databaseName, requestId: state?.requestId, ...query });
        }
      }
    };
  }
  return target;
}

export function startRuntimeDiagnostics() {
  if (eventLoop) return;
  eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  let cpu = process.cpuUsage();
  let previous = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const delta = process.cpuUsage(cpu);
    cpu = process.cpuUsage();
    write({ event: 'runtime_metrics', pid: process.pid,
      cpuPercent: rounded((delta.user + delta.system) / ((now - previous) * 10)),
      rssBytes: process.memoryUsage().rss, hostLoad: os.loadavg(),
      eventLoopP95Ms: rounded(eventLoop.percentile(95) / 1e6), eventLoopMaxMs: rounded(eventLoop.max / 1e6) });
    previous = now;
    eventLoop.reset();
    for (const [route, metric] of routeMetrics) {
      write({ event: 'http_route_metrics', route, latencyBoundsMs, ...metric,
        totalMs: rounded(metric.totalMs), maxMs: rounded(metric.maxMs),
        sqlMs: rounded(metric.sqlMs), poolWaitMs: rounded(metric.poolWaitMs) });
    }
    routeMetrics.clear();
  }, 60_000);
  timer.unref();
}
