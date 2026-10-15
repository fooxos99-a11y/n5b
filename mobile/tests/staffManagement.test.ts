import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPERVISOR_BASE_PERMISSIONS } from '../../shared/dashboard-permissions.js';
import type { ManagedCircle } from '../src/domain/management';
import { createNativeSession, type NativeSession, type NativeSessionController, type NativeSessionSnapshot,
  type SessionStorage, type StoredNativeSession } from '../src/domain/nativeSession';
import { emptyStaffDraft, filterManagedStaff, normalizeStaffDraft, requireStaffManagementScope, staffDraft,
  staffFixedPermissions, staffPermissions, type ManagedStaff } from '../src/domain/staffManagement';
import { createNativeApi, NativeApiError, type NativeFetch } from '../src/services/nativeApi';
import { createStaffManagementApi, decodeManagedStaff } from '../src/services/staffManagementApi';

const circle: ManagedCircle = { id: 3, name: 'حلقة أ', complexId: 4, complexName: 'مجمع أ', points: 0, studentsCount: 0 };
const secondCircle: ManagedCircle = { ...circle, id: 6, complexId: 7, name: 'حلقة ب', complexName: 'مجمع ب' };
const supervisor: ManagedStaff = { id: 2, name: 'أحمد مُوسى', loginNumber: '0002', nationalId: '', phone: '', jobTitle: 'مشرف المسار',
  role: 'supervisor', committeeIds: [3], permissions: ['students'] };
const administrator: ManagedStaff = { ...supervisor, id: 9, role: 'admin', jobTitle: 'إداري', committeeIds: [] };
const identity: NativeSession = { role: 'manager', id: 8, name: 'مدير اختبار', dashboardPermissions: [],
  complex: { name: 'جهة', registrationNumber: 'native-fixture' } };
