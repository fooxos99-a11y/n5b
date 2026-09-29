import React, { useEffect, useLayoutEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useScreenLoading } from './screen-loading-provider';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { usePageLoading } from './page-loading-boundary';

const LoadingIndicator = ({ className, mode = 'inline', delayMs = 180 }) => {
  const isScreen = mode === 'screen';
  const acquire = useScreenLoading();
  const acquirePage = usePageLoading();
  const register = acquirePage || (isScreen ? acquire : null);
  useLayoutEffect(() => register?.(), [register]);
  const [isVisible, setIsVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setIsVisible(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setIsVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (register) return null;
  return (
    <div
      className={cn(
        isScreen
          ? 'screen-loading-surface fixed inset-0 z-[100] grid place-items-center p-6'
          : 'flex items-center justify-center py-12',
        className,
      )}
      data-loading-indicator={isScreen ? 'screen' : 'local'}
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
    >
      <div className={cn(
        'flex items-center justify-center text-[#0ab4a6] transition-opacity duration-150',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}>
        <LoadingSpinner size="lg" />
      </div>
    </div>
  );
};

export default LoadingIndicator;
