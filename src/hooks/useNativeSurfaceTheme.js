import { useEffect } from 'react';

const useNativeSurfaceTheme = (theme, active = true) => {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const previous = root.dataset.nativeSurface;
    root.dataset.nativeSurface = theme === 'light' ? 'light' : 'dark';
    return () => {
      if (previous) root.dataset.nativeSurface = previous;
      else delete root.dataset.nativeSurface;
    };
  }, [active, theme]);
};

export default useNativeSurfaceTheme;

