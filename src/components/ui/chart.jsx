import React from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

export function ChartContainer({ children, className, ...props }) {
  return <div dir="ltr" className={cn('w-full min-w-0 text-xs [font-family:var(--font-ui)]', className)} {...props}><ResponsiveContainer width="100%" height="100%" minWidth={0}>{children}</ResponsiveContainer></div>;
}

export function ChartTooltip(props) {
  return <Tooltip cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.3 }} {...props} />;
}
