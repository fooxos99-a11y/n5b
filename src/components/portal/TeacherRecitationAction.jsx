import React from 'react';
import { Button } from '@/components/ui/button';
import TeacherRecitationDetails from '@/components/portal/TeacherRecitationDetails';
import { RotateCcw } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';

export default function TeacherRecitationAction({ label, slot, active = false, disabled = false, onClick, amount, amountControl, showAmount, retry = false, pending = false }) {
  return (
    <div data-recitation-slot={slot} className="recitation-action-column">
      <Button type="button" variant="secondary" size="sm" className="recitation-action min-w-0 px-2 gap-1" data-active={active} disabled={disabled || pending} aria-busy={pending || undefined} aria-label={retry ? `إعادة تسميع ${label}${pending ? '، بانتظار المزامنة' : ''}` : undefined} onClick={onClick}>
        {label}
        {pending ? <LoadingSpinner size="sm" className="!h-3 !w-3 shrink-0" /> : retry && <RotateCcw aria-hidden="true" className="h-3 w-3 shrink-0" />}
      </Button>
      {pending && <span role="status" className="text-[10px] leading-4 text-muted-foreground">بانتظار المزامنة</span>}
      {showAmount && <TeacherRecitationDetails amount={amount} amountControl={amountControl} />}
    </div>
  );
}
