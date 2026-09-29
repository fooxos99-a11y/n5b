import React from 'react';
import { evaluateRecitationGroup } from '@/lib/recitationGroupGrade';

export { evaluateRecitationGroup };

const formatScore = (value) => Number(value || 0).toFixed(2);

export const RecitationItemResult = ({ outcome }) => {
  if (!outcome) return null;
  return (
    <p className={`text-sm font-black tabular-nums ${outcome.failed ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
      النتيجة الحالية: {formatScore(outcome.score)}
    </p>
  );
};
