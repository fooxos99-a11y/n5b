import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from 'playwright';
import { parsePassingPolicy, effectivePassingPolicy, evaluatePassingPart, passingExamStatus } from '../shared/passing-policy.js';
import { readLocalMushafPage } from '../server/services/localMushaf.js';

const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const browser = await chromium.launch({ headless: true });
const mushafPage = await readLocalMushafPage(22);
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    let policy = parsePassingPolicy({}), failSave = false, failDecision = false, failMushaf = true;
    let globalPause = { paused: false, revision: 0, canManage: true }, individualPause = { ...globalPause };
    const range = { startPage: 1, startSurah: 1, startAyah: 1, startSurahName: 'الفاتحة', endPage: 21, endSurah: 2, endAyah: 141, endSurahName: 'البقرة' };
    const exams = { branch: [], hafiz: [] };
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('wajeh_role', 'manager'); globalThis.localStorage.setItem('nukhab_web_session', '1');
      globalThis.localStorage.setItem('wajeh_name', 'المدير');
    });
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/^\/api/, '');
      const method = request.method(); let body = [], status = 200;
      const payload = method === 'GET' ? null : request.postDataJSON();
      if (method !== 'GET') writes.push({ path, payload });
      if (path === '/health') body = { ok: true };
      if (['/public-settings', '/settings'].includes(path)) body = { staffAttendanceSource: 'supervisor', weeklyHolidayDays: [5, 6] };
      if (path === '/dashboard-bootstrap') body = { settings: { staffAttendanceSource: 'supervisor' }, permissions: [] };
      if (path === '/notifications/unread-count') body = { count: 0 };
      if (path === '/passing/policy') { if (method === 'PUT') policy = payload.policy; body = { policy }; }
      if (path === '/passing/students') body = [{ id: 3, name: 'طالب الاجتياز', committeeName: 'الحلقة الأولى' }];
      if (path === '/passing') {
        if (method === 'GET') body = exams[url.searchParams.get('type')];
        else {
          const type = payload.type;
          const exam = { id: type === 'branch' ? 1 : 2, type, studentId: 3, studentName: 'طالب الاجتياز', committeeName: 'الحلقة الأولى', createdAt: '2026-10-09T10:00:00', status: 'pending',
            parts: (type === 'branch' ? [1] : [1, 2]).map(juzNumber => ({ id: juzNumber + (type === 'branch' ? 10 : 20), juzNumber,
              ranges: [juzNumber===1 ? range : { ...range,startPage:22,startSurah:2,startAyah:142,startSurahName:'البقرة',endPage:41,endAyah:252 }], attempts: [], latestAttempt: null })) };
          exams[type].unshift(exam); body = exam; status = 201;
        }
      }
      if (/\/passing\/parts\/\d+\/attempts$/.test(path)) {
        if (failSave) { status = 500; body = { message: 'تعذر حفظ النتيجة التجريبية' }; }
        else {
          const id = Number(path.split('/')[3]), exam = Object.values(exams).flat().find(item => item.parts.some(part => part.id === id)), part = exam.parts.find(item => item.id === id);
          const snapshot = effectivePassingPolicy(policy, exam.type, part.juzNumber), result = evaluatePassingPart(snapshot, payload);
          const attempt = { id: writes.length, mode: payload.mode, createdAt: '2026-10-09T10:00:00', actorName: 'المدير', result, policy: snapshot, marks: [], rehifzDecision: 'pending' };
          part.attempts.unshift(attempt); part.latestAttempt = attempt; exam.status = passingExamStatus(exam.parts); body = { ok: true, result: { ...result, attemptId: attempt.id } };
        }
      }
      if (/\/passing\/parts\/\d+\/rehifz$/.test(path)) {
        if (failDecision) { status=500;body={ message:'تعذر حفظ قرار إعادة الحفظ' }; }
        else {
          const id=Number(path.split('/')[3]),part=Object.values(exams).flat().flatMap(exam=>exam.parts).find(item=>item.id===id);
          assert.equal(payload.attemptId,part.latestAttempt.id);
          part.latestAttempt.rehifzDecision=payload.repeat ? 'repeat':'keep';
          part.latestAttempt.rehifzStatus=payload.repeat ? 'pending':null;
          body={ ok:true,decision:part.latestAttempt.rehifzDecision,rehifzId:payload.repeat ? 1:null };
        }
      }
      if (/\/mushaf$/.test(path)) {
        if(failMushaf) { body={ message:'تعذر تحميل المصحف التجريبي' };status=500; }
        else body={ pages:[mushafPage],wordMarks:[],allowedRange:{ fromSurah:2,fromAyah:142,toSurah:2,toAyah:252,direction:1 } };
      }
      if (path.startsWith('/student-plans/pause')) {
        const individual = path.endsWith('/3');
        if (method === 'PUT') {
          const previous = individual ? individualPause : globalPause;
          const updated = { paused: payload.paused, revision: previous.revision + 1, canManage: true, pausedFrom: '2026-10-09' };
          if (individual) individualPause = updated; else globalPause = updated;
        }
        body = individual ? individualPause : globalPause;
      }
      if (path === '/student-plans') body = [{ studentId: 3, studentName: 'طالب الاجتياز', committeeName: 'الحلقة الأولى', priorMemorization: [], planPause: individualPause,
        rehifz: [{ id:1,juzNumber:1,status:'pending' }],
        plan: { id: 1, track: 'memorization', startDate: '2026-10-09', startSurah: 1, startAyah: 1, endSurah: 114, endAyah: 6, startPage: 1, endPage: 604, dailyPages: 1, reviewHizbs: 1, readingHizbs: 1, queuedRanges: [] } }];
      if (path === '/committees') body = [{ id: 1, name: 'الحلقة الأولى' }];
      await route.fulfill({ status, json: body });
    });
    const noOverflow = async () => {
      await page.waitForFunction(() => globalThis.document.fonts.status === 'loaded');
      assert.equal(await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth), false, `${width}: page overflow`);
      for (const dialog of await page.getByRole('dialog').elementHandles()) {
        await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
        assert.ok(await dialog.evaluate(el => !el.isConnected || el.scrollWidth <= el.clientWidth), `${width}: dialog overflow`);
      }
    };
    await page.goto(`${base}/dashboard/passing`);
    await page.getByRole('button', { name: 'اجتياز جديد', exact: true }).waitFor();
    await noOverflow();
    const create = async () => {
      await page.getByRole('button', { name: 'اجتياز جديد', exact: true }).click();
      await page.getByRole('combobox', { name: 'الطالب', exact: true }).click();
      await page.getByRole('option', { name: /طالب الاجتياز/ }).click();
      await page.getByRole('button', { name: 'إنشاء الاجتياز', exact: true }).click();
      await page.getByRole('button', { name: 'بدء تسميع الجزء', exact: true }).first().waitFor();
    };
    await create(); await noOverflow();
    const count = async label => {
      await page.getByRole('button', { name: label, exact: true }).first().click();
      await page.getByRole('button', { name: 'تسجيل عدد الأخطاء والتنبيهات', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'عدد الأخطاء', exact: true }).waitFor();
    };
    await count('بدء تسميع الجزء');
    const mistakes = page.getByRole('spinbutton', { name: 'عدد الأخطاء', exact: true });
    await mistakes.fill('4'); failSave = true;
    await page.getByRole('button', { name: 'حفظ النتيجة', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'تعذر حفظ النتيجة التجريبية' }).waitFor();
    assert.equal(await mistakes.inputValue(), '4'); await noOverflow();
    failSave = false;
    await page.getByRole('button', { name: 'حفظ النتيجة', exact: true }).click();
    await page.getByRole('dialog', { name:'إعادة الحفظ ضمن الخطة',exact:true }).waitFor();
    await page.getByText('هل تريد إعادة حفظ الجزء 1 كاملًا ضمن خطة الطالب؟',{ exact:true }).waitFor();
    await noOverflow();
    failDecision=true;
    await page.getByRole('button',{ name:'إبقاء الخطة',exact:true }).click();
    await page.getByRole('alert').filter({ hasText:'تعذر حفظ قرار إعادة الحفظ' }).waitFor();
    assert.equal(exams.branch[0].parts[0].attempts.length,1,'decision error never resubmits result');
    // Refresh keeps the recorded result and offers the pending choice again.
    await page.reload();
    await page.getByRole('button',{ name:'فتح الاجتياز',exact:true }).click();
    await page.getByRole('button',{ name:'تحديد إعادة الحفظ',exact:true }).click();
    failDecision=false;
    await page.getByRole('button',{ name:'إبقاء الخطة',exact:true }).click();
    await page.getByRole('button', { name: 'إعادة تسميع الجزء', exact: true }).waitFor();
    await page.getByRole('button', { name: 'تقرير الجزء (1)', exact: true }).click();
    await page.getByText('الدرجة 80/100', { exact: true }).last().waitFor();
    await page.getByText('سُجلت الأعداد فقط؛ مواضع الأخطاء غير محددة.', { exact: true }).waitFor();
    await page.getByText('الإعدادات المستخدمة', { exact: true }).click(); await noOverflow();
    await page.getByRole('dialog', { name: 'تقرير الجزء 1', exact: true }).getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.getByRole('dialog', { name: 'تقرير الجزء 1', exact: true }).waitFor({ state: 'hidden' });
    await count('إعادة تسميع الجزء');
    await mistakes.fill('0'); await page.getByRole('button', { name: 'حفظ النتيجة', exact: true }).click();
    await page.getByRole('button',{ name:'إعادة حفظ الجزء كاملًا',exact:true }).click();
    await page.getByRole('button', { name: 'تقرير الجزء (2)', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'إعادة تسميع الجزء', exact: true }).count(), 0);
    await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.getByRole('button', { name: 'اجتياز حافظ', exact: true }).click(); await create();
    assert.equal(await page.getByRole('button', { name: 'بدء تسميع الجزء', exact: true }).count(), 2);
    await page.getByRole('button', { name: 'تقرير الجزء', exact: true }).last().click();
    await page.getByText('لم يبدأ تسميع هذا الجزء.', { exact: true }).waitFor();
    await page.getByRole('dialog', { name: 'تقرير الجزء 2', exact: true }).getByRole('button', { name: 'إغلاق', exact: true }).click();
    await page.getByRole('dialog', { name: 'تقرير الجزء 2', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'بدء تسميع الجزء', exact: true }).last().click();
    await page.getByRole('button', { name: 'المصحف', exact: true }).click();
    await page.getByText('تعذر تحميل المصحف التجريبي', { exact: false }).first().waitFor();
    await noOverflow();
    failMushaf=false;
    await page.getByRole('button',{ name:'إعادة المحاولة',exact:true }).click();
    await page.getByRole('button',{ name:'إنهاء',exact:true }).click();
    await page.getByRole('dialog',{ name:'إعادة الحفظ ضمن الخطة',exact:true }).waitFor();
    await page.getByText('هل تريد إعادة حفظ الجزء 2 كاملًا ضمن خطة الطالب؟',{ exact:true }).waitFor();
    await noOverflow();
    await page.getByRole('button',{ name:'إبقاء الخطة',exact:true }).click();
    assert.equal(exams.hafiz[0].parts[1].latestAttempt.mode,'mushaf');
    await page.goto(`${base}/dashboard/settings-passing`);
    await page.getByRole('spinbutton', { name: 'حد الاجتياز', exact: true }).waitFor();
    const savePolicy = () => page.waitForResponse(response => response.url().includes('/passing/policy') && response.request().method() === 'PUT');
    let saved = savePolicy(); await page.getByRole('spinbutton', { name: 'حد الاجتياز', exact: true }).fill('90'); await saved;
    await page.getByRole('combobox', { name: 'نوع الاجتياز', exact: true }).click();
    await page.getByRole('option', { name: 'اجتياز حافظ', exact: true }).click();
    assert.equal(await page.getByRole('spinbutton', { name: 'حد الاجتياز', exact: true }).inputValue(), '85');
    saved = savePolicy(); await page.getByRole('spinbutton', { name: 'خصم التردد', exact: true }).fill('3'); await saved;
    await page.getByRole('combobox', { name: 'إعدادات الجزء', exact: true }).click();
    await page.getByRole('option', { name: 'الجزء 2', exact: true }).click();
    saved = savePolicy(); await page.getByRole('spinbutton', { name: 'حد الاجتياز', exact: true }).fill('95'); await saved;
    assert.equal(policy.branch.passScore, 90); assert.equal(policy.hafiz.passScore, 85); assert.equal(policy.hafiz.juzOverrides[2].passScore, 95);
    const writesBefore = writes.length;
    await page.getByRole('spinbutton', { name: 'حد الاجتياز', exact: true }).fill('101');
    await page.getByText('حد الاجتياز يجب ألا يتجاوز الدرجة الكاملة.', { exact: true }).waitFor();
    await page.waitForTimeout(850); assert.equal(writes.length, writesBefore, 'invalid policy is not saved');
    await page.getByRole('spinbutton', { name: 'حد الاجتياز', exact: true }).fill('95');
    await noOverflow();
    await page.goto(`${base}/dashboard/student-plans`);
    await page.getByRole('button', { name: 'إيقاف الخطة — طالب الاجتياز', exact: true }).waitFor();
    await page.getByText('إعادة حفظ الجزء 1 كاملًا',{ exact:true }).waitFor();
    await noOverflow();
    await page.getByRole('button', { name: 'إيقاف الخطة — طالب الاجتياز', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'إيقاف الخطة', exact: true }).click();
    await page.getByRole('button', { name: 'استئناف الخطة — طالب الاجتياز', exact: true }).waitFor();
    await page.getByRole('button', { name: 'إيقاف الخطط', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'إيقاف الخطط', exact: true }).click();
    await page.getByRole('button', { name: 'تشغيل الخطط', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'تشغيل الخطط', exact: true }).click();
    await page.getByRole('button', { name: 'استئناف الخطة — طالب الاجتياز', exact: true }).waitFor();
    assert.ok(individualPause.paused); await noOverflow(); assert.deepEqual(errors, []);
    await page.close();
    globalThis.console.log(`Passing dashboard/settings/plans: tabs, part reports, retry/error retention, policy independence/overrides, invalid draft, global/individual pause, RTL overflow passed at ${width}px.`);
  }
} finally { await browser.close(); }
