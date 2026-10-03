import React, { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, Play } from 'lucide-react';
import CountOnlyEvaluationDialog from '@/components/portal/CountOnlyEvaluationDialog';
import MushafRecitationDialog from '@/components/portal/MushafRecitationDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { studentsApi } from '@/services/studentsApi';
import NarrationErrorsDialog from './NarrationErrorsDialog';
import NarrationJuzParts from './NarrationJuzParts';
import NarrationMethodDialog from './NarrationMethodDialog';
import { groupNarrationParts, narrationOverallScore } from '@/lib/narrationParts';

const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);

const NarrationStudentPanel = ({ eventId, student, archived, onSaveJuz, onStart, maxScore = 100 }) => {
  const juzGroups = useMemo(() => groupNarrationParts(student.parts), [student.parts]);
  const [open, setOpen] = useState(false);
  const [countJuz, setCountJuz] = useState(null);
  const [mushafJuz, setMushafJuz] = useState(null);
  const [methodJuz, setMethodJuz] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorsGroup, setErrorsGroup] = useState(null);
  const overallScore = narrationOverallScore(juzGroups);
  const evaluatorNames = useMemo(
    () => [...new Set([...(student.reciterNames || []), ...juzGroups.flatMap((group) => group.evaluatorNames)])],
    [juzGroups, student.reciterNames]
  );

  const openEvaluation = () => {
    setOpen(true);
  };
  const loadMushafPart = useCallback(
    (part) => loadOfflineSnapshot(
      getAccountId(),
      `narration:ayahs:${eventId}:${part.id}`,
      () => studentsApi.getNarrationPartAyahs(eventId, part.id),
    ),
    [eventId]
  );
  const saveCountJuz = async ({ warningCount, hesitationCount, mistakeCount }) => {
    if (!countJuz) return;
    setIsSaving(true);
    try {
      await onSaveJuz(student.id, countJuz.juzNumber, { evaluationMode: 'count', warningCount, hesitationCount, mistakeCount });
      setCountJuz(null);
    } catch (error) {
      return error;
    } finally {
      setIsSaving(false);
    }
  };
  // All segments of the juz are recited in one session and saved as one graded unit.
  const saveMushafJuz = async (items) => {
    const result = await onSaveJuz(student.id, mushafJuz.juzNumber, {
      evaluationMode: 'mushaf',
      parts: items.map(({ task, payload }) => ({ partId: task.id, wordMarks: payload.wordMarks })),
    });
    return { results: [{ ...result, teacherCompleted: true }] };
  };

  const _resolveNarrationStudentPanel = () => {
    if (archived) {
      return 'عرض';
    }
    if (student.status === 'completed') {
      return 'تم الانتهاء';
    }
    return 'بدء';
  };
  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-foreground">{student.studentName}</h3>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {student.committeeName}
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="tabular-nums">{juzGroups.length} جزء</span>
          </p>
        </div>
        <Button
          type="button"
          onClick={openEvaluation}
          className={`min-h-11 min-w-28 shrink-0 gap-2 touch-manipulation ${student.status === 'completed' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}
        >
          {student.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {_resolveNarrationStudentPanel()}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-card p-4 sm:p-6 [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader className="border-b border-border pb-4 text-right">
            <DialogTitle className="text-xl font-black sm:text-2xl">{student.studentName}</DialogTitle>
            <p className="text-sm font-bold text-muted-foreground">{student.committeeName} · {student.totalFaces} وجه</p>
          </DialogHeader>

          <NarrationJuzParts groups={juzGroups} archived={archived} maxScore={maxScore} onRecite={(group) => { onStart(student.id); setMethodJuz(group); }} onShowErrors={setErrorsGroup} />

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="rounded-xl bg-primary/5 p-4">
              <div className="text-xs font-black text-muted-foreground">التقييم الإجمالي</div>
              <div className="mt-1 text-2xl font-black text-primary">
                {overallScore === null ? 'لم يكتمل' : `${overallScore.toFixed(1)} من ${maxScore}`}
              </div>
            </div>
            <div className="rounded-xl bg-muted/50 p-4">
              <div className="text-xs font-black text-muted-foreground">أسماء المسمعين</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {evaluatorNames.length ? evaluatorNames.map((name) => (
                  <span key={name} className="rounded-lg bg-card px-3 py-1.5 text-sm font-black text-foreground">{name}</span>
                )) : <span className="text-sm font-bold text-muted-foreground">لم يبدأ التقييم</span>}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NarrationErrorsDialog group={errorsGroup} onClose={() => setErrorsGroup(null)} loadPart={loadMushafPart} />
      <NarrationMethodDialog
        open={Boolean(methodJuz)}
        onOpenChange={(nextOpen) => !nextOpen && setMethodJuz(null)}
        onSelect={(mode) => {
          if (mode === 'mushaf') setMushafJuz(methodJuz);
          else setCountJuz(methodJuz);
          setMethodJuz(null);
        }}
      />
      <CountOnlyEvaluationDialog
        open={Boolean(countJuz)}
        onOpenChange={(nextOpen) => !nextOpen && setCountJuz(null)}
        title={`الجزء ${countJuz?.juzNumber || ''}`}
        initialWarningCount={countJuz?.warningCount}
        initialHesitationCount={countJuz?.hesitationCount}
        initialMistakeCount={countJuz?.mistakeCount}
        onSubmit={saveCountJuz}
        isSaving={isSaving}
        submitLabel="حفظ"
      />
      <MushafRecitationDialog
        tasks={mushafJuz ? mushafJuz.parts.map((part) => ({ ...part, fromSurahName: `الجزء ${mushafJuz.juzNumber}` })) : []}
        open={Boolean(mushafJuz)}
        onOpenChange={(nextOpen) => !nextOpen && setMushafJuz(null)}
        loadTaskData={loadMushafPart}
        saveSessionResults={saveMushafJuz}
        completionMessage={`حُفظ تقييم الجزء ${mushafJuz?.juzNumber || ''}.`}
        onSaved={() => setMushafJuz(null)}
      />
    </li>
  );
};

export default NarrationStudentPanel;
