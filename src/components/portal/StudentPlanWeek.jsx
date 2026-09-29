import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudentPlanDay from '@/components/portal/StudentPlanDay';
import { planWeekStart } from '@/lib/studentPlan';

export default function StudentPlanWeek({ week, today, onOpenAmount, readOnly = false, defaultExpanded = false }) {
  const current = week.start === planWeekStart(today);
  const upcoming = week.start > planWeekStart(today);
  const [expanded, setExpanded] = useState(null);
  const open = expanded ?? (current || upcoming || defaultExpanded);
  const dateText = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Riyadh' });
  const _resolveConditional = () => {
    if (current) {
      return 'هذا الأسبوع';
    }
    if (upcoming) {
      return 'الأسبوع القادم';
    }
    return 'الأسبوع';
  };
  return (
    <section className="student-plan-week" data-week={week.start} data-current={current}>
      <h2>
        <Button type="button" variant="ghost" className="student-plan-week-toggle" aria-expanded={open} aria-controls={`week-${week.start}`} onClick={() => setExpanded(!open)}>
          <span>{_resolveConditional()}<span className="student-plan-week-dates">{dateText.format(new Date(`${week.start}T12:00:00Z`))} — {dateText.format(new Date(`${week.end}T12:00:00Z`))}</span></span>
          <ChevronDown className={open ? 'rotate-180' : ''} aria-hidden="true" />
        </Button>
      </h2>
      <div id={`week-${week.start}`} hidden={!open} className="student-plan-days">
        {week.days.map((day) => <StudentPlanDay key={day.date} day={day} today={today} onOpenAmount={onOpenAmount} readOnly={readOnly} preview={day.preview} />)}
      </div>
    </section>
  );
}
