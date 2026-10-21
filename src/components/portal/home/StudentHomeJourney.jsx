import React from 'react';
import { ArrowLeft, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StudentHomeStatus from './StudentHomeStatus';
import './student-home-journey.css';
export default function StudentHomeJourney({ journey, onOpen, error, onRetry }) {
  return <section className="student-home-journey">
    <svg className="student-home-route" viewBox="0 0 600 280" fill="none" aria-hidden="true"><path d="M570 270C400 250 215 225 213 150S330 50 130-20" stroke="currentColor" strokeWidth="3" opacity=".22" strokeDasharray="6 10" /><path d="M570 270C400 250 215 225 213 150S240 99 260 77" stroke="currentColor" strokeWidth="4" />{[[460, 249], [293, 204], [213, 148]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="8" fill="currentColor" />)}<circle cx="260" cy="77" r="29" fill="currentColor" opacity=".12" /><path d="m260 61 13 16-13 16-13-16Z" fill="currentColor" /></svg>
    <div className="student-home-journey-content"><h2>الخريطة</h2><div className="student-home-journey-score"><strong>{journey ? `${Math.round(journey.points).toLocaleString('ar-SA-u-nu-latn')} كم` : '—'}</strong></div>
      {journey?.nextStage?.name && <p className="student-home-next"><Flag size={15} />المحطة التالية <strong>{journey.nextStage.name}</strong></p>}
      {error ? <StudentHomeStatus message="تعذر تحديث الخريطة." onRetry={onRetry} /> : <Button className="student-home-primary student-home-feature-action" onClick={onOpen}>اكتشف الخريطة<ArrowLeft size={18} aria-hidden="true" /></Button>}
    </div>
  </section>;
}
