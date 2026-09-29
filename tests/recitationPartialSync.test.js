import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { mergeEditableRecitationTasks, mergeRecitationTaskResults } from '../src/lib/recitationTaskResults.js';
import { canAdvanceRecitationSession } from '../src/lib/recitationTaskQueue.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = build({
  entryPoints: [path.join(root, 'src/services/offlineRecitationService.js')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'isolated-recitation-ports', setup(builder) {
    const mocks = {
      '@/services/studentsApi': 'export const studentsApi = ports.api;',
      '@/services/apiBase': "export const getTenantRegistrationNumber = () => 'test';",
      '@/services/offlineRecitationStore': 'export const offlineRecitationStore = ports.store;',
      '@/services/offlineOperationsService': 'export const syncOfflineActions = async () => []; export const commitOfflineOperation = () => {}; export const prefetchOfflineWorkspace = () => {};',
      '@/lib/authSession': 'export const getAuthSessionVersion = () => 1;',
    };
    builder.onResolve({ filter: /^@\// }, ({ path: name }) => mocks[name]
      ? { path: name, namespace: 'ports' }
      : { path: path.join(root, 'src', `${name.slice(2)}.js`) });
    builder.onLoad({ filter: /.*/, namespace: 'ports' }, ({ path: name }) => ({ contents: mocks[name], loader: 'js' }));
  } }],
});

async function loadService(ports) {
  const module = { exports: {} };
  vm.runInNewContext((await compiled).outputFiles[0].text, { module, exports: module.exports, ports, Date, setTimeout, clearTimeout });
  return module.exports;
}

test('batch partial commit persists through service restart and idempotent retry', async () => {
  let session = { sessionId: 'partial', status: 'pending', studentId: 8, sessionDate: '2026-09-08', tasks: [
    { taskId: 1, synced: false }, { taskId: 2, synced: false },
  ] };
  const official = new Set();
  let awards = 0;
  let calls = 0;
  const ports = {
    store: {
      getMeta: async () => null, setMeta: async () => {},
      getSessions: async (_actor, statuses) => !statuses || statuses.includes(session.status) ? [structuredClone(session)] : [],
      updateSession: async (_actor, id, patch) => {
        assert.equal(id, session.sessionId);
        session = structuredClone({ ...session, ...patch });
        return structuredClone(session);
      },
    },
    api: { syncOfflineRecitationBatch: async (batch) => {
      calls++;
      assert.equal(batch[0].sessionId, 'partial');
      const tasks = batch[0].tasks.map((item) => {
        if (calls === 1 && item.taskId === 2) return { taskId: 2, result: 'needs_retry', message: 'injected failure' };
        const duplicate = official.has(item.taskId);
        if (!duplicate) { official.add(item.taskId); awards += 10; }
        return { taskId: item.taskId, result: duplicate ? 'already_synced' : 'accepted', data: { ok: true, teacherCompleted: true } };
      });
      return { results: [{ sessionId: 'partial', result: calls === 1 ? 'needs_retry' : 'accepted', tasks }] };
    } },
  };
  await (await loadService(ports)).syncOfflineRecitations(11, { force: true });
  assert.equal(session.status, 'failed');
  assert.equal(session.tasks[0].result.ok, true);
  assert.equal(session.tasks[0].syncResultCode, 'accepted');
  assert.equal(session.tasks[1].synced, false);
  assert.equal(awards, 10);
  session = JSON.parse(JSON.stringify(session));
  await (await loadService(ports)).syncOfflineRecitations(11, { force: true });
  assert.equal(session.status, 'synced');
  assert.equal(session.tasks[0].syncResultCode, 'already_synced');
  assert.equal(awards, 20);
  assert.equal(official.size, 2);
});

test('incomplete or unrelated batch evidence never manufactures an acknowledgement', () => {
  const tasks = [{ taskId: 1, synced: false }, { taskId: 2, synced: true, result: { ok: true } }];
  const merged = mergeRecitationTaskResults(tasks, [
    { taskId: 1, result: 'accepted', data: null },
    { taskId: 99, result: 'accepted', data: { ok: true } },
  ]);
  assert.deepEqual(merged, tasks);
});

test('editing remaining work retains accepted payload and cannot advance an incomplete session', () => {
  const saved = { taskId: 1, synced: true, syncResultCode: 'accepted', result: { ok: true, teacherCompleted: true }, payload: { mistakeCount: 2 } };
  const pending = { taskId: 2, synced: false, payload: { offlineOutcome: { completed: true } } };
  const session = { status: 'failed', tasks: [saved, pending] };
  const edited = mergeEditableRecitationTasks(session, [{ taskId: 1, payload: { mistakeCount: 0 } }, pending]);
  assert.deepEqual(edited, [saved, pending]);
  assert.deepEqual(mergeEditableRecitationTasks(session, [pending]), [saved, pending]);
  assert.equal(canAdvanceRecitationSession({ ...session, tasks: edited }), false);
});
