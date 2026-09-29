import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const triggerClassName = 'inline-flex h-7 min-h-7 !w-auto !min-w-7 !gap-0 border-0 !bg-transparent !px-0.5 py-0 text-xs font-black text-primary !shadow-none ring-0 hover:text-primary/80 focus:ring-0 focus:ring-offset-0 sm:h-8 sm:min-h-8 sm:text-sm [&>span]:!w-auto [&>span]:!flex-none [&>svg]:hidden';
const contentClassName = 'z-[150] !w-auto !min-w-16 max-h-56 border-primary/25 bg-background/95 text-xs font-black shadow-xl shadow-primary/10 backdrop-blur';
const itemClassName = 'h-9 justify-center px-2 text-center text-xs font-black data-[state=checked]:bg-primary/15 data-[state=checked]:text-primary [&>span:last-child]:text-center';

const InlineRecitationSelect = ({ value, options = [], onValueChange, ariaLabel, disabled = false }) => (
  <Select value={String(value)} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger aria-label={ariaLabel} appearance="inline" className={triggerClassName} disabled={disabled}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent align="center" sideOffset={2} className={contentClassName}>
      {options.map((option) => (
        <SelectItem
          key={String(option.key ?? option.value)}
          value={String(option.value)}
          showIndicator={false}
          className={itemClassName}
        >
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default InlineRecitationSelect;
