import { quranFacePositions } from './quranFaceMeasurement.js';
import { planScheduleDates } from './planScheduleDates.js';
import { addDays } from './grading.js';
import { pendingRehifzWork } from './passingRehifz.js';

const positions = new Map(quranFacePositions.map(row => [`${row.surah}:${row.ayah}`, row]));
/** Subtract the union of accepted ranges in line coordinates, including partial faces. */
export function remainingPlanFaces(plan, acceptedRanges) {
  const first = positions.get(`${plan.startSurah}:${plan.startAyah}`);
  const last = positions.get(`${plan.endSurah}:${plan.endAyah}`);
  if (!first || !last) return 0;
  const reverse = Number(plan.startSurah) > Number(plan.endSurah);
  const prefix = reverse ? 'reverse' : 'forward';
  const low = reverse ? first.reverseStart : Math.min(first.forwardStart, last.forwardStart);
  const high = reverse ? last.reverseEnd : Math.max(first.forwardEnd, last.forwardEnd);
  const intervals = acceptedRanges.flatMap(range => {
    const from = positions.get(`${range.startSurah}:${range.startAyah}`);
    const to = positions.get(`${range.endSurah}:${range.endAyah}`);
    if (!from || !to) return [];
    const start = Math.max(low, Math.min(from[`${prefix}Start`], to[`${prefix}Start`]));
    const end = Math.min(high, Math.max(from[`${prefix}End`], to[`${prefix}End`]));
    return start <= end ? [[start, end]] : [];
  }).sort((a, b) => a[0] - b[0]);
  let covered = 0, end = low - 1;
  for (const [start, nextEnd] of intervals) {
    if (nextEnd > end) covered += nextEnd - Math.max(end + 1, start) + 1;
    end = Math.max(end, nextEnd);
  }
  const remainingLines = Math.max(0, high - low + 1 - covered);
  return remainingLines ? Math.max(0.25, Math.round(remainingLines * 4 / 15) / 4) : 0;
}

/** Find a study date even when a long or overlapping holiday spans the initial forecast window. */
async function completionDate(connection, from, requiredDays, workDays, studentId) {
  if (!requiredDays || !workDays.length) return null;
  let remaining = requiredDays;
  let start = from;
  for (let year = 0; year < 100; year++) {
    const end = addDays(start, 365);
    const dates = await planScheduleDates(connection, start, end, workDays, 'workDays', studentId, true);
    if (dates.length >= remaining) return dates[remaining - 1];
    remaining -= dates.length;
    start = addDays(end, 1);
  }
  return null;
}

export async function forecastQuranPlan(connection, { plan, acceptedRanges, priorRanges = [], today, workDays }) {
  const remainingFaces = remainingPlanFaces(plan, acceptedRanges);
  const dailyFaces = Math.max(0.25, Number(plan.dailyPages) || 1);
  const totalFaces = remainingPlanFaces(plan, priorRanges);
  const rehifz = await pendingRehifzWork(connection, plan.studentId);
  const rehifzDays = rehifz.reduce((days, item) => days + Math.ceil(remainingPlanFaces({ ...item.ranges[0],
    endSurah: item.ranges.at(-1).endSurah, endAyah: item.ranges.at(-1).endAyah }, item.accepted) / dailyFaces), 0);
  const requiredDays = Math.ceil(remainingFaces / dailyFaces) + rehifzDays;
  const start = plan.startDate || plan.createdDate;
  if (!start) return { remainingFaces, baseEndDate: null, projectedEndDate: null, paceStatus: 'on_track', aheadFaces: 0, delayedFaces: 0 };
  const anchor = plan.scheduleAnchorSurah && plan.scheduleAnchorAyah
    ? { startSurah: plan.startSurah, startAyah: plan.startAyah, endSurah: plan.scheduleAnchorSurah, endAyah: plan.scheduleAnchorAyah } : null;
  const scheduledRemaining = anchor ? remainingPlanFaces(plan, [...priorRanges, anchor]) : totalFaces;
  const scheduleStart = anchor ? (plan.effectiveFrom || start) : start;
  const baseEndDate = await completionDate(connection, scheduleStart, Math.ceil(scheduledRemaining / dailyFaces), workDays, plan.studentId);
  const elapsed = (await planScheduleDates(connection, scheduleStart, today, workDays, 'workDays', plan.studentId, true)).length;
  const expectedFaces = Math.min(totalFaces, totalFaces - scheduledRemaining + elapsed * dailyFaces);
  const completedFaces = Math.max(0, totalFaces - remainingFaces);
  const difference = Math.round((completedFaces - expectedFaces) * 4) / 4;
  const from = plan.startDate > today ? plan.startDate : addDays(today, 1);
  return { remainingFaces, baseEndDate,
    projectedEndDate: requiredDays ? await completionDate(connection, from, requiredDays, workDays, plan.studentId) : today,
    paceStatus: difference > 0 ? 'ahead' : difference < 0 ? 'behind' : 'on_track',
    aheadFaces: Math.max(0, difference), delayedFaces: Math.max(0, -difference), expectedFaces, completedFaces };
}
