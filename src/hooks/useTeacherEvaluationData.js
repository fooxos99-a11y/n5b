import { mergeOfflineReading } from '@/services/offlineOperationsService';
import { useCallback, useEffect, useRef, useState } from 'react';
import { studentsApi } from '@/services/studentsApi';
import { cacheTeacherEvaluation, getCachedTeacherEvaluation, mergeLocalTeacherEvaluation } from '@/services/offlineRecitationService';
import { getAuthSessionVersion } from '@/lib/authSession';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { recitationErrorMessage } from '@/lib/recitationErrorMessage';

export default function useTeacherEvaluationData(supervisorId, enabled, onLoaded) {
  const scope = JSON.stringify([getTenantRegistrationNumber(), getAuthSessionVersion(), supervisorId]);
  const [state, setState] = useState({ scope, data: null, loading: enabled, error: '' });
  const revision = useRef(0);
  const pending = useRef(null);
  const retryDeadline = useRef(0);
  const invalidatedTransport = useRef(false);
  const setData = useCallback((update) => {
    // A response started before a local save must not undo that save in the UI.
    revision.current += 1;
    pending.current = null;
    invalidatedTransport.current = true;
    setState((current) => current.scope === scope
      ? { ...current, data: typeof update === 'function' ? update(current.data) : update }
      : current);
  }, [scope]);

  const load = useCallback(({ fresh = false } = {}) => {
    if (!enabled || !supervisorId) return Promise.resolve();
    fresh = fresh || invalidatedTransport.current;
    if (fresh) {
      revision.current += 1;
      pending.current = null;
    }
    if (pending.current) return pending.current;
    if (Date.now() < retryDeadline.current) return Promise.resolve();
    const version = revision.current;
    const isCurrent = () => version === revision.current
      && scope === JSON.stringify([getTenantRegistrationNumber(), getAuthSessionVersion(), supervisorId]);
    const update = (patch) => {
      if (isCurrent()) setState((current) => ({ ...current, ...patch, scope }));
    };
    setState((current) => ({ ...current, loading: !current.data, error: '' }));
    const request = (async () => {
      let latestArrived = false;
      let cached = null;
      const restoreCache = (async () => {
        try {
          cached = await mergeOfflineReading(supervisorId, await getCachedTeacherEvaluation(supervisorId));
          if (navigator.onLine === false && cached && !latestArrived && isCurrent()) setState((current) => (
            current.scope === scope && !current.data
              ? { ...current, data: cached, loading: !(cached.tasks?.length || cached.students?.length) }
              : current
          ));
        } catch {
          // A device-storage failure must not prevent loading the live session.
          cached = null;
        }
      })();
      if (navigator.onLine === false) {
        await restoreCache;
        update({ loading: false, error: cached ? '' : 'لا توجد جلسة محفوظة على الجهاز. اتصل بالإنترنت ثم أعد المحاولة.' });
        return;
      }
      try {
        invalidatedTransport.current = false;
        const evaluation = await studentsApi.getSupervisorQuranEvaluation(supervisorId, { fresh });
        if (!Array.isArray(evaluation?.tasks) || !Array.isArray(evaluation?.students)) throw new Error('تعذر قراءة بيانات جلسة التسميع. أعد المحاولة.');
        latestArrived = true;
        if (!isCurrent()) return;
        // Merge durable local outcomes before display; snapshot writes are not on the rendering path.
        const resolvedEvaluation = await mergeOfflineReading(supervisorId, await mergeLocalTeacherEvaluation(supervisorId, evaluation));
        if (!isCurrent()) return;
        update({ data: resolvedEvaluation, loading: false, error: '', retryAt: 0 });
        void cacheTeacherEvaluation(supervisorId, evaluation).catch(() => {
          update({ error: 'الجلسة متاحة، لكن تعذر حفظ نسختها على الجهاز للعمل دون اتصال.' });
        });
        if (isCurrent()) onLoaded(evaluation);
      } catch (error) {
        await restoreCache;
        if (!isCurrent()) return;
        // A failed online read can fall back to durable local data, with its error visible.
        if (cached) setState((current) => current.scope === scope && !current.data
          ? { ...current, data: cached } : current);
        retryDeadline.current = error.status === 429 ? Date.now() + Math.max(Number(error.retryAfterMs) || 0, 1000) : 0;
        update({ loading: false, retryAt: retryDeadline.current, error: recitationErrorMessage(error, 'تعذر تحميل جلسة التسميع. أعد المحاولة.') });
      } finally {
        await restoreCache;
      }
    })().finally(() => {
      if (pending.current === request) pending.current = null;
    });
    pending.current = request;
    return request;
  }, [enabled, onLoaded, scope, supervisorId]);

  useEffect(() => {
    revision.current += 1;
    retryDeadline.current = 0;
    pending.current = null;
    setState({ scope, data: null, loading: enabled, error: '' });
    void load();
    return () => { revision.current += 1; pending.current = null; };
  }, [enabled, load, scope]);

  return { data: state.scope === scope ? state.data : null, setData, load,
    isLoading: state.scope === scope ? state.loading : enabled,
    retryAt: state.scope === scope ? state.retryAt || 0 : 0,
    loadError: state.scope === scope ? state.error : '' };
}
