import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { dashboardPermissionOptions } from '@/lib/dashboardPermissions';

export default function PermissionChecklist({ id, value = [], onToggle, fixedPermissions = [] }) {
  const options = dashboardPermissionOptions.filter(option => option.key !== 'quranEvaluation' || fixedPermissions.includes(option.key));
  const groups = ['المستخدمون', 'التحضير', 'الجلسات', 'الإدارة'];
  const selectedLabels = options.filter(option => fixedPermissions.includes(option.key) || value.includes(option.key)).map(option => option.label).join('، ');
  return <Popover modal>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" aria-label="الصلاحيات" dir="rtl"
        className="select-trigger-solid relative h-12 w-full min-w-0 justify-between border-primary/30 bg-background pl-10 pr-4 text-right shadow-none hover:translate-y-0 [font-family:var(--font-ui)]">
        <span title={selectedLabels || undefined} className={`w-0 min-w-0 flex-1 truncate ${selectedLabels ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabels || 'اختر الصلاحيات'}
        </span>
        <ChevronDown aria-hidden="true" className="absolute left-3 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" collisionPadding={12} dir="rtl" aria-label="اختيار الصلاحيات"
      className="max-h-[min(20rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain p-2 touch-pan-y [font-family:var(--font-ui)]">
      <div role="group" aria-label="الصلاحيات" className="space-y-3">
        {groups.map(group => <div key={group} role="group" aria-label={group}>
          <p className="px-2 py-1 text-sm font-bold text-muted-foreground">{group}</p>
          {options.filter(option => (option.group || 'الإدارة') === group).map(option => {
            const fixed = fixedPermissions.includes(option.key);
            const selected = fixed || value.includes(option.key);
            return <Button key={option.key} type="button" variant="ghost" role="checkbox" aria-checked={selected} disabled={fixed}
              className={`min-h-11 w-full justify-between gap-3 px-2 text-right hover:translate-y-0 ${selected ? 'bg-primary/10 text-primary' : ''}`} onClick={() => onToggle(option.key)}>
              {option.label}<span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                {selected && <Check className="h-4 w-4" />}
              </span>
            </Button>;
          })}
        </div>)}
      </div>
    </PopoverContent>
  </Popover>;
}
