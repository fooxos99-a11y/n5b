import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const StartupContext = createContext(null);
export const useStartup = () => useContext(StartupContext);

export default function StartupProvider({ children }) {
  const [startedAt] = useState(() => window.nukhabStartup?.startedAt ?? performance.now());
  const [active, setActive] = useState(() => Boolean(window.nukhabStartup?.active));
  useEffect(() => {
    const finished = () => setActive(false);
    window.addEventListener('nukhab-startup-finished', finished);
    if (!window.nukhabStartup?.active) finished();
    return () => window.removeEventListener('nukhab-startup-finished', finished);
  }, []);
  const setReady = useCallback((ready) => window.nukhabStartup?.setReady(ready), []);
  const value = useMemo(() => ({ active, startedAt, setReady }), [active, startedAt, setReady]);
  return <StartupContext.Provider value={value}>{children}</StartupContext.Provider>;
}
