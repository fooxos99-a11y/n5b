import {
  gradingMaxima,
  memorizationThresholdFor,
  normalizeGradingPolicy,
  reviewAmountThreshold,
} from './grading-policy.js';
import { DEFAULT_PLAN_READING_FACES } from './quran-plan-options.js';
import { getBusinessDate } from './business-date.js';

export const FAIL_TYPES = Object.freeze({
  manual: 'manual',
  face: 'face',
  amount: 'amount',
  hizb: 'hizb',
  threshold: 'threshold',
});

export const FAIL_REASON_LABELS = Object.freeze({
  manual: 'رسوب يدوي',
  face: 'تجاوز حد الوجه الواحد',
  amount: 'تجاوز حد المقدار كاملًا',
  hizb: 'تجاوز حد الحزب الواحد',
  threshold: 'تجاوز حد الرسوب',
});

const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const count = value => Math.max(0, Math.floor(Number(value) || 0));

function deductionOf(policy, item = {}) {
  const mistakes = count(item.mistakes);
  const warnings = count(item.warnings);
  const deduction = round((mistakes * policy.weeklyProgram.mistakeDeduction) + (warnings * policy.weeklyProgram.warningDeduction));
  return { mistakes, warnings, deduction };
}

function failed(base, type, extra = {}) {
  return { ...base, ...extra, passed: false, failType: type, failReason: FAIL_REASON_LABELS[type], grade: 0 };
}

/**
 * Memorization of N faces. Each face is checked against the single-face threshold first,
 * then the whole amount against the threshold configured for N faces.
 * A score equal to or below a threshold fails.
 */
export function evaluateMemorization(rawPolicy, { faces = [], manualFail = false } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const max = policy.weeklyProgram.memorizationDaily;
  const faceRows = (faces.length ? faces : [{}]).map((item, index) => {
    const { mistakes, warnings, deduction } = deductionOf(policy, item);
    return { index: index + 1, page: item.page ?? null, mistakes, warnings, deduction, score: round(1 - deduction) };
  });
  const faceCount = faceRows.length;
  const singleFaceThreshold = memorizationThresholdFor(policy, 1);
  const amountThreshold = memorizationThresholdFor(policy, faceCount);
  const totalMistakes = faceRows.reduce((sum, item) => sum + item.mistakes, 0);
  const totalWarnings = faceRows.reduce((sum, item) => sum + item.warnings, 0);
  const totalDeduction = round(faceRows.reduce((sum, item) => sum + item.deduction, 0));
  const rawScore = round(1 - totalDeduction);
  const base = {
    component: 'memorization',
    faceCount,
    faces: faceRows.map(item => ({ ...item, failed: item.score <= singleFaceThreshold })),
    totalMistakes,
    totalWarnings,
    totalDeduction,
    rawScore,
    singleFaceThreshold,
    amountThreshold,
    max,
    failedFaceIndex: null,
  };
  if (manualFail) return { ...failed(base, FAIL_TYPES.manual), repeatRequired: true };
  const failedFace = base.faces.find(item => item.failed);
  if (failedFace) return { ...failed(base, FAIL_TYPES.face, { failedFaceIndex: failedFace.index }), repeatRequired: true };
  if (rawScore <= amountThreshold) return { ...failed(base, FAIL_TYPES.amount), repeatRequired: true };
  return { ...base, passed: true, failType: null, failReason: null, grade: round(Math.max(0, rawScore) * max), repeatRequired: false };
}

export function evaluateLink(rawPolicy, { mistakes = 0, warnings = 0, manualFail = false } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const max = policy.weeklyProgram.linkDaily;
  const deduction = deductionOf(policy, { mistakes, warnings });
  const rawScore = round(1 - deduction.deduction);
  const base = {
    component: 'link',
    totalMistakes: deduction.mistakes,
    totalWarnings: deduction.warnings,
    totalDeduction: deduction.deduction,
    rawScore,
    threshold: policy.weeklyProgram.linkFailThreshold,
    max,
  };
  if (manualFail) return failed(base, FAIL_TYPES.manual);
  if (rawScore <= base.threshold) return failed(base, FAIL_TYPES.threshold);
  return { ...base, passed: true, failType: null, failReason: null, grade: round(rawScore * max) };
}

/**
 * Review measured in ahzab. Any single hizb reaching the hizb limit fails the whole review,
 * then the total is compared with 1 - (ahzab × limit).
 */
