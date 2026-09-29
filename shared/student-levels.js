/**
 * Student levels follow the memorization order from juz 30 down to juz 1.
 * A student sits in the first level whose juz are not all memorized; the last
 * level stays as the student's level after the whole Quran is memorized.
 */
export const STUDENT_LEVEL_GROUPS = Object.freeze([
  Object.freeze({ key: 'taheel', name: 'تأهيل', color: '#2a78d6' }),
  Object.freeze({ key: 'nujaba', name: 'نجباء', color: '#eb6834' }),
  Object.freeze({ key: 'fursan', name: 'فرسان', color: '#1baf7a' }),
  Object.freeze({ key: 'huffaz', name: 'حفاظ', color: '#eda100' }),
  Object.freeze({ key: 'khirijeen', name: 'خريجين', color: '#e87ba4' }),
]);

const LEVEL_JUZS = Object.freeze([
  ['taheel', [30, 29]],
  ['taheel', [28, 27]],
  ['nujaba', [26, 25]],
  ['nujaba', [24, 23]],
  ['nujaba', [22, 21]],
  ['fursan', [20, 19]],
  ['fursan', [18, 17]],
  ['fursan', [16, 15]],
  ['huffaz', [14, 13]],
  ['huffaz', [12, 11]],
  ['huffaz', [10, 9]],
  ['khirijeen', [8, 7]],
  ['khirijeen', [6, 5, 4, 3]],
  ['khirijeen', [2, 1]],
]);

const groupByKey = new Map(STUDENT_LEVEL_GROUPS.map((group) => [group.key, group]));

export const STUDENT_LEVELS = Object.freeze(LEVEL_JUZS.map(([groupKey, juzs], index) => {
  const group = groupByKey.get(groupKey);
  const rank = LEVEL_JUZS.slice(0, index + 1).filter(([key]) => key === groupKey).length;
  return Object.freeze({
    key: `${groupKey}-${rank}`,
    index,
    group: groupKey,
    rank,
    name: `${group.name} ${rank}`,
    color: group.color,
    juzs: Object.freeze([...juzs]),
  });
}));

const levelByKey = new Map(STUDENT_LEVELS.map((level) => [level.key, level]));

export const findStudentLevel = (key) => levelByKey.get(String(key || '')) || null;

/** Sub-levels share their group's hue and deepen with the rank (1 lightest). */
export const studentLevelShare = (level) => {
  const size = LEVEL_JUZS.filter(([key]) => key === level?.group).length;
  return size > 1 ? 45 + Math.round(((Number(level.rank) - 1) / (size - 1)) * 55) : 100;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const laterDate = (first, second) => (!first ? second || null : !second ? first : (first > second ? first : second));

/**
 * `juzStatus` maps a juz number to { total, covered, pages, completedOn } where `total`/`covered`
 * count ayahs and `completedOn` is the business date the juz became fully memorized.
 * Returns the current level, the page-weighted progress inside it and the date the level started
 * (null for the first level, whose start is the student's own start date).
 */
export function resolveStudentLevel(juzStatus = new Map()) {
  const status = (juz) => {
    const row = juzStatus instanceof Map ? juzStatus.get(juz) : juzStatus[juz];
    const total = toNumber(row?.total);
    return {
      total,
      covered: Math.min(toNumber(row?.covered), total),
      pages: toNumber(row?.pages) || 1,
      completedOn: row?.completedOn || null,
    };
  };
  const complete = (juz) => {
    const row = status(juz);
    return row.total > 0 && row.covered >= row.total;
  };
  const currentIndex = STUDENT_LEVELS.findIndex((level) => !level.juzs.every(complete));
  const finished = currentIndex === -1;
  const level = STUDENT_LEVELS[finished ? STUDENT_LEVELS.length - 1 : currentIndex];
  let pages = 0;
  let memorizedPages = 0;
  for (const juz of level.juzs) {
    const row = status(juz);
    pages += row.pages;
    memorizedPages += row.total > 0 ? (row.covered / row.total) * row.pages : 0;
  }
  const since = STUDENT_LEVELS.slice(0, level.index)
    .flatMap((previous) => previous.juzs)
    .reduce((date, juz) => laterDate(date, status(juz).completedOn), null);
  return {
    key: level.key,
    name: level.name,
    group: level.group,
    rank: level.rank,
    index: level.index,
    color: level.color,
    finished,
    progressPercent: finished ? 100 : Math.max(0, Math.min(100, Math.floor((memorizedPages / pages) * 100))),
    since,
  };
}

/** Whole days between two business dates (YYYY-MM-DD); never negative. */
export function daysBetweenDates(from, to) {
  const start = Date.parse(`${String(from || '')}T12:00:00Z`);
  const end = Date.parse(`${String(to || '')}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}
