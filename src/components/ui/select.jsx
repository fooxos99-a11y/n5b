import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = ({ children, onOpenChange, ...props }) => {
  const handleOpenChange = (open) => {
    if (open) {
      requestAnimationFrame(() => {
        const trigger = document.activeElement
        const dialog = trigger?.closest?.(".app-dialog")
        if (trigger?.getAttribute?.("role") === "combobox" && dialog) {
          const triggerRect = trigger.getBoundingClientRect()
          const dialogRect = dialog.getBoundingClientRect()
          const isOutsideVisibleArea = triggerRect.top < dialogRect.top || triggerRect.bottom > dialogRect.bottom
          if (isOutsideVisibleArea) {
            trigger.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" })
          }
        }
      })
    }
    onOpenChange?.(open)
  }

  return (
    <SelectPrimitive.Root dir="rtl" onOpenChange={handleOpenChange} {...props}>
      {children}
    </SelectPrimitive.Root>
  )
}

const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef(({ className, children, appearance = "solid", showChevron = true, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    dir="rtl"
    data-appearance={appearance}
    className={cn(
      "relative flex items-center text-right font-semibold text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
      appearance === "solid"
        ? "select-trigger-solid h-12 w-full rounded-xl border border-input bg-card py-2 pl-10 pr-4 text-sm shadow-[0_1px_2px_hsl(210_40%_20%/0.025)] transition-[border-color,box-shadow,background-color] focus:border-primary/55 focus:ring-4 focus:ring-primary/10 disabled:bg-muted/60"
        : "inline-flex border-0 bg-transparent p-0 shadow-none",
      className,
    )}
    {...props}
  >
    <span className="min-w-0 flex-1 text-right">{children}</span>
    {showChevron && <SelectPrimitive.Icon asChild>
      <ChevronDown className="absolute left-3 h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>}
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef(({
  className,
  children,
  side = "bottom",
  align = "end",
  sideOffset = 6,
  avoidCollisions = true,
  ...props
}, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position="popper"
      dir="rtl"
      side={side}
      align={align}
      sideOffset={sideOffset}
      avoidCollisions={avoidCollisions}
      collisionPadding={12}
      data-app-select-content=""
      className={cn("select-content-solid relative z-[120] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] overflow-hidden overscroll-contain rounded-xl border border-border bg-popover text-right text-foreground shadow-[0_14px_35px_hsl(210_40%_15%/0.16)] touch-pan-y [-webkit-overflow-scrolling:touch] duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2", className)}
      {...props}
    >
      <SelectPrimitive.Viewport className="max-h-[min(20rem,var(--radix-select-content-available-height))] overflow-y-auto overscroll-contain p-1 text-right touch-pan-y [-webkit-overflow-scrolling:touch]">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef(({ className, children, showIndicator = true, textClassName, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    dir="rtl"
    className={cn("relative flex min-h-11 w-full cursor-default select-none items-center justify-start rounded-lg py-2 pl-8 pr-3 text-right text-sm outline-none focus:bg-primary/10 focus:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)}
    {...props}
  >
    {showIndicator && (
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    )}
    <SelectPrimitive.ItemText asChild>
      <span className={cn("block w-full whitespace-normal break-words text-right leading-6", textClassName)}>{children}</span>
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectGroup = SelectPrimitive.Group

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("px-3 py-1.5 text-right text-xs font-bold text-muted-foreground", className)} {...props} />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue }
