import { formatHijriDate, formatHijriDateTime } from '../../../../shared/hijri-calendar.js';
import {
  BookMarked, Building2, CalendarCheck2, CalendarRange, GraduationCap, PlusCircle, Route,
} from 'lucide-react';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';
import { STUDENT_LEVELS, STUDENT_LEVEL_GROUPS, studentLevelShare } from '../../../../shared/student-levels.js';

export const METRIC_COLORS = Object.freeze({
  weeklyProgram: '#0d9488',
  weeklySession: '#ea580c',
  trackSession: '#2563eb',
  levels: STUDENT_LEVELS[0].color,
  committees: '#4f46e5',
  narration: '#e11d48',
  points: '#dc2626',
});

const TONES = Object.freeze({
  good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  bad: 'bg-destructive/12 text-destructive',
  neutral: 'bg-muted text-foreground',
});

const facesFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 2 });
const faces = (value) => facesFormatter.format(Number(value || 0));
const pct = (part, total) => (Number(total) > 0 ? Math.round((Number(part || 0) / Number(total)) * 100) : 0);
const rounded = (value) => Math.round(Number(value || 0));
const percentMetric = (value) => ({ value: rounded(value), display: `${formatNumber(rounded(value))}%` });
const countMetric = (count) => ({ value: Number(count || 0) > 0 ? 100 : 0, countValue: Number(count || 0), display: formatNumber(count) });
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar');
const outOf = (part, total, format = formatNumber) => `${format(part)} من ${format(total)}`;
const gradeTone = (percentage) => (percentage >= 80 ? TONES.good : percentage >= 50 ? TONES.warn : TONES.bad);
const gradeColor = (percentage) => percentage >= 80 ? '#059669' : percentage >= 50 ? '#d97706' : '#dc2626';
const ratioStat = (label, done, total, format = formatNumber) => ({
  label, value: outOf(done, total, format), tone: Number(total) > 0 ? gradeTone(pct(done, total)) : TONES.neutral,
});
const percentStat = (label, done, total) => ({
  label, value: `${formatNumber(pct(done, total))}%`, tone: Number(total) > 0 ? gradeTone(pct(done, total)) : TONES.neutral,
});

/** Small summary cards at the top of a details window: a share (%) or a count. */
const percentTile = (label, value) => ({ label, ...percentMetric(value), color: gradeColor(value) });
const countTile = (label, count, format = formatNumber) => ({ label, value: Number(count || 0) > 0 ? 100 : 0, display: format(count) });

const attendedOf = (stats = {}) => Number(stats.present || 0) + Number(stats.late || 0) + Number(stats.excused || 0);
const committeeBars = (committees = []) => (committees.length > 1
  ? committees.map((row) => ({ label: row.name, percent: row.percentage }))
  : []);

export const ALL_COMMITTEES = 'all';
const sum = (rows, read) => rows.reduce((total, row) => total + Number(read(row) || 0), 0);

/** Students of every circle with their plan indicators (attendance and accepted faces). */
const studentsOf = (overview) => (overview.committeeIndicators || [])
  .flatMap((committee) => (committee.students || []).map((student) => ({ ...student, committeeName: committee.name })));

