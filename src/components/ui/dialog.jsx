import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogPortal = DialogPrimitive.Portal

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-[#071c2b]/55 backdrop-blur-[3px]", className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({
  className,
  overlayClassName,
  children,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}, ref) => {
  const keepDialogOpenForSelect = (event, handler) => {
    const originalEvent = event.detail?.originalEvent
    const target = originalEvent?.target
    if (originalEvent?.detail > 1 || target?.closest?.("[data-app-select-content], [data-dashboard-undo]")) {
      event.preventDefault()
    }
    handler?.(event)
  }

  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn("app-dialog fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg min-w-0 -translate-x-1/2 -translate-y-1/2 touch-pan-y gap-3 overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-3 shadow-[0_24px_70px_hsl(210_55%_10%/0.24)] duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-3 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-3 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:gap-4 sm:p-6", className)}
        onPointerDownOutside={(event) => keepDialogOpenForSelect(event, onPointerDownOutside)}
        onInteractOutside={(event) => keepDialogOpenForSelect(event, onInteractOutside)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-2 text-right", className)} {...props} />
)

const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-row flex-wrap justify-end gap-2", className)} {...props} />
)

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-black leading-tight tracking-tight text-foreground", className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle }
