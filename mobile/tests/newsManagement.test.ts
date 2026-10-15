import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSession, type NativeRole, type NativeSession, type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { decodeNewsCommittees, decodeNewsConfiguration, emptyNewsDraft, newsAudienceLabel, newsDisplayStatus, newsDraft, normalizeNewsEntries,
  normalizeNewsEntry, validateNewsImage, type NewsConfiguration, type NewsEntry } from '../src/domain/newsManagement';
import { createNewsManagementApi } from '../src/services/newsManagementApi';
import { NativeApiError, type NativeApi, type NativeApiRequestOptions } from '../src/services/nativeApi';

const manager: NativeSession = { role: 'manager', id: 7, name: 'NewsFixture', dashboardPermissions: [], complex: { registrationNumber: 'native-news-fixture', name: 'Fixture' } };
const entry: NewsEntry = { id: 'fixture-entry', title: 'خبر تجريبي', body: 'نص الخبر', textColor: '#123456', image: '', startsAt: '2026-10-15T00:00', endsAt: '2026-10-16T23:59', committeeIds: [10], enabled: true };
const png = 'data:image/png;base64,iVBORw0KGgoA', webp = 'data:image/webp;base64,UklGRgAAAABXRUJQ';
const code = (expected: string) => (cause: unknown) => cause instanceof NativeApiError && cause.code === expected;
interface Call { path: string; method: string; body: unknown }
interface State { config: NewsConfiguration; committees: { id: number; name: string }[] }
async function fixture(role: NativeRole = 'manager', permissions: string[] = [], hook?: (call: Call, state: State) => unknown | Promise<unknown>) {
  let actor: NativeSession = { ...manager, role, dashboardPermissions: permissions }, stored: StoredNativeSession | null = null;
  const calls: Call[] = [], state: State = { config: { entries: [{ ...entry }], revision: 4 }, committees: [{ id: 10, name: 'حلقة أ' }, { id: 11, name: 'حلقة ب' }] };
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const api: NativeApi = {
    baseUrl: 'https://news-fixture.invalid/api', login: async () => ({ ...actor, token: 'a'.repeat(64) }), session: async () => actor, logout: async () => {},
    async request<T>(path: string, options?: NativeApiRequestOptions, decode?: (value: unknown) => T): Promise<T> {
      const call = { path, method: options?.method ?? 'GET', body: options?.body }; calls.push(call);
      let response = await hook?.(call, state);
      if (response === undefined) {
        if (path === '/student-news/manage' && call.method === 'GET') response = state.config;
        else if (path === '/student-news/audience') response = state.committees;
        else if (path === '/student-news/manage' && call.method === 'PUT') {
          const body = options?.body as NewsConfiguration; if (body.revision !== state.config.revision) throw new NativeApiError('conflict', 409);
          state.config = { entries: normalizeNewsEntries(body.entries), revision: body.revision + 1 }; response = state.config;
        } else throw new Error('Unexpected fixture route');
      }
      return decode ? decode(structuredClone(response)) : structuredClone(response) as T;
    },
  };
  const controller = createNativeSession({ api, storage });
  await controller.login({ loginNumber: '940001', password: '', registrationNumber: actor.complex.registrationNumber });
  return { controller, state, calls, change: async (next: NativeSession) => { actor = next; await controller.login({ loginNumber: '940001', password: '', registrationNumber: next.complex.registrationNumber }); },
    grants: async (permissions: string[]) => { actor = { ...actor, dashboardPermissions: permissions }; await controller.restore(); } };
}
const target = (config: NewsConfiguration, patch: Partial<NewsEntry> = { title: 'خبر معدل' }): readonly NewsEntry[] => config.entries.map(row => ({ ...row, ...patch }));