/** Weekly program: attendance share, the faces achieved and each student's attendance, faces and grade. */
function weeklyProgramMetric(overview, students, filtered) {
  const program = overview.grades?.weeklyProgram || {};
  // Circle totals come from the students shown; all circles use the server totals.
  const quranFaces = filtered
    ? Object.fromEntries(['memorization', 'mastery', 'review', 'link'].map((key) => [key, sum(students, (student) => student.metrics?.[key]?.done)]))
    : overview.totals?.quranFaces || {};
  const attendance = filtered
    ? { present: sum(students, (student) => student.metrics?.attendance?.done), total: sum(students, (student) => student.metrics?.attendance?.total) }
    : overview.attendance?.students || {};
  const gradeById = new Map((program.studentsList || []).map((row) => [String(row.id), row]));
  const reading = overview.grades?.reading || {};
  const readingHizbsOf = student => Number(reading.byStudent?.[String(student.id)]?.hizbs || 0);
  const readingDone = filtered ? sum(students, readingHizbsOf) : Number(reading.hizbs || 0);
  const facesOf = (label, metric = {}) => ratioStat(label, metric.done, metric.total, faces);
  const rows = students
    .map((student) => ({ student, grade: gradeById.get(String(student.id)) }))
    .sort((a, b) => (b.grade?.percentage ?? -1) - (a.grade?.percentage ?? -1) || byName(a.student, b.student))
    .map(({ student, grade }) => ({
      label: student.name,
      note: student.committeeName,
      value: grade ? outOf(grade.grade, grade.max) : '—',
      tone: grade ? gradeTone(grade.percentage) : TONES.neutral,
      stats: [
        ratioStat('الحضور', student.metrics?.attendance?.done, student.metrics?.attendance?.total),
        facesOf('أوجه الحفظ', student.metrics?.memorization),
        facesOf('أوجه الإتقان', student.metrics?.mastery),
        facesOf('المراجعة', student.metrics?.review),
        facesOf('الربط', student.metrics?.link),
        { label: 'أحزاب القراءة الذاتية', value: formatNumber(readingHizbsOf(student)) },
      ],
    }));
  return {
    id: 'weeklyProgram',
    label: 'البرنامج الأسبوعي',
    icon: CalendarRange,
    color: METRIC_COLORS.weeklyProgram,
    ...percentMetric(program.percentage),
    tiles: [
      percentTile('الحضور', pct(attendedOf(attendance), attendance.total)),
      countTile('أوجه الحفظ', quranFaces.memorization, faces),
      countTile('أوجه الإتقان', quranFaces.mastery, faces),
      countTile('المراجعة', quranFaces.review, faces),
      countTile('الربط', quranFaces.link, faces),
      countTile('أحزاب القراءة الذاتية', readingDone),
    ],
    bars: [{ title: 'الحلقات', rows: filtered ? [] : committeeBars(program.committees) }],
    records: [{ title: 'الطلاب', rows, emptyText: 'لا يوجد طلاب' }],
  };
}

const sessionExpectedOf = row => Number(row.expectedWeeks ?? (Number(row.attended || 0) + Number(row.absent || 0)));

/** Weekly session: attendance only, so its details are the weeks attended and missed. */
function weeklySessionMetric(data = {}, inCommittee, filtered) {
  const students = (data.studentsList || []).filter((row) => inCommittee(row.committeeName));
  const attended = filtered ? sum(students, row => row.attended) : Number(data.attended || 0);
  const expected = filtered ? sum(students, sessionExpectedOf) : Number(data.expectedAttendance ?? sum(students, sessionExpectedOf));
  return {
    id: 'weeklySession',
    label: 'الجلسة الأسبوعية',
    icon: CalendarCheck2,
    color: METRIC_COLORS.weeklySession,
    ...percentMetric(pct(attended, expected)),
    tiles: [
      countTile('عدد الحضور', attended),
      percentTile('نسبة الحضور', pct(attended, expected)),
    ],
    bars: [{ title: 'الحلقات', rows: filtered ? [] : committeeBars(data.committees) }],
    records: [{
      title: 'الطلاب',
      rows: students.map((row) => ({
        label: row.name,
        note: row.committeeName || 'بدون حلقة',
        value: `${formatNumber(pct(row.attended, sessionExpectedOf(row)))}%`,
        tone: sessionExpectedOf(row) > 0 ? gradeTone(pct(row.attended, sessionExpectedOf(row))) : TONES.neutral,
        stats: [
          ratioStat('عدد الحضور', row.attended, sessionExpectedOf(row)),
          percentStat('نسبة الحضور', row.attended, sessionExpectedOf(row)),
          ...(Number(row.late) > 0 ? [{ label: 'متأخر', value: formatNumber(row.late) }] : []),
          ...(Number(row.excused) > 0 ? [{ label: 'مستأذن', value: formatNumber(row.excused) }] : []),
        ],
      })),
      emptyText: 'لا توجد درجات مرصودة في هذه الفترة',
    }],
  };
}

