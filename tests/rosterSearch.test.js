import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRosterByName } from '../src/lib/rosterSearch.js';

const rows = [{ id: 1, name: 'أحمد إبراهيم' }, { id: 2, name: 'محمد علي' }, { id: 3, name: 'احمد خالد' }];
test('roster search matches Arabic names, multiple terms, empty and missing results', () => {
  assert.deepEqual(filterRosterByName(rows, ' احمد '), [rows[0], rows[2]]);
  assert.deepEqual(filterRosterByName(rows, 'إبراهيم أَحمد'), [rows[0]]);
  assert.deepEqual(filterRosterByName(rows, ''), rows);
  assert.deepEqual(filterRosterByName(rows, 'غير موجود'), []);
});
