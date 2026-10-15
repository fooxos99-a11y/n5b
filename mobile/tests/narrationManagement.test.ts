import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSession, type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { createNativeApi, NativeApiError, type NativeFetch } from '../src/services/nativeApi';
import { createNarrationManagementApi } from '../src/services/narrationManagementApi';
import { decodeNarrationEvent, decodeNarrationEvents, decodeNarrationPartReference, decodeNarrationPreview, decodeNarrationPupils,
  decodeNarrationReferences, emptyNarrationRange, filterNarrationPupils, narrationEventMatchesPreview, narrationGroups,
  narrationPreviewFingerprint, narrationSavedOverall, newNarrationDraft, normalizeNarrationDraft, normalizeNarrationRange,
  scopedNarrationPupils, type NarrationPayload } from '../src/domain/narrationManagement';

const identity: NativeSession = { role: 'manager', id: 8, name: 'مدير اختبار', dashboardPermissions: [], complex: { name: 'جهة', registrationNumber: 'native-fixture' } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status }); const token = 'a'.repeat(64);
const isCode = (code: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === code;
const circle = { id: 3, name: 'حلقة', complexId: 4, complexName: 'مجمع', points: 0, studentsCount: 1 };
const otherCircle = { ...circle, id: 4, complexId: 5, name: 'أخرى' };
const range = { startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 };
const measured = { ...range, startPage: 1, endPage: 1, faces: 1 };
const rawPupil = { id: 2, name: 'أحمد مُوسى', committeeId: 3, committeeName: 'حلقة' };
const payload: NarrationPayload = { name: 'سرد اختبار', startDate: '2026-10-14', endDate: '2026-10-15', scope: 'all', committeeIds: [], mode: 'full' };
const rawReferences = () => ({ chapters: [{ number: 1, name: 'الفاتحة', englishName: 'Al-Fatihah', ayahCount: 7, startPage: 1, endPage: 1 },
  { number: 2, name: 'البقرة', englishName: 'Al-Baqarah', ayahCount: 286, startPage: 2, endPage: 49 }],
  juzRanges: [{ juz: 1, startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 141, startPage: 1, endPage: 21, startSurahName: 'الفاتحة', endSurahName: 'البقرة' }] });
const rawPreview = () => ({ mode: payload.mode, startDate: payload.startDate, endDate: payload.endDate, scope: payload.scope, committeeIds: [],
  students: [{ studentId: 2, name: rawPupil.name, committeeId: 3, committeeName: 'حلقة', ranges: [{ ...measured }],
    juzParts: [{ juz: 1, start: { surah: 1, ayah: 1, page: 1 }, end: { surah: 1, ayah: 7, page: 1 }, faces: 1 }], totalFaces: 1 }], skippedStudents: [] });
const mark = { page: 1, startLocation: '1:1:1', endLocation: '1:1:2', selectedText: 'بسم الله', notes: 'شاهد', markType: 'lahn' };
const rawPart = () => ({ ...measured, id: '11', juzNumber: 1, startSurahName: 'الفاتحة', endSurahName: 'الفاتحة', rangeLabel: 'من الفاتحة 1 إلى الفاتحة 7', isFullJuz: false,
  warningCount: 0, hesitationCount: 0, mistakeCount: 0, score: null as number | null, evaluationMode: null as string | null,
  wordMarks: [] as unknown[], evaluatorName: null as string | null, evaluatedAt: null as string | null });
const rawEntry = () => ({ id: '9', studentId: '2', studentName: rawPupil.name, committeeId: '3', committeeName: 'حلقة', status: 'pending', totalFaces: 1,
  finalScore: null as number | null, finalRating: null as string | null, archivedAt: null as string | null, parts: [rawPart()], reciterNames: [] as string[] });
const rawEvent = () => ({ id: '6', name: payload.name, startDate: payload.startDate, endDate: payload.endDate, scope: 'all', committeeId: null, status: 'open',
  createdByName: identity.name, createdAt: '2026-10-14 12:00', students: [rawEntry()], recitationMode: 'both',
  evaluationPolicy: { maxScore: 100, warningDeduction: 1, hesitationDeduction: 0.5, mistakeDeduction: 5 }, summary: { total: 1, completed: 0, inProgress: 0, unfinished: 0 } });
const row = (event = rawEvent()) => ({ id: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate, status: event.status, studentsCount: event.students.length });
async function setup(fetcher: NativeFetch, actor: NativeSession = identity) {
  let stored: StoredNativeSession | null = null; let current = actor;
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, options) =>
    url.endsWith('/auth/login') ? json({ ...current, token }) : url.endsWith('/auth/session') ? json(current) : url.endsWith('/auth/logout') ? json({ ok: true }) : fetcher(url, options) }), storage });
  await controller.login({ loginNumber: '0008', password: 'synthetic' });
  return { controller, api: createNarrationManagementApi(controller), setActor: (value: NativeSession) => { current = value; } };
}
function memoryBackend() {
  let event: ReturnType<typeof rawEvent> | null = null; const calls: { path: string; method: string; body: unknown }[] = [];
  const fetch: NativeFetch = async (url, options) => {
    const path = new URL(url).pathname.replace('/api', ''); const method = options.method ?? 'GET'; const body: unknown = options.body ? JSON.parse(String(options.body)) : null;
    calls.push({ path, method, body });
    if (path === '/committees') return json([circle]);
    if (path === '/narration-events/preparation') return json([rawPupil]);
    if (path === '/narration-events/preparation-references') return json(rawReferences());
    if (path === '/narration-events/preparation-preview') return json(rawPreview());
    if (path === '/narration-events' && method === 'GET') return json(event ? [row(event)] : []);
    if (path === '/narration-events' && method === 'POST') { event = rawEvent(); return json({ ok: true, id: '6', studentsCount: 1, messageQueued: true }, 201); }
    if (path === '/narration-events/6/archive') { if (event) { event.status = 'archived'; event.students[0]!.archivedAt = '2026-10-14 12:30'; } return json({ ok: true, archivedAll: true, archivedStudents: 1 }); }
    if (path === '/narration-events/6' && method === 'DELETE') { event = null; return json({ ok: true }); }
    if (path === '/narration-events/6') return event ? json(event) : json({}, 404);
    if (path === '/narration-events/6/parts/11/ayahs') return json({ ayahs: [{ surah: 1, ayah: 1, textUthmani: 'بسم الله' }], wordMarks: [mark], pages: [] });
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  return { fetch, calls, seed: (value: ReturnType<typeof rawEvent> | null) => { event = value; }, get: () => event };
}

test('references and preparation pupils decode actual scoped DTO without a studentPlans grant', () => {
  assert.equal(decodeNarrationReferences(rawReferences()).chapters[0]!.ayahCount, 7);
  assert.equal(decodeNarrationPupils([rawPupil])[0]!.studentId, 2);
  assert.throws(() => decodeNarrationReferences({ ...rawReferences(), chapters: [{ ...rawReferences().chapters[0], ayahCount: 0 }] }), isCode('invalid-response'));
  assert.throws(() => decodeNarrationPupils([rawPupil, rawPupil]), isCode('invalid-response'));
});
test('manual range validation handles Arabic digits, actual chapter limits and ascending cross-surah bounds', () => {
  const references = decodeNarrationReferences(rawReferences());
  assert.deepEqual(normalizeNarrationRange({ startSurah: '١', startAyah: '١', endSurah: '۲', endAyah: '١٤١' }, references), { startSurah: 1, startAyah: 1, endSurah: 2, endAyah: 141 });
  for (const draft of [emptyNarrationRange(), { startSurah: '1', startAyah: '8', endSurah: '2', endAyah: '1' }, { startSurah: '2', startAyah: '1', endSurah: '1', endAyah: '1' }, { startSurah: '1', startAyah: '1.5', endSurah: '1', endAyah: '7' }])
    assert.throws(() => normalizeNarrationRange(draft, references), isCode('validation'));
});
test('all within a complex becomes explicit allowed committees and excludes other assignments', () => {
  const pupils = decodeNarrationPupils([rawPupil, { ...rawPupil, id: 7, committeeId: 4 }]);
  const draft = { ...newNarrationDraft(), ...payload, complexId: '4', committeeIds: ['all'], mode: 'manual' as const, assignments: { '2': [range], '7': [range] } };
  const normalized = normalizeNarrationDraft(draft, pupils, [circle, otherCircle], decodeNarrationReferences(rawReferences()));
  assert.deepEqual(normalized.committeeIds, [3]); assert.equal(normalized.scope, 'committee'); assert.deepEqual(normalized.assignments?.map(row => row.studentId), [2]);
  assert.deepEqual(scopedNarrationPupils(draft, pupils, [circle, otherCircle]).map(row => row.studentId), [2]);
});
test('creation rejects invalid dates, empty selections and excessive manual ranges before HTTP', () => {
  const initial = { ...newNarrationDraft(), name: 'سرد', startDate: payload.startDate, endDate: payload.endDate }; const pupils = decodeNarrationPupils([rawPupil]); const references = decodeNarrationReferences(rawReferences());
  for (const patch of [{ name: '' }, { startDate: '2026-02-30' }, { endDate: '2026-10-01' }, { committeeIds: ['99'] }, { mode: 'manual' as const }, { mode: 'manual' as const, assignments: { '2': Array.from({ length: 31 }, () => range) } }])
    assert.throws(() => normalizeNarrationDraft({ ...initial, ...patch }, pupils, [circle], references), isCode('validation'));
});
test('full preview preserves measured split, skipped pupils and source date cutoff', () => {
  const value = rawPreview(); const decoded = decodeNarrationPreview({ ...value, skippedStudents: [{ studentId: 5, name: 'دون محفوظ', committeeId: 3, committeeName: 'حلقة', reason: 'no-ranges' }] }, payload);
  assert.equal(decoded.students[0]!.juzParts[0]!.faces, 1); assert.equal(decoded.skippedStudents[0]!.studentId, 5); assert.equal(decoded.startDate, payload.startDate);
});
test('preview rejects inconsistent totals, duplicate pupils, foreign scoped pupils and mismatched mode', () => {
  const value = rawPreview();
  for (const patch of [{ students: [{ ...value.students[0], totalFaces: 2 }] }, { students: [...value.students, ...value.students] }, { mode: 'manual' },
    { scope: 'committee', committeeIds: [4] }, { endDate: '2026-10-01' }]) assert.throws(() => decodeNarrationPreview({ ...value, ...patch }, payload), isCode('invalid-response'));
});
test('manual preview never accepts students absent from reviewed assignments', () => {
  assert.throws(() => decodeNarrationPreview({ ...rawPreview(), mode: 'manual' }, { ...payload, mode: 'manual', assignments: [{ studentId: 7, ranges: [range] }] }), isCode('invalid-response'));
});
test('saved event decoding preserves null results, reciters, archived flags and historical markers', () => {
  const value = rawEvent(); value.students[0]!.parts[0]!.wordMarks = [mark]; value.students[0]!.reciterNames = ['مسمع']; value.students[0]!.archivedAt = '2026-10-14 12:30';
  const result = decodeNarrationEvent(value, 6); assert.equal(result.students[0]!.finalScore, null); assert.equal(result.students[0]!.parts[0]!.wordMarks[0]!.markType, 'lahn'); assert.deepEqual(result.students[0]!.reciterNames, ['مسمع']);
});
test('saved juz results average each juz once, retain partial results and do not weight by faces', () => {
  const value = rawEvent(); const first = value.students[0]!.parts[0]!; first.score = 80;
  value.students[0]!.parts.push({ ...first, id: '12', startAyah: 5, endAyah: 7, faces: 0.2 }, { ...first, id: '13', juzNumber: 2, score: 40, faces: 0.1 }, { ...first, id: '14', juzNumber: 3, score: null });
  const entry = decodeNarrationEvent(value).students[0]!; assert.equal(narrationGroups(entry).length, 3); assert.equal(narrationSavedOverall(entry), 60);
});
test('malformed event identities and malicious marker types fail closed', () => {
  assert.throws(() => decodeNarrationEvent(rawEvent(), 7), isCode('invalid-response')); assert.throws(() => decodeNarrationEvents([{ ...row(), status: 'deleted' }]), isCode('invalid-response'));
  const value = rawEvent(); value.students[0]!.parts[0]!.wordMarks = [{ ...mark, markType: '__proto__' }]; assert.throws(() => decodeNarrationEvent(value), isCode('invalid-response'));
  assert.throws(() => decodeNarrationEvent({ ...rawEvent(), students: [rawEntry(), rawEntry()] }), isCode('invalid-response'));
});
test('read-only reference decoding drops unrelated mushaf pages and rejects corrupt ayah text', () => {
  const result = decodeNarrationPartReference({ ayahs: [{ surah: 1, ayah: 1, textUthmani: 'بسم الله' }], wordMarks: [mark], pages: [{ ignored: true }] }); assert.equal(result.ayahs.length, 1);
  assert.throws(() => decodeNarrationPartReference({ ayahs: [{ surah: 1, ayah: 1, textUthmani: false }], wordMarks: [] }), isCode('invalid-response'));
});
test('Arabic roster filtering uses the shared normalization', () => { assert.equal(filterNarrationPupils(decodeNarrationPupils([rawPupil]), 'احمد موسى').length, 1); });
test('creation response is verified against exact scoped preview ranges and parts', () => {
  const event = decodeNarrationEvent(rawEvent()); const preview = decodeNarrationPreview(rawPreview(), payload); assert.equal(narrationEventMatchesPreview(event, payload, preview), true);
  event.students[0]!.parts[0]!.endAyah = 6; assert.equal(narrationEventMatchesPreview(event, payload, preview), false);
  assert.equal(narrationPreviewFingerprint(preview), narrationPreviewFingerprint(decodeNarrationPreview(rawPreview())));
});
test('narration-only admin loads new references and prep without Quran routes', async () => {
  const backend = memoryBackend(); const { api } = await setup(backend.fetch, { ...identity, role: 'admin', dashboardPermissions: ['narrationDay'] });
  const result = await api.loadPreparation(); assert.equal(result.references.chapters[0]!.name, 'الفاتحة'); assert.equal(result.pupils[0]!.studentId, 2);
  assert.ok(backend.calls.every(call => call.path.startsWith('/narration-events/')));
});
test('ungranted admin, supervisor and student never issue a narration HTTP request', async () => {
  for (const role of ['admin', 'supervisor', 'student'] as const) { let calls = 0; const { api } = await setup(async () => { calls++; return json([]); }, { ...identity, role, dashboardPermissions: [] });
    await assert.rejects(api.load(), isCode('forbidden')); await assert.rejects(api.loadPreparation(), isCode('forbidden')); assert.equal(calls, 0); }
});
test('fresh full preview is required immediately before create and successful response is read back', async () => {
  const backend = memoryBackend(); const { api } = await setup(backend.fetch); const result = await api.create(payload, decodeNarrationPreview(rawPreview(), payload));
  assert.equal(result.id, 6); assert.equal(result.messageQueued, true); assert.equal(api.hasUncertainOperation(), false);
  assert.deepEqual(backend.calls.map(call => `${call.method} ${call.path}`), ['POST /narration-events/preparation-preview', 'GET /narration-events', 'POST /narration-events', 'GET /narration-events/6']);
  assert.ok(!('delivered' in result));
});
test('changed memorized ranges or measured split reject known stale preview without inserting', async () => {
  const backend = memoryBackend(); const { api } = await setup(async (url, options) => url.endsWith('/preparation-preview') ? json({ ...rawPreview(), students: [] }) : backend.fetch(url, options));
  await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('conflict')); assert.equal(backend.calls.filter(call => call.method === 'POST' && call.path === '/narration-events').length, 0);
});
test('failed pre-create read does not create an uncertain operation or insert', async () => {
  let writes = 0; const { api } = await setup(async (url, options) => url.endsWith('/preparation-preview') ? json(rawPreview()) : url.endsWith('/narration-events') && options.method === 'GET' ? Promise.reject(new Error('offline')) : (writes++, json({ ok: true })));
  await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('network')); assert.equal(writes, 0); assert.equal(api.hasUncertainOperation(), false);
});
test('lost create response blocks retries across navigation and reconciles list plus actual detail', async () => {
  const backend = memoryBackend(); const { controller, api } = await setup(async (url, options) => { const response = await backend.fetch(url, options); if (url.endsWith('/narration-events') && options.method === 'POST') throw new Error('lost after save'); return response; });
  await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('network'));
  const secondApi = createNarrationManagementApi(controller); await assert.rejects(secondApi.create(payload, decodeNarrationPreview(rawPreview())), isCode('conflict'));
  const recovered = await secondApi.load(); assert.equal(recovered.reconciled?.kind, 'create'); assert.equal(recovered.reconciled?.eventId, 6); assert.match(recovered.reconciled!.message, /لم تُتحقق/);
  assert.equal(backend.calls.filter(call => call.method === 'POST' && call.path === '/narration-events').length, 1); assert.equal(secondApi.hasUncertainOperation(), false);
});
test('unknown create with absent or ambiguous outcome stays blocked after a read', async () => {
  const backend = memoryBackend(); const { api } = await setup(async (url, options) => { if (url.endsWith('/narration-events') && options.method === 'POST') throw new Error('unknown'); return backend.fetch(url, options); });
  await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('network')); await assert.rejects(api.load(), isCode('conflict')); assert.equal(api.hasUncertainOperation(), true);
  backend.seed({ ...rawEvent(), createdByName: 'حساب آخر' }); await assert.rejects(api.load(), isCode('conflict')); assert.equal(api.hasUncertainOperation(), true);
});
test('malformed create acknowledgement retains uncertainty until verified actual detail', async () => {
  const backend = memoryBackend(); const { api } = await setup(async (url, options) => { const response = await backend.fetch(url, options); return url.endsWith('/narration-events') && options.method === 'POST' ? json({ ok: true }) : response; });
  await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('invalid-response')); assert.equal(api.hasUncertainOperation(), true); assert.equal((await api.load()).reconciled?.kind, 'create');
});
test('confirmed server denials do not remain uncertain and never receive fallback payloads', async () => {
  for (const [status, code] of [[403, 'forbidden'], [404, 'not-found'], [409, 'conflict'], [422, 'validation']] as const) {
    const backend = memoryBackend(); const { api } = await setup(async (url, options) => url.endsWith('/narration-events') && options.method === 'POST' ? json({}, status) : backend.fetch(url, options));
    await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode(code)); assert.equal(api.hasUncertainOperation(), false);
  }
});
test('archiving requires a fresh unchanged snapshot and verifies the stored archived timestamp', async () => {
  const backend = memoryBackend(); backend.seed(rawEvent()); const { api } = await setup(backend.fetch); const source = await api.loadEvent(6);
  const result = await api.archive(source, 3); assert.equal(result.archivedAll, true); assert.ok(backend.get()!.students[0]!.archivedAt); assert.ok(!('sentCount' in result));
});
test('foreign circle and changed evaluation reject archive before POST', async () => {
  const backend = memoryBackend(); backend.seed(rawEvent()); const { api } = await setup(backend.fetch); const source = await api.loadEvent(6);
  await assert.rejects(api.archive(source, 999), isCode('validation')); backend.get()!.students[0]!.parts[0]!.score = 10;
  await assert.rejects(api.archive(source, null), isCode('conflict')); assert.equal(backend.calls.filter(call => call.path.endsWith('/archive')).length, 0);
});
test('lost archive response reconciles actual target timestamps without submitting again', async () => {
  const backend = memoryBackend(); backend.seed(rawEvent()); const { api } = await setup(async (url, options) => { const response = await backend.fetch(url, options); if (url.endsWith('/archive')) throw new Error('lost'); return response; });
  await assert.rejects(api.archive(await api.loadEvent(6), null), isCode('network')); assert.equal(api.hasUncertainOperation(), true);
  assert.equal((await api.load()).reconciled?.kind, 'archive'); assert.equal(backend.calls.filter(call => call.path.endsWith('/archive')).length, 1);
});
test('delete is restricted to archived events and verifies both list disappearance and 404 detail', async () => {
  const backend = memoryBackend(); backend.seed(rawEvent()); const { api } = await setup(backend.fetch); await assert.rejects(api.deleteArchive(await api.loadEvent(6)), isCode('validation'));
  backend.get()!.status = 'archived'; backend.get()!.students[0]!.archivedAt = '2026-10-14 12:30'; await api.deleteArchive(await api.loadEvent(6));
  assert.equal(backend.get(), null); assert.equal(api.hasUncertainOperation(), false); assert.equal(backend.calls.filter(call => call.method === 'DELETE').length, 1);
});
test('lost delete response reconciles only disappearance from list AND authorized not-found detail', async () => {
  const backend = memoryBackend(); const archived = rawEvent(); archived.status = 'archived'; backend.seed(archived);
  const { api } = await setup(async (url, options) => { const response = await backend.fetch(url, options); if (options.method === 'DELETE') throw new Error('lost'); return response; });
  await assert.rejects(api.deleteArchive(await api.loadEvent(6)), isCode('network')); assert.equal((await api.load()).reconciled?.kind, 'delete'); assert.equal(backend.calls.filter(call => call.method === 'DELETE').length, 1);
});
test('part references reject injected IDs before HTTP and remain read only', async () => {
  const backend = memoryBackend(); backend.seed(rawEvent()); const { api } = await setup(backend.fetch); const event = await api.loadEvent(6); const count = backend.calls.length;
  await assert.rejects(api.loadPartReference(event, 99), isCode('validation')); assert.equal(backend.calls.length, count);
  assert.equal((await api.loadPartReference(event, 11)).wordMarks[0]!.markType, 'lahn'); assert.equal(backend.calls.at(-1)!.method, 'GET');
});
test('grant revocation while reference request is in flight discards the response', async () => {
  const actor = { ...identity, role: 'admin' as const, dashboardPermissions: ['narrationDay'] }; let release: (() => void) | undefined;
  const { api, controller, setActor } = await setup(async () => { await new Promise<void>(resolve => { release = resolve; }); return json(rawEvent()); }, actor);
  const request = api.loadEvent(6); setActor({ ...actor, dashboardPermissions: [] }); await controller.restore(); release!();
  await assert.rejects(request, isCode('cancelled')); await assert.rejects(api.load(), isCode('forbidden'));
});
test('old services reject account and tenant changes even after a new successful login', async () => {
  const backend = memoryBackend(); const { api, controller, setActor } = await setup(backend.fetch); await controller.logout();
  setActor({ ...identity, id: 9, complex: { ...identity.complex, registrationNumber: 'other-fixture' } }); await controller.login({ loginNumber: '0009', password: 'synthetic' });
  await assert.rejects(api.loadPreparation(), isCode('cancelled')); assert.equal(backend.calls.length, 0);
});
test('invalid ID in a create acknowledgement is an unknown response, not a confirmed validation denial', async () => {
  const backend = memoryBackend(); const { api } = await setup(async (url, options) => { const response = await backend.fetch(url, options);
    return url.endsWith('/narration-events') && options.method === 'POST' ? json({ ok: true, id: 'bad', studentsCount: 1, messageQueued: true }) : response; });
  await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('invalid-response')); assert.equal(api.hasUncertainOperation(), true);
  assert.equal((await api.load()).reconciled?.eventId, 6);
});
test('partial circle archive keeps other circles open and verifies only the selected target', async () => {
  const backend = memoryBackend(); const value = rawEvent(); value.students.push({ ...rawEntry(), id: '10', studentId: '7', committeeId: '4', parts: [{ ...rawPart(), id: '12' }] }); backend.seed(value);
  const { api } = await setup(async (url, options) => { if (url.endsWith('/archive')) { backend.get()!.students[0]!.archivedAt = '2026-10-14 12:30'; return json({ ok: true, archivedAll: false, archivedStudents: 1 }); }
    return backend.fetch(url, options); });
  const result = await api.archive(await api.loadEvent(6), 3); assert.equal(result.archivedAll, false); assert.equal(backend.get()!.status, 'open'); assert.equal(backend.get()!.students[1]!.archivedAt, null);
});
test('unconfirmed archive remains locked if a read shows no archived target', async () => {
  const backend = memoryBackend(); backend.seed(rawEvent()); const { api } = await setup(async (url, options) => url.endsWith('/archive') ? Promise.reject(new Error('unknown')) : backend.fetch(url, options));
  await assert.rejects(api.archive(await api.loadEvent(6), null), isCode('network')); await assert.rejects(api.load(), isCode('conflict')); assert.equal(api.hasUncertainOperation(), true);
});
test('list disappearance with forbidden detail never confirms deletion or permits retry', async () => {
  const backend = memoryBackend(); const value = rawEvent(); value.status = 'archived'; backend.seed(value); let denied = false;
  const { api } = await setup(async (url, options) => { if (denied && url.endsWith('/narration-events/6')) return json({}, 403);
    const response = await backend.fetch(url, options); if (options.method === 'DELETE') { denied = true; throw new Error('lost'); } return response; });
  await assert.rejects(api.deleteArchive(await api.loadEvent(6)), isCode('network')); await assert.rejects(api.load(), isCode('forbidden')); assert.equal(api.hasUncertainOperation(), true);
});
test('simultaneous create calls never submit a second writer while preview is pending', async () => {
  const backend = memoryBackend(); let release: (() => void) | undefined; const { api } = await setup(async (url, options) => {
    if (url.endsWith('/preparation-preview')) await new Promise<void>(resolve => { release = resolve; }); return backend.fetch(url, options); });
  const first = api.create(payload, decodeNarrationPreview(rawPreview())); await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('conflict'));
  release!(); await first; assert.equal(backend.calls.filter(call => call.method === 'POST' && call.path === '/narration-events').length, 1);
});
test('a zero-student preview is readable but cannot create an inaccessible empty event', async () => {
  for (const role of ['manager', 'admin', 'supervisor'] as const) {
    const backend = memoryBackend(); const empty = { ...rawPreview(), students: [] };
    const { api } = await setup(async (url, options) => url.endsWith('/preparation-preview') ? json(empty) : backend.fetch(url, options), { ...identity, role, dashboardPermissions: ['narrationDay'] });
    const preview = await api.preview(payload); assert.equal(preview.students.length, 0);
    await assert.rejects(api.create(payload, preview), /لا يوجد طلاب بمحفوظ/); assert.equal(api.hasUncertainOperation(), false);
    assert.equal(backend.calls.filter(call => call.method === 'POST' && call.path === '/narration-events').length, 0);
  }
});
test('in-memory drafts survive navigation, are copied and never cross actor or tenant scopes', async () => {
  const backend = memoryBackend(); const { api, controller, setActor } = await setup(backend.fetch);
  const draft = { ...newNarrationDraft(), name: 'مسودة', assignments: { '2': [range] } }; api.keepDraft(draft);
  draft.assignments['2'][0] = { ...range, endAyah: 6 };
  const restored = createNarrationManagementApi(controller).readDraft(); assert.equal(restored.assignments['2']![0]!.endAyah, 7); assert.equal(restored.name, 'مسودة');
  await controller.logout(); setActor({ ...identity, id: 9 }); await controller.login({ loginNumber: '0009', password: 'synthetic' });
  assert.equal(createNarrationManagementApi(controller).readDraft().name, ''); await assert.rejects(api.loadPreparation(), isCode('cancelled'));
});
test('lost create keeps the write-time creator name through a same-account rename and navigation', async () => {
  const backend = memoryBackend(); const { controller, api, setActor } = await setup(async (url, options) => {
    const response = await backend.fetch(url, options); if (url.endsWith('/narration-events') && options.method === 'POST') throw new Error('lost after save'); return response;
  });
  await assert.rejects(api.create(payload, decodeNarrationPreview(rawPreview())), isCode('network'));
  setActor({ ...identity, name: 'اسم الحساب الجديد' }); await controller.restore();
  assert.equal(controller.getSnapshot().session!.id, identity.id); assert.equal(controller.getSnapshot().session!.name, 'اسم الحساب الجديد');
  const restoredApi = createNarrationManagementApi(controller); const result = await restoredApi.load();
  assert.equal(result.reconciled?.kind, 'create'); assert.equal(result.reconciled?.eventId, 6); assert.equal(restoredApi.hasUncertainOperation(), false);
  assert.equal(backend.get()!.createdByName, identity.name); assert.equal(backend.calls.filter(call => call.method === 'POST' && call.path === '/narration-events').length, 1);
});
