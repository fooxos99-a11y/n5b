import React, { Suspense } from 'react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';

const CallsSection = React.lazy(() => import('@/components/calls/CallsSection'));

const LazyCallsSection = (props) => (
  <Suspense fallback={<DashboardLoader className="min-h-[420px]" />}>
    <CallsSection {...props} />
  </Suspense>
);

export default LazyCallsSection;
