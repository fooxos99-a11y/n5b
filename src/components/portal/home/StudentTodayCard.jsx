import React from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudentHomeProgress from './StudentHomeProgress';
import StudentHomeStatus from './StudentHomeStatus';
import StudentReadAmounts from './StudentReadAmounts';

/** Today's amounts to read; the teacher executes and evaluates them, the student only reads. */
export default function StudentTodayCard({ model, loading, error, onRetry, onRead }) {
  return <section className="student-home-today" aria-labelledby="student-home-today-title" aria-busy={loading}>
    <div className="student-home-section-head"><h1 id="student-home-today-title"><BookOpen />خطة اليوم</h1><strong>{loading ? '—' : model.percent}<small>%</small></strong></div>
    <StudentHomeProgress value={model.percent} label="إنجاز خطة اليوم" />
    {error && <StudentHomeStatus message="تعذر تحديث خطة اليوم." onRetry={onRetry} />}
    {loading ? <div className="student-home-skeleton" aria-label="تحميل خطة اليوم" /> : <>
      <StudentReadAmounts groups={model.groups} onRead={onRead} />
      {!model.groups.length && !error && <p className="student-home-empty">{model.planPaused ? 'الخطة متوقفة — لا يوجد إنجاز مطلوب اليوم.' : model.seasonalHoliday ? 'إجازة موسمية — لا يوجد إنجاز مطلوب اليوم.' : 'لا توجد مقادير لهذا اليوم.'}</p>}
    </>}
    <Button className="student-home-primary" onClick={() => onRead(model.groups.find((group) => group.type === 'memorization')?.target || model.groups[0]?.target || null)}><BookOpen size={19} />فتح المصحف<ArrowLeft className="student-home-arrow" size={18} /></Button>
  </section>;
}
