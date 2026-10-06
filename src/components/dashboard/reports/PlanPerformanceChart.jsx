import React from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import { PERFORMANCE_LINES, performanceChartData } from './performanceChartData';

const format = value => Number(value || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 });

function PerformanceTooltip({ active, payload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div dir="rtl" className="min-w-40 rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg [font-family:var(--font-ui)]">
    <p className="mb-2 font-semibold">{formatHijriDate(point.date)}</p>
    {payload.filter(item => item.value !== null && item.value !== undefined).map(item => {
      const component = point.components?.[item.dataKey] || point;
      const difference = Number(component.done) - Number(component.expected);
      return <div key={item.dataKey} className="mt-2 border-t border-border pt-2">
        <p className="flex items-center justify-between gap-4 font-bold" style={{ color: item.color }}><span>{item.name}</span><span dir="ltr">{format(item.value)}%</span></p>
        <p className="mt-1">{difference < 0 ? `متأخر ${format(-difference)} وجه` : difference > 0 ? `متقدم ${format(difference)} وجه` : 'على المسار'}</p>
        <p className="mt-1 text-muted-foreground">المنجز {format(component.done)} · المطلوب {format(component.expected)} وجه</p>
      </div>;
    })}
  </div>;
}

export default function PlanPerformanceChart({ series = [], compact = false, title = 'الأداء' }) {
  const { points, keys, upper, ticks } = performanceChartData(series);
  const chart = <ChartContainer className={compact ? 'h-20' : 'h-[250px]'} aria-label={title}>
    <LineChart accessibilityLayer data={points} margin={{ left: compact ? 12 : 0, right: 12, top: 12, bottom: 8 }}>
      {!compact && <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />}
      <XAxis dataKey="date" hide={compact} tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={date => formatHijriDate(date, { month: 'short', year: undefined })} />
      <YAxis hide={compact} orientation="left" width={44} domain={[0, upper]} ticks={ticks} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={value => `${format(value)}%`} />
      <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
      <ChartTooltip content={<PerformanceTooltip />} />
      {keys.map(key => <Line key={key} dataKey={key} name={PERFORMANCE_LINES[key].label} type="monotone" stroke={PERFORMANCE_LINES[key].color} strokeDasharray={PERFORMANCE_LINES[key].dash} strokeWidth={2.5} dot={points.filter(point => point[key] !== null).length === 1} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }} isAnimationActive={false} />)}
    </LineChart>
  </ChartContainer>;
  if (compact) return <div className="min-w-0">{points.length ? chart : <p className="text-xs text-muted-foreground">لا توجد متطلبات مستحقة.</p>}</div>;
  return <Card className="min-w-0 [font-family:var(--font-ui)]" aria-label={title}>
    <CardHeader className="border-b border-border"><h2 className="text-sm font-semibold">{title}</h2></CardHeader>
    <CardContent className="px-2 sm:px-5">{points.length ? <>{chart}<ul aria-label="ألوان متطلبات البرنامج" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">{keys.map(key => <li key={key} className="flex items-center gap-1.5"><svg width="20" height="4" aria-hidden="true"><line x1="0" y1="2" x2="20" y2="2" stroke={PERFORMANCE_LINES[key].color} strokeWidth="2.5" strokeDasharray={PERFORMANCE_LINES[key].dash} /></svg>{PERFORMANCE_LINES[key].label}</li>)}</ul></> : <p className="py-6 text-sm text-muted-foreground">لا توجد متطلبات مستحقة خلال الفترة.</p>}</CardContent>
  </Card>;
}