/**
 * Track session: the card shows how well the tested segments were recited (their grades out of their maxima),
 * so an untested segment does not count as a failure; attendance is its own summary card.
 */
function trackSessionMetric(data = {}, inCommittee, filtered) {
  const students = (data.studentsList || []).filter((row) => inCommittee(row.committeeName));
  const segments = filtered
    ? Object.fromEntries(['tested', 'compensated', 'mistakes', 'warnings', 'hesitations', 'grade', 'max'].map((key) => [key, sum(students, (row) => row.segments?.[key])]))
    : data.segments || {};
  const attended = filtered ? sum(students, (row) => row.attended) : data.attended;
  const expected = filtered ? sum(students, sessionExpectedOf) : Number(data.expectedAttendance ?? sum(students, sessionExpectedOf));
  const studentValue = (row) => {
    if (Number(row.segments?.compensated) > 0) return { value: 'تعويض', tone: TONES.good };
    if (Number(row.attended || 0) === 0 && Number(row.excused || 0) > 0 && !Number(row.absent || 0)) return { value: 'مستأذن', tone: TONES.neutral };
    if (Number(row.attended || 0) === 0 && Number(row.absent || 0) > 0) return { value: 'غائب', tone: TONES.bad };
    if (!Number(row.segments?.tested || 0)) return { value: Number(row.attended) > 0 ? `${outOf(row.grade, row.max)} · لم يُختبر` : 'غير مرصود', tone: TONES.neutral };
    const accuracy = pct(row.segments.grade, row.segments.max);
    return { value: `${formatNumber(accuracy)}%`, tone: gradeTone(accuracy) };
  };
  return {
    id: 'trackSession',
    label: 'جلسة المسار',
    icon: Route,
    color: METRIC_COLORS.trackSession,
    ...percentMetric(pct(segments.grade, segments.max)),
    tiles: [
      percentTile('الحضور', pct(attended, expected)),
      percentTile('نسبة إتقان الحفظ', pct(segments.grade, segments.max)),
      countTile('الأخطاء', segments.mistakes), countTile('التنبيهات', segments.warnings), countTile('الترددات', segments.hesitations), countTile('المقاطع المعوضة', segments.compensated),
    ],
    bars: [],
    records: [{
      title: 'الطلاب',
      rows: students.map((row) => ({
        label: row.name,
        note: row.committeeName || 'بدون حلقة',
        ...studentValue(row),
        stats: [
          percentStat('الحضور', row.attended, sessionExpectedOf(row)),
          ...(Number(row.late) > 0 ? [{ label: 'متأخر', value: formatNumber(row.late) }] : []),
          ...(Number(row.excused) > 0 ? [{ label: 'مستأذن', value: formatNumber(row.excused) }] : []),
          percentStat('نسبة إتقان الحفظ', row.segments?.grade, row.segments?.max),
          { label: 'الأخطاء', value: formatNumber(row.segments?.mistakes || 0) },
          { label: 'التنبيهات', value: formatNumber(row.segments?.warnings || 0) },
          { label: 'الترددات', value: formatNumber(row.segments?.hesitations || 0) },
        ],
      })),
      emptyText: 'لا توجد درجات مرصودة في هذه الفترة',
    }],
  };
}

/** Level colour: the group's hue, lighter for the group's earlier levels. */
const studentLevelColor = (level) => `color-mix(in oklab, ${level.color} ${studentLevelShare(level)}%, hsl(var(--card)))`;

/**
 * Students per level: the card splits every student into the level colours; the details list each
 * level's count and its students, the longest time in the level first.
 */
