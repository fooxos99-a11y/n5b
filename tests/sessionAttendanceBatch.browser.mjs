import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3119';
const browser = await chromium.launch();
const policy = normalizeGradingPolicy({ trackSession: { segmentCount: 2 } });
async function checkSession(component, width, rejectSecond = false) {
  const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
  const writes = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const students = [1, 2].map(id => ({ id, name: `طالب ${id}`, committeeName: 'حلقة التجربة', grade: {} }));
  let selectedCommittee;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith('/grading/weekly-component')) {
      const body = request.postDataJSON();
      writes.push(body);
      if (rejectSecond && body.studentId === 2) {
        await route.fulfill({ status: 403, json: { message: 'غير مصرح' } });
        return;
      }
      students.find(student => student.id === body.studentId).grade[`${component}Detail`] = body;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    let body = [];
    if (url.pathname.endsWith('/committees')) body = [{ id: 7, name: 'حلقة التجربة' }];
    if (url.pathname.endsWith('/grading/policy')) body = { policy };
    if (url.pathname.endsWith('/grading/week')) {
      selectedCommittee = url.searchParams.get('committeeId');
      body = { weekStart: '2026-09-27', weekEnd: '2026-10-03', policy, maxima: { total: 100, weeklySession: 20, trackSession: 20 }, students };
    }
    await route.fulfill({ json: body });
  });
  try {
    await page.goto(`${base}/tests/fixtures/weekly-refinements.html?section=${component}`);
    await page.getByRole('combobox', { name: 'الحلقة', exact: true }).click();
    await page.getByRole('option', { name: 'حلقة التجربة', exact: true }).click();
    const button = page.getByRole('button', { name: 'تحضير الكل', exact: true });
    await button.waitFor();
    assert.equal(selectedCommittee, '7');
    const bounds = await button.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height >= 44);
    assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await button.click();
    await page.waitForFunction(() => !globalThis.document.querySelector('button[aria-busy="true"]'));
    assert.deepEqual(writes.map(row => row.studentId), [1, 2]);
    assert.ok(writes.every(row => row.weekStart === '2026-09-27' && row.component === component && row.attendanceStatus === 'present'));
    assert.equal(await page.getByRole('combobox', { name: new RegExp('حضور طالب 1') }).innerText(), 'حاضر');
    if (rejectSecond) {
      assert.equal(await page.getByRole('combobox', { name: new RegExp('حضور طالب 2') }).innerText(), 'اختر الحالة');
      assert.equal(await button.isEnabled(), true);
    } else {
      assert.equal(await button.isDisabled(), true);
    }
    if (component === 'track') assert.ok(writes.every(row => row.segments.length === 2 && row.segments.every(segment => segment.recorded === false)));
    assert.deepEqual(errors, []);
    globalThis.console.log(`${component}: ${width}px attendance, circle scope, layout and ${rejectSecond ? 'partial failure' : 'success'} passed.`);
  } finally {
    await page.close();
  }
}
try {
  await Promise.all([360, 1440].flatMap(width => ['weekly', 'track'].map(component => checkSession(component, width))));
  await checkSession('weekly', 360, true);
} finally {
  await browser.close();
}
