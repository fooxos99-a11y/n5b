export function getStartupTiming({ active, reducedMotion, startedAt = 0, now = startedAt }) {
  const elapsed = Math.min(2000, Math.max(0, now - startedAt));
  return { elapsed, duration: !active || reducedMotion ? 0 : 2000 - elapsed };
}