function studentLevelsMetric(overview, inCommittee) {
  const allStudents = overview.studentLevels || [];
  const students = allStudents.filter((student) => inCommittee(student.committeeName));
  const byLevel = (rows) => new Map(STUDENT_LEVELS.map((level) => [level.key, rows.filter((row) => row.level?.key === level.key)]));
  const cardLevels = byLevel(allStudents);
  const detailLevels = byLevel(students);
  const performance = new Map((overview.planPerformance?.students || []).map(student => [String(student.studentId), student.series]));
  return {
    id: 'levels',
    label: 'مستويات الطلاب',
    icon: GraduationCap,
    color: METRIC_COLORS.levels,
    ...(Array.isArray(overview.studentLevels) ? countMetric(allStudents.length) : { value: 0, display: 'غير متاح' }),
    segments: STUDENT_LEVELS.map((level) => ({
      key: level.key,
      label: level.name,
      color: studentLevelColor(level),
      count: cardLevels.get(level.key).length,
    })),
    tiles: [],
    levelGroups: STUDENT_LEVEL_GROUPS.map((group) => ({
      ...group,
      name: { taheel: 'التأهيل', nujaba: 'النجباء', fursan: 'الفرسان', huffaz: 'الحفاظ', khirijeen: 'الخريجين' }[group.key],
      count: students.filter(student => student.level?.group === group.key || STUDENT_LEVELS.some(level => level.group === group.key && level.key === student.level?.key)).length,
      levels: STUDENT_LEVELS.filter(level => level.group === group.key).map(level => ({ ...level, color: studentLevelColor(level), count: detailLevels.get(level.key).length })),
    })),
    records: STUDENT_LEVELS
      .filter((level) => detailLevels.get(level.key).length > 0)
      .map((level) => ({
        key: level.key,
        title: level.name,
        rows: [...detailLevels.get(level.key)]
          .sort((a, b) => Number(performance.get(String(a.id))?.at(-1)?.percentage ?? Infinity) - Number(performance.get(String(b.id))?.at(-1)?.percentage ?? Infinity) || byName(a, b))
          .map((student) => ({ label: student.name, series: performance.get(String(student.id)) || [] })),
      })),
  };
}

/** Number of circles, with each circle's students and teachers. */
function committeesCountMetric(overview, inCommittee) {
  const teachersByCommittee = new Map();
  for (const teacher of overview.teachers || []) {
    for (const name of String(teacher.committees || '').split('، ').filter(Boolean)) {
      teachersByCommittee.set(name, [...(teachersByCommittee.get(name) || []), teacher.name]);
    }
  }
  const committees = (overview.committeeIndicators || []).filter((committee) => inCommittee(committee.name));
  return {
    id: 'committees',
    label: 'عدد الحلقات',
    icon: Building2,
    color: METRIC_COLORS.committees,
    ...countMetric(overview.totals?.familiesCount),
    tiles: [
      countTile('الحلقات', committees.length),
      countTile('الطلاب', sum(committees, (committee) => committee.studentsCount)),
    ],
    bars: [],
    records: [{
      title: 'الحلقات',
      rows: [...committees].sort(byName).map((committee) => ({
        label: committee.name,
        note: (teachersByCommittee.get(committee.name) || []).join('، ') || 'بدون مشرف المسار',
        value: `${formatNumber(committee.studentsCount)} طالب`,
      })),
      emptyText: 'لا توجد حلقات',
    }],
  };
}

function narrationMetric(narration = {}, inCommittee, filtered) {
  const students = (narration.studentsList || []).filter((row) => inCommittee(row.committeeName));
  return {
    id: 'narration',
    label: 'يوم السرد',
    icon: BookMarked,
    color: METRIC_COLORS.narration,
    ...countMetric(narration.grade),
    tiles: [
      countTile('الدرجات', filtered ? sum(students, (row) => row.grade) : narration.grade),
      countTile('الطلاب', filtered ? students.length : narration.students),
    ],
    bars: [],
    records: [{
      title: 'الطلاب',
      rows: students.map((row) => ({
        label: row.name,
        note: row.committeeName || 'بدون حلقة',
        value: `${formatNumber(row.grade)} درجة`,
        stats: [{ label: 'مرات السرد', value: formatNumber(row.times) }],
      })),
    }],
  };
}

