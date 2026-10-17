import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import CheckboxOption from '@/components/ui/checkbox-option';
import { Textarea } from '@/components/ui/textarea';
import { callTime } from '@/lib/callArchivePresentation';
import { callArchiveApi } from '@/services/callArchiveApi';

const categories = { possible_error: 'خطأ محتمل', teacher_correction: 'تصحيح المقرئ', unclear: 'صوت غير واضح', note: 'ملاحظة' };
const confidence = { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة' };
export default function CallArchiveReport({ sessionId, report, canReview, onSeek, onSaved }) {
  const [notes, setNotes] = useState(''), [approved, setApproved] = useState([]), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    setNotes(report.review?.notes || '');
    setApproved((report.review?.approvedErrors || []).map(item => String(item.id)));
  }, [sessionId, report.review]);
  const observations = report.observations || [];
  const save = async () => {
    setSaving(true); setError('');
    try {
      await callArchiveApi.review(sessionId, { notes, approvedErrors: approved.map(id => ({ id, note: '' })) });
      await onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };
  return <div className="space-y-5">
    <div><h3 className="font-bold">ملخص الجلسة</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{report.summary || 'لا يتوفر ملخص لهذه الجلسة.'}</p></div>
    {report.passage && <p className="text-sm"><strong>المقطع المقروء: </strong>{report.passage}</p>}
    <p className="rounded-xl bg-muted p-3 text-sm leading-6">هذا تقرير آلي يحتاج مراجعة المقرئ. الأخطاء المحتملة لا تُضاف إلى درجة الطالب.</p>
    <p className="text-sm">مواضع الأخطاء المحتملة: {observations.filter(item => item.category === 'possible_error').length} · الأخطاء المعتمدة: {report.review?.approvedErrors?.length || 0}</p>
    <ol aria-label="ملاحظات المكالمة" className="space-y-3">
      {observations.map(item => <li key={item.id} className="min-w-0 space-y-2 rounded-xl border border-border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><strong>{categories[item.category] || 'ملاحظة'}</strong><Button variant="ghost" size="sm" disabled={!onSeek} onClick={() => onSeek?.(item.atSeconds)} aria-label={`استمع إلى الملاحظة عند ${callTime(item.atSeconds)}`}><span dir="ltr">{callTime(item.atSeconds)}</span></Button></div>
        <p className="whitespace-pre-wrap leading-6">{item.detail}</p>
        {item.correction && <p className="leading-6"><strong>التصحيح: </strong>{item.correction}</p>}
        {item.response && <p className="leading-6"><strong>استجابة الطالب: </strong>{item.response}</p>}
        <p className="text-xs text-muted-foreground">ثقة التحليل: {confidence[item.confidence] || 'غير محددة'}</p>
        {canReview && item.category === 'possible_error' && <CheckboxOption label={`اعتماد الملاحظة ${callTime(item.atSeconds)}`} checked={approved.includes(String(item.id))}
          onCheckedChange={checked => setApproved(current => checked ? [...new Set([...current, String(item.id)])] : current.filter(id => id !== String(item.id)))} className="flex items-center gap-2 border border-border p-3">
          <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${approved.includes(String(item.id)) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{approved.includes(String(item.id)) ? '✓' : ''}</span><span>اعتماد الخطأ بعد الاستماع</span>
        </CheckboxOption>}
      </li>)}
    </ol>
    {Boolean(report.followUp?.length) && <div><h3 className="font-bold">المتابعة المقترحة</h3><ul className="mt-2 list-inside list-disc space-y-2 text-sm">{report.followUp.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
    {Boolean(report.limitations?.length) && <div><h3 className="font-bold">حدود التحليل</h3><ul className="mt-2 list-inside list-disc space-y-2 text-sm text-muted-foreground">{report.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
    {report.review?.reviewedAt && <p className="text-sm text-muted-foreground">راجع التقرير: {typeof report.review.reviewedBy === 'string' ? report.review.reviewedBy : report.review.reviewedBy?.name || 'المقرئ'}</p>}
    {canReview ? <div className="space-y-3"><label htmlFor="call-review-notes" className="block text-sm font-bold">ملاحظات المقرئ</label><Textarea id="call-review-notes" value={notes} maxLength={6000} onChange={event => setNotes(event.target.value)} /><Button loading={saving} onClick={save}>حفظ المراجعة</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
      : report.review?.notes && <p className="whitespace-pre-wrap text-sm leading-7"><strong>ملاحظات المقرئ: </strong>{report.review.notes}</p>}
  </div>;
}
