import { getRecitationStatusLabel } from '@/lib/recitationEvaluation';
import React from 'react';
import QuranMarkedText from '@/components/portal/QuranMarkedText';
import { RECITATION_MARK_LABELS } from '../../../shared/recitation-mark-types.js';

export default function StudentPlanFeedback({ tasks }) {
  return <span className="student-plan-feedback">
    {tasks.map((task) => {
      const ratingLabel = task.teacherRatingLabel === 'يحتاج إعادة' || task.teacherRatingKey === 'repeat_required'
        ? getRecitationStatusLabel(task) : task.teacherRatingLabel;
      const marks = Array.isArray(task.ayahMarks) ? task.ayahMarks : [];
      const mistakes = Number(task.mistakeCount) || 0;
      const warnings = Number(task.warningCount) || 0;
      const hesitations = Number(task.hesitationCount) || 0;
      if (!mistakes && !warnings && !hesitations && !marks.length && !ratingLabel) return null;
      return <span key={task.id} className="student-plan-feedback-task">
        {ratingLabel && <span className="student-plan-feedback-rating">{ratingLabel}</span>}
        {!marks.length && <span className="student-plan-feedback-counts">
          {mistakes > 0 && <span data-tone="mistake">{mistakes} أخطاء</span>}
          {warnings > 0 && <span data-tone="warning">{warnings} تنبيهات</span>}
          {hesitations > 0 && <span data-tone="hesitation">{hesitations} ترددات</span>}
        </span>}
        {marks.map((mark, index) => <span key={mark.id || index} className="student-plan-feedback-mark" data-tone={['warning', 'hesitation'].includes(mark.markType) ? mark.markType : 'mistake'}>
          <span className="font-bold">{RECITATION_MARK_LABELS[mark.markType] || 'خطأ'}: </span>
          <QuranMarkedText mark={mark} />
          {mark.notes && <span> ({mark.notes})</span>}
        </span>)}
      </span>;
    })}
  </span>;
}
