import React, { useEffect, useId, useRef, useState } from 'react';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';

const format = value => Number(value || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 });

/** The 100% line is the due amount; red portions mark a shortage and green portions mark recovery. */
export default function PlanPerformanceChart({ series = [], compact = false, title = 'الإداء' }) {
  const id = useId();
  const container = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(640);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const points = series.filter(point => point.expected > 0 && point.percentage !== null);
  const last = points.at(-1);
  const width = compact ? 280 : Math.max(240, Math.min(640, availableWidth)), height = compact ? 76 : 220, pad = compact ? 8 : 36;
  const maximum = Math.max(120, ...points.map(point => Number(point.percentage || 0)));
  const x = index => pad + index * (width - pad * 2) / Math.max(1, points.length - 1);
  const y = value => height - pad - Math.min(maximum, Number(value || 0)) / maximum * (height - pad * 2);
  const tone = last?.percentage >= 100 ? 'text-emerald-600' : 'text-destructive';
  return <section ref={container} className={compact ? 'min-w-0' : 'min-w-0 rounded-2xl border border-border bg-card p-4 [font-family:var(--font-ui)] sm:p-5'} aria-label={title}>
    {!compact && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {last && <div className={`flex flex-wrap items-center gap-2 text-xs font-semibold tabular-nums ${tone}`}><bdi>{format(last.percentage)}%</bdi>{last.shortageFaces > 0 && <span className="rounded-md bg-muted px-2 py-1">التأخر {format(last.shortageFaces)} وجه</span>}</div>}
    </div>}
    {last ? <>
      <svg direction="ltr" viewBox={`0 0 ${width} ${height}`} className={compact ? 'h-14 w-full' : 'mx-auto h-auto w-full max-w-[640px] [font-family:var(--font-ui)]'} role="img" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>{title}: {format(last.done)} من {format(last.expected)} وجه، {format(last.percentage)}%</title>
        {!compact && [0, 50, 100].map(value => <g key={value}><line x1={pad} x2={width-pad} y1={y(value)} y2={y(value)} className="stroke-border" /><text x={pad-6} y={y(value)+4} textAnchor="end" className="fill-muted-foreground text-[10px]">{value}%</text></g>)}
        <line x1={pad} x2={width-pad} y1={y(100)} y2={y(100)} className="stroke-muted-foreground" strokeDasharray="5 5" />
        {points.slice(1).map((point, index) => {
          const previous = points[index];
          const before = previous.percentage >= 100, after = point.percentage >= 100;
          const strokeWidth = compact ? 3 : 3.5;
          if (before === after) return <line key={point.date} x1={x(index)} y1={y(previous.percentage)} x2={x(index+1)} y2={y(point.percentage)} stroke={after ? '#059669' : '#dc2626'} strokeWidth={strokeWidth} strokeLinecap="round" />;
          const crossing = x(index) + (100 - previous.percentage) / (point.percentage - previous.percentage) * (x(index+1) - x(index));
          return <g key={point.date}><line x1={x(index)} y1={y(previous.percentage)} x2={crossing} y2={y(100)} stroke={before ? '#059669' : '#dc2626'} strokeWidth={strokeWidth} /><line x1={crossing} y1={y(100)} x2={x(index+1)} y2={y(point.percentage)} stroke={after ? '#059669' : '#dc2626'} strokeWidth={strokeWidth} /></g>;
        })}
        {points.map((point, index) => <circle key={point.date} cx={x(index)} cy={y(point.percentage)} r={compact ? 2 : 3.5} fill={point.percentage >= 100 ? '#059669' : '#dc2626'}><title>{formatHijriDate(point.date)}: {format(point.done)} من {format(point.expected)} وجه، {format(point.percentage)}%</title></circle>)}
      </svg>
      {compact && <p className={`text-xs font-semibold ${tone}`}>{format(last.percentage)}%{last.shortageFaces > 0 ? `، تأخر ${format(last.shortageFaces)} وجه` : ''}</p>}
    </> : <p className="py-3 text-xs text-muted-foreground">لا توجد أوجه مستحقة خلال الفترة.</p>}
  </section>;
}
