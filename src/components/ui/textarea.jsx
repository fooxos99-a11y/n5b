import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        "flex min-h-[96px] w-full rounded-xl border border-input bg-card px-4 py-3 text-base text-foreground shadow-[0_1px_2px_hsl(210_40%_20%/0.025)] ring-offset-background placeholder:text-muted-foreground/75 transition-[border-color,box-shadow,background-color] focus-visible:border-primary/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
