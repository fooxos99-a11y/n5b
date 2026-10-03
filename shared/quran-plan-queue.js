export function readQueuedPlanRanges(value) {
  if (!value) return [];
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new Error('Invalid plan queue');
  return parsed;
}

const position = (range, side) => Number(range[`${side}Surah`]) * 1000 + Number(range[`${side}Ayah`]);
export function planRangesOverlap(first, second) {
  const firstBounds = [position(first, 'start'), position(first, 'end')].sort((a, b) => a - b);
  const secondBounds = [position(second, 'start'), position(second, 'end')].sort((a, b) => a - b);
  return firstBounds[0] <= secondBounds[1] && secondBounds[0] <= firstBounds[1];
}
