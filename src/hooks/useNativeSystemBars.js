import { useEffect } from 'react';
import { Capacitor, SystemBars } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { createNativeBarSynchronizer, getNativeBarAppearance, syncNativeSystemBars } from '@/lib/nativeSystemBars';

export default function useNativeSystemBars() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const root = document.documentElement;
    root.classList.add('native-app');
    const sync = createNativeBarSynchronizer({
      readAppearance: () => getNativeBarAppearance(root, getComputedStyle(root).backgroundColor),
      applyAppearance: (appearance) => syncNativeSystemBars({ platform: Capacitor.getPlatform(), appearance, statusBar: StatusBar, systemBars: SystemBars }),
      onSuccess: () => { delete root.dataset.nativeChromeError; },
      onError: () => { root.dataset.nativeChromeError = 'unavailable'; },
    });
    let frame;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { void sync.request(); });
    };
    const resume = () => { void sync.request(true); };
    const observer = new MutationObserver(schedule);
    // SiteProvider applies its palette through inline CSS variables after a class change.
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-native-surface'] });
    window.addEventListener('pageshow', resume);
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) resume(); });
    schedule();
    return () => {
      sync.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pageshow', resume);
      void listener.then((handle) => handle.remove());
      root.classList.remove('native-app');
    };
  }, []);
}