const delegate: NativeSession = { ...identity, role: 'admin', dashboardPermissions: ['supervisors', 'administrators', 'students'] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const token = 'a'.repeat(64);
const draft = () => ({ ...emptyStaffDraft(), name: '  أحمد   موسى ', loginNumber: '٠٠٠٢', password: '  ', committeeIds: ['3'], permissions: ['students'] });
const isCode = (code: string) => (error: unknown) => error instanceof NativeApiError && error.code === code;
async function setup(fetcher: NativeFetch, actor = identity) {
  let stored: StoredNativeSession | null = null;
  const storage: SessionStorage = { load: async () => stored, save: async value => { stored = value; }, clear: async () => { stored = null; } };
  const controller = createNativeSession({ api: createNativeApi({ baseUrl: 'https://example.invalid/api', fetch: async (url, options) =>
    url.endsWith('/auth/login') ? json({ ...actor, token }) : fetcher(url, options) }), storage });
  await controller.login({ loginNumber: '0008', password: 'synthetic' }); return controller;
}
function mutableController(actor: NativeSession, handle: (path: string, body: unknown) => Promise<unknown>) {
  let snapshot: NativeSessionSnapshot = { status: 'authenticated', session: actor, error: null };
  const controller: NativeSessionController = {
    getSnapshot: () => snapshot, subscribe: () => () => {}, login: async () => {}, restore: async () => {}, cancel: () => {},
    logout: async () => { snapshot = { status: 'signed-out', session: null, error: null }; return { localCleared: true, serverRevoked: true, error: null }; },
    async request<T>(path: string, options?: Parameters<NativeSessionController['request']>[1], decode?: (value: unknown) => T): Promise<T> {
      const value = await handle(path, options?.body); return decode ? decode(value) : value as T;
    },
  };
  return { controller, change: (next: NativeSession | null) => { snapshot = { status: next ? 'authenticated' : 'signed-out', session: next, error: null }; } };
}

test('staff account input preserves zero-prefixed Arabic/Persian login numbers and exact passwords', () => {
  const payload = normalizeStaffDraft('supervisors', { ...draft(), loginNumber: '۰۰۰۲', phone: '+٩٦٦ ٥٠١-٢٣٤-٥٦٧', nationalId: '١٠٠٠٠٠٠٠٠٢' }, [circle]);
  assert.equal(payload.name, 'أحمد موسى'); assert.equal(payload.loginNumber, '0002'); assert.equal(payload.password, '  ');
  assert.equal(payload.phone, '966501234567'); assert.equal(payload.nationalId, '1000000002');
  assert.deepEqual(payload.committeeIds, [3]); assert.equal('role' in payload, false);
});
test('staff editing leaves password absent when blank and allows optional contact fields', () => {
  const editing = normalizeStaffDraft('supervisors', { ...draft(), password: '' }, [circle], true);
  assert.equal('password' in editing, false); assert.equal(editing.phone, ''); assert.equal(editing.nationalId, '');
  assert.equal(normalizeStaffDraft('supervisors', { ...draft(), password: ' new secret ' }, [circle], true).password, ' new secret ');
  assert.throws(() => normalizeStaffDraft('supervisors', { ...draft(), password: '' }, [circle]), isCode('validation'));
  assert.equal(staffDraft(supervisor).password, ''); assert.deepEqual(staffDraft(supervisor).committeeIds, ['3']);
});
test('staff accounts enforce server lengths and login minimum of three digits', () => {
  for (const partial of [{ name: 'س' }, { name: 'x'.repeat(181) }, { loginNumber: '01' }, { loginNumber: '12x' },
    { loginNumber: '0'.repeat(81) }, { password: 'x'.repeat(257) }, { phone: '12' }, { phone: 'phone' },
    { nationalId: '123' }, { nationalId: '١٠٠٠٠٠٠٠٠x' }]) {
    assert.throws(() => normalizeStaffDraft('supervisors', { ...draft(), ...partial }, [circle]));
  }
  assert.equal(normalizeStaffDraft('supervisors', { ...draft(), loginNumber: '000' }, [circle]).loginNumber, '000');
});
test('administrator names, job titles and permission rules use the existing account contract', () => {
  const payload = normalizeStaffDraft('administrators', { ...draft(), jobTitle: '  مسؤول المتابعة  ', permissions: ['grades', 'quranEvaluation', 'students'] }, []);
  assert.equal(payload.jobTitle, 'مسؤول المتابعة'); assert.equal('committeeIds' in payload, false);
  assert.deepEqual(payload.permissions, ['weeklySession', 'trackSession', 'students']);
  assert.equal(normalizeStaffDraft('administrators', { ...draft(), jobTitle: '  ' }, []).jobTitle, 'إداري');
  assert.throws(() => normalizeStaffDraft('administrators', { ...draft(), jobTitle: 'x'.repeat(121) }, []), isCode('validation'));
  assert.throws(() => normalizeStaffDraft('administrators', { ...draft(), permissions: ['invented'] }, []), isCode('validation'));
});
test('supervisor links allow no circles, deduplicate IDs, and reject stale or unsafe circles', () => {
  assert.deepEqual(normalizeStaffDraft('supervisors', { ...draft(), committeeIds: [] }, []).committeeIds, []);
  assert.deepEqual(normalizeStaffDraft('supervisors', { ...draft(), committeeIds: ['3', '6', '3'] }, [circle, secondCircle]).committeeIds, [3, 6]);
  for (const committeeIds of [['9'], ['-1'], ['0'], ['NaN'], ['9007199254740992']]) {
    assert.throws(() => normalizeStaffDraft('supervisors', { ...draft(), committeeIds }, [circle]), isCode('validation'));
  }
});
test('supervisor base grants stay fixed for display and are not silently added to the payload', () => {
  assert.deepEqual(staffFixedPermissions('supervisors'), SUPERVISOR_BASE_PERMISSIONS);
  assert.deepEqual(staffFixedPermissions('administrators'), []);
  assert.deepEqual(normalizeStaffDraft('supervisors', { ...draft(), permissions: [] }, [circle]).permissions, []);
  assert.deepEqual(staffPermissions('administrators', ['quranEvaluation', 'grades']), ['weeklySession', 'trackSession']);
});
test('staff search covers Arabic spelling, account contacts and assigned or unassigned circles', () => {
  const other = { ...supervisor, id: 11, name: 'طالب آخر', loginNumber: '0011', phone: '966501234567', committeeIds: [] };
  assert.deepEqual(filterManagedStaff([supervisor, other], 'احمد موسي', '3'), [supervisor]);
  assert.deepEqual(filterManagedStaff([supervisor, other], '', 'none'), [other]);
  assert.deepEqual(filterManagedStaff([supervisor, other], '0011'), [other]);
  assert.deepEqual(filterManagedStaff([supervisor, other], '1234567'), [other]);
  assert.equal(filterManagedStaff([supervisor], 'أحمد', '6').length, 0);
});
test('delegated scope permits existing subsets and refuses granting or managing broader accounts', () => {
  requireStaffManagementScope(delegate, 'supervisors', ['students'], supervisor);
  requireStaffManagementScope(delegate, 'administrators', [], administrator);
  assert.throws(() => requireStaffManagementScope(delegate, 'supervisors', ['settings']), isCode('forbidden'));
  assert.throws(() => requireStaffManagementScope(delegate, 'supervisors', [], { ...supervisor, permissions: ['settings'] }), isCode('forbidden'));
  assert.throws(() => requireStaffManagementScope({ ...delegate, dashboardPermissions: ['students'] }, 'supervisors'), isCode('forbidden'));
  assert.throws(() => requireStaffManagementScope({ ...identity, role: 'student', dashboardPermissions: ['supervisors'] }, 'supervisors'), isCode('forbidden'));
});
test('manager accounts and accounts of another staff mode remain protected even for a manager', () => {
  requireStaffManagementScope(identity, 'supervisors', ['settings'], { ...supervisor, permissions: ['settings'] });
  assert.throws(() => requireStaffManagementScope(identity, 'administrators', [], { ...administrator, role: 'manager' }), isCode('conflict'));
  assert.throws(() => requireStaffManagementScope(identity, 'administrators', [], supervisor), isCode('conflict'));
  assert.throws(() => requireStaffManagementScope(identity, 'supervisors', [], administrator), isCode('conflict'));
});
test('staff response decoders accept SQL string IDs and normalize explicit grants and optional values', () => {
  const decoded = decodeManagedStaff({ ...supervisor, id: '2', nationalId: null, phone: null, committeeIds: ['3', 3], permissions: ['grades'] }, 'supervisors');
  assert.equal(decoded.id, 2); assert.equal(decoded.phone, ''); assert.deepEqual(decoded.committeeIds, [3]);
  assert.deepEqual(decoded.permissions, ['weeklySession', 'trackSession']);
  assert.deepEqual(decodeManagedStaff({ ...administrator, permissions: ['quranEvaluation', 'students'] }, 'administrators').permissions, ['students']);
});
test('staff response decoders reject malformed IDs, roles, permissions and links', () => {
  for (const partial of [{ id: true }, { id: 0 }, { id: '1.5' }, { name: 4 }, { loginNumber: null }, { role: 'reciter' },
    { role: 'admin' }, { permissions: null }, { permissions: [4] }, { committeeIds: null }, { committeeIds: [0] }, { committeeIds: ['oops'] }]) {
    assert.throws(() => decodeManagedStaff({ ...supervisor, ...partial }, 'supervisors'), isCode('invalid-response'));
  }
  assert.throws(() => decodeManagedStaff(supervisor, 'administrators'), isCode('invalid-response'));
});
test('staff API loads the actual endpoints and only requests circles for supervisor management', async () => {
  const calls: string[] = [];
  const controller = await setup(async url => {
    const path = new URL(url).pathname.replace('/api', ''); calls.push(path);
    return json(path === '/supervisors' ? [supervisor] : path === '/administrators' ? [administrator] : [circle]);
  });
  const api = createStaffManagementApi(controller);
  assert.deepEqual((await api.loadStaff('supervisors')).circles, [circle]);
  assert.equal((await api.loadStaff('administrators')).circles.length, 0);
  assert.deepEqual(calls.sort(), ['/administrators', '/committees', '/supervisors']);
});
test('staff mutations use existing CRUD contracts without roles, tokens or invented activation', async () => {
  const calls: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const controller = await setup(async (url, options) => {
    const path = new URL(url).pathname.replace('/api', ''); const body = options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : null;
    calls.push({ path, method: options.method ?? 'GET', body });
    return json(options.method === 'POST' ? path === '/supervisors' ? supervisor : administrator : { ok: true }, options.method === 'POST' ? 201 : 200);
  });
  const api = createStaffManagementApi(controller);
  for (const mode of ['supervisors', 'administrators'] as const) {
    const row = mode === 'supervisors' ? supervisor : administrator;
    await api.saveStaff(mode, draft(), [circle]);
    await api.saveStaff(mode, { ...draft(), password: '' }, [circle], row);
    await api.deleteStaff(mode, row);
  }
  assert.deepEqual(calls.map(call => [call.method, call.path]), [['POST', '/supervisors'], ['PUT', '/supervisors/2'], ['DELETE', '/supervisors/2'],
    ['POST', '/administrators'], ['PUT', '/administrators/9'], ['DELETE', '/administrators/9']]);
  assert.equal(calls.some(call => call.body && ['token', 'role', 'isActive'].some(key => key in call.body!)), false);
  assert.equal('password' in calls[1]!.body!, false); assert.equal('password' in calls[4]!.body!, false);
});
test('invalid forms and protected targets are refused before any network request', async () => {
  let requests = 0; const api = createStaffManagementApi(await setup(async () => { requests += 1; return json({ ok: true }); }));
  await assert.rejects(api.saveStaff('supervisors', { ...draft(), password: '' }, [circle]), isCode('validation'));
  await assert.rejects(api.saveStaff('supervisors', { ...draft(), committeeIds: ['99'] }, [circle]), isCode('validation'));
  await assert.rejects(api.deleteStaff('administrators', { ...administrator, role: 'manager' }), isCode('conflict'));
  await assert.rejects(api.saveStaff('administrators', draft(), [circle], supervisor), isCode('conflict'));
  assert.equal(requests, 0);
});
test('staff factory accepts a single grant and each mode independently enforces it', async () => {
  let requests = 0;
  const controller = await setup(async () => { requests += 1; return json([administrator]); }, { ...delegate, dashboardPermissions: ['administrators'] });
  const api = createStaffManagementApi(controller); await api.loadStaff('administrators');
  await assert.rejects(api.loadStaff('supervisors'), isCode('forbidden'));
  assert.equal(requests, 1); assert.equal(api.canManage('supervisors'), false); assert.equal(api.canManage('administrators'), true);
});
test('ungranted accounts cannot read, create, edit or delete staff accounts', async () => {
  for (const role of ['admin', 'student'] as const) {
    let requests = 0; const api = createStaffManagementApi(await setup(async () => { requests += 1; return json({ ok: true }); },
      { ...identity, role, dashboardPermissions: [] }));
    await assert.rejects(api.loadStaff('administrators'), isCode('forbidden'));
    await assert.rejects(api.saveStaff('supervisors', draft(), [circle]), isCode('forbidden'));
    await assert.rejects(api.saveStaff('administrators', draft(), [circle], administrator), isCode('forbidden'));
    await assert.rejects(api.deleteStaff('supervisors', supervisor), isCode('forbidden'));
    assert.equal(requests, 0);
  }
});
test('delegate services refuse broader requested or existing grants before mutation requests', async () => {
  let requests = 0; const api = createStaffManagementApi(await setup(async () => { requests += 1; return json({ ok: true }); }, delegate));
  await assert.rejects(api.saveStaff('administrators', { ...draft(), permissions: ['settings'] }, []), isCode('forbidden'));
  await assert.rejects(api.saveStaff('supervisors', draft(), [circle], { ...supervisor, permissions: ['settings'] }), isCode('forbidden'));
  await assert.rejects(api.deleteStaff('supervisors', { ...supervisor, permissions: ['settings'] }), isCode('forbidden'));
  assert.equal(requests, 0); assert.deepEqual(api.assignablePermissions('administrators'), ['supervisors', 'administrators', 'students']);
});
for (const [status, code] of [[403, 'forbidden'], [404, 'not-found'], [409, 'conflict'], [422, 'validation'], [500, 'server']] as const) {
  test(`staff server rejection ${status} surfaces safe ${code} without exposing private details`, async () => {
    const api = createStaffManagementApi(await setup(async () => json({ message: 'private staff detail' }, status)));
    await assert.rejects(api.deleteStaff('supervisors', supervisor), error => isCode(code)(error)
      && error instanceof Error && !error.message.includes('private'));
  });
}
test('server authorization expiry immediately removes local authenticated access', async () => {
  const controller = await setup(async () => json({ message: 'expired' }, 401)); const api = createStaffManagementApi(controller);
  await assert.rejects(api.loadStaff('administrators'), isCode('unauthorized'));
  assert.equal(controller.getSnapshot().status, 'signed-out'); assert.equal(api.canManage('administrators'), false);
});
test('old staff services stop before request after role, account or tenant changes', async () => {
  for (const changed of [{ ...delegate, id: 10 }, { ...delegate, role: 'supervisor' as const },
    { ...delegate, complex: { ...delegate.complex, registrationNumber: 'another-fixture' } }]) {
    let requests = 0; const state = mutableController(delegate, async () => { requests += 1; return { ok: true }; });
    const api = createStaffManagementApi(state.controller); state.change(changed);
    await assert.rejects(api.deleteStaff('administrators', administrator), isCode('cancelled')); assert.equal(requests, 0);
  }
});
test('staff services recheck grants after delayed reads and mutation responses', async () => {
  for (const mode of ['supervisors', 'administrators'] as const) {
    const state = mutableController(delegate, async path => {
      state.change({ ...delegate, dashboardPermissions: [] });
      return path === '/committees' ? [circle] : [{ ...(mode === 'supervisors' ? supervisor : administrator) }];
    });
    await assert.rejects(createStaffManagementApi(state.controller).loadStaff(mode), isCode('forbidden'));
  }
  const state = mutableController(delegate, async () => { state.change({ ...delegate, dashboardPermissions: ['administrators'] }); return { ok: true }; });
  await assert.rejects(createStaffManagementApi(state.controller).saveStaff('administrators', { ...draft(), password: '' }, [], administrator), isCode('forbidden'));
});
test('staff services reject a response arriving after sign-out or a tenant identity switch', async () => {
  for (const changed of [null, { ...delegate, complex: { ...delegate.complex, registrationNumber: 'other-fixture' } }]) {
    const state = mutableController(delegate, async () => { state.change(changed); return { ok: true }; });
    await assert.rejects(createStaffManagementApi(state.controller).deleteStaff('administrators', administrator), isCode(changed ? 'cancelled' : 'unauthorized'));
  }
});
test('staff services do not silently retry ambiguous failures or malformed save acknowledgements', async () => {
  for (const kind of ['network', 'invalid-response'] as const) {
    let requests = 0; const api = createStaffManagementApi(await setup(async () => {
      requests += 1; if (kind === 'network') throw new Error('lost response'); return json({ ok: 'true' });
    }));
    await assert.rejects(api.saveStaff('supervisors', { ...draft(), password: '' }, [circle], supervisor), isCode(kind));
    assert.equal(requests, 1);
  }
});
test('editing your own staff permissions refreshes the live session immediately', async () => {
  const self = { ...administrator, id: delegate.id, permissions: ['administrators', 'students'] };
  let session = { ...delegate }; let reads = 0;
  const controller = await setup(async url => {
    if (url.endsWith('/auth/session')) { reads += 1; return json(session); }
    session = { ...delegate, dashboardPermissions: [] }; return json({ ok: true });
  }, delegate);
  const api = createStaffManagementApi(controller); await api.saveStaff('administrators', { ...draft(), password: '', permissions: [] }, [], self);
  assert.equal(reads, 1); assert.deepEqual(controller.getSnapshot().session?.dashboardPermissions, []);
  await assert.rejects(api.deleteStaff('administrators', self), isCode('forbidden'));
});
test('editing your own staff credentials signs out after server session revocation', async () => {
  const self = { ...administrator, id: delegate.id, permissions: ['administrators', 'students'] };
  const controller = await setup(async url => url.endsWith('/auth/session') ? json({}, 401) : json({ ok: true }), delegate);
  await createStaffManagementApi(controller).saveStaff('administrators', draft(), [], self);
  assert.equal(controller.getSnapshot().status, 'error'); assert.equal(controller.getSnapshot().session, null);
});
test('deleting your own staff account clears access and no obsolete service can continue', async () => {
  const self = { ...administrator, id: delegate.id, permissions: ['administrators', 'students'] };
  const controller = await setup(async () => json({ ok: true }), delegate); const api = createStaffManagementApi(controller);
  await api.deleteStaff('administrators', self); assert.equal(controller.getSnapshot().status, 'signed-out');
  await assert.rejects(api.loadStaff('administrators'), isCode('unauthorized'));
});
test('staff factory refuses a signed-out session', () => {
  const state = mutableController(identity, async () => []); state.change(null);
  assert.throws(() => createStaffManagementApi(state.controller), isCode('unauthorized'));
});
test('staff requests include the session tenant and bearer credential in headers only', async () => {
  const controller = await setup(async (_url, options) => {
    const headers = options.headers as Record<string, string>;
    assert.equal(headers['X-Registration-Number'], 'native-fixture'); assert.equal(headers.Authorization, `Bearer ${token}`);
    assert.equal(options.credentials, 'omit');
    assert.equal(String(options.body).includes(token), false);
    return json({ ok: true });
  });
  await createStaffManagementApi(controller).deleteStaff('supervisors', supervisor);
});
test('staff loading forwards cancellation to both supervisor and circle requests', async () => {
  let requests = 0; const controller = await setup(async () => { requests += 1; return json([]); });
  const abort = new AbortController(); abort.abort();
  await assert.rejects(createStaffManagementApi(controller).loadStaff('supervisors', abort.signal), isCode('cancelled'));
  assert.equal(requests, 0);
});
