import { useEffect, useRef, useState } from 'react';
import { NativeApiError } from '../services/nativeApi';

export function useVerifiedMutation(reload: () => Promise<boolean>) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false); const locked = useRef(false); const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(work: () => Promise<unknown>, close: () => void, message: (value: unknown) => string) {
    if (locked.current || uncertain) return; locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await work();
      if (mounted.current) { close(); setNotice(message(result)); await reload(); }
    } catch (cause) {
      if (mounted.current) {
        const unknownResult = cause instanceof NativeApiError && ['network', 'timeout', 'server', 'invalid-response'].includes(cause.code);
        setUncertain(unknownResult);
        setError(unknownResult ? 'تعذّر تأكيد نتيجة الحفظ. حدّث البيانات قبل إعادة العملية.' : cause instanceof Error ? cause.message : 'تعذّر حفظ التغيير.');
      }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  async function reconcile(close: () => void) {
    if (locked.current) return; locked.current = true; setBusy(true);
    try {
      const verified = await reload();
      if (mounted.current && verified) { close(); setUncertain(false); setError(''); }
      else if (mounted.current) setError('تعذّر تحديث البيانات. تبقى العملية موقوفة حتى نتحقق من نتيجة الحفظ.');
    }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function reset() { if (!uncertain) { setError(''); setNotice(''); } }
  return { busy, error, notice, uncertain, run, reconcile, reset };
}
