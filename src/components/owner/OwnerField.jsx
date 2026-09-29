import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const OwnerField = ({
  label,
  hint,
  icon: Icon,
  value,
  onChange,
  type = 'text',
  disabled = false,
  inputMode,
  placeholder,
  actionLabel,
  onAction,
}) => {
  const inputId = React.useId();

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Label htmlFor={inputId} className="font-bold">{label}</Label>
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-bold text-primary"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
      <div className="relative">
        <Input
          id={inputId}
          type={type}
          value={value}
          disabled={disabled}
          inputMode={inputMode}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 rounded-xl border-border bg-background pr-11 text-base shadow-none focus-visible:border-primary"
        />
        <Icon className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
      </div>
      {hint ? <p className="text-xs font-semibold leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
};

export default OwnerField;
