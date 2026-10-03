import React from 'react';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import { sessionAttendanceStatus } from '../../../../shared/session-attendance.js';
import { sessionPeriod } from '../../../../shared/session-period.js';
import { formatQuranRangeText } from '@/lib/quranRangeText';
import GradeScore from '@/components/dashboard/grades/GradeScore';

import { ATTENDANCE_LABELS } from '@/components/dashboard/grades/gradesFormat';

export default function StudentWeeklySessionResult({ week, component, today }) {
  const track = component === 'track';
  const section = track ? 'trackSession' : 'weeklySession';
  const detail = week.grade?.[track ? 'trackDetail' : 'weeklyDetail'];
  const score = week.grade?.[section];
  const day = week.grade?.policy?.[section]?.sessionDay;
  const period = sessionPeriod(week.start, day);
  const attendanceRecorded = detail && detail.attendanceRecorded !== false;
  return <section className="student-session-part" aria-label={track ? 'جلسة المسار' : 'الجلسة الأسبوعية'}>
    <header><div><h4>{track ? 'جلسة المسار' : 'الجلسة الأسبوعية'}</h4>
      <small>{formatHijriDate(period.start)} — {formatHijriDate(period.end)}</small></div>
      {score?.recorded && <GradeScore grade={score.grade} max={score.max} />}
    </header>
    <p className="mt-2 text-xs text-muted-foreground">{attendanceRecorded ? ATTENDANCE_LABELS[sessionAttendanceStatus(detail)] : period.start > today ? 'لم تبدأ الجلسة' : 'بانتظار تسجيل الحضور'}</p>
    {track && detail?.segments?.length > 0 && <div className="student-session-records">{detail.segments.map((segment, index) => <div key={index}>
      <h5 className="font-bold">{segment.source === 'review' ? 'مقطع المراجعة' : 'مقطع الربط'} {index + 1}</h5>
      {segment.range && <p>{formatQuranRangeText({ startSurah: segment.range.fromSurah, startAyah: segment.range.fromAyah, endSurah: segment.range.toSurah, endAyah: segment.range.toAyah })}</p>}
      <p>{segment.compensated ? 'مُعوّض' : segment.recorded ? `${segment.mistakes || 0} أخطاء، ${segment.warnings || 0} تنبيهات، ${segment.hesitations || 0} ترددات` : 'بانتظار الاختبار'}</p>
      {(segment.recorded || segment.compensated) && <GradeScore grade={segment.grade} max={segment.max} />}
    </div>)}</div>}
  </section>;
}
