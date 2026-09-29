import { useCallback, useEffect, useState } from 'react';

const views = new Set(['sessions', 'mushaf', 'store', 'calls']);
const readView = () => {
  const value = window.location.hash.replace('#student/', '');
  return window.location.hash.startsWith('#student/') && views.has(value) ? value : null;
};

export default function useStudentHomeNavigation() {
  const [view, setView] = useState(readView);
  const open = useCallback((next) => {
    if (next === readView()) return;
    const url = new URL(window.location.href);
    const depth = Number(window.history.state?.studentHomeDepth || 0);
    window.history.pushState({ ...window.history.state, studentHomeDepth: depth + 1 }, '', `${url.pathname}${url.search}${next ? '#student/' + next : ''}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    setView(next);
  }, []);
  const back = useCallback(() => {
    if (window.history.state?.studentHomeDepth > 0) window.history.back();
    else {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      setView(null);
    }
  }, []);
  useEffect(() => {
    const sync = () => setView(readView());
    const nativeBack = (event) => { if (readView()) { event.preventDefault(); back(); } };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener('nukhab-student-back', nativeBack);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('nukhab-student-back', nativeBack);
    };
  }, [back]);
  return { view, open, back };
}
