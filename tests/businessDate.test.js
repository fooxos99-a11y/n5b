import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUSINESS_TIME_ZONE,
  getBusinessDate,
  getBusinessDateTimeParts,
  shiftDateOnly,
} from '../shared/business-date.js';

test('business day stays on yesterday after Riyadh midnight while the wall clock remains accurate', () => {
  const afterRiyadhMidnight = new Date('2026-08-31T21:15:00.000Z');
  assert.equal(afterRiyadhMidnight.toISOString().slice(0, 10), '2026-08-31');
  assert.equal(BUSINESS_TIME_ZONE, 'Asia/Riyadh');
  assert.equal(getBusinessDate(afterRiyadhMidnight), '2026-08-31');
  assert.deepEqual(getBusinessDateTimeParts(afterRiyadhMidnight), {
    date: '2026-08-31',
    time: '00:15:00',
  });
});

test('business date history and date-only shifts preserve the intended calendar day', () => {
  const value = new Date('2026-08-31T23:30:00.000Z');
  assert.equal(getBusinessDate(value), '2026-08-31');
  assert.equal(shiftDateOnly('2026-09-01', -14), '2026-08-18');
});

test('business day changes exactly at 03:00 Riyadh across month, year and leap-day boundaries', () => {
  for (const [today, yesterday] of [['2026-09-07', '2026-09-06'], ['2026-01-01', '2025-12-31'], ['2028-03-01', '2028-02-29']]) {
    assert.equal(getBusinessDate(`${today}T02:59:59.999+03:00`), yesterday);
    assert.equal(getBusinessDate(`${today}T03:00:00.000+03:00`), today);
    assert.deepEqual(getBusinessDateTimeParts(`${today}T03:00:00+03:00`), { date: today, time: '03:00:00' });
    assert.equal(getBusinessDate(`${today}T23:59:59+03:00`), today);
  }
});

test('invalid business date inputs fail closed', () => {
  assert.equal(getBusinessDate('invalid'), '');
  assert.deepEqual(getBusinessDateTimeParts('invalid'), { date: '', time: '' });
  assert.equal(shiftDateOnly('invalid', 1), '');
});
