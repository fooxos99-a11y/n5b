import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStudentPlan, loadStudentToday, readCachedStudentPlan } from '@/services/studentPlanService';

export default function useStudentPlan(studentId, today) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const load = useCallback(async (silent = false) => {
    const request = ++revision.current;
    if (!silent) setLoading(true);
    const todayRequest = loadStudentToday(studentId).then(todayData => {
      if (request === revision.current) setData(current => ({ ...current, today: todayData }));
    }).catch(() => undefined);
    try {
      const next = await loadStudentPlan(studentId);
      await todayRequest;
      if (request === revision.current) { setData(next); setError(''); }
    } catch (error_) {
      if (request === revision.current) setError(error_.message || 'تعذر تحميل الخطة.');
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoading(true);
    readCachedStudentPlan(studentId, today).then(cached => {
      if (active && cached) { setData(current => current || cached); setLoading(false); }
    }).catch(() => undefined);
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    const executionUpdated = (event) => {
      if (String(event.detail?.studentId) !== String(studentId)) return;
      if (event.detail?.today) {
        ++revision.current;
        setData(current => ({ ...current, today: event.detail.today }));
        setError('');
        setLoading(false);
      } else refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('nukhab-quran-execution-updated', executionUpdated);
    return () => {
      active = false;
      ++revision.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('nukhab-quran-execution-updated', executionUpdated);
    };
  }, [load, studentId, today]);
  return { data, loading, error, retry: () => load() };
}
