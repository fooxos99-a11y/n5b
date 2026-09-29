import React from 'react';
import RecitationAmountVisibility from '@/components/portal/RecitationAmountVisibility';

export default function TeacherRecitationDetails({ amount, amountControl }) {
  return (
    <div className="recitation-amount" dir="rtl">
      {amountControl || <RecitationAmountVisibility amount={amount} maxLines={2} className="recitation-amount-text" />}
    </div>
  );
}
