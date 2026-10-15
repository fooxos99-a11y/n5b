import { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import { sessionPeriod } from '../../../../shared/session-period.js';
import { studentSessionGroupResult, studentSessionResult } from '../../../../src/lib/studentSessionResult.js';
import { studentRangeLabel, studentTaskLabels, type StudentGrade, type StudentPlanData, type StudentPointsDay,
  type StudentSavedJuz, type StudentWeek, type StudentWeeklyGrade } from '../../domain/studentDashboard';
import { usePalette, useTheme } from '../../theme';
import { AppText } from '../AppText';
import { DashboardIcon } from '../dashboard/DashboardIcon';
import { StudentPointsValue } from './StudentPointsValue';
import { StudentResourceStatus, type StudentResource } from './StudentResourceStatus';
import { StudentSessionTabs } from './StudentSessionTabs';
import type { StudentSessionTab } from './studentSessionNavigation';
import { studentSessionDays } from './studentSessionPresentation';
import { StudentProgress } from './StudentPortalSurface';
import { StudentTaskAmounts } from './StudentTaskAmounts';

const number = (value: number) => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(value);
const dayName = (date: string) => new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' }).format(new Date(`${date}T12:00:00Z`));
const attendance: Record<string, string> = { present: 'حاضر', late: 'متأخر', excused: 'مستأذن', absent: 'غائب' };
export function StudentSessionsContent({ plan, saved, weeks, tab, onTabChange, onRetry, expanded, onToggle }: {
  plan: StudentResource<StudentPlanData>; saved: StudentResource<StudentSavedJuz[]>; weeks: StudentWeek[];
  tab: StudentSessionTab; onTabChange: (value: StudentSessionTab) => void; onRetry: () => void;
  expanded: ReadonlySet<number>; onToggle: (juz: number) => void;
}) {
  const palette = usePalette(); const today = plan.value?.today; const { width } = useWindowDimensions();
  const summaryText = { fontSize: width >= 640 ? 14 : 12, lineHeight: width >= 640 ? 28 : 24 };
  return <StudentSessionTabs value={tab} onChange={onTabChange}>
    {!!today?.plan?.projectedEndDate && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: '100%', marginBottom: 12 }}>
      <AppText numberOfLines={1} style={[summaryText, { flexShrink: 0 }]}>
      تاريخ انتهاء الخطة المتوقع: {formatHijriDate(today.plan.projectedEndDate)}
      {today.plan.paceStatus === 'behind' && today.plan.delayedFaces > 0 && <AppText style={[summaryText, { color: palette.error }]}> ({number(today.plan.delayedFaces)} أوجه متعثرة)</AppText>}
      </AppText>
    </ScrollView>}
    {tab === 'saved' ? <SavedContent resource={saved} onRetry={onRetry} expanded={expanded} onToggle={onToggle} /> : <>
      <StudentResourceStatus resource={plan} onRetry={onRetry} large />
      <View style={{ gap: 12, direction: 'rtl' }}>{weeks.map(week => <SessionWeek key={week.start} week={week} today={today?.date ?? ''} />)}</View>
      {!plan.loading && !plan.error && !weeks.length && <AppText style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>لا توجد خطة أو نتائج مسجلة.</AppText>}
    </>}
  </StudentSessionTabs>;
}
function Grade({ score, lineHeight = 18 }: { score: Pick<StudentGrade, 'grade' | 'max'>; lineHeight?: number }) {
  const palette = usePalette();
  return <AppText style={{ fontSize: 12, lineHeight, fontFamily: 'CairoBlack', writingDirection: 'ltr' }}>{number(score.grade)}
    <AppText style={{ fontSize: 12, lineHeight, fontFamily: 'CairoBold', color: palette.muted }}>/{number(score.max)}</AppText></AppText>;
}
function SessionWeek({ week, today }: { week: StudentWeek; today: string }) {
  const palette = usePalette(); const { theme } = useTheme(); const { width } = useWindowDimensions();
  const [columnsWidth, setColumnsWidth] = useState(0);
  const days = studentSessionDays(week, today);
  return <View accessibilityLabel={`الأسبوع ${formatHijriDate(week.start)}`} style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 18, overflow: 'hidden', backgroundColor: palette.card }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10, paddingHorizontal: 12,
      backgroundColor: `${palette.primary}0a` }}><AppText accessibilityRole="header" style={{ fontSize: 14, lineHeight: 21, fontFamily: 'CairoExtraBold' }}>الأسبوع</AppText>
      <AppText style={{ fontSize: 11, lineHeight: 16.5 }}>{formatHijriDate(week.start)} — {formatHijriDate(week.end)}</AppText></View>
    <View accessibilityLabel="البرنامج الأسبوعي" style={{ padding: 12, borderTopWidth: 1, borderColor: palette.border }}>
      <View style={row}><AppText style={heading}>البرنامج الأسبوعي</AppText>{week.grade && <Grade score={week.grade.weeklyProgram} />}</View>
    </View>
    {days.map((day, dayIndex) => <View key={day.date} accessibilityLabel={`يوم الجلسات ${day.date}`} style={{ padding: width >= 768 ? 12 : 10,
      borderTopWidth: dayIndex ? 1 : 0, borderColor: palette.border }}>
      <View style={[row, { marginBottom: 6 }]}><AppText style={{ fontSize: 12, lineHeight: 18, fontFamily: 'CairoExtraBold' }}>{dayName(day.date)}</AppText>
        {day.points && <DayPoints points={day.points} />}</View>
      <View accessibilityLabel={`مقادير يوم ${day.date}`} onLayout={event => setColumnsWidth(event.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', gap: 8 }}>{(['memorization', 'review', 'link'] as const).map(type => {
        const tasks = day.tasks.filter(task => task.taskType === type).sort((a, b) => a.id - b.id);
        return <View key={type} style={{ ...(columnsWidth ? { width: (columnsWidth - 16) / 3 } : { flex: 1 }), minWidth: 0, gap: 6, borderColor: `${palette.border}99`,
          borderRightWidth: type === 'memorization' ? 0 : 1, paddingRight: type === 'memorization' ? 0 : 8 }}>
          <AppText style={{ fontSize: 12, lineHeight: 18, fontFamily: 'CairoExtraBold' }}>{studentTaskLabels[type]}</AppText>
          {!tasks.length ? <AppText style={{ fontSize: 12, lineHeight: 18 }}>—</AppText> : <View style={{ gap: 12 }}>{(type === 'memorization' ? tasks.map(task => [task]) : [tasks]).map(group => {
            const result = type === 'memorization' ? studentSessionResult(group[0]) : studentSessionGroupResult(group);
            const evaluatedDate = group.map(task => task.evaluatedAt.slice(0, 10)).sort().at(-1);
            const color = result.tone === 'completed' ? theme === 'dark' ? '#95dfd6' : '#08887d'
              : result.tone === 'mistakes' ? theme === 'dark' ? '#f5c397' : '#b54708' : palette.muted;
            return <View key={group[0]!.id} style={{ gap: 2 }}><StudentTaskAmounts tasks={group.filter(task => !task.amountHidden)} />
              <AppText style={{ fontSize: result.tone === 'pending' ? 10 : 12, lineHeight: result.tone === 'pending' ? 17 : 20.4,
                fontFamily: result.tone === 'pending' ? 'Cairo' : 'CairoBold', color }}>{result.label}</AppText>
              {!!evaluatedDate && evaluatedDate !== day.date && <AppText style={{ fontSize: 12, lineHeight: 16, color }}>قُيّم بتاريخ {formatHijriDate(evaluatedDate)}</AppText>}
            </View>;
          })}</View>}
        </View>;
      })}</View>
      <DailyRecords grade={week.grade} date={day.date} />
    </View>)}
    <WeeklyResult week={week} today={today} type="track" /><WeeklyResult week={week} today={today} type="weekly" />
  </View>;
}
function WeeklyResult({ week, today, type }: { week: StudentWeek; today: string; type: 'track' | 'weekly' }) {
  const palette = usePalette(); const grade = week.grade; const track = type === 'track';
  const score = grade?.[track ? 'trackSession' : 'weeklySession']; const status = grade?.[track ? 'trackAttendance' : 'weeklyAttendance'];
  const period = sessionPeriod(week.start, grade?.[track ? 'trackDay' : 'weeklyDay']);
  return <View accessibilityLabel={track ? 'جلسة المسار' : 'الجلسة الأسبوعية'} style={{ padding: 12, borderTopWidth: 1, borderColor: palette.border }}>
    <View style={row}><View><AppText style={heading}>{track ? 'جلسة المسار' : 'الجلسة الأسبوعية'}</AppText>
      <AppText style={{ fontSize: 10, lineHeight: 15, color: palette.muted, marginTop: 4 }}>{formatHijriDate(period.start)} — {formatHijriDate(period.end)}</AppText></View>
      {score?.recorded && <Grade score={score} />}</View>
    <AppText style={{ fontSize: 12, lineHeight: 16, color: palette.muted, marginTop: 8 }}>{attendance[status ?? ''] || (period.start > today ? 'لم تبدأ الجلسة' : 'بانتظار تسجيل الحضور')}</AppText>
    {track && !!grade?.trackSegments.length && <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, paddingVertical: 8 }}>{grade.trackSegments.map((segment, index) => <View key={index} style={recordColumn}>
      <AppText style={[recordText, { fontFamily: 'CairoBold' }]}>{segment.source === 'review' ? 'مقطع المراجعة' : 'مقطع الربط'} {index + 1}</AppText>
      {segment.range && <AppText style={recordText}>{studentRangeLabel(segment.range)}</AppText>}
      <AppText style={recordText}>{segment.compensated ? 'مُعوّض' : segment.recorded ? `${segment.mistakes} أخطاء، ${segment.warnings} تنبيهات، ${segment.hesitations} ترددات` : 'بانتظار الاختبار'}</AppText>
      {(segment.recorded || segment.compensated) && <Grade score={segment} lineHeight={21.6} />}
    </View>)}</View>}
  </View>;
}
function DailyRecords({ grade, date }: { grade?: StudentWeeklyGrade; date: string }) {
  const records = grade?.records[date], scheduled = grade?.scheduledRecords[date];
  return <View accessibilityLabel={`درجات يوم ${date}`} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, paddingVertical: 8 }}>
    {scheduled?.attendance && <View style={recordColumn}><AppText style={[recordText, { fontFamily: 'CairoBold' }]}>الحضور</AppText>
      <AppText style={recordText}>{records?.attendance ? attendance[records.attendance.status] || 'حُفظ الحضور' : 'بانتظار تسجيل الحضور'}</AppText>{records?.attendance && <Grade score={records.attendance} lineHeight={21.6} />}</View>}
    {scheduled?.reading && <View style={recordColumn}><AppText style={[recordText, { fontFamily: 'CairoBold' }]}>المقدار الذاتي</AppText>
      {!!records?.reading?.readingAmount && <AppText style={recordText}>{records.reading.readingAmount}</AppText>}
      {records?.reading?.ranges.map((range, index) => <AppText key={index} style={recordText}>{studentRangeLabel(range)}</AppText>)}
      <AppText style={recordText}>{records?.reading ? records.reading.passed ? 'مكتمل' : 'لم يكتمل' : 'بانتظار التسجيل'}</AppText>{records?.reading && <Grade score={records.reading} lineHeight={21.6} />}</View>}
  </View>;
}
function DayPoints({ points }: { points: StudentPointsDay }) {
  const palette = usePalette(); const [open, setOpen] = useState(false);
  return points.pending ? <AppText style={{ fontSize: 12, lineHeight: 16, color: palette.muted }}>بانتظار التقييم</AppText> : <View style={{ minWidth: 0, flexShrink: 1 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`نقاط اليوم: ${number(points.earned)}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><StudentPointsValue value={points.earned} /></Pressable>
    {open && <View style={{ gap: 4 }}>{points.details.map((detail, index) => <View key={index} style={row}><AppText style={{ fontSize: 12 }}>{detail.label}</AppText><StudentPointsValue value={detail.earned} /></View>)}
      {!!points.additionalDetails.length && <><AppText style={{ fontSize: 12 }}>البرامج والمكافآت والتعديلات</AppText><StudentPointsValue value={points.additionalEarned} />
        {points.additionalDetails.map((detail, index) => <View key={index} style={row}><AppText style={{ fontSize: 12 }}>{detail.label}</AppText><StudentPointsValue value={detail.earned} /></View>)}</>}
    </View>}
  </View>;
}
function SavedContent({ resource, onRetry, expanded, onToggle }: { resource: StudentResource<StudentSavedJuz[]>; onRetry: () => void;
  expanded: ReadonlySet<number>; onToggle: (juz: number) => void }) {
  const palette = usePalette(); const { width } = useWindowDimensions(); const columns = width >= 768 ? 3 : 2;
  const [gridWidth, setGridWidth] = useState(0);
  const visible = resource.value?.filter(juz => juz.progressPercent > 0 || juz.savedRanges.length) ?? [];
  return <><StudentResourceStatus resource={resource} onRetry={onRetry} large />
    {!resource.loading && !resource.error && !visible.length && <AppText style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>لا يوجد محفوظ مسجل حتى الآن.</AppText>}
    <View onLayout={event => setGridWidth(event.nativeEvent.layout.width)} style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>{visible.map(juz => <View key={juz.juz}
      style={{ width: expanded.has(juz.juz) ? '100%' : gridWidth ? (gridWidth - (columns - 1) * 12) / columns : `${100 / columns}%`, minWidth: 0, borderWidth: 1,
        borderColor: palette.border, borderRadius: 15, backgroundColor: palette.background, boxShadow: `0 4px 14px ${palette.primary}0a` }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${juz.label} · ${number(juz.progressPercent)}٪${juz.isComplete ? ' · مكتمل' : ''}`}
        accessibilityState={{ expanded: expanded.has(juz.juz) }} onPress={() => onToggle(juz.juz)} style={{ minHeight: 100, padding: 15, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }}><DashboardIcon name="workspace" size={19} color={palette.text} /><AppText style={{ fontFamily: 'CairoExtraBold', fontSize: 13 }}>{juz.label}</AppText></View>
        <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }}><AppText style={{ fontSize: 12, color: palette.muted }}>{number(juz.progressPercent)}٪</AppText><DashboardIcon name="chevronDown" size={18} color={palette.muted} /></View>
        <StudentProgress value={juz.progressPercent} label={`تقدم ${juz.label}`} height={6} />
      </Pressable>
      {expanded.has(juz.juz) && <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>{juz.savedRanges.length ? juz.savedRanges.map((range, index) => <AppText key={index} style={{ fontSize: 13, lineHeight: 24, padding: 12 }}>{studentRangeLabel(range)}</AppText>)
        : <AppText style={{ fontSize: 13, color: palette.muted, textAlign: 'center' }}>تفاصيل المحفوظ غير متاحة حاليًا.</AppText>}</View>}
    </View>)}</View>
  </>;
}
const row = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } as const;
const heading = { fontSize: 14, lineHeight: 21, fontFamily: 'CairoExtraBold' };
const recordText = { fontSize: 12, lineHeight: 21.6 };
const recordColumn = { flexGrow: 1, flexBasis: 120, minWidth: 0 };
