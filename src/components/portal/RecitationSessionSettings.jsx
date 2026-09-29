import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { studentsApi } from '@/services/studentsApi';

const defaultPreferences = Object.freeze({
  memorizationMode: 'mushaf',
  masteryMode: 'mushaf',
  reviewMode: 'mushaf',
  linkMode: 'mushaf',
});

const preferenceFields = Object.freeze([
  { key: 'memorizationMode', label: 'الحفظ' },
  { key: 'reviewMode', label: 'المراجعة' },
  { key: 'linkMode', label: 'الربط' },
]);

const normalizePreferences = (value = {}) => { return (Object.fromEntries(
  [...preferenceFields, { key: 'masteryMode' }].map(({ key }) => { const _resolveNormalizePreferences = () => {
                                                                     if (value[key === 'masteryMode' ? 'memorizationMode' : key] === 'count') {
                                                                       return 'count';
                                                                     }
                                                                     return 'mushaf';
                                                                   };
                                                                   return ([key, _resolveNormalizePreferences()]); }),
)); };

const readCachedPreferences = (staffId) => {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(`nukhab_recitation_preferences:${staffId}`) || 'null') || {});
  } catch {
    return null;
  }
};

const cachePreferences = (staffId, preferences) => {
  localStorage.setItem(`nukhab_recitation_preferences:${staffId}`, JSON.stringify(preferences));
};

const RecitationSessionSettings = ({ staffId }) => {
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  const cachedPreferences = useMemo(() => readCachedPreferences(staffId), [staffId]);
  const [preferences, setPreferences] = useState(cachedPreferences || defaultPreferences);
  const [isLoading, setIsLoading] = useState(Boolean(isOnline));
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveRequestRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    if (!isOnline) {
      setIsLoading(false);
      return undefined;
    }
    setIsLoading(true);
    studentsApi.getMyRecitationPreferences()
      .then((result) => {
        if (!mounted) return;
        const normalized = normalizePreferences(result);
        setPreferences(normalized);
        cachePreferences(staffId, normalized);
      })
      .catch((error) => {
        if (!mounted) return;
        toast({ title: 'تعذر تحميل إعدادات التسميع', description: error.message, variant: 'destructive' });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isOnline, staffId, toast]);

  const save = async (nextValue) => {
    const nextPreferences = normalizePreferences(nextValue);
    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    setPreferences(nextPreferences);
    cachePreferences(staffId, nextPreferences);
    window.dispatchEvent(new CustomEvent('nukhab-recitation-preferences-updated', { detail: nextPreferences }));
    if (!isOnline) {
      setSaveStatus('offline');
      return;
    }
    setSaveStatus('saving');
    try {
      const saved = normalizePreferences(await studentsApi.updateMyRecitationPreferences(nextPreferences));
      if (saveRequestRef.current !== requestId) return;
      setPreferences(saved);
      cachePreferences(staffId, saved);
      window.dispatchEvent(new CustomEvent('nukhab-recitation-preferences-updated', { detail: saved }));
      setSaveStatus('saved');
    } catch (error) {
      if (saveRequestRef.current !== requestId) return;
      setSaveStatus('error');
      toast({ title: 'تعذر حفظ إعدادات التسميع', description: error.message, variant: 'destructive' });
    }
  };

  const updatePreference = (key, value) => {
    void save({ ...preferences, [key]: value });
  };

  if (isLoading) return <DashboardLoader className="min-h-[180px]" />;

  return (
    <div className="space-y-3 [font-family:var(--font-ui)]" dir="rtl">
        <div className="grid grid-cols-1 gap-4">
          {preferenceFields.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
              <Label htmlFor={`recitation-preference-${key}`} className="text-base font-black">{label}</Label>
              <Select
                value={preferences[key]}
                onValueChange={(value) => updatePreference(key, value)}
              >
                <SelectTrigger
                  id={`recitation-preference-${key}`}
                  aria-label={`طريقة تسميع ${label}`}
                  className="h-12 border-primary/30 bg-card"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mushaf">المصحف</SelectItem>
                  <SelectItem value="count">العد</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="min-h-5 text-xs font-bold text-muted-foreground" aria-live="polite">
          {saveStatus === 'saving' && 'جاري الحفظ…'}
          {saveStatus === 'saved' && 'حُفظ تلقائيًا'}
          {saveStatus === 'offline' && 'حُفظ على الجهاز مؤقتًا'}
          {saveStatus === 'error' && 'تعذر الحفظ'}
        </p>
    </div>
  );
};

export default RecitationSessionSettings;
