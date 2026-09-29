import React, { useRef, useState } from 'react';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 2;

/**
 * One ring split into coloured parts. Pointing at a part (a tap on touch screens, the arrow keys
 * on a keyboard) shows that part's count; clicking the card opens the details.
 */
export default function SegmentedMetricCard({ metric, onSelect, bare = false }) {
  const [activeKey, setActiveKey] = useState(null);
  const touchSelected = useRef(false);
  const parts = (metric.segments || []).filter((segment) => segment.count > 0);
  const total = parts.reduce((sum, segment) => sum + segment.count, 0);
  const active = parts.find((segment) => segment.key === activeKey) || null;
  const count = active ? active.count : metric.countValue ?? total;
  const title = active ? active.label : metric.label;

  let offset = 0;
  const arcs = parts.map((segment) => {
    const length = total > 0 ? (segment.count / total) * CIRCUMFERENCE : 0;
    const arc = { ...segment, start: offset, length };
    offset += length;
    return arc;
  });

  const choose = (key, event) => {
    if (event.pointerType === 'touch' && key !== activeKey) touchSelected.current = true;
    setActiveKey(key);
  };
  const step = (direction) => {
    if (!parts.length) return;
    const index = parts.findIndex((segment) => segment.key === activeKey);
    const next = index === -1 ? (direction > 0 ? 0 : parts.length - 1) : index + direction;
    setActiveKey(next < 0 || next >= parts.length ? null : parts[next].key);
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (touchSelected.current && !bare) {
          touchSelected.current = false;
          return;
        }
        onSelect(metric, active);
      }}
      onPointerLeave={(event) => { if (event.pointerType !== 'touch') setActiveKey(null); }}
      onBlur={() => setActiveKey(null)}
      onKeyDown={(event) => {
        // RTL: the left arrow moves forward through the levels.
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); step(1); }
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); step(-1); }
        if (event.key === 'Escape') setActiveKey(null);
      }}
      aria-label={`${title}: ${formatNumber(count)}`}
      className={bare
        ? 'flex w-full flex-col items-center justify-center gap-3 rounded-xl py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [font-family:var(--font-ui)]'
        : 'group flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--app-shadow)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 [font-family:var(--font-ui)]'}
    >
      <div className={bare ? 'relative h-32 w-32 max-w-full shrink-0' : 'relative h-28 w-28 shrink-0'}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke={bare && !total ? metric.color : 'hsl(var(--muted))'} opacity={bare && !total ? 0.25 : 1} strokeWidth={11} />
          {arcs.map((arc) => (
            <g key={arc.key}>
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={11}
                strokeDasharray={`${Math.max(arc.length - (parts.length > 1 ? GAP : 0), 0.01)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-arc.start}
                opacity={active && active.key !== arc.key ? 0.3 : 1}
                className="transition-opacity duration-150 motion-reduce:transition-none"
              />
              {/* A wider invisible ring makes each part easy to point at. */}
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke="transparent"
                strokeWidth={24}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE}`}
                strokeDashoffset={-arc.start}
                pointerEvents="stroke"
                onPointerEnter={(event) => choose(arc.key, event)}
                onPointerDown={(event) => choose(arc.key, event)}
              />
            </g>
          ))}
        </svg>
        <strong className={`pointer-events-none absolute inset-0 grid place-items-center ${bare ? 'text-3xl' : 'text-xl'} font-black tabular-nums text-foreground`} dir="ltr">
          {formatNumber(count)}
        </strong>
      </div>
      <h2 className="text-center text-sm font-bold leading-5 text-foreground" aria-live="polite">{title}</h2>
    </button>
  );
}
