import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const StartupContext = createContext(null);
export const useStartup = () => useContext(StartupContext);

export default function StartupProvider({ children }) {
  const [startedAt] = useState(() => performance.now());
  const [active, setActive] = useState(true);
  const finish = useCallback(() => setActive(false), []);
  const value = useMemo(() => ({ active, startedAt, finish }), [active, startedAt, finish]);
  return <StartupContext.Provider value={value}>{children}</StartupContext.Provider>;
}
