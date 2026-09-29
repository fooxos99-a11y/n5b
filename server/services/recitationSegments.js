import quranVerseLineLayout from '../data/quranVerseLineLayout.js';
import { descendingRecitationLines, measureQuranFaces } from './quranFaceMeasurement.js';
import { classifyPlanExecution } from './quranPlanProgress.js';
import { compareQuranPositionInDirection } from '../../shared/quran-execution-policy.js';
const QURAN_LINES_PER_PAGE = 15;
const layout = new Map(quranVerseLineLayout.map(([key, startPage, startLine, endPage, endLine]) => [key, { startPage, startLine, endPage, endLine }]));
export const getQuranVerseLine = (position) => layout.get(`${Number(position?.surah)}:${Number(position?.ayah)}`);
const getQuranLineCoordinate = (page, line) => ((Number(page) - 1) * QURAN_LINES_PER_PAGE) + Number(line);

export async function buildRecitationSegmentDetails(connection, context, actualEnd, settings, {
  adjacentPosition, rangeFaces,
} = {}) {
  if (!context || !actualEnd) return [];
  if (context.legacyMode) return [];
  const classified = classifyPlanExecution({
    actualStart: context.actualStart,
    normalEnd: context.normalEnd,
    scheduledEnd: context.scheduledEnd,
    actualEnd,
    direction: context.direction,
    allowCompensation: settings.allowQuranCompensation,
    allowExtra: settings.allowQuranExtra,
  });
  const details = [];
  for (const segment of classified) {
    const start = segment.start || await adjacentPosition(connection, segment.startAfter, context.direction);
    if (!start || compareQuranPositionInDirection(start, segment.end, context.direction) > 0) continue;
    const startLayout = getQuranVerseLine(start);
    const endLayout = getQuranVerseLine(segment.end);
    const previousLayout = segment.startAfter ? getQuranVerseLine(segment.startAfter) : null;
    let amount;
    if (startLayout && endLayout) {
      const endCoordinate = getQuranLineCoordinate(endLayout.endPage, endLayout.endLine);
      const startCoordinate = previousLayout
        ? getQuranLineCoordinate(previousLayout.endPage, previousLayout.endLine)
        : getQuranLineCoordinate(startLayout.startPage, startLayout.startLine);
      const descending = Number(start.surah) > Number(segment.end.surah)
        || Number(segment.startAfter?.surah) > Number(segment.end.surah);
      const _resolveCoveredLines = () => {
        if (descending) {
          return descendingRecitationLines(start, segment.end, segment.startAfter);
        }
        return Math.abs(endCoordinate - startCoordinate) + (previousLayout ? 0 : 1);
      };
      const coveredLines = _resolveCoveredLines();
      amount = Math.max(0.01, Number((coveredLines / QURAN_LINES_PER_PAGE).toFixed(2)));
    } else {
      amount = await rangeFaces(connection, {
        startPage: start.page,
        startSurah: start.surah,
        startAyah: start.ayah,
        endPage: segment.end.page,
        endSurah: segment.end.surah,
        endAyah: segment.end.ayah,
      });
    }
    details.push({ ...segment, start, amount: Math.max(0.01, Number(amount || 0.01)) });
  }
  return details;
}


export function recitationFacesFromLines(start, end) {
  let from = getQuranVerseLine(start);
  let to = getQuranVerseLine(end);
  if (!from || !to) return null;
  if (Number(start.surah) > Number(end.surah)) return measureQuranFaces(start, end);
  if (getQuranLineCoordinate(from.startPage, from.startLine) > getQuranLineCoordinate(to.startPage, to.startLine)) [from, to] = [to, from];
  const faces = (getQuranLineCoordinate(to.endPage, to.endLine) - getQuranLineCoordinate(from.startPage, from.startLine) + 1) / 15;
  return Math.max(0.25, Math.round(faces * 4) / 4);
}