function teacherPointsMetric(list, inCommittee) {
  list ??= { loading: true, rows: [] };
  const allRows = list.rows || [];
  const allIncreases = allRows.filter((row) => row.type === 'increase').length;
  const rows = allRows.filter((row) => inCommittee(row.committeeName));
  const increases = rows.filter((row) => row.type === 'increase').length;
  return {
    id: 'points',
    label: 'الإضافة والخصم',
    icon: PlusCircle,
    color: METRIC_COLORS.points,
    value: pct(allIncreases, allRows.length),
    countValue: allRows.length,
    display: formatNumber(allRows.length),
    loading: list.loading,
    error: list.error,
    tiles: [
      countTile('إضافة', increases),
      countTile('خصم', rows.length - increases),
    ],
    bars: [],
    records: [{
      title: 'العمليات',
      rows: rows.map((row) => ({
        label: row.studentName,
        note: [row.reason, row.transactionDate, row.teacherName].filter(Boolean).join(' · '),
        value: `${row.type === 'increase' ? '+' : '-'}${faces(row.points)}`,
        tone: row.type === 'increase' ? TONES.good : TONES.bad,
      })),
    }],
  };
}

/** Circle names that the details window can filter by. */
export const detailCommitteesOf = (overview) => [...new Set((overview?.committeeIndicators || []).map((committee) => committee.name).filter(Boolean))];

/**
 * Every indicator of the statistics page, each with its own summary cards and student details.
 * The card values always cover the whole page scope; `committee` narrows only the details.
 * `lists` holds { teacherPoints } as { rows, loading, error } or undefined.
 */
export function buildReportMetrics(overview, {
  lists = {},
  showStandard = true,
  showTeacherPoints = false,
  committee = ALL_COMMITTEES,
} = {}) {
  const filtered = committee !== ALL_COMMITTEES;
  const inCommittee = (name) => !filtered || name === committee;
  const metrics = [];
  if (showStandard && overview) {
    const grades = overview.grades || {};
    const students = studentsOf(overview).filter((student) => inCommittee(student.committeeName));
    metrics.push(
      weeklyProgramMetric(overview, students, filtered),
      weeklySessionMetric(grades.weeklySession, inCommittee, filtered),
      trackSessionMetric(grades.trackSession, inCommittee, filtered),
      narrationMetric(grades.narration, inCommittee, filtered),
      studentLevelsMetric(overview, inCommittee),
      committeesCountMetric(overview, inCommittee),
    );
    const compensations = (grades.compensations || []).filter(row => inCommittee(row.committeeName));
    if (compensations.length) metrics.push({ id: 'compensations', label: 'التعويضات', icon: CalendarCheck2,
      color: METRIC_COLORS.weeklyProgram, ...countMetric(compensations.filter(row => !row.cancelledAt).length),
      tiles: [countTile('التعويضات المعتمدة', compensations.filter(row => !row.cancelledAt).length), countTile('التعويضات الملغاة', compensations.filter(row => row.cancelledAt).length)], bars: [],
      records: [{ title: 'سجل التعويض', rows: compensations.map(row => ({ label: row.studentName,
        note: `${row.committeeName || 'بدون حلقة'} · ${row.scope === 'track' ? 'جلسة المسار' : 'البرنامج الأسبوعي'}`,
        value: row.cancelledAt ? 'ملغى' : 'تعويض', stats: [
          { label: 'اليوم المعوض', value: formatHijriDate(row.date) }, { label: 'نفذه', value: row.actorName },
          { label: 'وقت التسجيل', value: formatHijriDateTime(row.recordedAt) }, { label: 'مرجع الاستئذان', value: row.excuseReference },
          ...(row.cancelledAt ? [{ label: 'ألغاه', value: row.cancelledByName }, { label: 'سبب الإلغاء', value: row.cancellationReason }] : []),
        ] })) }],
    });
  }
  if (showTeacherPoints) metrics.push(teacherPointsMetric(lists.teacherPoints, inCommittee));
  return metrics;
}
