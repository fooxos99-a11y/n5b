import { useId, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { screenStyles } from '../ScreenLayout';
import { usePalette } from '../../theme';
import { reportFaces, reportNumber } from './reportPresentation';
import { DashboardIcon } from '../dashboard/DashboardIcon';

export type ReportRankingRow = { id: number; name: string; grade?: number; max?: number; average?: number; percentage?: number | null;
  committeeName?: string; complexName?: string; studentsCount?: number; committeesCount?: number };
export type ReportTeacherRow = { id: number; name: string; committees?: string;
  attendance?: { attended?: number; late?: number; absent?: number; excused?: number; expected?: number; percentage?: number | null };
  achievement?: { completed?: number; expected?: number; percentage?: number | null } };
function RankingSection({ title, children }: { title: string; children: ReactNode }) {
  const palette = usePalette(), { width } = useWindowDimensions();
  return <View style={[rankingStyles.panel, { borderColor: palette.border, backgroundColor: palette.card, padding: width < 640 ? 16 : 20 }]}>
    <AppText accessibilityRole="header" style={{ fontSize: 14, fontFamily: 'CairoSemi', borderBottomWidth: 1,
      borderColor: `${palette.border}b3`, paddingBottom: 12 }}>{title}</AppText>{children}
  </View>;
}
function RankingRow({ index, name, note, children, stacked = false }: { index: number; name: string; note: string; children: ReactNode; stacked?: boolean }) {
  const palette = usePalette();
  const gradientId = useId().replaceAll(':', '');
  const goldTint = `#${[1, 3, 5].map((position, index) => Math.round(Number.parseInt(palette.card.slice(position, position + 2), 16)
    * 0.87 + [245, 193, 61][index]! * 0.13).toString(16).padStart(2, '0')).join('')}`;
  const colors = [{ text: '#795512', background: '#f9e8bb' }, { text: '#4b6579', background: '#e9f0f5' },
    { text: '#795533', background: '#f7ebdf' }][index] ?? { text: '#526b75', background: '#f1f5f7' };
  return <View style={[rankingStyles.row, { borderColor: palette.border, flexWrap: stacked ? 'wrap' : 'nowrap' }]}>
    {index === 0 && <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} accessible={false} pointerEvents="none">
      <Defs><LinearGradient id={gradientId} x1="100%" y1="0%" x2="0%" y2="0%">
        <Stop offset="0%" stopColor={goldTint} /><Stop offset="70%" stopColor={palette.card} />
      </LinearGradient></Defs><Rect width="100%" height="100%" rx={12} fill={`url(#${gradientId})`} />
    </Svg>}
    <View style={[rankingStyles.medal, { backgroundColor: colors.background }]} accessibilityLabel={`المركز ${index + 1}`}>
      {index < 3 ? <><DashboardIcon name={index === 0 ? 'crown' : 'award'} color={colors.text} size={21} />
        <AppText style={{ color: colors.text, fontSize: 9, lineHeight: 10 }}>{reportNumber(index + 1)}</AppText></>
        : <AppText style={{ color: colors.text }}>{reportNumber(index + 1)}</AppText>}
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 5 }}><AppText style={{ fontFamily: 'CairoSemi', fontSize: 13, lineHeight: 22 }}>{name}</AppText>
      {!!note && <AppText style={{ color: palette.muted, fontSize: 11, lineHeight: 18 }}>{note}</AppText>}</View>
    <View style={stacked ? { width: '100%', paddingRight: 48 } : undefined}>{children}</View>
  </View>;
}
function RankingList({ title, rows, unavailable }: { title: string; rows: { name: string; note: string; value: string }[]; unavailable?: boolean }) {
  const palette = usePalette();
  return <RankingSection title={title}>{unavailable ? <AppText>بيانات الترتيب غير متاحة في هذا التقرير.</AppText> : !rows.length && <AppText>لا توجد بيانات في هذه الفترة.</AppText>}
    <View style={{ gap: 8 }}>{rows.map((row, index) => <RankingRow key={`${row.name}-${index}`} index={index} name={row.name} note={row.note}>
      <AppText style={{ backgroundColor: `${palette.primary}14`, color: palette.primary, borderRadius: 9, paddingHorizontal: 8,
        paddingVertical: 6, fontSize: 12, fontFamily: 'CairoSemi' }}>{row.value}</AppText>
    </RankingRow>)}</View>
  </RankingSection>;
}
export function ReportRankingPanels({ bestStudents, bestCommittees, bestComplexes }: {
  bestStudents?: readonly ReportRankingRow[]; bestCommittees?: readonly ReportRankingRow[]; bestComplexes?: readonly ReportRankingRow[];
}) {
  const decimals = (value: number) => value.toLocaleString('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 1 });
  const value = (row: ReportRankingRow) => row.percentage !== null && row.percentage !== undefined ? `${decimals(row.percentage)}%`
    : row.max === 0 ? '—' : row.average === undefined && row.grade === undefined ? 'غير متاح' : `${decimals(row.average ?? row.grade ?? 0)} درجة`;
  return <>
    <RankingList title="أفضل الطلاب" unavailable={!bestStudents} rows={(bestStudents ?? []).map(row => ({ name: row.name,
      note: [row.committeeName || 'بدون حلقة', row.complexName].filter(Boolean).join(' · '), value: row.grade === undefined ? 'غير متاح' : `${reportFaces(row.grade)} درجة` }))} />
    <RankingList title="أفضل الحلقات" unavailable={!bestCommittees} rows={(bestCommittees ?? []).map(row => ({ name: row.name,
      note: [row.complexName, `${reportNumber(row.studentsCount)} طالب`].filter(Boolean).join(' · '), value: value(row) }))} />
    <RankingList title="أفضل المجمعات" unavailable={!bestComplexes} rows={(bestComplexes ?? []).map(row => ({ name: row.name,
      note: `${reportNumber(row.committeesCount)} حلقة · ${reportNumber(row.studentsCount)} طالب`, value: value(row) }))} />
  </>;
}
export function ReportTeachersPanel({ teachers }: { teachers: readonly ReportTeacherRow[] }) {
  const palette = usePalette(); const [selection, setSelection] = useState<{ id: number; type: 'attendance' | 'achievement' } | null>(null);
  const { width } = useWindowDimensions();
  const teacher = teachers.find(row => row.id === selection?.id); const attendance = teacher?.attendance ?? {}, achievement = teacher?.achievement ?? {};
  const complete = achievement.completed !== undefined && achievement.expected !== undefined;
  const details: [string, number | undefined][] = selection?.type === 'attendance' ? [
    ['الحضور', attendance.attended], ['التأخير', attendance.late], ['الغياب', attendance.absent], ['الاستئذان المعتمد', attendance.excused],
    ['الأيام المطلوبة', attendance.expected], ['غير مرصود', Math.max(0, (attendance.expected ?? 0) - (attendance.attended ?? 0) - (attendance.absent ?? 0))],
  ] : complete ? [['مرات رصد الطلاب المكتملة', achievement.completed], ['مرات رصد الطلاب المطلوبة', achievement.expected],
    ['المتبقي', Math.max(0, (achievement.expected ?? 0) - (achievement.completed ?? 0))]] : [];
  const percentage = (value?: number | null) => value === null || value === undefined ? '—' : `${reportNumber(Math.max(0, Math.min(100, value)))}%`;
  const indicator = (row: ReportTeacherRow, type: 'attendance' | 'achievement') => {
    const label = type === 'attendance' ? 'الحضور' : 'إكمال الرصد';
    const percent = type === 'attendance' ? row.attendance?.percentage : row.achievement?.completed !== undefined ? row.achievement.percentage : null;
    const value = Math.max(0, Math.min(100, percent ?? 0));
    return <Pressable accessibilityRole="button" accessibilityLabel={`${label} — ${row.name}`} onPress={() => setSelection({ id: row.id, type })}
      style={{ minHeight: 44, minWidth: 96, padding: 8, gap: 6, borderRadius: 8, backgroundColor: `${palette.primary}0d` }}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 }}>
        <AppText style={{ color: palette.primary, fontSize: 12 }}>{label}</AppText><AppText style={{ color: palette.primary, fontSize: 12 }}>{percentage(percent)}</AppText>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: value }}
        style={{ height: 6, borderRadius: 3, backgroundColor: palette.mutedSurface, overflow: 'hidden', flexDirection: 'row-reverse' }}>
        <View style={{ width: `${value}%`, height: 6, borderRadius: 3, backgroundColor: '#0d9488' }} />
      </View>
    </Pressable>;
  };
  return <>
    <RankingSection title="مشرفو المسارات">{!teachers.length && <AppText>لا يوجد مشرفون في هذه الفترة.</AppText>}
      <View style={{ gap: 8 }}>{teachers.map((row, index) => <RankingRow key={row.id} stacked={width < 640} index={index} name={row.name} note={row.committees || 'بدون حلقة'}>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>{indicator(row, 'attendance')}{indicator(row, 'achievement')}</View>
      </RankingRow>)}</View>
    </RankingSection>
    {!!teacher && !!selection && <FormDialog visible title={`${selection.type === 'attendance' ? 'الحضور' : 'إكمال الرصد'} — ${teacher.name}`} onClose={() => setSelection(null)}>
      {selection.type === 'achievement' && (!complete || !achievement.expected) && <AppText style={{ color: palette.muted }}>{complete
        ? 'لا يوجد رصد مطلوب خلال الفترة.' : 'بيانات إكمال الرصد غير متاحة في هذا التقرير.'}</AppText>}
      {details.map(([label, value]) => <View key={label} style={[screenStyles.row, { borderColor: palette.border }]}><AppText>{label}: {value === undefined ? 'غير متاح' : reportNumber(value)}</AppText></View>)}
    </FormDialog>}
  </>;
}
const rankingStyles = StyleSheet.create({ panel: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  row: { minHeight: 72, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, overflow: 'hidden' },
  medal: { width: 38, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 1 } });
