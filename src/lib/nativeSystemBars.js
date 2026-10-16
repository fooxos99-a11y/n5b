export function getNativeBarAppearance(root, backgroundColor, navigationColor) {
  if (root.dataset.startupActive === 'true') return { style: 'DARK', color: '#04433d' };
  // A full-screen Mushaf overrides the dashboard beneath it, even with its drawer open.
  if (!root.dataset.nativeSurface && root.dataset.nativeSidebar === 'open') {
    return { style: 'DARK', color: navigationColor || '#06332f' };
  }
  const surface = root.dataset.nativeSurface;
  const dark = surface === 'dark' || (surface !== 'light' && root.classList.contains('dark'));
  const channels = backgroundColor.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  const _resolveColor = () => {
    if (channels) {
      return `#${channels.slice(1, 4).map((channel) => Math.min(255, Number(channel)).toString(16).padStart(2, '0')).join('')}`;
    }
    if (dark) {
      return '#020617';
    }
    return '#f1f5f9';
  };
  const color = _resolveColor();
  return { style: dark ? 'DARK' : 'LIGHT', color };
}

export async function syncNativeSystemBars({ platform, appearance, statusBar, systemBars, nativeBackground }) {
  if (platform === 'ios') {
    // The web surface extends under the bar; each screen owns its safe-area padding.
    if (appearance.overlay === false) await statusBar.setBackgroundColor({ color: appearance.color });
    await statusBar.setOverlaysWebView({ overlay: appearance.overlay ?? true });
    await statusBar.setStyle({ style: appearance.style });
  } else {
    await systemBars.setStyle({ style: appearance.style });
    await nativeBackground.setBackgroundColor({ color: appearance.color });
  }
}

// Serialize native updates so a slow response cannot repaint a previous route's theme.
export function createNativeBarSynchronizer({ readAppearance, applyAppearance, onError, onSuccess }) {
  let pending = false;
  let running = null;
  let appliedKey = null;
  let disposed = false;
  return {
    request(force = false) {
      if (disposed) return Promise.resolve();
      pending = true;
      if (force) appliedKey = null;
      if (running) return running;
      running = (async () => {
        while (pending) {
          if (disposed) break;
          pending = false;
          const appearance = readAppearance();
          const key = JSON.stringify(appearance);
          if (key === appliedKey) continue;
          try {
            await applyAppearance(appearance);
            appliedKey = key;
            onSuccess();
          } catch (error) {
            onError(error);
          }
        }
      })().finally(() => { running = null; });
      return running;
    },
    dispose() { disposed = true; pending = false; },
  };
}
