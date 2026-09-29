// Grading policy: every value that decides a student's grade lives here as data, never in the calculation code.
export const GRADING_POLICY_SETTING_KEY = 'gradingPolicy';

export const ATTENDANCE_GRADE_STATUSES = Object.freeze(['present', 'late', 'excused', 'absent']);
export const DAILY_GRADE_COMPONENTS = Object.freeze(['attendance', 'memorization', 'link', 'review', 'reading']);
export const WEEKLY_GRADE_COMPONENTS = Object.freeze(['track', 'weekly']);

export const DEFAULT_GRADING_POLICY = Object.freeze({
  version: 1,
  generalMargin: 20,
  notApplicableCredit: 'full',
  weeklyProgram: Object.freeze({
    workDays: Object.freeze([0, 1, 2, 3, 4]),
    readingDays: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    attendance: Object.freeze({ present: 1, late: 0.5, excused: 0.25, absent: 0 }),
    memorizationDaily: 1,
    linkDaily: 1,
    reviewDaily: 1,
    readingDaily: 1,
    mistakeDeduction: 0.05,
    warningDeduction: 0.01,
    linkFailThreshold: 0.85,
    hizbDeductionLimit: 0.15,
    memorizationThresholds: Object.freeze([
      Object.freeze({ faces: 1, threshold: 0.97 }),
      Object.freeze({ faces: 2, threshold: 0.95 }),
    ]),
    margin: 3,
  }),
  trackSession: Object.freeze({
    attendance: 10,
    segmentCount: 2,
    segmentMax: 10,
    mistakeDeduction: 5,
    warningDeduction: 1,
  }),
  weeklySession: Object.freeze({ attendance: 20 }),
  statistics: Object.freeze({ repetitionsPerFace: 40 }),
});

