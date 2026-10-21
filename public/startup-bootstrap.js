(() => {
  const root = globalThis.document.documentElement;
  const surface = globalThis.document.getElementById('startup-splash');
  const content = globalThis.document.getElementById('app-root');
  if (!surface || !content) return;

  const startedAt = globalThis.performance.now();
  const motion = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  const logo = surface.querySelector('img');
  const recovery = surface.querySelector('[data-startup-recovery]');
  const native = globalThis.Capacitor?.isNativePlatform?.() ? globalThis.Capacitor : null;
  let nativeReady = !native;
  let nativePending = false;
  let nativeAttempts = 0;
  let ready = false;
  let active = true;
  let dismissed = false;
  let assetsReady = logo.complete && logo.naturalWidth > 0;
  let revealTimer;
  let frame;
  root.dataset.startupActive = 'true';

  const reveal = () => {
    if (!active || !nativeReady || (!dismissed && (!ready || !assetsReady))) return;
    active = false;
    globalThis.cancelAnimationFrame(frame);
    globalThis.clearTimeout(revealTimer);
    globalThis.clearTimeout(recoveryTimer);
    root.dataset.startupActive = 'false';
    root.classList.add('app-ready');
    content.inert = false;
    content.removeAttribute('aria-hidden');
    surface.dataset.state = 'leaving';
    surface.setAttribute('aria-hidden', 'true');
    globalThis.dispatchEvent(new globalThis.Event('nukhab-startup-finished'));
    globalThis.setTimeout(() => surface.remove(), motion.matches ? 0 : 140);
  };
  const hideBrand = () => {
    if (!active || !ready || !assetsReady) return;
    recovery.hidden = true;
    // Keep the background opaque until the brand is gone, so it never overlays account content.
    const brandAlreadyHidden = surface.dataset.brandHidden === 'true';
    surface.dataset.brandHidden = 'true';
    revealTimer = globalThis.setTimeout(reveal, motion.matches || brandAlreadyHidden ? 0 : 120);
  };
  const setReady = (value) => {
    if (!active || dismissed) return;
    ready = value;
    globalThis.clearTimeout(revealTimer);
    globalThis.cancelAnimationFrame(frame);
    if (!ready || !assetsReady) return;
    // Consecutive paints let route loaders register without imposing a branded waiting period.
    frame = globalThis.requestAnimationFrame(() => {
      frame = globalThis.requestAnimationFrame(hideBrand);
    });
  };
  const fail = () => {
    if (!active) return;
    surface.dataset.state = 'error';
    recovery.hidden = false;
    handoffNativeSplash();
  };
  const handoffNativeSplash = () => {
    if (nativeReady || nativePending) return;
    nativePending = true;
    // The injected Capacitor proxy exists before React. Hand the plain native cover to
    // the single painted HTML splash, so slow or failed app bundles remain recoverable.
    let firstPaint, secondPaint, paintTimeout;
    let handedOff = false;
    const hideNativeCover = async () => {
      if (handedOff) return;
      handedOff = true;
      globalThis.cancelAnimationFrame(firstPaint);
      globalThis.cancelAnimationFrame(secondPaint);
      globalThis.clearTimeout(paintTimeout);
      nativeAttempts++;
      try {
        const options = { fadeOutDuration: 0 };
        if (typeof native.Plugins?.SplashScreen?.hide === 'function') await native.Plugins.SplashScreen.hide(options);
        else await native.nativePromise('SplashScreen', 'hide', options);
        nativeReady = true;
        nativePending = false;
        delete root.dataset.nativeStartupError;
        if (dismissed) hideBrand();
        else setReady(ready);
      } catch {
        nativePending = false;
        root.dataset.nativeStartupError = 'unavailable';
        surface.dataset.state = 'error';
        recovery.hidden = false;
        if (nativeAttempts < 3) globalThis.setTimeout(handoffNativeSplash, 250);
      }
    };
    firstPaint = globalThis.requestAnimationFrame(() => { secondPaint = globalThis.requestAnimationFrame(hideNativeCover); });
    // WebKit can defer paints while a native cover or a failed preload is pending.
    // The local surface is already prepared; do not trap its recovery UI behind that cover.
    paintTimeout = globalThis.setTimeout(hideNativeCover, 150);
  };
  const recoveryTimer = globalThis.setTimeout(fail, 15_000);
  logo.addEventListener('load', () => { assetsReady = true; handoffNativeSplash(); setReady(ready); });
  logo.addEventListener('error', () => { assetsReady = false; fail(); });
  surface.querySelector('button').addEventListener('click', () => {
    handoffNativeSplash();
    if (!assetsReady) {
      // WebKit can retain a failed image across reloads; retry this local asset afresh.
      const url = new globalThis.URL(logo.src);
      url.searchParams.set('startup-retry', String(globalThis.Date.now()));
      logo.src = url.href;
      return;
    }
    globalThis.location.reload();
  });
  motion.addEventListener('change', () => setReady(ready));
  const dismiss = () => {
    // A failed React tree releases its loaders during unmount; those releases must not cover its error page.
    dismissed = true; ready = true; assetsReady = true;
    globalThis.cancelAnimationFrame(frame);
    globalThis.clearTimeout(revealTimer);
    hideBrand();
  };
  globalThis.nukhabStartup = { startedAt, get active() { return active; }, get nativeReady() { return nativeReady; }, setReady, dismiss };
  if (assetsReady) handoffNativeSplash();
  else if (logo.complete) fail();
})();
