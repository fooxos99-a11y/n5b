// The UI and rewards treat the configured count as yes/no.
export function practiceCompletionCount(value, expected = 1) {
  const count = Number(value ?? expected);
  const maximum = Number(expected);
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.max(1, Math.trunc(maximum));
}
