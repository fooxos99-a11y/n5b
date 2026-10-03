import React from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';

const format = value => Number(value || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 });
const labels = { memorization: 'الحفظ', review: 'المراجعة', link: 'الربط', repeat: 'التكرار', reading: 'المقدار الذاتي' };

function PerformanceTooltip({ active, payload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const difference = Number(point.done) - Number(point.expected);
  return <div dir="rtl" className="min-w-40 rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg [font-family:var(--font-ui)]">
    <p className="mb-2 font-semibold">{formatHijriDate(point.date)}</p>
    <p className="font-bold text-primary">{format(point.percentage)}%</p>
    <p className="mt-1">{difference < 0 ? `متأخر ${format(-difference)} وجه` : difference > 0 ? `متقدم ${format(difference)} وجه` : 'على المسار'}</p>
    <p className="mt-1 text-muted-foreground">المنجز {format(point.done)} · المطلوب {format(point.expected)} وجه</p>
    {Object.entries(point.components || {}).filter(([, value]) => value.expected > 0 || value.done > 0).map(([key, value]) => <p key={key} className="mt-1 text-muted-foreground">{labels[key]}: {format(value.done)} / {format(value.expected)} وجه</p>)}
  </div>;
}

export default function PlanPerformanceChart({ series = [], compact = false, title = 'الأداء' }) {
  const points = series.filter(point => point.expected > 0 && point.percentage !== null);
  const chart = <ChartContainer className={compact ? 'h-20' : 'h-[250px]'} aria-label={title}>
    <LineChart accessibilityLayer data={points} margin={{ left: 12, right: 12, top: 12, bottom: 8 }}>
      {!compact && <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />}
      <XAxis dataKey="date" hide={compact} tickLine={false} axisLine={false} tickMargin={8} minTickGap={40} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={date => formatHijriDate(date, { month: 'short', year: undefined })} />
      <YAxis hide domain={[0, maximum => Math.max(120, maximum)]} />
      <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
      <ChartTooltip content={<PerformanceTooltip />} />
      <Line dataKey="percentage" name="الأداء" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={points.length === 1} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }} isAnimationActive={false} />
    </LineChart>
  </ChartContainer>;
  if (compact) return <div className="min-w-0">{points.length ? chart : <p className="text-xs text-muted-foreground">لا توجد متطلبات مستحقة.</p>}</div>;
  return <Card className="min-w-0 [font-family:var(--font-ui)]" aria-label={title}>
    <CardHeader className="border-b border-border"><h2 className="text-sm font-semibold">{title}</h2></CardHeader>
    <CardContent className="px-2 sm:px-5">{points.length ? chart : <p className="py-6 text-sm text-muted-foreground">لا توجد متطلبات مستحقة خلال الفترة.</p>}</CardContent>
  </Card>;
}
