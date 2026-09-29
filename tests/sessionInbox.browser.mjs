import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
await mkdir('outputs', { recursive: true });
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    let evaluationLoads = 0;
    let bothTracks = false;
    let masteryOnly = false;
    let reads = [];
    const student = { studentId: 990, studentName: 'طالب تجريبي', attendanceStatus: 'present', canSetAttendance: true };
    const notices = [1, 2].map((id) => ({ id: String(id), title: `رسالة الإدارة ${id}`, body: 'نص تجريبي', isRead: false, createdAt: '2026-09-06' }));
    await context.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body = [];
      if (path.endsWith('/public-settings')) body = { staffAttendanceSource: 'supervisor', hasStudentQuranExecution: true };
      else if (path.endsWith('/site-config')) body = {};
      else if (path.endsWith('/quran-evaluation')) {
        evaluationLoads++;
        body = {
          date: '2026-09-06', students: [student],
          tasks: [{ ...student, id: 900, taskType: 'memorization', track: 'memorization',
            taskDate: '2026-09-06', fromPage: 3, toPage: 3, fromSurah: 2, toSurah: 2, fromAyah: 6, toAyah: 16,
            fromSurahName: 'البقرة', toSurahName: 'البقرة', targetPages: 1, teacherCompleted: null, expectedRepeatCount: 10, normalEnd: { surah: 2, ayah: 16, surahName: 'البقرة' }, options: [16, 17].map((ayah) => ({ surah: 2, ayah, surahName: 'البقرة', page: 3 })) }],
          listeningEnabled: true, executionSources: { memorization: 'teacher' },
        };
        addSessionInboxTracks(body, bothTracks, masteryOnly);
      } else if (path.endsWith('/notifications/read')) {
        reads = route.request().postDataJSON().ids;
        for (const notice of notices) if (reads.includes(notice.id)) notice.isRead = true;
        body = { ok: true };
      } else if (path.endsWith('/notifications')) body = notices;
      await route.fulfill({ json: body });
    });
    await context.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'supervisor');
      globalThis.localStorage.setItem('wajeh_supervisor_id', '13');
      globalThis.localStorage.setItem('wajeh_account_id', '13');
      globalThis.localStorage.setItem('nukhab_web_session', '1');
      globalThis.localStorage.setItem('wajeh_dashboard_permissions', '[]');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:3000/portal/recitation-sessions');
    await page.getByRole('button', { name: 'حفظ', exact: true }).waitFor({ timeout: 15000 });
    assert.ok(evaluationLoads >= 1);
    const actions = page.locator('.recitation-actions');
    const actionLayout = await actions.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, right: rect.right, left: rect.left, gap: Number.parseFloat(globalThis.getComputedStyle(el).columnGap),
        buttons: [...el.querySelectorAll('button')].map((button) => {
          const box = button.getBoundingClientRect();
          return { text: button.textContent, width: box.width, right: box.right, left: box.left };
        }) };
    });
    assert.equal(actionLayout.buttons.length, 2);
    assert.ok(actionLayout.buttons.every((button) => Math.abs(button.width - (actionLayout.width - 2 * actionLayout.gap) / 3) < 1));
    assert.ok(Math.abs(actionLayout.buttons.find((button) => button.text === 'حفظ').right - actionLayout.right) < 1);
    assert.ok(Math.abs(actionLayout.buttons.find((button) => button.text === 'ربط').right - (actionLayout.right - actionLayout.buttons[0].width - actionLayout.gap)) < 1);
    assert.equal(await page.locator('.recitation-attendance svg').count(), 0);
    assert.ok(await page.locator('.recitation-attendance').evaluate((el) => el.offsetHeight >= 44));
    assert.equal(await page.getByRole('button', { name: /^الإشعارات/ }).count(), 0);
    await page.locator('.recitation-attendance').click();
    assert.equal(await page.getByRole('option', { name: 'غائب', exact: true }).count(), 1);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).click();
    const range = page.getByRole('button', { name: 'تعديل المقدار: البقرة 6–16', exact: true });
    await range.click();
    await page.getByRole('combobox', { name: 'آية النهاية', exact: true }).click();
    await page.getByRole('option', { name: '17', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'تعديل المقدار: البقرة 6–17', exact: true }).waitFor();
    const amounts = page.locator('.recitation-amount');
    assert.equal(await amounts.count(), 2);
    assert.equal(await amounts.getByText('الحفظ', { exact: true }).count(), 0);
    const practice = await page.locator('.recitation-practice > div').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    assert.equal(practice.length, 2);
    assert.equal(practice[0], practice[1]);
    const targets = await page.locator('.recitation-practice button, .recitation-amount button').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    assert.ok(targets.every((height) => height >= 44));
    for (const theme of ['light', 'dark']) {
      await page.evaluate((mode) => { globalThis.document.documentElement.classList.toggle('dark', mode === 'dark'); globalThis.document.documentElement.classList.toggle('light', mode === 'light'); }, theme);
      await page.screenshot({ path: `outputs/session-refresh-${width}-${theme}.png`, animations: 'disabled' });
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    }
    for (const onlyMastery of [false, true]) {
      bothTracks = !onlyMastery;
      masteryOnly = onlyMastery;
      await page.reload();
      await page.getByRole('button', { name: 'إتقان', exact: true }).waitFor();
      const buttons = page.locator('.recitation-action');
      assert.deepEqual(await buttons.allTextContents(), onlyMastery ? ['إتقان', 'ربط', 'مراجعة'] : ['حفظ', 'ربط', 'مراجعة', 'إتقان']);
      const boxes = await buttons.evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { top: rect.top, width: rect.width, x: rect.x };
      }));
      assert.ok(boxes.every((box, index) => box.top === boxes[0].top && Math.abs(box.width - boxes[0].width) < 1 && (index === 0 || box.x < boxes[index - 1].x)));
      await page.getByRole('button', { name: 'إظهار جميع المقادير', exact: true }).click();
      assert.equal(await page.locator('.recitation-amount').count(), onlyMastery ? 3 : 4);
      await page.screenshot({ path: `outputs/recitation-tracks-${width}-${onlyMastery ? 'mastery' : 'both'}.png`, animations: 'disabled' });
      assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    }
    await page.goto('http://127.0.0.1:3000/portal/calls');
    await page.getByRole('button', { name: 'الإشعارات، 2 غير مقروء', exact: true }).click();
    await page.getByRole('dialog', { name: 'الإشعارات', exact: true }).waitFor();
    await page.waitForFunction(() => !globalThis.document.querySelector('button[aria-label*="غير مقروء"]'));
    await page.getByRole('dialog').getByText('رسالة الإدارة 1', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'الإشعارات', exact: true }).waitFor();
    assert.deepEqual(reads, ['1', '2']);
    assert.ok(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth));
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
process.stdout.write('Session refresh, accessible arrowless attendance, and read-on-open inbox passed at 360/768/1440px.\n');

/** Extend the mocked response with the selected tracks. */
function addSessionInboxTracks(body, bothTracks, masteryOnly) {
  body.tasks.push({ ...body.tasks[0], id: 901, taskType: 'link', options: [] });
  if (bothTracks || masteryOnly) {
    body.tasks.push({ ...body.tasks[0], id: 902, taskType: 'review', options: [] },
      { ...body.tasks[0], id: 903, track: 'mastery', options: [] });
    if (masteryOnly) body.tasks = body.tasks.filter((task) => task.id !== 900);
  }
}
