import React from 'react';
import { cn } from '@/lib/utils';

const RecitationAmountVisibility = ({ amount, visible = true, maxLines = 1, className }) => {
  if (!visible) return null;

  return (
    <span
      className={cn(
        'min-w-0 text-xs font-black leading-4 text-muted-foreground [font-family:var(--font-ui)]',
        maxLines === 2 ? 'line-clamp-2 whitespace-normal' : 'truncate',
        className,
      )}
    >
      {amount}
    </span>
  );
};

export default RecitationAmountVisibility;
