import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { AppText } from '../AppText';
import { ActionButton } from '../ActionButton';
import { ChoiceDialog } from '../ChoiceDialog';
import { screenStyles } from '../ScreenLayout';
import { usePalette } from '../../theme';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import type { ReportPerformancePoint } from '../../domain/reportManagement';
import { PERFORMANCE_LINES } from '../../../../src/components/dashboard/reports/performanceChartData.js';
import { reportPerformanceData } from './reportPresentation';

export type { ReportPerformancePoint } from '../../domain/reportManagement';
const lines = PERFORMANCE_LINES;
const format = (value: number) => value.toLocaleString('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 1 });
export function ReportPerformanceChart({ series, compact = false, title = 'الأداء' }: {
  series: readonly ReportPerformancePoint[]; compact?: boolean; title?: string;
}) {
  const palette = usePalette(); const { points, keys, upper, ticks } = reportPerformanceData(series);
  const { width: windowWidth } = useWindowDimensions();
  const [selection, setSelection] = useState<string | null>(null); const [chooseDate, setChooseDate] = useState(false);
  const [width, setWidth] = useState(320);
  const point = points.find(row => row.date === selection);
  const height = compact ? 115 : 250; const left = compact ? 12 : 56; const right = 16;
  const top = 14; const bottom = compact ? 8 : 35; const y = (value: number) => top + (height - top - bottom) * (1 - value / upper);
  const x = (index: number) => left + (width - left - right) * (points.length > 1 ? index / (points.length - 1) : 0.5);
  const content = <>
    {!points.length ? <AppText style={{ color: palette.muted, fontSize: compact ? 12 : 14, paddingVertical: compact ? 0 : 24 }}>{compact ? 'لا توجد متطلبات مستحقة.' : 'لا توجد متطلبات مستحقة خلال الفترة.'}</AppText> : <>
      <View style={{ minWidth: 0 }} onLayout={event => { if (event.nativeEvent.layout.width > 0) setWidth(event.nativeEvent.layout.width); }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessible accessibilityLabel={title}>
        {!compact && ticks.map(tick => <Line key={tick} x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke={palette.border} strokeDasharray="3 3" />)}
        <Line x1={left} x2={width - right} y1={y(100)} y2={y(100)} stroke={palette.muted} strokeDasharray="5 5" />
        {!compact && ticks.map(tick => <SvgText key={tick} x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize={12} fill={palette.muted}>{format(tick)}%</SvgText>)}
        {!compact && (width < 380 ? [0, points.length - 1] : [0, Math.floor((points.length - 1) / 2), points.length - 1]).filter((value, index, values) => values.indexOf(value) === index).map(index =>
          <SvgText key={index} x={x(index)} y={height - 7} textAnchor={points.length > 1 && index === points.length - 1 ? 'end' : 'middle'} fontSize={12} fill={palette.muted}>{formatHijriDate(points[index]!.date, { month: 'short', year: undefined })}</SvgText>)}
        {keys.map(key => {
          const segments: string[] = []; let segment: string[] = [];
          points.forEach((row, index) => { const value = row.values[key]; if (value === null || value === undefined) { if (segment.length) segments.push(segment.join(' ')); segment = []; }
            else segment.push(`${x(index)},${y(value)}`); }); if (segment.length) segments.push(segment.join(' '));
          return segments.map((coordinates, index) => <Polyline key={`${key}-${index}`} points={coordinates} fill="none" stroke={key === 'percentage' || key === 'memorization' ? palette.primary : lines[key].color} strokeWidth={2.5} />);
        })}
        {keys.map(key => points.filter(row => row.values[key] !== null && row.values[key] !== undefined).length === 1
          ? points.map((row, index) => row.values[key] !== null && row.values[key] !== undefined && <Circle key={`${key}-${index}`} cx={x(index)} cy={y(row.values[key]!)} r={4} fill={key === 'memorization' || key === 'percentage' ? palette.primary : lines[key].color} />) : null)}
      </Svg>
      </View>
      {!compact && <>
        <View style={screenStyles.actions}>{keys.map(key => <AppText key={key} style={{ color: key === 'memorization' || key === 'percentage' ? palette.primary : lines[key].color }}>{lines[key].label}</AppText>)}</View>
        <ActionButton label="تفاصيل يوم من الرسم" secondary onPress={() => setChooseDate(true)} />
        <ChoiceDialog visible={chooseDate} title="تاريخ الأداء" value={selection ?? undefined} options={points.map(row => ({ value: row.date, label: `${formatHijriDate(row.date)} — ${row.date}` }))}
          onChoose={setSelection} onClose={() => setChooseDate(false)} />
        {!!point && <View style={[styles.details, { borderColor: palette.border }]}><AppText style={screenStyles.bold}>{formatHijriDate(point.date)}</AppText>
          {keys.filter(key => point.values[key] !== null && point.values[key] !== undefined).map(key => {
            const component = key === 'percentage' ? point : point.components?.[key]; if (!component) return null;
            const difference = component.done - component.expected;
            return <View key={key} style={styles.detailRow}><AppText>{lines[key].label}: {format(point.values[key]!)}%</AppText>
              <AppText>{difference < 0 ? `متأخر ${format(-difference)} وجه` : difference > 0 ? `متقدم ${format(difference)} وجه` : 'على المسار'}</AppText>
              <AppText>المنجز {format(component.done)} · المطلوب {format(component.expected)} وجه</AppText></View>;
          })}
        </View>}
      </>}
    </>}
  </>;
  return compact ? <View style={{ minWidth: 0 }}>{content}</View> : <View style={{ minWidth: 0, borderWidth: 1, borderRadius: 16, borderColor: palette.border,
    backgroundColor: palette.card, overflow: 'hidden', boxShadow: '0 2px 12px rgba(16, 36, 62, 0.055)' }}>
    <View style={{ borderBottomWidth: 1, borderColor: palette.border, padding: 24 }}><AppText accessibilityRole="header" style={{ fontSize: 14, fontFamily: 'CairoSemi' }}>{title}</AppText></View>
    <View style={{ paddingHorizontal: windowWidth >= 640 ? 20 : 8, paddingBottom: 24 }}>{content}</View>
  </View>;
}
const styles = StyleSheet.create({ details: { borderTopWidth: 1, paddingTop: 12, gap: 10 }, detailRow: { gap: 4 } });
