import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = 'http://127.0.0.1:3048';
const { token } = JSON.parse(await readFile('outputs/summit-map/student-session.local', 'utf8'));
const { staffTokens } = JSON.parse(await readFile('outputs/passing-entry/preview-session.local', 'utf8'));
const browser = await chromium.launch({ headless: true });
const evidence = [];
const init = async (context, role, session, theme) => {
  await context.addCookies([{ name: 'nukhab_session', value: session, url: base, httpOnly: true, sameSite: 'Strict' }]);
  await context.addInitScript(({ accountRole, color }) => {
    globalThis.localStorage.setItem('wajeh_role', accountRole);
    globalThis.localStorage.setItem('nukhab_web_session', '1');
    globalThis.localStorage.setItem(accountRole === 'student' ? 'wajeh_student_id' : 'wajeh_supervisor_id', accountRole === 'student' ? '11' : '1');
    globalThis.localStorage.setItem('wajeh_name', accountRole === 'student' ? 'طالب الاجتياز المحلي' : 'الإدارة المحلية');
    globalThis.localStorage.setItem('nukhab_theme_account', color);
  }, { accountRole: role, color: theme });
};
const ready = async page => { await page.waitForFunction(() => !globalThis.window.nukhabStartup?.active); await page.evaluate(() => globalThis.document.fonts.ready); };
const noOverflow = async page => {
  assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), 'document must fit viewport');
  for (const dialog of await page.getByRole('dialog').all()) assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'dialog must fit viewport');
};
try {
  for (const [width, theme] of [[320, 'light'], [390, 'light'], [768, 'light'], [1440, 'light'], [390, 'dark'], [1440, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await init(context, 'student', token, theme);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'اكتشف الخريطة', exact: true }).waitFor(); await ready(page);
    await noOverflow(page);
    await page.getByRole('button', { name: 'اكتشف الخريطة', exact: true }).click();
    await page.locator('.qassim-map-artwork').waitFor();
    assert.equal(await page.locator('.summit-map-shell img,.summit-map-shell image').count(), 0);
    assert.equal(await page.getByRole('button', { name: /تبديل.*الطريق|التحدي اليومي/ }).count(), 0);
    assert.ok(await page.locator('.qassim-map-artwork text').allTextContents().then(names => names.includes('بريدة') && names.includes('عنيزة')));
    const canvas = page.locator('.summit-map-canvas'); const original = await canvas.evaluate(el => el.clientWidth);
    await page.getByRole('button', { name: 'تكبير الخريطة', exact: true }).click();
    assert.ok(await canvas.evaluate(el => el.clientWidth) > original);
    await page.getByRole('button', { name: 'تصغير الخريطة', exact: true }).click();
    await page.getByRole('button', { name: 'عرض خريطة القصيم كاملة', exact: true }).click();
    await noOverflow(page);
    for (const button of await page.locator('.summit-map-controls button').all()) {
      const box = await button.boundingBox(); assert.ok(box.width >= 40 && box.height >= 40 && box.y >= 0 && box.y + box.height <= 900);
    }
    await page.screenshot({ path: `outputs/summit-map/student-${width}-${theme}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: 'رجوع', exact: true }).click();
    await page.locator('.summit-map-shell').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []); evidence.push({ student: width, theme, overflow: false, zoom: true, images: 0, errors: 0 });
    await context.close();
  }
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await init(context, 'manager', staffTokens.manager, 'light');
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/dashboard/settings-map');
    await page.getByLabel('تفعيل الخريطة', { exact: true }).waitFor(); await ready(page);
    await page.locator('.qassim-map-artwork').waitFor(); await noOverflow(page);
    assert.equal(await page.locator('input[type="file"]').count(), 0);
    const goalName = page.getByLabel('اسم الوجهة', { exact: true });
    const oldName = await goalName.inputValue();
    await goalName.fill(`${oldName} محلية`); await goalName.blur();
    const save = page.getByRole('button', { name: 'حفظ التغييرات', exact: true });
    const saveResponse = page.waitForResponse(response => response.url().endsWith('/api/summit/settings') && response.request().method() === 'PUT');
    await save.click(); assert.equal((await saveResponse).status(), 200); await save.waitFor({ state: 'visible' });
    await page.reload(); await goalName.waitFor(); await ready(page);
    assert.equal(await goalName.inputValue(), `${oldName} محلية`);
    await goalName.fill(oldName); await goalName.blur();
    const restoreResponse = page.waitForResponse(response => response.url().endsWith('/api/summit/settings') && response.request().method() === 'PUT');
    await save.click(); assert.equal((await restoreResponse).status(), 200);
    await page.screenshot({ path: `outputs/summit-map/settings-${width}.png`, fullPage: true, animations: 'disabled' });
    await noOverflow(page); assert.deepEqual(errors, []); evidence.push({ administration: width, settingsSaveReload: true, images: 0, errors: 0 });
    await context.close();
  }
  const response = await globalThis.fetch(base + '/outputs/summit-map/student-session.local'); assert.equal(response.status, 403);
  const backup = await globalThis.fetch(base + '/outputs/summit-map/preview-before-map.local.sql'); assert.equal(backup.status, 403);
  await writeFile('outputs/summit-map/browser-evidence.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} finally { await browser.close(); }
