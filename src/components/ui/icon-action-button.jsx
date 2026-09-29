import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Button } from '@/components/ui/button';

const IconActionButton = React.forwardRef(({ label, children, ...props }, ref) => (
  <TooltipPrimitive.Provider delayDuration={250}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <Button ref={ref} type="button" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-[100] rounded-md border border-primary/20 bg-popover px-2.5 py-1.5 text-xs font-bold text-popover-foreground shadow-lg"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-popover" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
));
IconActionButton.displayName = 'IconActionButton';

export default IconActionButton;
