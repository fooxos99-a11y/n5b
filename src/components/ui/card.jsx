import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-2xl border border-border bg-card text-card-foreground shadow-[0_2px_12px_hsl(210_40%_20%/0.055)]", className)} {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex min-w-0 flex-col space-y-1.5 p-3 sm:p-5 lg:p-6", className)} {...props} />
))
CardHeader.displayName = "CardHeader"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("min-w-0 p-3 pt-3 sm:p-5 sm:pt-3 lg:p-6 lg:pt-3", className)} {...props} />
))
CardContent.displayName = "CardContent"

export { Card, CardHeader, CardContent }
