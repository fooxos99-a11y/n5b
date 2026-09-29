import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecitationSegmentDetails, recitationFacesFromLines } from '../server/services/recitationSegments.js';
import { descendingRecitationLines } from '../server/services/quranFaceMeasurement.js';

const settings = { allowQuranCompensation: false, allowQuranExtra: true };
const start = { surah: 57, ayah: 29 };
const end = { surah: 56, ayah: 6 };
test('Hadid to Waqiah counts six recited lines instead of 108 intervening lines', async () => {
  const segments = await buildRecitationSegmentDetails(null,
    { actualStart: start, normalEnd: end, scheduledEnd: end, direction: -1 }, end, settings);
  assert.equal(descendingRecitationLines(start, end), 6);
  assert.equal(segments[0].amount, 0.4);
  assert.equal(recitationFacesFromLines(start, end), 0.5);
});

test('descending extra segments continue after the last counted verse without measuring intervening pages', async () => {
  const extraEnd = { surah: 56, ayah: 8 };
  const segments = await buildRecitationSegmentDetails(null,
    { actualStart: start, normalEnd: start, scheduledEnd: start, direction: -1 }, extraEnd, settings,
    { adjacentPosition: async () => ({ surah: 56, ayah: 1 }) });
  assert.equal(segments.length, 2);
  assert.equal(segments[0].amount, 0.2);
  assert.equal(segments[1].amount, Number((descendingRecitationLines({ surah: 56, ayah: 1 }, extraEnd, start) / 15).toFixed(2)));
  assert.ok(segments[1].amount < 1);
});

test('same-surah calculations and missing-layout fallback remain supported', async () => {
  const same = { surah: 1, ayah: 1 }, last = { surah: 1, ayah: 7 };
  const segments = await buildRecitationSegmentDetails(null,
    { actualStart: same, normalEnd: last, scheduledEnd: last, direction: 1 }, last, settings);
  assert.equal(segments[0].amount, 0.47);
  assert.equal(descendingRecitationLines({ surah: 999, ayah: 1 }, end), null);
  assert.equal(recitationFacesFromLines({ surah: 999, ayah: 1 }, end), null);
});
