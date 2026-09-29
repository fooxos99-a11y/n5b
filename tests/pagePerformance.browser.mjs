import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const requests = [];
  await page.route('**/__page-performance', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    const history = path.endsWith('/quran-sessions');
    await setTimeout(history ? 1200 : 100);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
    const _resolveBody = () => {
      if (history) {
        return { rows: [], points: {} };
      }
      return { date, plan: { id: 1 }, todayAmounts: [] };
    };
    const body = _resolveBody();
    await route.fulfill({ json: body });
  });
  await page.goto('http://localhost:3000/__page-performance');
  await page.addScriptTag({ type: 'module', content: `
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    window.preambleReady = true;
  ` });
  await page.waitForFunction(() => globalThis.preambleReady);
  await page.addScriptTag({ type: 'module', content: `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import useStudentPlan from '/src/hooks/useStudentPlan.js';
    import * as service from '/src/services/offlineStudentService.js';
    import { offlineRecitationStore as storage } from '/src/services/offlineRecitationStore.js';
    import { offlineActorKey } from '/src/services/offlineOperationsService.js';
    window.pageTest = { service, storage, key: id => offlineActorKey(id, 'student') + ':workspace' };
    function Probe() {
      const plan = useStudentPlan(77, 'test-date');
      window.planState = plan;
      return React.createElement('div', null, plan.data?.today ? 'today-ready' : 'loading');
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Probe));
  ` });
  await page.waitForFunction(() => globalThis.planState?.data?.today);
  assert.equal(await page.evaluate(() => globalThis.planState.loading), true, 'today displays while history remains pending');
  await page.waitForFunction(() => !globalThis.planState.loading);
  assert.equal(requests.filter(path => path.endsWith('/quran-today')).length, 1);
  console.log('PASS: progressive home and one today request');
} finally { await browser.close(); }
