import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedPlanCompletion } from '../../src/lib/quranPlanPreview.js';
import { createNativeSession, type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeFetch } from '../src/services/nativeApi';
import { createPlanManagementApi } from '../src/services/planManagementApi';
import { decodeManagedPlanStudents, decodePlanChapters, decodePlanPause, decodePlanSettings, emptyPlanRange, initialPlanDraft,
  normalizeNewPriorRange, normalizePlanDraft, planNumber, planRangeDraft, planRangeOverlaps, previewManagedPlan,
  type ManagedPlanStudent, type PlanManagementData, type PlanRange } from '../src/domain/planManagement';

const identity: NativeSession = { role: 'manager', id: 8, name: 'مدير اصطناعي', dashboardPermissions: [], complex: { name: 'جهة اختبار', registrationNumber: 'native-fixture' } };
const token = 'a'.repeat(64); const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const isCode = (code: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === code;
const pause = { paused: false, pausedFrom: null, revision: 0, canManage: true };
const range = (start = 10, end = 14): PlanRange => ({ startPage: start, endPage: end, startSurah: 2, startAyah: start, endSurah: 2, endAyah: end });
const rawPlan = () => ({ ...range(), id: 4, track: 'memorization', startDate: '2026-10-14', dailyPages: 1, linkPages: 10, reviewPages: 20,
  reviewHizbs: 1, readingHizbs: 1, progressPercent: 0, projectedEndDate: '2026-10-20', priorMemorization: [], completedMemorization: [], queuedRanges: [] });
const rawRow = () => ({ studentId: 2, studentName: 'طالب', committeeName: 'حلقة', priorMemorization: [], planPause: pause, plan: rawPlan() });
const row = (): ManagedPlanStudent => decodeManagedPlanStudents([rawRow()])[0]!;
const chapters = [{ number: 1, name: 'الفاتحة', ayahCount: 7, startPage: 1, endPage: 1 }, { number: 2, name: 'البقرة', ayahCount: 286, startPage: 2, endPage: 49 }];
const settings = { quranReferenceMode: 'page', weeklyHolidayDays: [5, 6], currentTermStartDate: '' };
const data = (): PlanManagementData => ({ rows: [row()], chapters: decodePlanChapters(chapters), pause, settings: decodePlanSettings(settings, '2026-10-14'), lastStartDate: '' });
async function setup(fetcher: NativeFetch, actor = identity) {
  let stored: StoredNativeSession | null = null;
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, options) =>
    url.endsWith('/auth/login') ? json({ ...actor, token }) : fetcher(url, options) }), storage });
  await controller.login({ loginNumber: '0008', password: 'synthetic' }); return controller;
}
const newDraft = () => initialPlanDraft({ ...row(), plan: null }, data());
test('plan contracts decode actual chapter metadata, plan identity, legacy reading, prior ranges and pause state', () => {
  assert.equal(decodePlanChapters(chapters)[1]!.ayahs, 286);
  assert.equal(row().plan!.id, 4);
  assert.equal(decodeManagedPlanStudents([{ ...rawRow(), plan: { ...rawPlan(), readingHizbs: null } }])[0]!.plan!.readingHizbs, null);
  const legacy = decodeManagedPlanStudents([{ ...rawRow(), plan: { ...rawPlan(), startDate: '' } }])[0]!;
  assert.equal(initialPlanDraft(legacy, data()).startDate, data().settings.minimumStartDate);
  assert.deepEqual(decodePlanPause(pause), pause);
  assert.equal(decodePlanSettings({ ...settings, currentTermStartDate: '2026-11-01' }, '2026-10-14').minimumStartDate, '2026-11-01');
});
test('malformed identities, ranges, impossible dates, amounts and pause revisions fail decoding', () => {
  for (const value of [[{ ...rawRow(), studentId: -1 }], [{ ...rawRow(), plan: { ...rawPlan(), startPage: 605 } }],
    [{ ...rawRow(), plan: { ...rawPlan(), startDate: '2026-02-30' } }], [{ ...rawRow(), plan: { ...rawPlan(), track: 'student-execute' } }],
    [rawRow(), rawRow()]]) assert.throws(() => decodeManagedPlanStudents(value), isCode('invalid-response'));
  for (const value of [{ ...pause, revision: -1 }, { ...pause, paused: true }, { ...pause, paused: 'false' }, { ...pause, canManage: 'true' }]) {
    assert.throws(() => decodePlanPause(value), isCode('invalid-response'));
  }
});
test('plan amounts accept Arabic and Persian numerals with quarter faces and reject invalid increments', () => {
  assert.equal(planNumber('٠٫٢٥', 0.25, 604, 0.25), 0.25); assert.equal(planNumber('۲', 1, 60), 2);
  for (const value of ['0', '0.3', '-1', 'NaN', '1e1', '1x', '605']) assert.throws(() => planNumber(value, 0.25, 604, 0.25), isCode('validation'));
});
test('preview uses the web completion rule and excludes previous and completed pages while mastery retains them', () => {
  const current = { ...row(), priorMemorization: [range(10, 10)], plan: { ...row().plan!, completedMemorization: [range(11, 11)] } };
  const draft = initialPlanDraft(current, data()); const preview = previewManagedPlan(draft, data(), current);
  assert.equal(preview.pages, 3); assert.deepEqual({ days: preview.days, endDate: preview.endDate }, expectedPlanCompletion({ pages: 3, dailyPages: 1, startDate: draft.startDate, weeklyHolidayDays: [5, 6] }));
  assert.equal(previewManagedPlan({ ...draft, track: 'mastery' }, data(), current).pages, 5);
  assert.equal(previewManagedPlan({ ...draft, dailyPages: '٠٫٢٥' }, data(), current).days, 12);
});
test('date, holiday availability and fully saved ranges prevent invalid saving', () => {
  const current = row(), draft = initialPlanDraft(current, data());
  assert.throws(() => normalizePlanDraft({ ...draft, mode: 'new', startDate: '2026-10-13' }, current, data()), isCode('validation'));
  assert.throws(() => normalizePlanDraft({ ...draft, startDate: '2026-02-30' }, current, data()), isCode('validation'));
  assert.throws(() => normalizePlanDraft(draft, current, { ...data(), settings: { ...data().settings, weeklyHolidayDays: [0, 1, 2, 3, 4, 5, 6] } }), isCode('validation'));
  assert.throws(() => normalizePlanDraft(draft, { ...current, priorMemorization: [range()] }, data()), isCode('validation'));
  const running = { ...current, plan: { ...current.plan!, startDate: '2026-10-01' } };
  assert.equal(normalizePlanDraft(initialPlanDraft(running, data()), running, data()).startDate, '2026-10-01');
});
test('prior memorization rejects duplicates, overlaps, backward ranges and incomplete references', () => {
  const current = { ...row(), priorMemorization: [range(1, 3)] };
  assert.equal(normalizeNewPriorRange(planRangeDraft(range(4, 5)), data(), current, []).startPage, 4);
  for (const item of [range(2, 4), range(5, 4)]) assert.throws(() => normalizeNewPriorRange(planRangeDraft(item), data(), current, []), isCode('validation'));
  assert.throws(() => normalizeNewPriorRange(planRangeDraft(range(4, 5)), data(), current, [planRangeDraft(range(5, 6))]), isCode('validation'));
  assert.throws(() => normalizeNewPriorRange(emptyPlanRange(), data(), current, []), isCode('validation'));
});
test('queue rejects overlap with current and preceding queued ranges without losing distinct partial-ayah ranges', () => {
  const current = row(), draft = initialPlanDraft(current, data());
  assert.equal(normalizePlanDraft({ ...draft, queuedRanges: [planRangeDraft(range(15, 17))] }, current, data()).queuedRanges.length, 1);
  assert.throws(() => normalizePlanDraft({ ...draft, queuedRanges: [planRangeDraft(range(14, 17))] }, current, data()), isCode('validation'));
  assert.throws(() => normalizePlanDraft({ ...draft, queuedRanges: [planRangeDraft(range(15, 17)), planRangeDraft(range(16, 18))] }, current, data()), isCode('validation'));
  assert.equal(planRangeOverlaps({ ...range(2, 2), startAyah: 1, endAyah: 2 }, { ...range(2, 2), startAyah: 3, endAyah: 4 }, data().chapters), false);
});
test('ayah and page payloads preserve hidden review settings and central reference mode without inventing execution permissions', () => {
  const current = row(), draft = initialPlanDraft(current, data()); const payload = normalizePlanDraft(draft, current, data());
  assert.equal(payload.startPage, 10); assert.equal('startSurah' in payload, false);
  assert.equal(payload.reviewSplitWeekly, false); assert.equal('executionActorRole' in payload, false);
  const ayahData = { ...data(), settings: { ...data().settings, referenceMode: 'ayah' as const } };
  const ayahPayload = normalizePlanDraft(draft, current, ayahData);
  assert.equal(ayahPayload.startSurah, 2); assert.equal('startPage' in ayahPayload, false);
  const legacy = { ...current, plan: { ...current.plan!, reviewWeekStartDay: 1, reviewWeekEndDay: 4, reviewMinDailyPages: 3 } };
  const legacyPayload = normalizePlanDraft(draft, legacy, data());
  assert.deepEqual([legacyPayload.reviewWeekStartDay, legacyPayload.reviewWeekEndDay, legacyPayload.reviewMinDailyPages], [1, 4, 3]);
});
test('loads use existing plan, reference, settings and pause endpoints', async () => {
  const calls: string[] = [];
  const controller = await setup(async url => { const path = url.replace('https://example.invalid/api', ''); calls.push(path);
    return json(path.startsWith('/student-plans?') ? [rawRow()] : path === '/quran/chapters' ? chapters : path === '/student-plans/pause' ? pause
      : path === '/public-settings' ? settings : { lastStartDate: '' }); });
  const loaded = await createPlanManagementApi(controller).load();
  assert.equal(loaded.rows.length, 1); assert.equal(loaded.chapters[1]!.ayahs, 286);
  assert.deepEqual(calls.sort(), ['/student-plans?committeeId=all', '/quran/chapters', '/student-plans/pause', '/public-settings', '/student-plans/preferences'].sort());
});
test('native actions send exact existing contracts with plan id and pause revision', async () => {
  const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const current = { ...row(), priorMemorization: [range(1, 3)], plan: { ...row().plan!, queuedRanges: [range(15, 17)] } };
  const raw = { ...rawRow(), priorMemorization: current.priorMemorization, plan: current.plan };
  const controller = await setup(async (url, options) => { const path = new URL(url).pathname.replace('/api', '');
    if (options.method === 'GET') return json([raw]);
    const body = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
    calls.push({ path, method: options.method!, body }); return json(path.startsWith('/student-plans/pause') ? { ...pause, paused: true, pausedFrom: '2026-10-14', revision: 1 } : { ok: true, id: 4 }); });
  const api = createPlanManagementApi(controller); await api.savePlan(current, initialPlanDraft(current, data()), data());
  await api.closePlan(current); await api.deletePlan(current); await api.deletePrior(current, 1, 3); await api.setPause(pause, 2); await api.setPause(pause);
  assert.deepEqual(calls.map(call => [call.method, call.path]), [['PUT', '/student-plans/2'], ['POST', '/student-plans/2/close'], ['DELETE', '/student-plans/2'],
    ['DELETE', '/student-plans/2/prior-memorization'], ['PUT', '/student-plans/pause/2'], ['PUT', '/student-plans/pause']]);
  assert.deepEqual(calls[1]!.body, { planId: 4 }); assert.deepEqual(calls[4]!.body, { paused: true, revision: 0 });
  assert.equal(calls.some(call => 'role' in call.body || 'token' in call.body || 'studentStatus' in call.body), false);
});
test('stale plan or memorization blocks writes before sending a mutation', async () => {
  for (const changed of [{ ...rawRow(), plan: { ...rawPlan(), dailyPages: 2 } }, { ...rawRow(), priorMemorization: [range(1, 3)] }, { ...rawRow(), plan: { ...rawPlan(), id: 9 } }]) {
    let writes = 0; const controller = await setup(async (_url, options) => { if (options.method !== 'GET') writes++; return json([changed]); });
    await assert.rejects(createPlanManagementApi(controller).savePlan(row(), initialPlanDraft(row(), data()), data()), isCode('conflict'));
    assert.equal(writes, 0);
  }
});
test('students and ungranted staff send no requests; supervisors cannot pause all plans', async () => {
  for (const actor of [{ ...identity, role: 'student' as const, dashboardPermissions: ['studentPlans'] }, { ...identity, role: 'admin' as const }]) {
    let calls = 0; const controller = await setup(async () => { calls++; return json({}); }, actor);
    await assert.rejects(createPlanManagementApi(controller).load(), isCode('forbidden')); assert.equal(calls, 0);
  }
  let calls = 0; const controller = await setup(async () => { calls++; return json({}); }, { ...identity, role: 'supervisor', dashboardPermissions: ['studentPlans'] });
  await assert.rejects(createPlanManagementApi(controller).setPause(pause), isCode('forbidden')); assert.equal(calls, 0);
});
test('server authorization, scope, validation and stale pause conflicts surface without unsafe fallback', async () => {
  for (const [status, code] of [[403, 'forbidden'], [404, 'not-found'], [409, 'conflict'], [422, 'validation']] as const) {
    const controller = await setup(async () => json({ message: 'private detail' }, status));
    await assert.rejects(createPlanManagementApi(controller).setPause(pause, 2), isCode(code));
  }
});
test('missing mutation acknowledgement remains unknown rather than looking like an input error', async () => {
  const controller = await setup(async (_url, options) => options.method === 'GET' ? json([rawRow()]) : json({ ok: true }));
  await assert.rejects(createPlanManagementApi(controller).savePlan(row(), initialPlanDraft(row(), data()), data()), isCode('invalid-response'));
});
test('old services reject grant revocation and account changes before and after requests', async () => {
  const actor = { ...identity, role: 'admin' as const, dashboardPermissions: ['studentPlans'] }; let session: NativeSession = actor;
  let release: (() => void) | undefined;
  const controller = await setup(async url => url.endsWith('/auth/session') ? json(session) : url.endsWith('/auth/logout') ? json({ ok: true })
    : (await new Promise<void>(resolve => { release = resolve; }), json([{ ayah: 1, page: 1 }])), actor);
  const api = createPlanManagementApi(controller); const pending = api.ayahs(1);
  session = { ...actor, dashboardPermissions: [] }; await controller.restore(); release!();
  await assert.rejects(pending, isCode('cancelled')); await assert.rejects(api.ayahs(1), isCode('forbidden'));
  await controller.logout(); Object.assign(actor, { id: 9 }); await controller.login({ loginNumber: '0009', password: 'synthetic' });
  await assert.rejects(api.ayahs(1), isCode('cancelled'));
});
test('new plans do not prepopulate old prior ranges and preserve selected continuity mode', () => {
  const current = row(); assert.equal(initialPlanDraft(current, data()).mode, 'continue');
  const draft = newDraft(); assert.equal(draft.mode, 'new'); assert.deepEqual(draft.priorMemorization, []);
  assert.deepEqual(draft.range, emptyPlanRange()); assert.equal(initialPlanDraft(current, data(), true).mode, 'new');
});
