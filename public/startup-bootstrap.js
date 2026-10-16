(() => {
  const root = globalThis.document.documentElement;
  const surface = globalThis.document.getElementById('startup-splash');
  const content = globalThis.document.getElementById('app-root');
  if (!surface || !content) return;

  const startedAt = globalThis.performance.now();
  const motion = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  const logo = surface.querySelector('img');
  const recovery = surface.querySelector('[data-startup-recovery]');
  let ready = false;
  let active = true;
  let assetsReady = logo.complete && logo.naturalWidth > 0;
  let revealTimer;
  root.dataset.startupActive = 'true';

  const reveal = () => {
    if (!active || !ready || !assetsReady) return;
    active = false;
    globalThis.clearTimeout(recoveryTimer);
    root.dataset.startupActive = 'false';
    root.classList.add('app-ready');
    content.inert = false;
    content.removeAttribute('aria-hidden');
    surface.dataset.state = 'leaving';
    surface.setAttribute('aria-hidden', 'true');
    globalThis.dispatchEvent(new globalThis.Event('nukhab-startup-finished'));
    globalThis.setTimeout(() => surface.remove(), motion.matches ? 0 : 180);
  };
  const setReady = (value) => {
    if (!active) return;
    ready = value;
    globalThis.clearTimeout(revealTimer);
    if (!ready || !assetsReady) return;
    // A quiet frame between route/data loaders must not reveal an unfinished page.
    const remaining = motion.matches ? 0 : 2000 - (globalThis.performance.now() - startedAt);
    revealTimer = globalThis.setTimeout(reveal, Math.max(180, remaining));
  };
  const fail = () => {
    if (!active) return;
    surface.dataset.state = 'error';
    recovery.hidden = false;
  };
  const recoveryTimer = globalThis.setTimeout(fail, 15_000);
  logo.addEventListener('load', () => { assetsReady = true; setReady(ready); }, { once: true });
  logo.addEventListener('error', fail, { once: true });
  surface.querySelector('button').addEventListener('click', () => {
    if (!assetsReady && content.firstElementChild) {
      // WebKit can retain a failed image across reloads; retry this local asset afresh.
      const url = new globalThis.URL(logo.src);
      url.searchParams.set('startup-retry', String(globalThis.Date.now()));
      logo.src = url.href;
      return;
    }
    globalThis.location.reload();
  });
  motion.addEventListener('change', () => setReady(ready));
  const dismiss = () => { ready = true; assetsReady = true; reveal(); };
  globalThis.nukhabStartup = { startedAt, get active() { return active; }, setReady, dismiss };
})();
