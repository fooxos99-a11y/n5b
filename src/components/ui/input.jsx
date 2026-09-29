import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-12 w-full rounded-xl border border-input bg-card px-4 py-2 text-base text-foreground shadow-[0_1px_2px_hsl(210_40%_20%/0.025)] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/75 transition-[border-color,box-shadow,background-color] focus-visible:border-primary/55 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
