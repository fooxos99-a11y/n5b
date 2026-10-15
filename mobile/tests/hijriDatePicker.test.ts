import assert from 'node:assert/strict';
import test from 'node:test';
import { dateOnly, shiftHijriMonth } from '../../shared/hijri-calendar.js';
import { calendarFocusIndex, canSelectCalendarDate, hijriCalendarCells, initialHijriMonth } from '../src/domain/hijriDatePicker';

test('Umm al-Qura month uses Saturday-first cells and keeps Gregorian values only in the data', () => {
  const month = initialHijriMonth('2024-03-25', '2026-10-15'), cells = hijriCalendarCells(month);
  assert.equal(dateOnly(month), '2024-03-11');
  assert.deepEqual(cells.slice(0, 2), [null, null]);
  assert.equal(cells[2]?.value, '2024-03-11'); assert.equal(cells[2]?.day, 1);
  assert.equal(cells.at(-1)?.value, '2024-04-09'); assert.equal(cells.at(-1)?.day, 30);
  assert.match(cells[2]?.label ?? '', /رمضان/); assert.doesNotMatch(cells[2]?.label ?? '', /2024|2024-03-11/);
  assert.equal(dateOnly(shiftHijriMonth(month, 1)), '2024-04-10');
  assert.equal(dateOnly(shiftHijriMonth(shiftHijriMonth(month, -1), 1)), dateOnly(month));
});

test('empty or invalid initial values use the valid reference without normalizing impossible dates', () => {
  assert.equal(dateOnly(initialHijriMonth('', '2024-03-25')), '2024-03-11');
  assert.equal(dateOnly(initialHijriMonth('2024-02-30', '2024-03-25')), '2024-03-11');
  assert.throws(() => initialHijriMonth('bad', 'invalid'));
  assert.equal(canSelectCalendarDate('2024-02-29'), true);
  for (const invalid of ['', '2023-02-29', '2024-02-30', '٢٠٢٤-٠٣-١١', '2024-3-11', '2024-03-11T00:00:00Z']) assert.equal(canSelectCalendarDate(invalid), false);
});

test('inclusive range boundaries and locked state reject unavailable selections', () => {
  const min = '2024-03-15', max = '2024-03-20';
  for (const day of ['2024-03-15', '2024-03-18', '2024-03-20']) assert.equal(canSelectCalendarDate(day, min, max), true);
  for (const day of ['2024-03-14', '2024-03-21']) assert.equal(canSelectCalendarDate(day, min, max), false);
  assert.equal(canSelectCalendarDate(min, min, max, true), false);
  assert.equal(canSelectCalendarDate(min, 'bad', max), false);
  assert.equal(canSelectCalendarDate(min, min, 'bad'), false);
  assert.equal(canSelectCalendarDate(min, max, min), false);
});

test('RTL keyboard navigation skips disabled dates and stays within the rendered month and week', () => {
  const cells = hijriCalendarCells(initialHijriMonth('2024-03-25', '2024-03-25'));
  assert.equal(calendarFocusIndex(cells, 2, 'ArrowLeft'), 3);
  assert.equal(calendarFocusIndex(cells, 3, 'ArrowRight'), 2);
  assert.equal(calendarFocusIndex(cells, 2, 'ArrowRight'), 2);
  assert.equal(calendarFocusIndex(cells, 2, 'ArrowDown'), 9);
  assert.equal(calendarFocusIndex(cells, 9, 'ArrowUp'), 2);
  assert.equal(calendarFocusIndex(cells, 5, 'Home'), 2);
  assert.equal(calendarFocusIndex(cells, 5, 'End'), 6);
  assert.equal(calendarFocusIndex(cells, 5, 'Home', '2024-03-14'), 5);
  assert.equal(calendarFocusIndex(cells, 5, 'End', undefined, '2024-03-14'), 5);
  assert.equal(calendarFocusIndex(cells, cells.length - 1, 'ArrowLeft'), cells.length - 1);
  assert.equal(calendarFocusIndex(cells, 4, 'Enter'), 4);
});
