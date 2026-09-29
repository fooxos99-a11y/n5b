import assert from 'node:assert/strict';
import test from 'node:test';
import { runCountedStatements, queryTaskGroups } from '../server/services/queryResults.js';
import { createBufferedPdf, registerReportFonts } from '../server/services/bufferedPdf.js';
import { sendWhatsAppResult } from '../server/services/whatsAppResult.js';
import { createStudentHomeFixture, studentHomeResponse } from './helpers/studentHomeFixture.mjs';

test('student browser fixtures provide the news object contract and isolated task state', () => {
  const fixture = createStudentHomeFixture();
  const another = createStudentHomeFixture();
  fixture.tasks[0].studentStatus = 'not_done';
  assert.equal(another.tasks[0].studentStatus, 'done');
  assert.deepEqual(studentHomeResponse('/api/student-news', fixture), { json: { entries: [] } });
  assert.equal(studentHomeResponse('/api/quran-saved', { ...fixture, savedFailure: true }).status, 500);
  assert.equal(studentHomeResponse('/api/quran-saved', fixture).json.length, 30);
});

test('counted statements run sequentially and aggregate child/parent results', async () => {
  const calls = [];
  const connection = { async query(sql) { calls.push(sql); return [{ affectedRows: calls.length }]; } };
  assert.deepEqual(await runCountedStatements(connection, { paths: ['children', 'parents'], students: 'students' }), { paths: 3, students: 3 });
  assert.deepEqual(calls, ['children', 'parents', 'students']);
});

test('counted statements propagate failure without executing later statements', async () => {
  const calls = [];
  const connection = { async query(sql) { calls.push(sql); throw new Error('query failed'); } };
  await assert.rejects(runCountedStatements(connection, { a: 'first', b: 'second' }), /query failed/);
  assert.deepEqual(calls, ['first']);
});

test('task groups deduplicate query ids, preserve row order and skip empty queries', async () => {
  let calls = 0;
  const connection = { async query(sql, params) {
    calls += 1;
    assert.equal(sql, 'marks WHERE task_id IN (?)');
    assert.deepEqual(params, [[2, 3]]);
    return [[{ taskId: '2', value: 'first' }, { taskId: 3, value: 'other' }, { taskId: 2, value: 'last' }]];
  } };
  const result = await queryTaskGroups(connection, ['2', 2, 3, null], 'marks WHERE task_id IN (?)', (row) => row.value);
  assert.deepEqual([...result], [[2, ['first', 'last']], [3, ['other']]]);
  assert.deepEqual(await queryTaskGroups(connection, [], '', () => null), new Map());
  assert.equal(calls, 1);
});

test('WhatsApp result keeps partial success and complete failure response contracts', () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { return value; } };
  const failed = [{ reason: 'delivery rejected' }];
  const prepared = [{ status: 'sent' }, { status: 'failed' }];
  assert.deepEqual(sendWhatsAppResult(res, prepared, failed, 'fallback'), { preparedCount: 2, sentCount: 1, failedCount: 1, prepared, failed });
  assert.equal(res.statusCode, 200);
  assert.equal(sendWhatsAppResult(res, [], failed, 'fallback').message, 'delivery rejected');
  assert.equal(res.statusCode, 502);
  assert.equal(sendWhatsAppResult(res, [], [], 'fallback').message, 'fallback');
});

test('PDF font registration preserves Arabic selection and Helvetica fallback', () => {
  const registered = [];
  const doc = { registerFont(...args) { registered.push(args); } };
  assert.deepEqual(registerReportFonts(doc, { regular: 'regular.ttf', bold: 'bold.ttf' }), { regularFont: 'Arabic', boldFont: 'ArabicBold' });
  assert.deepEqual(registered, [['Arabic', 'regular.ttf'], ['ArabicBold', 'bold.ttf']]);
  const broken = { registerFont() { throw new Error('font unavailable'); } };
  assert.deepEqual(registerReportFonts(broken, {}), { regularFont: 'Helvetica', boldFont: 'Helvetica-Bold' });
});

test('buffered PDF returns a complete document and propagates stream errors', async () => {
  const bytes = await new Promise((resolve, reject) => {
    const { doc, regularFont } = createBufferedPdf({ size: 'A4', margin: 36, bufferPages: true }, null, resolve, reject);
    doc.font(regularFont).text('Report');
    doc.end();
  });
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(bytes.toString(), /%%EOF/);
  await assert.rejects(new Promise((resolve, reject) => {
    const { doc } = createBufferedPdf({}, null, resolve, reject);
    doc.emit('error', new Error('stream failed'));
    doc.end();
  }), /stream failed/);
});
