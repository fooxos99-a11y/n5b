import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStatisticsNumber } from '../src/lib/statisticsNumber.js';

test('statistics display rounded integers without grouping separators', () => {
  for (const [input, expected] of [[10783.25, '10783'], [201.75, '202'], [22.5, '23'], [156.86, '157'], [525, '525'], [0, '0'], ['10783.25', '10783'], [null, '0'], [undefined, '0']]) {
    assert.equal(formatStatisticsNumber(input), expected);
  }
});
