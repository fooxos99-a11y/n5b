import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PassingResultSummary } from './PassingAttemptReport';
import CountOnlyEvaluationDialog from '@/components/portal/CountOnlyEvaluationDialog';
import MushafRecitationDialog from '@/components/portal/MushafRecitationDialog';
import NarrationMethodDialog from '../NarrationMethodDialog';
import { passingApi } from '@/services/passingApi';
import { secureRandomId } from '../../../../shared/secure-random.js';

export default function PassingPartEvaluation({ part, onClose, onSaved }) {
  const pending = part.latestAttempt?.rehifzDecision === 'pending' ? part.latestAttempt : null;
  const [mode, setMode] = useState(pending ? 'decision' : '');
  const [savedAttempt, setSavedAttempt] = useState(pending);
  const savedRef = useRef(pending);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => secureRandomId('passing'));
  const loadTask = useCallback(task => passingApi.mushaf(part.id, task.segmentIndex), [part.id]);
  const save = async payload => {
    const result = await passingApi.saveAttempt(part.id, { ...payload, requestId, previousAttemptId: Number(part.latestAttempt?.id || 0) });
    const attempt = { id: result.result.attemptId, result: result.result };
    savedRef.current = attempt;
    setSavedAttempt(attempt);
    return result;
  };
  const decide = async repeat => {
    setSaving(true); setError('');
    try {
      await passingApi.decideRehifz(part.id, { attemptId: Number(savedAttempt.id), repeat });
      await onSaved();
      onClose();
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  };
  return <>
    <NarrationMethodDialog open={!mode} onOpenChange={open => !open && onClose()} onSelect={setMode} />
    <CountOnlyEvaluationDialog open={mode === 'count'} onOpenChange={open => !open && !saving && onClose()}
      title={`اجتياز الجزء ${part.juzNumber}`} isSaving={saving} submitLabel="حفظ النتيجة"
      onSubmit={async counts => {
        setSaving(true); setError('');
        try { await save({ ...counts, mode: 'count' }); setMode('decision'); }
        catch (cause) { setError(cause.message); } finally { setSaving(false); }
      }}>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</CountOnlyEvaluationDialog>
    <MushafRecitationDialog open={mode === 'mushaf'} onOpenChange={open => {
      if (!open) { if (savedRef.current) setMode('decision'); else onClose(); }
    }} loadTaskData={loadTask}
      tasks={part.ranges.map((range, index) => ({ id: index + 1, segmentIndex: index, fromPage: range.startPage, toPage: range.endPage,
        fromSurah: range.startSurah, fromAyah: range.startAyah, toSurah: range.endSurah, toAyah: range.endAyah, fromSurahName: range.startSurahName }))}
      saveSessionResults={async items => {
        const saved = await save({ mode: 'mushaf', segments: items.map(({ task, payload }) => ({ index: task.segmentIndex, wordMarks: payload.wordMarks })) });
        return { results: [{ ...saved, teacherCompleted: saved.result.passed }] };
      }} completionMessage={`حُفظت نتيجة الجزء ${part.juzNumber}.`} />
    <Dialog open={mode === 'decision'}>
      <DialogContent dir="rtl" className="max-w-lg bg-card [font-family:var(--font-ui)]"
        onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <DialogHeader><DialogTitle>إعادة الحفظ ضمن الخطة</DialogTitle></DialogHeader>
        <PassingResultSummary result={savedAttempt?.result} />
        <p className="text-sm leading-7">هل تريد إعادة حفظ الجزء {part.juzNumber} كاملًا ضمن خطة الطالب؟</p>
        <p className="text-xs leading-6 text-muted-foreground">يُوزّع الجزء على المقدار اليومي، ثم تتابع الخطة من موضعها السابق. إذا كانت الخطة موقوفة، تبدأ إعادة الحفظ بعد استئنافها.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button autoFocus variant="outline" className="min-h-11" disabled={saving} onClick={() => decide(false)}>إبقاء الخطة</Button>
          <Button className="min-h-11" loading={saving} onClick={() => decide(true)}>إعادة حفظ الجزء كاملًا</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
