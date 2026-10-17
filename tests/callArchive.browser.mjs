import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const origin = process.env.CALL_ARCHIVE_UI_ORIGIN || 'http://127.0.0.1:3003';
await mkdir('outputs/call-system', { recursive: true });
try {
  for (const { width, theme } of [320, 390, 1440].flatMap(width => ['light', 'dark'].map(theme => ({ width, theme })))) {
    const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => globalThis.document.addEventListener('DOMContentLoaded', () => globalThis.document.documentElement.classList.toggle('dark', theme === 'dark')), theme);
    await page.goto(`${origin}/tests/fixtures/call-archive.html`);
    await page.getByRole('tab', { name: 'الأرشيف', exact: true }).click();
    await page.getByRole('button', { name: /أرشيف غرفة المقرئ/ }).click();
    await page.getByRole('button', { name: 'تحميل المزيد' }).click();
    await page.waitForFunction(() => globalThis.document.querySelectorAll('ul[aria-label="جلسات المكالمة"] li').length === 2);
    await page.getByRole('button', { name: /^فتح جلسة/ }).first().click();
    await page.getByRole('heading', { name: 'ملخص الجلسة' }).waitFor();
    assert.match(page.url(), /callSession=session-22/);
    await page.getByRole('button', { name: 'تشغيل التسجيل', exact: true }).click();
    await page.waitForFunction(() => globalThis.document.querySelector('audio')?.readyState >= 1);
    await page.getByRole('button', { name: 'استمع إلى الملاحظة عند 0:02' }).click();
    assert.ok(await page.locator('audio').evaluate(audio => audio.currentTime >= 2));
    await page.getByRole('checkbox', { name: 'اعتماد الملاحظة 0:02' }).check();
    await page.getByLabel('ملاحظات المقرئ', { exact: true }).fill('راجعت الصوت واعتمدت موضعًا واحدًا.');
    await page.getByRole('button', { name: 'حفظ المراجعة', exact: true }).click();
    await page.waitForFunction(() => globalThis.__archiveReview?.approvedErrors?.length === 1);
    assert.ok(await page.locator('body').evaluate(body => body.scrollWidth <= globalThis.innerWidth));
    await page.screenshot({ path: `outputs/call-system/archive-${width}${theme === 'dark' ? '-dark' : ''}.png`, fullPage: true });
    const deepLink = page.url(); await page.reload();
    await page.getByRole('heading', { name: 'ملخص الجلسة' }).waitFor(); assert.equal(page.url(), deepLink);
    await page.evaluate(() => { globalThis.__archiveDenied = true; });
    await page.getByRole('button', { name: 'تحديث', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'الجلسة غير متاحة لحسابك.' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'ملخص الجلسة' }).count(), 0);
    await page.goto(`${origin}/tests/fixtures/call-archive.html?role=student&callArchiveRoom=17&callSession=session-22`);
    await page.getByRole('heading', { name: 'ملخص الجلسة' }).waitFor();
    assert.equal(await page.getByRole('checkbox').count(), 0); assert.equal(await page.getByRole('button', { name: 'حفظ المراجعة' }).count(), 0);
    await page.goto(`${origin}/tests/fixtures/call-archive.html?callArchiveRoom=17&callSession=session-23`);
    await page.getByRole('button', { name: 'إعادة إعداد التقرير' }).click();
    await page.waitForFunction(() => globalThis.__archiveRetried === true);
    assert.ok(await page.getByText('قد يحتوي التسجيل على جزء مفقود.', { exact: false }).count());
    await page.goto(`${origin}/tests/fixtures/call-archive.html?callArchiveRoom=17&callSession=session-24`);
    await page.getByRole('button', { name: 'إعادة محاولة التسجيل' }).click();
    await page.waitForFunction(() => globalThis.__archiveRetried === true);
    assert.equal(await page.getByRole('button', { name: 'إعادة إعداد التقرير' }).count(), 0);
    assert.deepEqual(errors, []); await page.close();
  }
  globalThis.console.log('Archive UI passed at 320/390/1440 light/dark: pagination, closed room archive, audio playback/seek, probable/approved review, deep links, access revoked, student read-only, partial recording and retry. Synthetic audio/provider fixture only.');
} finally { await browser.close(); }
