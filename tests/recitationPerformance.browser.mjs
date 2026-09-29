import assert from 'node:assert/strict';
import console from 'node:console';
import { chromium, webkit } from 'playwright';

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'supervisor');
      globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
    });
    await context.route('**/api/**', (route) => route.fulfill({ json: { students: [], tasks: [] } }));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/tests/fixtures/recitation-policy.html');
    await page.waitForFunction(() => Boolean(globalThis.recitationFixture));
    const result = await page.evaluate(async () => {
      const { api, store, prefetchRecitationTasks, syncOfflineRecitations } = globalThis.recitationFixture;
      let ayahCalls = 0;
      api.getSupervisorQuranTaskAyahs = async () => { ayahCalls += 1; return { ayahs: [] }; };
      const tasks = Array.from({ length: 100 }, (_, id) => ({ id: id + 1000, taskType: 'memorization', taskDate: '2026-09-06', planVersion: 1 }));
      const options = { automatic: true, date: '2026-09-06' };
      await prefetchRecitationTasks(990, tasks, options);
      const offscreenCalls = ayahCalls;
      globalThis.history.replaceState({}, '', '/portal/recitation-sessions');
      await Promise.all([prefetchRecitationTasks(990, tasks, options), prefetchRecitationTasks(990, tasks, options)]);
      const firstCalls = ayahCalls;
      await prefetchRecitationTasks(990, tasks, options);
      const cachedCalls = ayahCalls - firstCalls;
      api.getSupervisorQuranTaskAyahs = async () => { ayahCalls += 1; throw Object.assign(new Error('busy'), { status: 429, retryAfterMs: 60_000 }); };
      await prefetchRecitationTasks(990, tasks.map((task) => ({ ...task, id: task.id + 1000 })), options);
      const limitedCalls = ayahCalls - firstCalls;
      let readyRejected = false;
      try { await prefetchRecitationTasks(990, tasks); } catch { readyRejected = true; }
      const actor = 'default:supervisor:990';
      for (let id = 1; id <= 3; id += 1) await store.commitSession(actor, {
        sessionId: globalThis.crypto.randomUUID(), studentId: id, supervisorId: 990, sessionDate: '2026-09-06',
        sessionType: 'memorization', tasks: [{ taskId: id, payload: { mistakeCount: 1 } }],
      });
      let batches = 0; let individual = 0;
      api.syncOfflineRecitationBatch = async () => { batches += 1; throw Object.assign(new Error('server busy'), { status: 503 }); };
      api.rateSupervisorQuranTask = async () => { individual += 1; return {}; };
      await syncOfflineRecitations(990);
      await syncOfflineRecitations(990);
      const retained = await store.getSessions(actor);
      return { offscreenCalls, firstCalls, cachedCalls, limitedCalls, readyRejected, batches, individual,
        retained: retained.length, retryable: retained.every((session) => session.status === 'failed' && Date.parse(session.nextRetryAt) > Date.now()) };
    });
    assert.equal(result.offscreenCalls, 0);
    assert.equal(result.firstCalls, 24);
    assert.equal(result.cachedCalls, 0);
    assert.ok(result.limitedCalls > 0 && result.limitedCalls <= 4);
    assert.equal(result.readyRejected, true);
    assert.equal(result.batches, 1);
    assert.equal(result.individual, 0);
    assert.equal(result.retained, 3);
    assert.equal(result.retryable, true);
    console.log(JSON.stringify({ engine: name, ...result }));
    await context.close();
    const entryContext = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 768, height: 900 } });
    await entryContext.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'supervisor');
      globalThis.localStorage.setItem('wajeh_supervisor_id', '990');
      globalThis.localStorage.setItem('nukhab_web_session', '1');
      globalThis.localStorage.setItem('wajeh_dashboard_permissions', '[]');
      globalThis.visitedAccountPaths = [];
      for (const method of ['pushState', 'replaceState']) {
        const original = globalThis.history[method].bind(globalThis.history);
        globalThis.history[method] = (...args) => { globalThis.visitedAccountPaths.push(String(args[2])); return original(...args); };
      }
    });
    await entryContext.route('**/api/**', (route) => {
      const url = route.request().url();
      const settings = { staffAttendanceSource: 'teacher', hasStudentQuranExecution: true };
      const _resolveJson = () => {
        if (url.includes('public-settings')) {
          return settings;
        }
        if (url.includes('quran-evaluation')) {
          return { date: '2026-09-06', students: [], tasks: [] };
        }
        if (url.includes('bootstrap')) {
          return { settings, permissions: [], students: [], tasks: [] };
        }
        if (url.includes('notifications')) {
          return { notifications: [], unreadCount: 0 };
        }
        if (url.includes('staff-attendance')) {
          return { enabled: true, date: '2026-09-06', alreadyPresent: false, canAttend: true };
        }
        return {};
      };
      const json = _resolveJson();
      return route.fulfill({ json });
    });
    const entryPage = await entryContext.newPage();
    await entryPage.goto('http://127.0.0.1:3000/portal');
    await entryPage.waitForURL('**/portal/recitation-sessions');
    assert.equal(await entryPage.evaluate(() => globalThis.visitedAccountPaths.some((path) => path.includes('staff-attendance'))), false);
    console.log(JSON.stringify({ engine: name, teacherDirectEntry: 'passed' }));
    await entryContext.close();
  } finally { await browser.close(); }
}
