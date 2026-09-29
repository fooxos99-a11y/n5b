export function getStartupTiming({ active, startedAt = 0, now, reducedMotion }) {
  const elapsed = Math.max(0, Math.min(1200, now - startedAt));
  return { elapsed, duration: !active || reducedMotion ? 0 : 2000 - elapsed };
}