test('news DTO keeps all supported fields, color, dates and legacy targets', () => {
  const config = decodeNewsConfiguration({ entries: [{ ...entry, image: png, legacyStudentIds: [21] }], revision: 3 });
  assert.equal(config.entries[0]?.textColor, '#123456'); assert.deepEqual(config.entries[0]?.legacyStudentIds, [21]); assert.ok(Object.isFrozen(config.entries));
  assert.equal(newsAudienceLabel(config.entries[0]!, [{ id: 10, name: 'حلقة أ' }]), 'تخصيص سابق');
});
test('date-only boundaries match start of day and inclusive end of day', () => {
  const row = normalizeNewsEntry({ ...entry, startsAt: '2026-10-15', endsAt: '2026-10-16' });
  assert.equal(row.startsAt, '2026-10-15T00:00'); assert.equal(row.endsAt, '2026-10-16T23:59');
  assert.equal(newsDisplayStatus(row, '2026-10-16T23:59'), 'معروض'); assert.equal(newsDisplayStatus(row, '2026-10-17T00:00'), 'انتهى العرض');
  assert.equal(newsDisplayStatus(row, '2026-10-14T23:59'), 'مجدول'); assert.equal(newsDisplayStatus({ ...row, enabled: false }), 'مخفي');
});
test('new draft uses existing Riyadh and Hijri-month defaults; editor preserves legacy until explicit save', () => {
  const draft = emptyNewsDraft('new-entry'); assert.match(draft.startsAt, /^\d{4}-\d{2}-\d{2}$/); assert.ok(draft.endsAt >= draft.startsAt);
  assert.equal(draft.textColor, '#000000'); assert.deepEqual(newsDraft({ ...entry, legacyStudentIds: [21] }).legacyStudentIds, [21]);
});
test('news allows eight independent entries and rejects nine and duplicate ids', () => {
  assert.equal(normalizeNewsEntries(Array.from({ length: 8 }, (_, index) => ({ ...entry, id: `entry-${index}` }))).length, 8);
  for (const rows of [Array.from({ length: 9 }, (_, index) => ({ ...entry, id: `entry-${index}` })), [entry, entry]]) assert.throws(() => normalizeNewsEntries(rows), code('validation'));
});
for (const patch of [{ title: '' }, { title: 'a'.repeat(81) }, { body: 5 }, { body: 'a'.repeat(2001) }, { textColor: 'red' }, { id: '../news' }, { startsAt: '2026-02-30' }, { endsAt: '2026-10-14' }, { startsAt: '2026-10-15T25:00' }, { committeeIds: [0] }, { committeeIds: [10, 10] }, { enabled: 1 }]) {
  test(`invalid news input rejected: ${Object.keys(patch)[0]} ${JSON.stringify(patch).slice(0, 45)}`, () => assert.throws(() => normalizeNewsEntry({ ...entry, ...patch }), code('validation')));
}
test('image validation uses the news limit, accepts over one MiB, rejects spoofed type and five MiB overflow', () => {
  assert.equal(validateNewsImage(''), ''); assert.equal(validateNewsImage(png), png); assert.equal(validateNewsImage(webp), webp);
  assert.ok(validateNewsImage(png + 'A'.repeat(2 * 1024 * 1024)).length > 1024 * 1024);
  for (const source of ['https://fixture.invalid/x.png', png.replace('image/png', 'image/jpeg'), png + 'A'.repeat(7_000_000)]) assert.throws(() => validateNewsImage(source));
});
test('malformed management responses never become empty or usable data', () => {
  for (const value of [null, {}, { entries: [], revision: '4' }, { entries: [], revision: -1 }, { entries: [entry, entry], revision: 1 }]) assert.throws(() => decodeNewsConfiguration(value), code('invalid-response'));
  assert.deepEqual(decodeNewsCommittees([{ id: '10', name: 'حلقة' }]), [{ id: 10, name: 'حلقة' }]);
  for (const value of [null, [null], [{ id: true, name: 'حلقة' }], [{ id: '1e1', name: 'حلقة' }], [{ id: 10, name: '' }], [{ id: 10, name: 'أ' }, { id: 10, name: 'ب' }]]) assert.throws(() => decodeNewsCommittees(value), code('invalid-response'));
});
for (const role of ['manager', 'admin', 'supervisor'] as const) test(`${role} reads management with settings grant`, async () => {
  const f = await fixture(role, role === 'manager' ? [] : ['settings']), api = createNewsManagementApi(f.controller), data = await api.load();
  assert.equal(data.entries.length, 1); assert.equal(data.revision, 4); assert.equal(data.committees.length, 2); assert.equal(data.scopeKey, api.scopeKey());
});
for (const role of ['student', 'admin', 'supervisor'] as const) test(`${role} cannot bypass missing settings grant`, async () => {
  const f = await fixture(role, role === 'student' ? ['settings'] : ['store']); assert.throws(() => createNewsManagementApi(f.controller), code('forbidden')); assert.equal(f.calls.length, 0);
});
test('create, edit, hide, restore and delete use atomic revision and exact readback', async () => {
  const f = await fixture(), api = createNewsManagementApi(f.controller);
  await api.saveEntries({ entries: [...f.state.config.entries, { ...entry, id: 'created', title: 'خبر جديد', committeeIds: [] }], expected: f.state.config });
  await api.saveEntries({ entries: target(f.state.config), expected: f.state.config });
  await api.saveEntries({ entries: target(f.state.config, { enabled: false }), expected: f.state.config });
  await api.saveEntries({ entries: target(f.state.config, { enabled: true }), expected: f.state.config });
  await api.saveEntries({ entries: [], expected: f.state.config });
  assert.equal(f.state.config.revision, 9); assert.equal(f.state.config.entries.length, 0); assert.equal(api.hasUncertainOperation(), false);
  assert.deepEqual(f.calls.filter(row => row.method === 'PUT').map(row => (row.body as NewsConfiguration).revision), [4, 5, 6, 7, 8]);
});
test('server-normalized image acknowledgement is verified by exact subsequent read', async () => {
  const f = await fixture('manager', [], (call, state) => {
    if (call.method !== 'PUT') return; const body = call.body as NewsConfiguration;
    state.config = { revision: body.revision + 1, entries: body.entries.map(row => ({ ...row, image: webp })) }; return state.config;
  }), api = createNewsManagementApi(f.controller);
  await api.saveEntries({ entries: target(f.state.config, { image: png }), expected: f.state.config }); assert.equal(f.state.config.entries[0]?.image, webp); assert.equal(api.hasUncertainOperation(), false);
});
test('unchanged legacy target is retained; explicit editor payload removes it', async () => {
  const f = await fixture(), api = createNewsManagementApi(f.controller); f.state.config = { ...f.state.config, entries: [{ ...entry, legacyStudentIds: [21] }] };
  await api.saveEntries({ entries: target(f.state.config, { enabled: false }), expected: f.state.config }); assert.deepEqual(f.state.config.entries[0]?.legacyStudentIds, [21]);
  const edited = { ...f.state.config.entries[0]!, title: 'تحرير صريح' }; delete edited.legacyStudentIds;
  await api.saveEntries({ entries: [edited], expected: f.state.config }); assert.equal(f.state.config.entries[0]?.legacyStudentIds, undefined);
});
test('new legacy ids and unknown committees cause no PUT', async () => {
  const f = await fixture(), api = createNewsManagementApi(f.controller);
  await assert.rejects(api.saveEntries({ entries: target(f.state.config, { legacyStudentIds: [99] }), expected: f.state.config }), code('validation'));
  await assert.rejects(api.saveEntries({ entries: target(f.state.config, { committeeIds: [999] }), expected: f.state.config }), code('validation'));
  assert.equal(f.calls.filter(row => row.method === 'PUT').length, 0);
});
test('clearing a legacy target must omit its property rather than sending a misleading empty list', async () => {
  const f = await fixture(), api = createNewsManagementApi(f.controller); f.state.config = { ...f.state.config, entries: [{ ...entry, legacyStudentIds: [21] }] };
  await assert.rejects(api.saveEntries({ entries: target(f.state.config, { legacyStudentIds: [] }), expected: f.state.config }), code('validation'));
  assert.equal(f.calls.filter(row => row.method === 'PUT').length, 0); assert.equal(api.hasUncertainOperation(), false);
});
test('stale expected revision or data cannot overwrite another editor', async () => {
  const f = await fixture(), api = createNewsManagementApi(f.controller), expected = f.state.config; f.state.config = { ...expected, revision: 5 };
  await assert.rejects(api.saveEntries({ entries: target(expected), expected }), code('conflict')); assert.equal(f.calls.filter(row => row.method === 'PUT').length, 0);
  f.state.config = { ...expected, entries: [{ ...entry, title: 'تعديل متزامن' }] };
  await assert.rejects(api.saveEntries({ entries: target(expected), expected }), code('conflict')); assert.equal(api.hasUncertainOperation(), false);
});
for (const status of [403, 409, 413, 422]) test(`explicit HTTP ${status} leaves no uncertain request and dispatches only once`, async () => {
  const f = await fixture('manager', [], call => { if (call.method === 'PUT') throw new NativeApiError(status === 403 ? 'forbidden' : 'conflict', status); }), api = createNewsManagementApi(f.controller);
  await assert.rejects(api.saveEntries({ entries: target(f.state.config), expected: f.state.config })); assert.equal(api.hasUncertainOperation(), false); assert.equal(f.calls.filter(row => row.method === 'PUT').length, 1);
});
test('lost successful PUT reconciles revision and exact content after API remount without repeating mutation', async () => {
  const f = await fixture('manager', [], (call, state) => {
    if (call.method !== 'PUT') return; const body = call.body as NewsConfiguration;
    state.config = { entries: normalizeNewsEntries(body.entries), revision: body.revision + 1 }; throw new NativeApiError('timeout');
  }), api = createNewsManagementApi(f.controller), expected = f.state.config;
  await assert.rejects(api.saveEntries({ entries: target(expected), expected }), code('timeout')); assert.equal(api.hasUncertainOperation(), true);
  const remounted = createNewsManagementApi(f.controller); assert.equal(remounted.hasUncertainOperation(), true);
  await assert.rejects(remounted.saveEntries({ entries: target(expected), expected }), code('conflict'));
  assert.equal((await remounted.load()).uncertainOperation, false); assert.equal(f.calls.filter(row => row.method === 'PUT').length, 1);
});
test('unknown result with unchanged revision remains blocked, including remount', async () => {
  const f = await fixture('manager', [], call => { if (call.method === 'PUT') throw new NativeApiError('network'); }), api = createNewsManagementApi(f.controller), expected = f.state.config;
  await assert.rejects(api.saveEntries({ entries: target(expected), expected }), code('network')); assert.equal((await api.load()).uncertainOperation, true);
  await assert.rejects(createNewsManagementApi(f.controller).saveEntries({ entries: target(expected), expected }), code('conflict')); assert.equal(f.calls.filter(row => row.method === 'PUT').length, 1);
});
test('unknown transformed image never gets confirmed by unrelated matching text or arbitrary revision', async () => {
  const f = await fixture('manager', [], (call, state) => {
    if (call.method !== 'PUT') return; const body = call.body as NewsConfiguration;
    state.config = { entries: body.entries.map(row => ({ ...row, image: webp })), revision: body.revision + 1 }; throw new NativeApiError('network');
  }), api = createNewsManagementApi(f.controller), expected = f.state.config;
  await assert.rejects(api.saveEntries({ entries: target(expected, { image: png }), expected }), code('network')); assert.equal((await api.load()).uncertainOperation, true);
  f.state.config = { entries: target(expected, { image: png }), revision: 6 }; assert.equal((await api.load()).uncertainOperation, true);
  assert.equal(f.calls.filter(row => row.method === 'PUT').length, 1);
});
test('double press and recreated API cannot dispatch a second mutation while preflight runs', async () => {
  let release!: () => void, waiting = true; const gate = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture('manager', [], async call => { if (waiting && call.path === '/student-news/manage' && call.method === 'GET') { waiting = false; await gate; } });
  const api = createNewsManagementApi(f.controller), expected = f.state.config, first = api.saveEntries({ entries: target(expected), expected });
  await assert.rejects(createNewsManagementApi(f.controller).saveEntries({ entries: target(expected), expected }), code('conflict'));
  await assert.rejects(api.load(), code('conflict')); release(); await first; assert.equal(f.calls.filter(row => row.method === 'PUT').length, 1);
});
test('account and tenant change invalidate prior API before any new protected request', async () => {
  const f = await fixture(), api = createNewsManagementApi(f.controller); await f.change({ ...manager, id: 8, complex: { ...manager.complex, registrationNumber: 'other-news-fixture' } });
  await assert.rejects(api.load(), code('cancelled')); await assert.rejects(api.saveEntries({ entries: [], expected: f.state.config }), code('cancelled')); assert.equal(f.calls.length, 0);
  const other = createNewsManagementApi(f.controller); assert.notEqual(other.scopeKey(), api.scopeKey());
});
test('revoked settings grant blocks load and save without outbound requests', async () => {
  const f = await fixture('admin', ['settings']), api = createNewsManagementApi(f.controller); await f.grants([]);
  await assert.rejects(api.load(), code('forbidden')); await assert.rejects(api.saveEntries({ entries: [], expected: f.state.config }), code('forbidden')); assert.equal(f.calls.length, 0);
});
test('late preflight result after grant revocation never sends PUT', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture('admin', ['settings'], async call => { if (call.path === '/student-news/manage') await gate; }), api = createNewsManagementApi(f.controller);
  const operation = api.saveEntries({ entries: [], expected: f.state.config }); await f.grants([]); release();
  await assert.rejects(operation); assert.equal(f.calls.filter(row => row.method === 'PUT').length, 0); assert.equal(api.hasUncertainOperation(), false);
});
test('late dispatched response after account switch is hidden and cannot mutate another scope', async () => {
  let release!: () => void, entered!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), dispatch = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture('manager', [], async (call, state) => { if (call.method === 'PUT') { entered(); await gate; const body = call.body as NewsConfiguration; state.config = { entries: body.entries, revision: body.revision + 1 }; return state.config; } });
  const api = createNewsManagementApi(f.controller), operation = api.saveEntries({ entries: target(f.state.config), expected: f.state.config }); await dispatch;
  await f.change({ ...manager, id: 8 }); release(); await assert.rejects(operation, code('cancelled')); assert.equal(api.hasUncertainOperation(), true);
  assert.equal(createNewsManagementApi(f.controller).hasUncertainOperation(), false); assert.equal(f.calls.filter(row => row.method === 'PUT').length, 1);
});
test('acknowledged response with altered fields or failed readback is not reported verified', async () => {
  const f = await fixture('manager', [], (call, state) => { if (call.method === 'PUT') return { entries: state.config.entries, revision: 5 }; }), api = createNewsManagementApi(f.controller);
  await assert.rejects(api.saveEntries({ entries: target(f.state.config), expected: f.state.config }), code('invalid-response')); assert.equal(api.hasUncertainOperation(), true);
});
