import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '../DashboardLoader';
import SettingsGroup from '../SettingsGroup';
import { useToast } from '@/components/ui/use-toast';
import useQueuedAutosave from '@/hooks/useQueuedAutosave';
import { passingApi } from '@/services/passingApi';
import { PASSING_TYPES, passingPolicyErrors, effectivePassingPolicy } from '../../../../shared/passing-policy.js';
import PassingPolicyFields from './PassingPolicyFields';

export default function PassingSettingsPanel({ onStatusChange }) {
  const [policy, setPolicy] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [edited, setEdited] = useState(false);
  const [type, setType] = useState('branch');
  const [juz, setJuz] = useState('all');
  const { toast } = useToast();
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;
  const load = useCallback(async () => {
    setLoadError('');
    try { setPolicy((await passingApi.getPolicy()).policy); setEdited(false); }
    catch (error) { setLoadError(error.message); statusRef.current?.('error'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const errors = useMemo(() => policy ? passingPolicyErrors(policy) : {}, [policy]);
  const valid = !Object.keys(errors).length;
  useEffect(() => { if (edited && !valid) statusRef.current?.('error'); }, [edited, valid]);
  useQueuedAutosave({ channel: 'passing-policy', value: policy, enabled: Boolean(edited && policy && valid),
    save: value => passingApi.savePolicy(value), onStatus: status => statusRef.current?.(status),
    onError: error => toast({ title: 'تعذر حفظ إعدادات الاجتياز', description: error.message, variant: 'destructive' }) });
  if (loadError) return <SettingsGroup><ErrorState message={loadError} onRetry={load} /></SettingsGroup>;
  if (!policy) return <DashboardLoader />;
  const value = juz === 'all' ? policy[type] : { ...policy[type], ...policy[type].juzOverrides[juz] };
  const path = juz === 'all' ? type : `${type}.juzOverrides.${juz}`;
  const update = (key, next) => {
    setEdited(true);
    setPolicy(current => ({ ...current, [type]: juz === 'all' ? { ...current[type], [key]: next }
      : { ...current[type], juzOverrides: { ...current[type].juzOverrides, [juz]: { ...effectivePassingPolicy(current, type, juz), [key]: next } } } }));
  };
  return <div className="divide-y divide-border" dir="rtl">
    <SettingsGroup>
      <h3 className="text-sm font-black text-primary">إعدادات الاجتياز</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="passing-settings-type">نوع الاجتياز</Label>
          <Select value={type} onValueChange={setType}><SelectTrigger id="passing-settings-type"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(PASSING_TYPES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="passing-settings-juz">إعدادات الجزء</Label>
          <Select value={juz} onValueChange={setJuz}><SelectTrigger id="passing-settings-juz"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">الإعدادات الافتراضية لجميع الأجزاء</SelectItem>
              {Array.from({ length: 30 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>الجزء {index + 1}{policy[type].juzOverrides[index + 1] ? ' — مخصص' : ''}</SelectItem>)}
            </SelectContent></Select></div>
      </div>
    </SettingsGroup>
    <SettingsGroup>
      <PassingPolicyFields {...{ value, errors, path, onChange: update }} />
      <p className="text-xs leading-6 text-muted-foreground">يجتاز الجزء عند بلوغ حد الاجتياز وعدم تجاوز الحدود المفعّلة. الإعدادات الجديدة تُطبّق على المحاولات التالية.</p>
      {juz !== 'all' && <Button variant="outline" disabled={!policy[type].juzOverrides[juz]} onClick={() => {
        setEdited(true); setPolicy(current => { const overrides = { ...current[type].juzOverrides }; delete overrides[juz];
          return { ...current, [type]: { ...current[type], juzOverrides: overrides } }; });
      }}>استخدام الإعدادات الافتراضية لهذا الجزء</Button>}
    </SettingsGroup>
  </div>;
}
