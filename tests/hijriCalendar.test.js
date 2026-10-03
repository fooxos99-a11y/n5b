import assert from 'node:assert/strict';
import test from 'node:test';
import { addCalendarDays, dateOnly, formatHijriDate, formatHijriDateTime, hijriMonthRange, hijriMonthStart, hijriParts, parseDateOnly, shiftHijriDate, shiftHijriMonth } from '../shared/hijri-calendar.js';

test('Hijri calendar keeps stored ISO dates and rejects impossible dates', () => {
  assert.equal(dateOnly(parseDateOnly('2026-10-02')), '2026-10-02');
  assert.deepEqual(hijriParts(parseDateOnly('2026-10-02')), { month: 4, day: 21, year: 1448 });
  assert.match(formatHijriDate('2026-10-02'), /1448/);
  for (const value of ['', 'invalid', '2026-02-30', '2026-13-01', '2026-1-01']) {
    assert.equal(parseDateOnly(value), null);
    assert.equal(formatHijriDate(value), '');
  }
});

test('timestamp labels use the Saudi date across midnight and accept SQL timestamps', () => {
  assert.equal(formatHijriDateTime('2026-10-01T21:05:00Z'), formatHijriDateTime('2026-10-02 00:05:00'));
  assert.match(formatHijriDateTime('2026-10-02 00:05:00'), /1448/);
  assert.equal(formatHijriDateTime('invalid'), '');
  assert.equal(formatHijriDateTime(null), '');
});

test('Hijri months navigate across years with correct 29 and 30 day API ranges', () => {
  let start = hijriMonthStart(parseDateOnly('2026-01-01'));
  const lengths = new Set();
  for (let index = 0; index < 36; index++) {
    const range = hijriMonthRange(start);
    const next = shiftHijriMonth(start, 1);
    assert.equal(hijriParts(start).day, 1);
    assert.ok([29, 30].includes(range.days));
    assert.equal(range.to, dateOnly(addCalendarDays(next, -1)));
    assert.equal(dateOnly(shiftHijriMonth(next, -1)), range.from);
    const first = hijriParts(start);
    const following = hijriParts(next);
    assert.equal(following.month, first.month === 12 ? 1 : first.month + 1);
    assert.equal(following.year, first.year + (first.month === 12 ? 1 : 0));
    lengths.add(range.days);
    start = next;
  }
  assert.deepEqual([...lengths].sort(), [29, 30]);
});

test('comparison dates preserve Hijri day and clamp it to shorter months', () => {
  let start = hijriMonthStart(parseDateOnly('2026-01-01'));
  for (let index = 0; index < 24; index++) {
    const date = addCalendarDays(start, hijriMonthRange(start).days - 1);
    const next = shiftHijriDate(date, 1);
    assert.equal(hijriParts(next).day, Math.min(hijriParts(date).day, hijriMonthRange(next).days));
    const previousYear = shiftHijriDate(date, -12);
    assert.equal(hijriParts(previousYear).year, hijriParts(date).year - 1);
    assert.equal(hijriParts(previousYear).month, hijriParts(date).month);
    start = shiftHijriMonth(start, 1);
  }
});
