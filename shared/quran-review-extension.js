import { compareQuranPositionInDirection } from './quran-execution-policy.js';

export function extendReviewEnd({ ayahs, expectedEnd, direction = 1, isAvailable }) {
  let end = expectedEnd;
  const following = ayahs.filter(ayah => compareQuranPositionInDirection(ayah, expectedEnd, direction) > 0)
    .sort((a, b) => compareQuranPositionInDirection(a, b, direction));
  for (const ayah of following) {
    if (!isAvailable(ayah)) break;
    end = ayah;
  }
  return end;
}
