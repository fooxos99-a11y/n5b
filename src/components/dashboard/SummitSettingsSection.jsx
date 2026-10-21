import React, { useCallback, useEffect, useState } from 'react';
import SummitMapEditor from './SummitMapEditor';
import DashboardLoader from './DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { ToggleSwitch } from '@/components/ui/setting-toggle';
import { summitApi } from '@/services/summitApi';
export default function SummitSettingsSection() {
  const [settings, setSettings] = useState(null), [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const value = await summitApi.settings(); setSettings(value); setSaved(value); }
    catch (cause) { setError(cause.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <DashboardLoader />;
  if (!settings) return <ErrorState message={error} onRetry={load} />;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const save = async () => {
    setSaving(true); setError('');
    try { const value = await summitApi.saveSettings(settings); setSettings(value); setSaved(value); }
    catch (cause) { setError(cause.message); } finally { setSaving(false); }
  };
  return <div className="space-y-4 [font-family:var(--font-ui)]" dir="rtl">
    <fieldset disabled={saving} className="space-y-4">
      <div className="flex min-h-14 items-center justify-between rounded-2xl border border-border bg-card p-4"><span className="font-bold">تفعيل الخريطة</span>
        <ToggleSwitch ariaLabel="تفعيل الخريطة" checked={settings.enabled} onCheckedChange={enabled => setSettings(current => ({ ...current, enabled }))} /></div>
      {settings.enabled && <SummitMapEditor value={settings.mapConfig} pointsDisabled={dirty || saving} onChange={mapConfig => setSettings(current => ({ ...current, mapConfig }))} />}
    </fieldset>
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={load}>إعادة تحميل الإعدادات</Button></div>}
    <div className="sticky bottom-0 flex justify-end border-t border-border bg-card/95 p-3 backdrop-blur">
      <Button className="min-h-11" loading={saving} disabled={saving || !dirty} onClick={save}>حفظ التغييرات</Button>
    </div>
  </div>;
}
