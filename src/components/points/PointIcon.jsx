import React from 'react';
import { cn } from '@/lib/utils';

const PointIcon = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={cn('h-4 w-4 shrink-0 drop-shadow-sm', className)}
    fill="none"
  >
    <path
      d="M12 2.75 14.2 5l3.12-.45.5 3.1 2.8 1.45-1.42 2.8 1.42 2.8-2.8 1.45-.5 3.1-3.12-.45L12 21.05 9.8 18.8l-3.12.45-.5-3.1-2.8-1.45 1.42-2.8-1.42-2.8 2.8-1.45.5-3.1L9.8 5 12 2.75Z"
      fill="currentColor"
      opacity="0.24"
    />
    <path
      d="m12 6.8 1.38 2.8 3.1.45-2.24 2.18.53 3.08L12 13.86 9.23 15.3l.53-3.08-2.24-2.18 3.1-.45L12 6.8Z"
      fill="currentColor"
    />
  </svg>
);

export default PointIcon;
