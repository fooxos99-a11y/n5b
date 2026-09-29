import React from 'react';
import { Ban, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import MultiSelectSetting from '@/components/ui/multi-select-setting';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const weekDays = [
  { value: 6, label: 'السبت' }, { value: 0, label: 'الأحد' }, { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' }, { value: 3, label: 'الأربعاء' }, { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
];

const taskTypes = [
  { value: 'memorization', label: 'الحفظ والإتقان' }, { value: 'review', label: 'المراجعة' },
  { value: 'link', label: 'الربط' }, { value: 'repeat', label: 'التكرار' },
];

const policyOptions = [
  { value: 'enabled', label: 'مفعّل', icon: CheckCircle2 },
  { value: 'disabled', label: 'مغلق', icon: Ban },
  { value: 'tenant', label: 'اختياري من قبل المجمع', icon: SlidersHorizontal },
];

const policyClasses = {
  enabled: 'border-emerald-500/30 bg-emerald-500/5',
  disabled: 'border-destructive/30 bg-destructive/5',
  tenant: 'border-primary/15 bg-muted/20',
};

const OwnerPolicySetting = ({ definition, value, policy, onValueChange, onPolicyChange }) => {
  const editable = policy === 'enabled';
  const selectedPolicy = policyOptions.find((option) => option.value === policy) || policyOptions[2];
  const PolicyIcon = selectedPolicy.icon;
  const inputId = `owner-setting-${definition.key}`;
  const updateList = (item) => {
    const current = Array.isArray(value) ? value.map(String) : [];
    const target = String(item);
    onValueChange(current.includes(target)
      ? current.filter((entry) => entry !== target)
      : [...current, target]);
  };

  const renderValue = () => {
    if (definition.type === 'boolean') return null;
    if (definition.type === 'select') {
      return (
        <Select value={String(value ?? definition.defaultValue)} onValueChange={onValueChange} disabled={!editable}>
          <SelectTrigger id={inputId} className="h-11 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>{definition.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    if (definition.type === 'weekDays' || definition.type === 'taskTypes') {
      return (
        <MultiSelectSetting
          value={value}
          options={definition.type === 'weekDays' ? weekDays : taskTypes}
          placeholder="اختر"
          disabled={!editable}
          onToggle={updateList}
        />
      );
    }
    if (definition.type === 'textarea') {
      return <Textarea id={inputId} className="min-h-24 bg-card" value={value ?? ''} disabled={!editable} onChange={(event) => onValueChange(event.target.value)} />;
    }
    return (
      <Input
        id={inputId}
        type={definition.type}
        min={definition.min}
        max={definition.max}
        className="h-11 bg-card"
        value={value ?? ''}
        disabled={!editable}
        onChange={(event) => onValueChange(definition.type === 'number' ? Number(event.target.value) : event.target.value)}
      />
    );
  };

  return (
    <article className={`min-w-0 space-y-3 rounded-xl border p-3.5 [font-family:var(--font-ui)] ${policyClasses[policy] || policyClasses.tenant}`}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <Label htmlFor={definition.type === 'boolean' ? undefined : inputId} className="min-w-0 text-sm font-black leading-6">{definition.label}</Label>
        <PolicyIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className={`grid gap-3 ${definition.type === 'boolean' ? '' : 'sm:grid-cols-2'}`}>
        {definition.type !== 'boolean' && (
          <div className="min-w-0 space-y-1.5">
            <Label className="block text-xs font-bold text-muted-foreground">القيمة</Label>
            {renderValue()}
          </div>
        )}
        <div className="min-w-0 space-y-1.5">
          <Label className="block text-xs font-bold text-muted-foreground">الحالة</Label>
        <Select value={policy} onValueChange={onPolicyChange}>
          <SelectTrigger className="h-11 bg-card" aria-label={`التحكم في ${definition.label}`}><SelectValue /></SelectTrigger>
          <SelectContent>{policyOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        </div>
      </div>
    </article>
  );
};

export default OwnerPolicySetting;