export function evaluateReview(rawPolicy, { hizbs = [], manualFail = false } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const max = policy.weeklyProgram.reviewDaily;
  const limit = policy.weeklyProgram.hizbDeductionLimit;
  const rows = (hizbs.length ? hizbs : [{}]).map((item, index) => {
    const { mistakes, warnings, deduction } = deductionOf(policy, item);
    return { index: index + 1, hizb: item.hizb ?? null, mistakes, warnings, deduction, failed: deduction >= limit };
  });
  const totalDeduction = round(rows.reduce((sum, item) => sum + item.deduction, 0));
  const rawScore = round(1 - totalDeduction);
  const base = {
    component: 'review',
    hizbCount: rows.length,
    hizbs: rows,
    totalMistakes: rows.reduce((sum, item) => sum + item.mistakes, 0),
    totalWarnings: rows.reduce((sum, item) => sum + item.warnings, 0),
    totalDeduction,
    rawScore,
    hizbLimit: limit,
    amountThreshold: reviewAmountThreshold(policy, rows.length),
    max,
    failedHizbIndex: null,
  };
  if (manualFail) return failed(base, FAIL_TYPES.manual);
  const failedHizb = rows.find(item => item.failed);
  if (failedHizb) return failed(base, FAIL_TYPES.hizb, { failedHizbIndex: failedHizb.index });
  if (rawScore <= base.amountThreshold) return failed(base, FAIL_TYPES.amount);
  return { ...base, passed: true, failType: null, failReason: null, grade: round(Math.max(0, rawScore) * max) };
}

export function evaluateReading(rawPolicy, { completed = false, requiredFaces, expectedFaces } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const max = policy.weeklyProgram.readingDaily;
  const faces = Number(requiredFaces) > 0 ? Number(requiredFaces) : DEFAULT_PLAN_READING_FACES;
  const expected = Number(expectedFaces) > 0 ? Number(expectedFaces) : faces;
  const grade = completed ? Math.round(max * Math.min(1, faces / expected) * 100) / 100 : 0;
  return { component: 'reading', completed: Boolean(completed), requiredFaces: faces, expectedFaces: expected, max, passed: Boolean(completed), grade };
}

export function evaluateAttendance(rawPolicy, status) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const values = policy.weeklyProgram.attendance;
  const key = Object.hasOwn(values, status) ? status : 'absent';
  return { component: 'attendance', status: key, max: values.present, passed: key !== 'absent', grade: values[key] };
}

export function evaluateTrackSession(rawPolicy, { attended = false, segments = [] } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const track = policy.trackSession;
  const rows = Array.from({ length: track.segmentCount }, (_, index) => {
    const item = segments[index] || {};
    const mistakes = count(item.mistakes);
    const warnings = count(item.warnings);
    const recorded = attended && Boolean(item.recorded ?? true);
    const grade = recorded ? round(Math.max(0, track.segmentMax - (mistakes * track.mistakeDeduction) - (warnings * track.warningDeduction))) : 0;
    return { index: index + 1, range: item.range ?? null, mistakes, warnings, recorded, max: track.segmentMax, grade };
  });
  const attendanceGrade = attended ? track.attendance : 0;
  return {
    component: 'track',
    attended: Boolean(attended),
    attendanceGrade,
    segments: rows,
    max: round(track.attendance + (track.segmentCount * track.segmentMax)),
    grade: round(attendanceGrade + rows.reduce((sum, item) => sum + item.grade, 0)),
  };
}

export function evaluateWeeklySession(rawPolicy, { attended = false } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  return { component: 'weekly', attended: Boolean(attended), max: policy.weeklySession.attendance, grade: attended ? policy.weeklySession.attendance : 0 };
}

const COMPONENT_MAX_KEY = { memorization: 'memorizationDaily', link: 'linkDaily', review: 'reviewDaily' };

/**
 * Weekly grade out of the configured total (100 by default).
 * @param {object} rawPolicy policy frozen for that week
 * @param {object} week
 * @param {{date:string, weekday:number, attendance?:{grade:number}, reading?:{grade:number},
 *   memorization?:{grade?:number, scheduled:boolean}, link?:{grade?:number, scheduled:boolean},
 *   review?:{grade?:number, scheduled:boolean}, planActive?:boolean}[]} week.days
 * @param {{grade:number}|null} week.track
 * @param {{grade:number}|null} week.weekly
 */
