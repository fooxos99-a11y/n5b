import React from 'react';
import { cn } from '@/lib/utils';
import '@/styles/loading-spinner.css';

const sizeClassNames = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'loading-spinner--screen',
};

// All loading surfaces, including buttons, share the boot logo and animation.
const LoadingSpinner = ({ className, size = 'sm' }) => (
  <span className={cn('loading-logo', sizeClassNames[size] || sizeClassNames.sm, className)} aria-hidden="true" />
);

export default LoadingSpinner;
