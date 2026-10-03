import React, { memo, useEffect, useRef, useState } from 'react';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';
import SegmentedMetricCard from './SegmentedMetricCard';

const prefersReducedMotion = () => (
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

/** Counts from zero to the target once, easing out; jumps straight there when motion is reduced. */
function useCountUp(target, duration = 850) {
  const [value, setValue] = useState(0);
  const frame = useRef(0);
  useEffect(() => {
    const goal = Number(target || 0);
    if (prefersReducedMotion()) {
      setValue(goal);
      return undefined;
    }
    setValue(0);
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      setValue(Math.round(goal * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return value;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Ring gauge: a tinted track and the filled share in the metric colour. */
export const MetricGauge = memo(function MetricGauge({ value, color, strokeWidth = 11 }) {
  const clamped = Math.min(Math.max(Number(value || 0), 0), 100);
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r={RADIUS} fill="none" stroke={`color-mix(in oklab, ${color} 14%, hsl(var(--card)))`} strokeWidth={strokeWidth} />
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE - (CIRCUMFERENCE * clamped) / 100}
      />
    </svg>
  );
});

/** One indicator: a split ring when it has parts, otherwise the gauge; opens the details. */
export default function MetricCard({ metric, onSelect }) {
  return metric.segments ? <SegmentedMetricCard metric={metric} onSelect={onSelect} /> : <GaugeMetricCard metric={metric} onSelect={onSelect} />;
}

/** The gauge with its animated value and the label. */
function GaugeMetricCard({ metric, onSelect }) {
  const animated = useCountUp(metric.value);
  const animatedCount = useCountUp(metric.countValue ?? 0);
  const center = metric.countValue === undefined ? `${formatNumber(animated)}%` : formatNumber(animatedCount);
  return (
    <button
      type="button"
      onClick={() => onSelect(metric)}
      aria-label={`${metric.label}: ${metric.display}`}
      className="group flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--app-shadow)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 [font-family:var(--font-ui)]"
    >
      <div className="relative h-28 w-28 shrink-0">
        <MetricGauge value={animated} color={metric.color} />
        <strong className="pointer-events-none absolute inset-0 grid place-items-center text-xl font-black tabular-nums text-foreground" dir="ltr">
          {center}
        </strong>
      </div>
      <h2 className="text-center text-sm font-bold leading-5 text-foreground">{metric.label}</h2>
    </button>
  );
}

/** Smaller, static version of the card for the summaries inside a details window. */
export function MetricTile({ tile, color }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 [font-family:var(--font-ui)]">
      <div className="relative h-16 w-16 shrink-0">
        <MetricGauge value={tile.value} color={tile.color || color} strokeWidth={10} />
        <strong className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-black tabular-nums text-foreground" dir="ltr">
          {tile.display}
        </strong>
      </div>
      <p className="w-full text-center text-xs font-bold leading-5 text-foreground [overflow-wrap:anywhere]">{tile.label}</p>
    </div>
  );
}
