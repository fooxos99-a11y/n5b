import { useEffect } from 'react';
import { Capacitor, SystemBars, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import { createNativeBarSynchronizer, getNativeBarAppearance, syncNativeSystemBars } from '@/lib/nativeSystemBars';
import '@/styles/native-system-bars.css';

const NativeSystemBarBackground = registerPlugin('NativeSystemBarBackground');

export default function useNativeSystemBars() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const root = document.documentElement;
    const platform = Capacitor.getPlatform();
    const viewport = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewport?.getAttribute('content');
    if (platform === 'ios' && viewport) {
      // WKWebView must expose the bottom safe area so it can match the status bar.
      const parts = (previousViewport || 'width=device-width, initial-scale=1').split(',')
        .filter((part) => !part.trim().startsWith('viewport-fit='));
      viewport.setAttribute('content', [...parts, 'viewport-fit=cover'].join(','));
    }
    root.classList.add('native-app');
    root.dataset.nativePlatform = platform;
    const sync = createNativeBarSynchronizer({
      readAppearance: () => {
        const style = getComputedStyle(root);
        return {
          ...getNativeBarAppearance(root, style.backgroundColor, style.getPropertyValue('--brand-navigation').trim()),
          overlay: root.dataset.nativeDashboard === 'true' || Boolean(root.dataset.nativeSurface),
        };
      },
      applyAppearance: (appearance) => {
        root.style.setProperty('--native-system-bar-color', appearance.color);
        return syncNativeSystemBars({ platform, appearance, statusBar: StatusBar, systemBars: SystemBars, nativeBackground: NativeSystemBarBackground });
      },
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
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-native-surface', 'data-startup-active', 'data-native-sidebar', 'data-native-dashboard'] });
    window.addEventListener('pageshow', resume);
    window.addEventListener('resize', resume);
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) resume(); });
    schedule();
    return () => {
      sync.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('resize', resume);
      void listener.then((handle) => handle.remove());
      root.classList.remove('native-app');
      delete root.dataset.nativePlatform;
      root.style.removeProperty('--native-system-bar-color');
      if (platform === 'ios' && viewport) {
        if (previousViewport === null) viewport.removeAttribute('content');
        else viewport.setAttribute('content', previousViewport);
      }
    };
  }, []);
}
