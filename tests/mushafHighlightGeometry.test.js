import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMushafHighlightPaths } from '../src/lib/mushafHighlightGeometry.js';

test('a wrapped selection forms one closed outline, including disjoint RTL ends, without changing source rectangles', () => {
  for (const left of [20, 180]) {
    const rows = [{ line: 4, left: 10, right: 150, top: 10, bottom: 30 },
      { line: 5, left, right: 280, top: 50, bottom: 70 }];
    const original = structuredClone(rows);
    const paths = buildMushafHighlightPaths(rows);
    assert.equal(paths.length, 1);
    assert.match(paths[0], /^M .* Z$/);
    assert.doesNotMatch(paths[0], /NaN|Infinity/);
    assert.deepEqual(rows, original);
  }
});

test('unselected lines and independent ranges are never connected', () => {
  const row = { left: 10, right: 90, top: 10, bottom: 30 };
  assert.equal(buildMushafHighlightPaths([{ ...row, line: 1 }, { ...row, line: 3, top: 90, bottom: 110 }]).length, 2);
  assert.equal(buildMushafHighlightPaths([]).length, 0);
  assert.equal(buildMushafHighlightPaths([{ ...row, line: 1, right: 10 }]).length, 0);
});
