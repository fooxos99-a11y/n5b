import assert from 'node:assert/strict';
import console from 'node:console';
import { URL } from 'node:url';
import { setTimeout } from 'node:timers';
import { chromium } from 'playwright';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const requests = [];
  await page.route('**/__store-performance', route => route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    const isStore = path.endsWith('/store/products');
    await new Promise(resolve => setTimeout(resolve, isStore ? 100 : 700));
    const store = {enabled:true,products:[{id:1,name:'منتج اختبار',pointsPrice:10,stock:5}],storeBalance:100};
    const _resolveBody = () => {
      if (isStore) {
        return store;
      }
      if (path.endsWith('/bootstrap')) {
        return {store};
      }
      return {rows:[],tasks:[],plan:null};
    };
    const body = _resolveBody();
    await route.fulfill({json:body});
  });
  await page.goto('http://localhost:3000/__store-performance');
  await page.addScriptTag({type:'module',content:`
    import * as service from '/src/services/offlineStudentService.js';
    import { offlineRecitationStore } from '/src/services/offlineRecitationStore.js';
    import { offlineActorKey } from '/src/services/offlineOperationsService.js';
    window.storeTest={service,storage:offlineRecitationStore,key:id=>offlineActorKey(id,'student')+':workspace'};
  `});
  await page.waitForFunction(() => globalThis.storeTest);
  const oldMs = await page.evaluate(async () => { const t=globalThis.performance.now(); await globalThis.storeTest.service.loadOfflineStudentWorkspace(1); return globalThis.performance.now()-t; });
  requests.length = 0;
  const result = await page.evaluate(async () => { const t=globalThis.performance.now(); const [a,b]=await Promise.all([globalThis.storeTest.service.loadOfflineStudentStore(2),globalThis.storeTest.service.loadOfflineStudentStore(2)]); return {ms:globalThis.performance.now()-t,balance:a.storeBalance,shared:a===b}; });
  assert.deepEqual(requests,['/api/store/products']);
  assert.equal(result.balance,100);
  assert.ok(result.ms < oldMs/2);
  await page.evaluate(async () => {
    const {storage,key}=globalThis.storeTest;
    await storage.cacheSnapshot(key(2),{store:{enabled:true,pendingSync:true,storeBalance:70,products:[]},marker:{date:'preserved'}});
  });
  const pending = await page.evaluate(() => globalThis.storeTest.service.loadOfflineStudentStore(2));
  assert.equal(pending.storeBalance,70);
  await page.context().setOffline(true);
  const offline = await page.evaluate(() => globalThis.storeTest.service.loadOfflineStudentStore(2));
  assert.equal(offline.storeBalance,70);
  console.log(JSON.stringify({previousMs:Math.round(oldMs),storeOnlyMs:Math.round(result.ms),onlyStoreRequest:true,pendingPurchasePreserved:true,offline:true}));
} finally { await browser.close(); }
