import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import mysql from 'mysql2/promise';
import { URL } from 'node:url';
import { prepareNarrationAssignments, normalizeNarrationRanges } from '../server/services/narrationPreparation.js';
import { readQuranAyah } from '../server/services/quranReferenceCache.js';
import { measureQuranFaces } from '../server/services/quranFaceMeasurement.js';

assert.ok(['127.0.0.1', 'localhost'].includes(process.env.MYSQL_HOST || '127.0.0.1'));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '', database: 'nukhab_local', decimalNumbers: true });
const tables = ['students', 'committees', 'supervisor_committees', 'narration_events', 'narration_event_students', 'narration_event_parts'];
const replacement = new RegExp(`\\b(${tables.join('|')})\\b`, 'g');
const scoped = { query: (sql, params) => connection.query(sql.replace(replacement, 'audit_prep_$1'), params), beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(), rollback: () => connection.rollback(), release: () => {} };
try {
  for (const table of tables.slice(3)) await connection.query(`CREATE TEMPORARY TABLE audit_prep_${table} LIKE ${table}`);
  await connection.query('CREATE TEMPORARY TABLE audit_prep_students (id INT, name VARCHAR(100), committee_id INT)');
  await connection.query('CREATE TEMPORARY TABLE audit_prep_committees (id INT, name VARCHAR(100))');
  await connection.query('CREATE TEMPORARY TABLE audit_prep_supervisor_committees (supervisor_id INT, committee_id INT)');
  await scoped.query("INSERT INTO committees VALUES (5,'حلقة أ'),(6,'حلقة ب')");
  await scoped.query("INSERT INTO students VALUES (9,'طالب أ',5),(10,'طالب ب',6)");
  await scoped.query('INSERT INTO supervisor_committees VALUES (3,5)');
  // Security review: only the fixed repository source below is evaluated;
  // request bodies, environment values and database content are never code.
  // The explicit context exposes only test doubles and connection-local tables.
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const routes = new Map();
  let canReadMemorized = false;
  const context = vm.createContext({
    app: { post: (path, guard, handler) => routes.set(path, { guard, handler }), get: (path, guard, handler) => routes.set(path, { guard, handler }) },
    db: () => ({ ...scoped, getConnection: async () => scoped }), prepareNarrationAssignments, normalizeNarrationRanges,
    readQuranAyah, measureQuranFaces,
    isValidDateOnly: value => /^\d{4}-\d{2}-\d{2}$/.test(value),
    ensureCommitteeIdsExist: async (_db, ids) => ids,
    canAccessNarrationCommittee: async (auth, id) => auth.role !== 'supervisor' || id === 5,
    permissionDenied: res => res.status(403).json({ message: 'denied' }), hasSupervisorDashboardPermission: async id => id === 1,
    getNarrationEvent: async () => null, addUtcDays: date => date,
    getStudentMemorizedRanges: async () => { assert.ok(canReadMemorized, 'manual mode must not read or modify the student plan'); return [{ startSurah: 1, startAyah: 1, startPage: 1, endSurah: 1, endAyah: 7, endPage: 1 }]; },
    getAdjacentQuranAyah: async (_db, position) => ({ ...position, ayah: position.ayah + 1 }),
  });
  const extract = name => { const start = source.indexOf(`function ${name}(`); return source.slice(source.lastIndexOf('\n', start) + 1, source.indexOf('\n}', start) + 2); };
  for (const name of ['requireNarrationAccess', 'normalizeQuranRange', 'getQuranRangeStart', 'getQuranRangeEnd', 'compareQuranPosition', 'isValidQuranPosition', 'getQuranAyah', 'mergeQuranRanges', 'getQuranJuzRanges', 'calculateQuranRangeFaces', 'narrationRangeDependencies', 'createNarrationStudentEntries', 'collectNarrationJuzParts']) vm.runInContext(extract(name), context);
  vm.runInContext(source.slice(source.indexOf("app.get('/api/narration-events/preparation'"), source.indexOf('function narrationRangeDependencies(')), context);
  vm.runInContext(source.slice(source.indexOf("app.post('/api/narration-events/preview-ranges'"), source.indexOf("app.get('/api/narration-events/:id'")), context);
  vm.runInContext(source.slice(source.indexOf("app.post('/api/narration-events',"), source.indexOf("app.put('/api/narration-events/:eventId/parts")), context);
  const invoke = async (path, body, auth) => {
    auth ??= { role: 'manager', id: 1 };
    let status = 200, result, allowed = false;
    const res = { status: code => { status = code; return res; }, json: value => { result = value; } };
    const req = { auth, body };
    const { guard, handler } = routes.get(path);
    await guard(req, res, () => { allowed = true; });
    if (allowed) await handler(req, res, error => { status = error.statusCode || 500; result = error.message; });
    return { status, result };
  };
  const path = '/api/narration-events';
  const body = { name: 'اختبار يدوي', startDate: '2026-10-01', endDate: '2026-10-01', scope: 'committee', committeeIds: [5], mode: 'manual', assignments: [{ studentId: 9, ranges: [
    { startSurah: 2, startAyah: 140, endSurah: 2, endAyah: 145 },
    { startSurah: 2, startAyah: 143, endSurah: 2, endAyah: 148 },
    { startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6 },
  ] }] };
  const created = await invoke(path, body);
  assert.equal(created.status, 201, JSON.stringify(created));
  assert.equal(created.result.studentsCount, 1);
  const preview = await invoke('/api/narration-events/preview-ranges', { ranges: body.assignments[0].ranges });
  assert.equal(preview.status, 200);
  assert.equal(preview.result.length, 2);
  assert.ok(preview.result.every(range => range.faces > 0));
  const [[entry]] = await scoped.query('SELECT total_faces AS faces FROM narration_event_students');
  assert.equal(entry.faces, preview.result.reduce((sum, range) => sum + range.faces, 0), 'preview matches the stored juz-based total');
  const [parts] = await scoped.query('SELECT juz_number, start_surah, start_ayah, end_surah, end_ayah FROM narration_event_parts ORDER BY id');
  assert.deepEqual(parts.map(part => part.juz_number), [1, 2, 30]);
  assert.equal(parts[0].end_ayah, 141);
  assert.equal(parts[1].start_ayah, 142);
  assert.equal(parts[1].end_ayah, 148);
  assert.equal(parts[2].start_surah, 114);
  assert.equal((await invoke(path, { ...body, assignments: [{ ...body.assignments[0], studentId: 10 }] })).status, 403);
  assert.equal((await invoke(path, { ...body, assignments: [{ studentId: 9, ranges: [{ startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 8 }] }] })).status, 422);
  for (const auth of [{ role: 'student', id: 9 }, { role: 'admin', id: 99 }]) {
    assert.equal((await invoke(path, body, auth)).status, 403);
    assert.equal((await invoke('/api/narration-events/preparation', {}, auth)).status, 403);
    assert.equal((await invoke('/api/narration-events/preview-ranges', { ranges: body.assignments[0].ranges }, auth)).status, 403);
  }
  assert.equal((await invoke('/api/narration-events/preparation', {})).result.length, 2);
  const [[count]] = await scoped.query('SELECT COUNT(*) AS count FROM narration_events');
  assert.equal(count.count, 1, 'failed requests roll back the entire event');
  canReadMemorized = true;
  const full = await invoke(path, { ...body, mode: 'full', assignments: undefined });
  assert.equal(full.status, 201);
  assert.equal(full.result.studentsCount, 1);
  globalThis.console.log('Local MySQL passed: manual ranges outside memorization, overlap merge, juz split, scoped students, permissions, rollback, and legacy full mode. Temporary tables only.');
} finally { await connection.end(); }
