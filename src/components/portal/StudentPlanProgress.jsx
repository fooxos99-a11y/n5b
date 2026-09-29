import React from 'react';
import { Sparkles } from 'lucide-react';
import { planProgressPercent } from '@/lib/studentPlan';
import ProgressValue from '@/components/ui/progress-value';

export default function StudentPlanProgress({ plan }) {
  const progress = planProgressPercent(plan);
  return (
    <section className="student-plan-progress" aria-labelledby="student-plan-progress-title" data-complete={progress === 100}>
      <div className="student-plan-progress-heading">
        <h2 id="student-plan-progress-title"><Sparkles aria-hidden="true" />تقدم الخطة</h2>
        <span className="student-plan-progress-percent">{new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 1 }).format(progress)}<span>٪</span></span>
      </div>
      <div className="student-plan-progress-track">
        <ProgressValue value={progress} label="تقدم الخطة" />
        <div className="student-plan-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
