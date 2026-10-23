import { isMistakeMark } from './recitation-mark-types.js';

export function trackWordMarkCounts(wordMarks = []) {
  return wordMarks.reduce((counts, mark) => {
    if (isMistakeMark(mark.markType)) counts.mistakes += 1;
    else if (mark.markType === 'warning') counts.warnings += 1;
    else if (mark.markType === 'hesitation') counts.hesitations += 1;
    return counts;
  }, { mistakes: 0, warnings: 0, hesitations: 0 });
}

/** Keep additional manual counts when a word mark is added, edited or removed. */
export function updateTrackWordMarks(segment, wordMarks) {
  const before = trackWordMarkCounts(segment.wordMarks);
  const after = trackWordMarkCounts(wordMarks);
  return { ...segment, wordMarks, ...Object.fromEntries(Object.keys(after).map(key =>
    [key, Math.max(0, (Number(segment[key]) || 0) - before[key]) + after[key]])) };
}
