import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { ChoiceDialog } from '../ChoiceDialog';
import { FormDialog } from '../FormDialog';
import { SectionCard, screenStyles } from '../ScreenLayout';
import { usePalette } from '../../theme';
import { ReportPerformanceChart } from './ReportPerformanceChart';
import { reportLevelColor, reportNumber, type ReportMetric, type ReportRecord, type ReportTone } from './reportPresentation';

function ReportProgress({ label, value, color }: { label: string; value: number; color: string }) {
  const palette = usePalette(); const clamped = Math.max(0, Math.min(100, value));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: clamped }}
    style={[styles.progress, { backgroundColor: palette.border }]}><View style={{ width: `${clamped}%`, height: '100%', backgroundColor: color }} /></View>;
}
function toneColor(tone: ReportTone | undefined, text: string, error: string) {
  return tone === 'good' ? '#059669' : tone === 'warn' ? '#b7791f' : tone === 'bad' ? error : text;
}
export function ReportMetricCard({ metric, onSelect, disabled }: { metric: ReportMetric; onSelect: () => void; disabled?: boolean }) {
  const palette = usePalette(); const total = metric.segments?.reduce((sum, segment) => sum + segment.count, 0) ?? 0;
  const [animation, setAnimation] = useState(1), [active, setActive] = useState<string | null>(null), [focused, focus] = useState(false);
  useEffect(() => {
    let live = true, frame = 0;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!live || reduced) return;
      const start = performance.now(); setAnimation(0);
      const tick = (now: number) => { if (!live) return; const progress = Math.min(1, (now - start) / 850);
        setAnimation(1 - (1 - progress) ** 3); if (progress < 1) frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    }).catch(() => { if (live) setAnimation(1); });
    return () => { live = false; cancelAnimationFrame(frame); };
  }, [metric.value, metric.countValue]);
  const segment = metric.segments?.find(item => item.key === active), radius = 42, perimeter = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = metric.segments?.filter(item => item.count > 0).map(item => {
    const arc = { ...item, offset, length: item.count / Math.max(1, total) * perimeter }; offset += arc.length; return arc;
  });
  const count = segment?.count ?? metric.countValue ?? total;
  const display = metric.segments ? reportNumber(count) : metric.countValue === undefined ? `${reportNumber(Math.round(metric.value * animation))}%` : reportNumber(Math.round(metric.countValue * animation));
  return <Pressable accessibilityRole="button" accessibilityLabel={`تفاصيل ${segment?.label ?? metric.label}: ${metric.display}`}
    accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onSelect} onFocus={() => focus(true)} onBlur={() => focus(false)}
    style={({ pressed }) => [styles.metric, { backgroundColor: palette.card, borderColor: focused ? palette.primary : palette.border,
      opacity: disabled ? 0.6 : pressed ? 0.8 : 1 }]}>
    <View style={{ width: 112, height: 112 }}>
      <Svg width={112} height={112} viewBox="0 0 100 100" accessible={false}>
        <G rotation={-90} origin="50,50">
          <Circle cx={50} cy={50} r={radius} fill="none" stroke={arcs ? palette.mutedSurface : reportLevelColor(metric.color, 14, palette.card)} strokeWidth={11} />
          {arcs ? arcs.map(arc => <Circle key={arc.key} cx={50} cy={50} r={radius} fill="none" stroke={reportLevelColor(arc.color, arc.share, palette.card)} strokeWidth={11}
            strokeDasharray={`${Math.max(0.01, arc.length - (arcs.length > 1 ? 2 : 0))} ${perimeter}`}
            strokeDashoffset={-arc.offset} opacity={active && active !== arc.key ? 0.3 : 1}
            onPress={event => { event.stopPropagation(); if (disabled) return; if (active === arc.key) onSelect(); else setActive(arc.key); }} />)
            : <Circle cx={50} cy={50} r={radius} fill="none" stroke={metric.color} strokeWidth={11} strokeLinecap="round"
              strokeDasharray={`${perimeter} ${perimeter}`} strokeDashoffset={perimeter * (1 - Math.max(0, Math.min(100, metric.value * animation)) / 100)} />}
        </G>
      </Svg>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <AppText style={{ fontSize: 20, fontFamily: 'CairoBlack', textAlign: 'center', writingDirection: 'ltr' }}>{display}</AppText>
      </View>
    </View>
    <AppText accessibilityLiveRegion="polite" style={{ fontSize: 14, lineHeight: 20, fontFamily: 'CairoBold', textAlign: 'center' }}>{segment?.label ?? metric.label}</AppText>
  </Pressable>;
}
export function ReportRecordRow({ row }: { row: ReportRecord }) {
  const palette = usePalette();
  return <View style={[styles.record, { borderColor: palette.border }]}><View style={styles.recordHead}>
    <View style={{ flex: 1, minWidth: 0 }}><AppText style={screenStyles.bold}>{row.label}</AppText>{!!row.note && <AppText style={{ color: palette.muted }}>{row.note}</AppText>}</View>
    {!!row.value && <AppText style={{ color: toneColor(row.tone, palette.text, palette.error), fontFamily: 'CairoBold' }}>{row.value}</AppText>}
  </View>{!!row.stats?.length && <View style={screenStyles.grid}>{row.stats.map(stat => <View key={stat.label} style={styles.stat}>
    <AppText style={{ color: palette.muted }}>{stat.label}</AppText><AppText style={{ color: toneColor(stat.tone, palette.text, palette.error), fontFamily: 'CairoBold' }}>{stat.value}</AppText>
  </View>)}</View>}{!!row.series && <ReportPerformanceChart series={row.series} compact title={`أداء ${row.label}`} />}</View>;
}
export function ReportMetricDialog({ metric, periodLabel, committees, committee, onCommitteeChange, onClose, onRetry, onReportType }: {
  metric: ReportMetric; periodLabel: string; committees: string[]; committee: string; onCommitteeChange: (value: string) => void;
  onClose: () => void; onRetry: () => void;
  onReportType?: () => void;
}) {
  const palette = usePalette(); const [chooseCircle, setChooseCircle] = useState(false); const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const selected = metric.levelGroups?.flatMap(group => group.levels).find(level => level.key === selectedLevel);
  const students = metric.records.find(group => group.key === selectedLevel)?.rows ?? [];
  return <FormDialog visible title={`تفاصيل ${metric.label}`} onClose={onClose}>
    <AppText style={{ color: palette.muted }}>{periodLabel}</AppText>
    {committees.length > 1 && <ActionButton label={committee === 'all' ? 'كل الحلقات' : committee} accessibilityLabel="حلقة تفاصيل المؤشر" secondary onPress={() => setChooseCircle(true)} />}
    {metric.error ? <><AppText accessibilityRole="alert">{metric.error}</AppText><ActionButton label="إعادة تحميل تفاصيل المؤشر" secondary onPress={onRetry} /></>
      : metric.loading ? <AppText>جارٍ تحميل تفاصيل المؤشر</AppText> : <>
        <View style={screenStyles.grid}>{metric.tiles.map(tile => <View key={tile.label} style={[styles.tile, { borderColor: palette.border }]}>
          <AppText>{tile.label}</AppText><AppText style={[styles.value, { color: tile.color ?? metric.color }]}>{tile.display}</AppText>
        </View>)}</View>
        {metric.levelGroups?.map(group => <SectionCard key={group.key} title={`${group.name} — ${reportNumber(group.count)}`}><View style={screenStyles.grid}>
          {group.levels.map(level => <View key={level.key} style={styles.level}><AppText style={{ color: reportLevelColor(level.color, level.share, palette.card) }}>{level.name}: {reportNumber(level.count)}</AppText>
            <ActionButton label={`طلاب ${level.name}`} secondary onPress={() => setSelectedLevel(level.key)} /></View>)}
        </View></SectionCard>)}
        {!!selected && <SectionCard title={selected.name}>{students.length ? students.map((row, index) => <ReportRecordRow key={`${row.label}-${index}`} row={row} />)
          : <AppText>لا يوجد طلاب في هذا المستوى.</AppText>}</SectionCard>}
        {metric.bars?.filter(group => group.rows.length).map(group => <SectionCard key={group.title} title={group.title}>{group.rows.map((row, index) => <View key={`${row.label}-${index}`} style={styles.bar}>
          <AppText>{row.label}: {reportNumber(Math.max(0, Math.min(100, row.percent)))}%</AppText><ReportProgress label={row.label} value={row.percent} color={metric.color} />
        </View>)}</SectionCard>)}
        {!metric.levelGroups && metric.records.map((group, index) => <SectionCard key={`${group.title}-${index}`} title={group.title}>{group.rows.length
          ? group.rows.map((row, rowIndex) => <ReportRecordRow key={`${row.label}-${rowIndex}`} row={row} />)
          : <AppText>{group.emptyText ?? 'لا توجد سجلات في هذه الفترة'}</AppText>}</SectionCard>)}
      </>}
    {onReportType && <ActionButton label="نوع التقرير" secondary onPress={onReportType} />}
    <ChoiceDialog visible={chooseCircle} title="حلقة تفاصيل المؤشر" value={committee} options={[{ value: 'all', label: 'كل الحلقات' }, ...committees.map(name => ({ value: name, label: name }))]}
      onChoose={onCommitteeChange} onClose={() => setChooseCircle(false)} />
  </FormDialog>;
}
const styles = StyleSheet.create({ metric: { minHeight: 192, minWidth: 0, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 12,
  padding: 16, borderRadius: 16, borderWidth: 1, boxShadow: '0 2px 12px rgba(16, 36, 62, 0.055)' }, value: { fontSize: 22, lineHeight: 34, fontFamily: 'CairoBold' },
  progress: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row-reverse' }, segmentLine: { flexDirection: 'row-reverse', overflow: 'hidden', borderRadius: 5, minHeight: 10 },
  record: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 }, recordHead: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: 155, maxWidth: '100%', minWidth: 0, gap: 4 }, tile: { borderWidth: 1, borderRadius: 12, flexBasis: 145, flexGrow: 1, maxWidth: '100%', padding: 12 },
  level: { minWidth: 0, flexBasis: 165, flexGrow: 1, maxWidth: '100%', gap: 8 }, bar: { gap: 8 } });
