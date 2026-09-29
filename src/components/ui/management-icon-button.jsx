import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ManagementIconButton = React.forwardRef(({
  tone = 'default',
  className,
  ...props
}, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="outline"
    size="icon"
    className={cn(
      'h-11 w-11 border-border/70 shadow-none',
      tone === 'destructive' && 'text-destructive hover:border-border hover:bg-destructive/[0.06] hover:text-destructive',
      tone === 'primary' && 'text-primary hover:border-border hover:bg-primary/[0.06] hover:text-primary',
      className,
    )}
    {...props}
  />
));

ManagementIconButton.displayName = 'ManagementIconButton';

export default ManagementIconButton;
