import React, { useId } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const calculateTrend = (data, key) => {
  if (!data.length) return { change: 0, direction: 'same' };
  const first = Number(data[0]?.[key] || 0);
  const last = Number(data.at(-1)?.[key] || 0);
  const _resolveChange = () => {
    if (first) {
      return ((last - first) / Math.abs(first)) * 100;
    }
    if (last) {
      return 100;
    }
    return 0;
  };
  const change = _resolveChange();
  const _resolveDirection = () => {
    if (change > 0) {
      return 'up';
    }
    if (change < 0) {
      return 'down';
    }
    return 'same';
  };
  return { change, direction: _resolveDirection() };
};

const OwnerTrendChart = ({ title, data, series }) => {
  const chartId = useId();
  const width = 640;
  const height = 230;
  const padding = 28;
  const values = data.flatMap((point) => series.map((item) => Number(point[item.key] || 0)));
  const maxValue = Math.max(1, ...values);
  const x = (index) => padding + (index * (width - padding * 2)) / Math.max(1, data.length - 1);
  const y = (value) => height - padding - (Number(value || 0) / maxValue) * (height - padding * 2);

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="border-b border-border/70 p-4">
        <h3 className="font-black text-foreground">{title}</h3>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {data.length ? (
          <>
            <div className="flex flex-wrap gap-1.5 text-[10px] font-bold sm:text-[11px]">
              {series.map((item) => {
                const trend = calculateTrend(data, item.key);
                const _resolveTrendIcon = () => {
                  if (trend.direction === 'up') {
                    return ArrowUp;
                  }
                  if (trend.direction === 'down') {
                    return ArrowDown;
                  }
                  return Minus;
                };
                const TrendIcon = _resolveTrendIcon();
                const _resolveTone = () => {
                  if (trend.direction === 'up') {
                    return 'text-emerald-600';
                  }
                  if (trend.direction === 'down') {
                    return 'text-red-600';
                  }
                  return 'text-muted-foreground';
                };
                const tone = _resolveTone();
                return (
                  <span key={item.key} className={`flex min-h-7 items-center gap-1 rounded-md border border-border/70 px-1.5 ${tone}`}>
                    <i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                    <TrendIcon className="h-3 w-3" aria-hidden="true" />
                    {Math.abs(trend.change).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 })}%
                  </span>
                );
              })}
            </div>
            <svg className="mt-3 h-auto w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${chartId}-title`}>
              <title id={`${chartId}-title`}>{title}</title>
              {[0, 1, 2, 3, 4].map((line) => <line key={line} x1={padding} x2={width - padding} y1={padding + line * ((height - padding * 2) / 4)} y2={padding + line * ((height - padding * 2) / 4)} stroke="currentColor" className="text-border" strokeWidth="1" />)}
              {series.map((item) => (
                <g key={item.key}>
                  <polyline fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={data.map((point, index) => `${x(index)},${y(point[item.key])}`).join(' ')} />
                  {data.map((point, index) => (
                    <circle key={`${point.date}-${item.key}`} cx={x(index)} cy={y(point[item.key])} r="4" fill={item.color} className="stroke-card" strokeWidth="2">
                      <title>{`${point.date}: ${item.label} ${Number(point[item.key] || 0).toLocaleString('ar-SA-u-nu-latn')}`}</title>
                    </circle>
                  ))}
                </g>
              ))}
              <text x={padding} y={height - 5} className="fill-muted-foreground text-[10px]">{data[0]?.date}</text>
              <text x={width - padding} y={height - 5} textAnchor="end" className="fill-muted-foreground text-[10px]">{data.at(-1)?.date}</text>
            </svg>
          </>
        ) : <div className="grid min-h-52 place-items-center text-sm font-bold text-muted-foreground">لا توجد بيانات خلال الفترة.</div>}
      </CardContent>
    </Card>
  );
};

export default OwnerTrendChart;
