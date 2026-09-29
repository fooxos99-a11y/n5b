import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import CheckboxOption from '@/components/ui/checkbox-option';

const CommitteeMultiSelect = ({ committees = [], value = [], onChange }) => {
  const selected = new Set((Array.isArray(value) ? value : []).map(String));
  const allSelected = selected.has('all');
  const selectedNames = committees.filter(committee => selected.has(String(committee.id))).map(committee => committee.name);

  const selectAll = () => onChange?.(['all']);
  const toggleCommittee = (committeeId) => {
    const id = String(committeeId);
    const next = new Set(allSelected ? [] : selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange?.([...next]);
  };

  const optionClassName = (checked) => `min-h-11 justify-start gap-2 touch-manipulation [font-family:var(--font-ui)] ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-primary/20 bg-background'}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="حلقات يوم السرد" className="min-h-11 w-full min-w-0 justify-between gap-2 [font-family:var(--font-ui)]" dir="rtl">
          <span className="truncate">{allSelected ? 'جميع الحلقات' : selectedNames.join('، ') || 'اختر الحلقات'}</span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] max-h-[min(20rem,var(--radix-popover-content-available-height))] overflow-y-auto p-2" dir="rtl">
    <fieldset className="min-w-0 m-0 border-0 p-0 grid grid-cols-1 gap-2" aria-label="حلقات يوم السرد" dir="rtl">
      <CheckboxOption checked={allSelected} onCheckedChange={selectAll} className={buttonVariants({ variant: 'outline', className: optionClassName(allSelected) })}>
        <span className="flex h-5 w-5 items-center justify-center rounded border border-current">{allSelected && <Check className="h-4 w-4" />}</span>
        <span>جميع الحلقات</span>
      </CheckboxOption>
      {committees.map((committee) => {
        const checked = !allSelected && selected.has(String(committee.id));
        return (
          <CheckboxOption key={committee.id} checked={checked} onCheckedChange={() => toggleCommittee(committee.id)} className={buttonVariants({ variant: 'outline', className: optionClassName(checked) })}>
            <span className="flex h-5 w-5 items-center justify-center rounded border border-current">{checked && <Check className="h-4 w-4" />}</span>
            <span className="truncate">{committee.name}</span>
          </CheckboxOption>
        );
      })}
    </fieldset>
      </PopoverContent>
    </Popover>
  );
};

export default CommitteeMultiSelect;
