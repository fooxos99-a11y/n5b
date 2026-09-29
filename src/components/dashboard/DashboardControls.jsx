import React from 'react';
import { Button } from '@/components/ui/button';
import DatePicker from '@/components/ui/date-picker';
import RecitationSessionDatePicker from '@/components/ui/recitation-session-date-picker';
import { cn } from '@/lib/utils';

const dashboardSecondaryControlClassName =
  'h-11 rounded-xl border-border bg-card font-bold text-foreground shadow-[0_1px_2px_hsl(210_40%_20%/0.025)] hover:border-primary/35 hover:bg-muted';

export const DashboardDatePicker = ({
  sessionDates = false,
  className,
  ...props
}) => {
  const Picker = sessionDates ? RecitationSessionDatePicker : DatePicker;
  return (
    <Picker
      {...props}
      className={cn('h-11 w-full min-w-0', className)}
    />
  );
};

export const DashboardSecondaryButton = React.forwardRef(({
  className,
  variant: _variant,
  ...props
}, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="outline"
    className={cn(dashboardSecondaryControlClassName, className)}
    {...props}
  />
));

DashboardSecondaryButton.displayName = 'DashboardSecondaryButton';
