import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingToggle from '@/components/ui/setting-toggle';
import { PASSING_FIELDS } from '../../../../shared/passing-policy.js';

export default function PassingPolicyFields({ value, errors, path, onChange }) {
  return <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2 lg:grid-cols-3">
    {PASSING_FIELDS.map(field => {
      const id = `passing-${path}-${field.key}`;
      const enabled = value[field.key] !== null;
      const error = errors[`${path}.${field.key}`];
      return <div key={field.key} className="min-w-0 space-y-2">
        {field.optional ? <SettingToggle label={field.label} checked={enabled} onCheckedChange={checked => onChange(field.key, checked ? 0 : null)} />
          : <Label htmlFor={id}>{field.label}</Label>}
        {(!field.optional || enabled) && <Input id={id} type="number" min={field.min} max={field.max} step={field.optional ? 1 : 0.25}
          inputMode={field.optional ? 'numeric' : 'decimal'} aria-label={field.label} value={value[field.key] ?? ''}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          onChange={event => onChange(field.key, event.target.value === '' ? '' : Number(event.target.value))} />}
        {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
      </div>;
    })}
  </div>;
}