const round = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const number = (value, fallback, { min = 0, max = 1000 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return round(Math.min(max, Math.max(min, parsed)));
};

const integer = (value, fallback, { min = 0, max = 1000 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const weekDays = (value, fallback) => {
  if (!Array.isArray(value)) return [...fallback];
  const days = [...new Set(value.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
  return days.length ? days : [...fallback];
};

function normalizeThresholds(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const byFaces = new Map();
  for (const item of source) {
    const faces = integer(item?.faces, 0, { min: 0, max: 604 });
    if (faces < 1) continue;
    byFaces.set(faces, { faces, threshold: number(item?.threshold, 0.95, { min: 0, max: 1 }) });
  }
  if (!byFaces.has(1)) byFaces.set(1, { ...fallback.find(item => item.faces === 1) });
  return [...byFaces.values()].sort((a, b) => a.faces - b.faces);
}

/** Returns a complete, validated policy. Unknown or invalid values fall back to the defaults. */
export function normalizeGradingPolicy(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const defaults = DEFAULT_GRADING_POLICY;
  const program = source.weeklyProgram && typeof source.weeklyProgram === 'object' ? source.weeklyProgram : {};
  const programDefaults = defaults.weeklyProgram;
  const attendance = program.attendance && typeof program.attendance === 'object' ? program.attendance : {};
  const track = source.trackSession && typeof source.trackSession === 'object' ? source.trackSession : {};
  const weekly = source.weeklySession && typeof source.weeklySession === 'object' ? source.weeklySession : {};
  const statistics = source.statistics && typeof source.statistics === 'object' ? source.statistics : {};
  return {
    version: defaults.version,
    generalMargin: number(source.generalMargin, defaults.generalMargin),
    notApplicableCredit: source.notApplicableCredit === 'none' ? 'none' : 'full',
    weeklyProgram: {
      workDays: weekDays(program.workDays, programDefaults.workDays),
      readingDays: weekDays(program.readingDays, programDefaults.readingDays),
      attendance: Object.fromEntries(ATTENDANCE_GRADE_STATUSES.map(status => [
        status,
        number(attendance[status], programDefaults.attendance[status]),
      ])),
      memorizationDaily: number(program.memorizationDaily, programDefaults.memorizationDaily),
      linkDaily: number(program.linkDaily, programDefaults.linkDaily),
      reviewDaily: number(program.reviewDaily, programDefaults.reviewDaily),
      readingDaily: number(program.readingDaily, programDefaults.readingDaily),
      mistakeDeduction: number(program.mistakeDeduction, programDefaults.mistakeDeduction, { max: 1 }),
      warningDeduction: number(program.warningDeduction, programDefaults.warningDeduction, { max: 1 }),
      linkFailThreshold: number(program.linkFailThreshold, programDefaults.linkFailThreshold, { max: 1 }),
      hizbDeductionLimit: number(program.hizbDeductionLimit, programDefaults.hizbDeductionLimit, { min: 0.0001, max: 1 }),
      memorizationThresholds: normalizeThresholds(program.memorizationThresholds, programDefaults.memorizationThresholds),
      margin: number(program.margin, programDefaults.margin),
    },
    trackSession: {
      attendance: number(track.attendance, defaults.trackSession.attendance),
      segmentCount: integer(track.segmentCount, defaults.trackSession.segmentCount, { min: 0, max: 20 }),
      segmentMax: number(track.segmentMax, defaults.trackSession.segmentMax),
      mistakeDeduction: number(track.mistakeDeduction, defaults.trackSession.mistakeDeduction),
      warningDeduction: number(track.warningDeduction, defaults.trackSession.warningDeduction),
    },
    weeklySession: {
      attendance: number(weekly.attendance, defaults.weeklySession.attendance),
    },
    statistics: {
      repetitionsPerFace: integer(statistics.repetitionsPerFace, defaults.statistics.repetitionsPerFace, { min: 0, max: 10000 }),
    },
  };
}

/** Recitation sessions run on the weekly program work days; every other day is a weekly holiday. */
export function scheduleDaysFromGradingPolicy(rawPolicy) {
  const { workDays } = normalizeGradingPolicy(rawPolicy).weeklyProgram;
  return {
    recitationSessionDays: [...workDays],
    weeklyHolidayDays: [0, 1, 2, 3, 4, 5, 6].filter(day => !workDays.includes(day)),
  };
}

export function parseGradingPolicy(stored) {
  if (!stored) return normalizeGradingPolicy();
  if (typeof stored === 'object') return normalizeGradingPolicy(stored);
  try {
    return normalizeGradingPolicy(JSON.parse(stored));
  } catch {
    return normalizeGradingPolicy();
  }
}

/** Maximum grade of every part of the week, derived from the policy. */
export function gradingMaxima(rawPolicy) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const program = policy.weeklyProgram;
  const workDays = program.workDays.length;
  const programParts = {
    attendance: round(workDays * program.attendance.present),
    memorization: round(workDays * program.memorizationDaily),
    link: round(workDays * program.linkDaily),
    review: round(workDays * program.reviewDaily),
    reading: round(program.readingDays.length * program.readingDaily),
    margin: program.margin,
  };
  const weeklyProgram = round(Object.values(programParts).reduce((sum, value) => sum + value, 0));
  const trackSession = round(policy.trackSession.attendance + (policy.trackSession.segmentCount * policy.trackSession.segmentMax));
  const weeklySession = policy.weeklySession.attendance;
  return {
    programParts,
    weeklyProgram,
    trackSession,
    weeklySession,
    generalMargin: policy.generalMargin,
    total: round(weeklyProgram + trackSession + weeklySession + policy.generalMargin),
  };
}

export function gradingPolicyErrors(rawPolicy) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const errors = {};
  if (gradingMaxima(policy).total > 100) errors.total = 'مجموع الدرجات يجب ألا يتجاوز 100.';
  for (const status of ['late', 'excused', 'absent']) {
    if (policy.weeklyProgram.attendance[status] > policy.weeklyProgram.attendance.present) {
      errors[`weeklyProgram.attendance.${status}`] = 'يجب ألا تتجاوز درجة الحاضر.';
    }
  }
  return errors;
}

/** Threshold for a memorization amount of N faces: exact entry, otherwise the closest smaller entry. */
export function memorizationThresholdFor(rawPolicy, faceCount) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const faces = Math.max(1, Math.round(Number(faceCount) || 1));
  const thresholds = policy.weeklyProgram.memorizationThresholds;
  let selected = thresholds[0];
  for (const item of thresholds) {
    if (item.faces <= faces) selected = item;
  }
  return selected.threshold;
}

export function reviewAmountThreshold(rawPolicy, hizbCount) {
  const policy = normalizeGradingPolicy(rawPolicy);
  return Math.max(0, round(1 - (Math.max(1, Number(hizbCount) || 1) * policy.weeklyProgram.hizbDeductionLimit)));
}
