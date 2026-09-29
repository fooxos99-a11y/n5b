import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let failed = true;
    let callMode = 'manager';
    const writes = [];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (request.method() !== 'GET') writes.push(path);
      if (failed && /families|reports\/students/.test(path)) return route.fulfill({ status: 500, json: { message: 'خطأ تحميل تجريبي' } });
      let body = [];
      const committees = [{ id: 1, name: 'حلقة أولى' }, { id: 2, name: 'حلقة ثانية' }];
      if (path.endsWith('/committees')) body = committees;
      if (path.endsWith('/students')) body = url.searchParams.get('committeeId') === '2'
        ? [{ id: 2, name: 'طالب ثانٍ', guardianPhone: '0500000002' }]
        : [{ id: 1, name: 'طالب أول', guardianPhone: '0500000001' }];
      if (path.endsWith('/calls')) body = { rooms: [], committees, canCreate: true, canCreateGeneral: callMode === 'manager', committeeSelectionLocked: false, livekitConfigured: callMode !== 'disabled' };
      if (path.endsWith('/settings/public')) body = { recitationSessionDays: [0,1,2,3,4] };
      await route.fulfill({ json: body });
    });
    const visit = section => page.goto(`http://127.0.0.1:3107/tests/fixtures/audit-settings.html?section=${section}`);
    const noOverflow = async () => assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false);
    await visit('families');
    await page.getByText('خطأ تحميل تجريبي', { exact: true }).waitFor();
    assert.equal(await page.getByText('لا توجد حلقات حالياً.', { exact: true }).count(), 0);
    await noOverflow();
    failed = false;
    await visit('whatsapp');
    await page.getByRole('button', { name: 'تحديد طالب أول', exact: true }).click();
    await page.getByRole('combobox', { name: 'الحلقة', exact: true }).click();
    await page.getByRole('option', { name: 'حلقة ثانية', exact: true }).click();
    await page.getByRole('button', { name: 'تحديد طالب ثانٍ', exact: true }).click();
    await page.getByLabel('نص الرسالة', { exact: true }).fill('رسالة تجربة لن ترسل');
    await page.getByRole('button', { name: 'إرسال', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'تأكيد إرسال واتساب' });
    await confirm.waitFor();
    assert.match(await confirm.innerText(), /إلى 2 مستلمًا/);
    await confirm.getByRole('button', { name: 'إلغاء', exact: true }).click();
    assert.equal(writes.length, 0);
    await noOverflow();
    await visit('calls');
    await page.getByRole('button', { name: 'إنشاء غرفة', exact: true }).click();
    await page.getByRole('combobox', { name: 'الحلقة', exact: true }).click();
    await page.getByRole('option', { name: 'غرفة عامة', exact: true }).click();
    await noOverflow();
    callMode = 'teacher';
    await visit('calls');
    await page.getByRole('button', { name: 'إنشاء غرفة', exact: true }).click();
    await page.getByRole('combobox', { name: 'الحلقة', exact: true }).click();
    assert.equal(await page.getByRole('option', { name: 'غرفة عامة', exact: true }).count(), 0);
    await page.getByRole('option', { name: 'حلقة ثانية', exact: true }).click();
    await noOverflow();
    callMode = 'disabled';
    await visit('calls');
    await page.getByRole('button', { name: 'إنشاء غرفة', exact: true }).waitFor();
    assert.equal(await page.getByText(/خدمة المكالمات غير مهيأة/).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'إنشاء غرفة', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    await page.close();
    globalThis.console.log(`Closure UI passed at ${width}px: load errors, retained recipients, send cancellation, scoped calls.`);
  }
} finally { await browser.close(); }
