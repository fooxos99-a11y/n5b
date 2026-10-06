export const PERFORMANCE_LINES = Object.freeze({
  memorization: { label: 'الحفظ', color: 'hsl(var(--primary))' },
  review: { label: 'المراجعة', color: '#2563eb', dash: '8 3' },
  link: { label: 'الربط', color: '#8b5cf6', dash: '3 3' },
  repeat: { label: 'التكرار', color: '#b7791f', dash: '10 3 2 3' },
  reading: { label: 'المقدار الذاتي', color: '#db2777', dash: '6 3 2 3' },
  percentage: { label: 'الأداء', color: 'hsl(var(--primary))' },
});

/** Each requirement uses its own cumulative due amount, rather than its share of the total. */
export function performanceChartData(series = []) {
  const points = series.filter(point => point.expected > 0 && point.percentage !== null).map(point => {
    const values = { ...point };
    for (const key of Object.keys(PERFORMANCE_LINES).filter(key => key !== 'percentage')) {
      const component = point.components?.[key];
      values[key] = component?.expected > 0 ? Math.round(component.done / component.expected * 1000) / 10 : null;
    }
    return values;
  });
  const components = Object.keys(PERFORMANCE_LINES).filter(key => key !== 'percentage' && points.some(point => point[key] !== null));
  const keys = components.length ? components : ['percentage'];
  const maximum = Math.max(100, ...points.flatMap(point => keys.map(key => point[key] || 0)));
  const upper = Math.ceil(maximum / 50) * 50;
  const ticks = [1, 50, 100];
  const step = Math.max(50, Math.ceil((upper - 100) / 4 / 50) * 50);
  for (let tick = 100 + step; tick < upper; tick += step) ticks.push(tick);
  if (upper > 100) ticks.push(upper);
  return { points, keys, upper, ticks };
}
