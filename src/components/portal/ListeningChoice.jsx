import React from 'react';
import InlineRecitationSelect from '@/components/portal/InlineRecitationSelect';
import { cn } from '@/lib/utils';

const ListeningChoice = ({
  value = 1,
  onChange,
  disabled = false,
  label = 'السماع',
  ariaLabel = 'هل استمع الطالب؟',
  compact = false,
}) => (
  <div
    className={cn(
      'flex items-center justify-start text-right font-bold text-muted-foreground [font-family:var(--font-ui)]',
      compact ? 'min-h-6 w-auto shrink-0 gap-0 text-xs sm:text-sm' : 'min-h-9 w-full gap-1 text-xs',
    )}
    dir="rtl"
  >
    {label && <span>{compact ? `${label.replace(/:$/, '')}:` : label}</span>}
    <InlineRecitationSelect
      ariaLabel={ariaLabel}
      value={Number(value) > 0 ? 1 : 0}
      options={[
        { value: 1, label: 'نعم' },
        { value: 0, label: 'لا' },
      ]}
      onValueChange={(nextValue) => onChange?.(Number(nextValue))}
      disabled={disabled}
    />
  </div>
);

export default ListeningChoice;
