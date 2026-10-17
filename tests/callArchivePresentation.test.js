import test from 'node:test';
import assert from 'node:assert/strict';
import { callArchiveLink, callDate, callTime, recordingLabel } from '../src/lib/callArchivePresentation.js';

test('archive deep link preserves deployment path and unrelated navigation fields', () => {
  const url = new URL(callArchiveLink('17', 'session-22', 'https://example.test/n5b/portal/calls?keep=1#calls'));
  assert.equal(url.pathname, '/n5b/portal/calls'); assert.equal(url.searchParams.get('keep'), '1');
  assert.equal(url.searchParams.get('callArchiveRoom'), '17'); assert.equal(url.searchParams.get('callSession'), 'session-22');
  assert.equal(new URL(callArchiveLink('17', '', url.href)).searchParams.has('callSession'), false);
});
test('archive display handles unknown times and recording failure without claiming saved audio', () => {
  assert.equal(callDate('invalid'), '—'); assert.equal(callTime(-10), '0:00'); assert.equal(callTime(125), '2:05');
  assert.match(recordingLabel('failed'), /تعذر/); assert.match(recordingLabel('unconfigured'), /غير مفعّل/);
});
