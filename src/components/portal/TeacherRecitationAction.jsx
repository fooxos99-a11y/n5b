import React from 'react';
import { Button } from '@/components/ui/button';
import TeacherRecitationDetails from '@/components/portal/TeacherRecitationDetails';

export default function TeacherRecitationAction({ label, slot, active = false, disabled = false, onClick, amount, amountControl, showAmount }) {
  return (
    <div data-recitation-slot={slot} className="recitation-action-column">
      <Button type="button" variant="secondary" size="sm" className="recitation-action min-w-0 px-2" data-active={active} disabled={disabled} onClick={onClick}>
        {label}
      </Button>
      {showAmount && <TeacherRecitationDetails amount={amount} amountControl={amountControl} />}
    </div>
  );
}
