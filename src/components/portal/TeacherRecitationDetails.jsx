import React from 'react';
import RecitationAmountVisibility from '@/components/portal/RecitationAmountVisibility';
import { splitFacePortionAmount } from '../../../shared/quran-face-portion.js';
import { compactQuranAmount } from '../../../shared/quran-display-text.js';

export default function TeacherRecitationDetails({ amount, amountControl }) {
  const portion = splitFacePortionAmount(amount);
  const displayedAmount = portion.label ? compactQuranAmount(portion.amount).replace(/^من\s+/, '') : portion.amount;
  return (
    <div className="recitation-amount" dir="rtl" data-face-portion={portion.label ? true : undefined}>
      {portion.label && <span className="recitation-portion-label">{portion.label}</span>}
      {amountControl || <RecitationAmountVisibility amount={displayedAmount} maxLines={2} className="recitation-amount-text" />}
    </div>
  );
}
