export function getStartupTiming({ active, reducedMotion }) {
  // Play the full visible animation even when the initial bundle loads slowly.
  return { elapsed: 0, duration: !active || reducedMotion ? 0 : 2000 };
}
