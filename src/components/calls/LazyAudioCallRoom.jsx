import React, { Suspense } from 'react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';

const AudioCallRoom = React.lazy(() => import('@/components/calls/AudioCallRoom'));

const LazyAudioCallRoom = (props) => (
  <Suspense fallback={<DashboardLoader className="min-h-[180px]" />}>
    <AudioCallRoom {...props} />
  </Suspense>
);

export default LazyAudioCallRoom;
