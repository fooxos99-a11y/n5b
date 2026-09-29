import assert from 'node:assert/strict';
import test from 'node:test';
import { buildForwardQuranFaceRange } from '../shared/quran-face-range.js';

test('one face from the beginning of Al-Fatihah ends at Al-Fatihah 7', async () => {
  const start = { page: 1, surah: 1, ayah: 1 };
  const endLimit = { page: 604, surah: 114, ayah: 6 };
  const result = await buildForwardQuranFaceRange({
    start,
    endLimit,
    targetFaces: 1,
    getPageEnd: async (position) => (
      position.page === 1
        ? { page: 1, surah: 1, ayah: 7 }
        : { page: position.page, surah: position.surah, ayah: position.ayah }
    ),
    getNextPosition: async () => ({ page: 2, surah: 2, ayah: 1 }),
    getHalfPageEnd: async (position) => position,
  });

  assert.deepEqual(result.end, { page: 1, surah: 1, ayah: 7 });
  assert.deepEqual(result.segments, [{ start, end: result.end, faces: 1 }]);
});

test('quarter face uses the exact fractional page boundary', async () => {
  const start = { page: 2, surah: 2, ayah: 1 };
  const end = { page: 2, surah: 2, ayah: 3 };
  const fractions = [];
  const result = await buildForwardQuranFaceRange({
    start,
    endLimit: { page: 604, surah: 114, ayah: 6 },
    targetFaces: 0.25,
    getPageEnd: async () => ({ page: 2, surah: 2, ayah: 5 }),
    getNextPosition: async () => null,
    getHalfPageEnd: async () => ({ page: 2, surah: 2, ayah: 4 }),
    getFractionalPageEnd: async (_position, fraction) => {
      fractions.push(fraction);
      return end;
    },
  });

  assert.deepEqual(fractions, [0.25]);
  assert.equal(result.faces, 0.25);
  assert.deepEqual(result.end, end);
  assert.deepEqual(result.segments, [{ start, end, faces: 0.25 }]);
});