export function computeWeeklyGrade(rawPolicy, { days = [], track = null, weekly = null, today = getBusinessDate() } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const maxima = gradingMaxima(policy);
  const program = policy.weeklyProgram;
  const workDays = new Set(program.workDays);
  const readingDays = new Set(program.readingDays);
  const parts = { attendance: 0, memorization: 0, link: 0, review: 0, reading: 0 };
  const dayRows = days.map(day => {
    const row = { date: day.date, weekday: day.weekday, components: {} };
    if (day.date > today) {
      if (workDays.has(day.weekday)) {
        maxima.programParts.attendance -= program.attendance.present;
        for (const component of ['memorization', 'link', 'review']) {
          maxima.programParts[component] -= program[COMPONENT_MAX_KEY[component]];
        }
      }
      if (readingDays.has(day.weekday)) maxima.programParts.reading -= program.readingDaily;
      return { ...row, excluded: true };
    }
    if (workDays.has(day.weekday)) {
      const attendance = Math.min(program.attendance.present, Math.max(0, Number(day.attendance?.grade) || 0));
      parts.attendance += attendance;
      row.components.attendance = { grade: attendance, max: program.attendance.present };
      for (const component of ['memorization', 'link', 'review']) {
        const entry = day[component] || {};
        const max = program[COMPONENT_MAX_KEY[component]];
        const notApplicable = Boolean(day.planActive) && !entry.scheduled && entry.grade === undefined;
        const grade = notApplicable
          ? (policy.notApplicableCredit === 'full' ? max : 0)
          : Math.min(max, Number(entry.grade) || 0);
        parts[component] += grade;
        row.components[component] = { grade, max, notApplicable };
      }
    }
    if (readingDays.has(day.weekday)) {
      const grade = Math.min(program.readingDaily, Number(day.reading?.grade) || 0);
      parts.reading += grade;
      row.components.reading = { grade, max: program.readingDaily };
    }
    return row;
  });
  const futureWeek = days.length > 0 && days.every(day => day.date > today);
  const programMargin = futureWeek ? 0 : program.margin;
  const generalMargin = futureWeek ? 0 : policy.generalMargin;
  maxima.programParts.margin = programMargin;
  maxima.weeklyProgram = round(Object.values(maxima.programParts).reduce((sum, value) => sum + value, 0));
  if (futureWeek) {
    maxima.trackSession = 0;
    maxima.weeklySession = 0;
    maxima.generalMargin = 0;
  }
  maxima.total = round(maxima.weeklyProgram + maxima.trackSession + maxima.weeklySession + generalMargin);
  const programGrade = round(Object.values(parts).reduce((sum, value) => sum + value, 0) + programMargin);
  const trackGrade = round(Math.min(maxima.trackSession, Number(track?.grade) || 0));
  const weeklyGrade = round(Math.min(maxima.weeklySession, Number(weekly?.grade) || 0));
  const total = round(programGrade + trackGrade + weeklyGrade + generalMargin);
  return {
    maxima,
    parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, round(value)])),
    weeklyProgram: { grade: programGrade, max: maxima.weeklyProgram, margin: programMargin },
    trackSession: { grade: trackGrade, max: maxima.trackSession, recorded: Boolean(track) },
    weeklySession: { grade: weeklyGrade, max: maxima.weeklySession, recorded: Boolean(weekly) },
    generalMargin,
    total,
    max: maxima.total,
    days: dayRows,
  };
}

export function averageWeeklyTotals(weeks = []) {
  const valid = weeks.filter(week => Number.isFinite(Number(week?.total)) && Number(week?.max) > 0);
  if (!valid.length) return null;
  const percent = valid.reduce((sum, week) => sum + (Number(week.total) / Number(week.max)), 0) / valid.length;
  return { weeks: valid.length, averagePercent: round(percent * 100, 2) };
}

/** Faces read: every passed memorization face counts once for the recitation plus the configured repetitions. */
export function facesReadStatistics(rawPolicy, { memorizationFaces = 0, linkFaces = 0, reviewFaces = 0, readingFaces = 0 } = {}) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const memorization = round(Number(memorizationFaces) * (1 + policy.statistics.repetitionsPerFace), 2);
  const link = round(Number(linkFaces), 2);
  const review = round(Number(reviewFaces), 2);
  const reading = round(Number(readingFaces), 2);
  return { memorization, link, review, reading, total: round(memorization + link + review + reading, 2) };
}
