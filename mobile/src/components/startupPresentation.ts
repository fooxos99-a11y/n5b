export const STARTUP_COMPLETION_BUDGET_MS = 3000;

type StartupAnimation = { stop(): void };

export function startStartupPresentation({ isReduceMotionEnabled, animate, onComplete }: {
  isReduceMotionEnabled: () => Promise<boolean>;
  animate: (onEnd: (result: { finished: boolean }) => void) => StartupAnimation;
  onComplete: () => void;
}): () => void {
  let active = true; let completed = false; let animation: StartupAnimation | undefined;
  const stopAnimation = () => {
    const running = animation; animation = undefined;
    running?.stop();
  };
  const finish = () => {
    if (!active || completed) return;
    completed = true;
    clearTimeout(deadline);
    try { stopAnimation(); }
    finally { onComplete(); }
  };
  // Native accessibility and animation callbacks can stall independently of the JS bundle.
  const deadline = setTimeout(finish, STARTUP_COMPLETION_BUDGET_MS);
  async function start() {
    const reducedMotion = await isReduceMotionEnabled();
    if (!active || completed) return;
    if (reducedMotion) { finish(); return; }
    const started = animate(finish);
    if (!active || completed) started.stop();
    else animation = started;
  }
  void start().catch(finish);
  return () => {
    active = false;
    clearTimeout(deadline);
    stopAnimation();
  };
}
