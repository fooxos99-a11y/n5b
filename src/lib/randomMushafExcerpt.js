import { secureRandomInt } from '../../shared/secure-random.js';

export function pickRandomMushafEntry(total, visitedIndexes = [], currentIndex = -1, random = undefined) {
  const size = Math.max(0, Number(total || 0));
  if (!size) return { index: -1, visitedIndexes: [] };
  const visited = new Set((visitedIndexes || []).map(Number).filter((index) => index >= 0 && index < size));
  let candidates = Array.from({ length: size }, (_, index) => index).filter((index) => !visited.has(index));
  if (!candidates.length) {
    visited.clear();
    candidates = Array.from({ length: size }, (_, index) => index).filter((index) => size === 1 || index !== Number(currentIndex));
  }
  const randomValue = random?.();
  const position = randomValue == null
    ? secureRandomInt(candidates.length)
    : Math.floor(Math.min(0.999999, Math.max(0, Number(randomValue))) * candidates.length);
  const index = candidates[position] ?? 0;
  visited.add(index);
  return { index, visitedIndexes: [...visited] };
}
