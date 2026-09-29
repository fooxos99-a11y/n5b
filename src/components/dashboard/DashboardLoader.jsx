import React from 'react';
import LoadingIndicator from '@/components/ui/loading-indicator';

const DashboardLoader = ({ className = 'py-12', mode = 'inline' }) => <LoadingIndicator className={className} mode={mode} />;

export default DashboardLoader;
