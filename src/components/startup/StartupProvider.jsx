import React, { createContext, useCallback, useContext, useMemo, useState, useLayoutEffect } from 'react';

const StartupContext = createContext(null);
export const useStartup = () => useContext(StartupContext);

export default function StartupProvider({ children }) {
  const [startedAt] = useState(() => performance.now());
  const [active, setActive] = useState(true);
  useLayoutEffect(() => {
    document.documentElement.dataset.startupActive = String(active);
    return () => { delete document.documentElement.dataset.startupActive; };
  }, [active]);
  const finish = useCallback(() => setActive(false), []);
  const value = useMemo(() => ({ active, startedAt, finish }), [active, startedAt, finish]);
  return <StartupContext.Provider value={value}>{children}</StartupContext.Provider>;
}
