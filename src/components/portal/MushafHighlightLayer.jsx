import React, { useLayoutEffect, useState } from 'react';
import { buildMushafHighlightPaths } from '@/lib/mushafHighlightGeometry';

const TONES = {
  selection: 'fill-sky-400/25 stroke-sky-500/45',
  mistake: 'fill-red-400/20 stroke-red-500/35',
  lahn: 'fill-fuchsia-400/20 stroke-fuchsia-500/35',
  hesitation: 'fill-sky-400/20 stroke-sky-500/35',
  warning: 'fill-amber-400/20 stroke-amber-500/35',
};

export default function MushafHighlightLayer({ containerRef, ranges, fontReady }) {
  const [drawing, setDrawing] = useState({ width: 1, height: 1, paths: [] });
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const words = [...container.querySelectorAll('[data-mushaf-highlight-index]')];
      const paths = ranges.flatMap(({ start, end, tone, key }) => {
        const lines = new Map();
        for (const word of words) {
          const index = Number(word.dataset.mushafHighlightIndex);
          if (index < start || index > end) continue;
          const rect = word.getBoundingClientRect();
          const line = Number(word.dataset.mushafLine);
          const current = lines.get(line);
          lines.set(line, {
            line,
            left: Math.min(current?.left ?? Infinity, rect.left - bounds.left - 1),
            right: Math.max(current?.right ?? -Infinity, rect.right - bounds.left + 1),
            top: Math.min(current?.top ?? Infinity, rect.top - bounds.top - 2),
            bottom: Math.max(current?.bottom ?? -Infinity, rect.bottom - bounds.top + 2),
          });
        }
        return buildMushafHighlightPaths([...lines.values()]).map((path, index) => ({ key: `${key}:${index}`, path, tone }));
      });
      setDrawing({ width: bounds.width || 1, height: bounds.height || 1, paths });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const turn = container.closest('.mushaf-page-turn');
    turn?.addEventListener('animationend', measure);
    document.fonts?.addEventListener('loadingdone', measure);
    return () => {
      observer.disconnect();
      turn?.removeEventListener('animationend', measure);
      document.fonts?.removeEventListener('loadingdone', measure);
    };
  }, [containerRef, fontReady, ranges]);
  return <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${drawing.width} ${drawing.height}`} aria-hidden="true" data-mushaf-highlights>
    {drawing.paths.map(({ key, path, tone }) => <path key={key} d={path} className={TONES[tone] || TONES.selection} strokeWidth="0.8" data-highlight-tone={tone} />)}
  </svg>;
}
