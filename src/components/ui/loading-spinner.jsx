import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import '@/styles/loading-spinner.css';

const sizeClassNames = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'loading-spinner--screen',
};

// Branding belongs to the startup screen; later loading keeps a quiet progress indicator.
const LoadingSpinner = ({ className, size = 'sm' }) => (
  <Loader2 className={cn('loading-progress motion-safe:animate-spin', sizeClassNames[size] || sizeClassNames.sm, className)} aria-hidden="true" />
);

export default LoadingSpinner;
