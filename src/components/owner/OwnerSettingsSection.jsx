import React, { useEffect, useState } from 'react';
import { ChevronDown, Save, SlidersHorizontal } from 'lucide-react';
import { platformSettingsGroups } from '../../../shared/platform-settings-catalog.js';
import OwnerErrorState from '@/components/owner/OwnerErrorState';
import OwnerPolicySetting from '@/components/owner/OwnerPolicySetting';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { platformApi } from '@/services/platformApi';

const OwnerSettingsSection = ({ complexes }) => {
  const { toast } = useToast();
  const activeComplexes = complexes.filter((complex) => complex.status === 'active');
  const [complexId, setComplexId] = useState(() => String(activeComplexes[0]?.id || ''));
  const [settings, setSettings] = useState(null);
  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const [policies, setPolicies] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    if (!complexId) return;
    setError('');
    setSettings(null);
    setPolicies(null);
    try {
      const sourceComplexId = complexId === 'all' ? activeComplexes[0]?.id : complexId;
      const result = await platformApi.getSettings(sourceComplexId);
      setSettings(result.settings);
      setPolicies(result.policies);
    } catch (requestError) {
      setError(requestError.message || 'تعذر تحميل الإعدادات.');
    }
  };

  useEffect(() => { load(); }, [complexId]);

  const updatePolicy = (definition, policy) => {
    setPolicies((current) => ({ ...current, [definition.key]: policy }));
    if (definition.type === 'boolean' && policy !== 'tenant') {
      setSettings((current) => ({ ...current, [definition.key]: policy === 'enabled' }));
    }
  };

  const save = async () => {
    const all = complexId === 'all';
    setBusy('save');
    try {
      const result = await platformApi.updateSettings({
        complexIds: all ? [] : [Number(complexId)],
        settings,
        policies,
      });
      setSettings(result.settings);
      setPolicies(result.policies);
      toast({ title: all ? 'حُفظت الإعدادات لجميع المجمعات' : 'حُفظت إعدادات المجمع' });
    } catch (requestError) {
      toast({ title: 'تعذر حفظ الإعدادات', description: requestError.message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  if (!activeComplexes.length) return <OwnerErrorState message="لا توجد مجمعات مفعّلة." />;

  const _resolveOwnerSettingsSection = () => {
    if (error) {
      return <OwnerErrorState message={error} onRetry={load} />;
    }
    if (!settings || !policies) {
      return <DashboardLoader className="min-h-80" />;
    }
    return <>
          <Card className="border-border/70 bg-card shadow-sm">
            <CardContent className="space-y-2 p-3 sm:p-4">
              {platformSettingsGroups.map((group, groupIndex) => (
                <details key={group.key} className="group rounded-xl border border-border/70 bg-card" open={groupIndex === 0}>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 font-black outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{group.label}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="grid gap-3 border-t border-border/70 p-3 xl:grid-cols-2">
                    {group.settings.map((definition) => (
                      <OwnerPolicySetting
                        key={definition.key}
                        definition={definition}
                        value={settings[definition.key]}
                        policy={policies[definition.key] || 'tenant'}
                        onValueChange={(value) => updateSetting(definition.key, value)}
                        onPolicyChange={(policy) => updatePolicy(definition, policy)}
                      />
                    ))}
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>

          <Button type="button" className="h-11 w-full gap-2 sm:w-auto sm:min-w-56" loading={busy === 'save'} disabled={Boolean(busy)} onClick={save}>
            <Save className="h-4 w-4" />{complexId === 'all' ? 'حفظ لجميع المجمعات' : 'حفظ لهذا المجمع'}
          </Button>
        </>;
  };
  return (
    <section className="space-y-4 [font-family:var(--font-ui)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-xl font-black text-foreground sm:text-2xl">إعدادات المنصة</h2>
        <div className="w-full sm:w-72">
          <Label className="mb-1 block text-xs font-black">المجمع</Label>
          <Select value={complexId} onValueChange={setComplexId}>
            <SelectTrigger className="h-11 bg-card" aria-label="اختيار المجمع"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المجمعات</SelectItem>
              {activeComplexes.map((complex) => <SelectItem key={complex.id} value={String(complex.id)}>{complex.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {_resolveOwnerSettingsSection()}
    </section>
  );
};

export default OwnerSettingsSection;
