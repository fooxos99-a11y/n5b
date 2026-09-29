import { useEffect, useState } from 'react';

const useSaudiClock = () => {
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setClock(new Date());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return clock;
};

export default useSaudiClock;
