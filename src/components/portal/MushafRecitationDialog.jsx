import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, List, RotateCcw } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import FullScreenPage from '@/components/ui/full-screen-page';
import MadaniMushafPage from '@/components/portal/MadaniMushafPage';
import MushafPageCarousel from '@/components/portal/MushafPageCarousel';
import MushafThemeSwitch from '@/components/portal/MushafThemeSwitch';
import MushafWordMarkDialog from '@/components/portal/MushafWordMarkDialog';
import StudentMushafIndexDialog from '@/components/portal/StudentMushafIndexDialog';
import PageBackButton from '@/components/ui/page-back-button';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useNativeSurfaceTheme from '@/hooks/useNativeSurfaceTheme';
import { preloadMushafFonts } from '@/lib/quranFonts';
import { pickRandomMushafEntry } from '@/lib/randomMushafExcerpt';
import { studentsApi } from '@/services/studentsApi';
import { getRecitationDraft, saveRecitationDraft } from '@/services/offlineRecitationService';
import { clampMushafPage, getOfflineMushafIndex, getOfflineMushafPage, MUSHAF_PAGE_COUNT } from '@/services/offlineMushaf';
import { formatQuranSelectionText } from '../../../shared/quranSelectionText.js';
import { secureRandomId } from '../../../shared/secure-random.js';

const temporaryId = () => secureRandomId('mark');
const MUSHAF_PAGES = Array.from({ length: MUSHAF_PAGE_COUNT }, (_, index) => index + 1);

const taskLoadKey = (tasks = []) => tasks.map((task) => [
  task?.id,
  task?.taskType,
  task?.track,
  task?.fromPage,
  task?.toPage,
  task?.fromSurah,
  task?.fromAyah,
  task?.toSurah,
  task?.toAyah,
  task?.updatedAt,
].map((value) => String(value ?? '')).join(':')).join('|');

const rangesOverlap = (words, first, second) => {
  const firstStart = words.findIndex((word) => word.location === first.startLocation);
  const firstEnd = words.findIndex((word) => word.location === first.endLocation);
  const secondStart = words.findIndex((word) => word.location === second.startLocation);
  const secondEnd = words.findIndex((word) => word.location === second.endLocation);
  if ([firstStart, firstEnd, secondStart, secondEnd].some((index) => index < 0)) return false;
  const firstFrom = Math.min(firstStart, firstEnd);
  const firstTo = Math.max(firstStart, firstEnd);
  const secondFrom = Math.min(secondStart, secondEnd);
  const secondTo = Math.max(secondStart, secondEnd);
  return Math.max(firstFrom, secondFrom) <= Math.min(firstTo, secondTo);
};

const MushafRecitationDialog = ({
  supervisorId,
  student,
  tasks = [],
  open,
  onOpenChange,
  onSaved,
  loadTaskData,
  saveTaskResult,
  saveSessionResults,
  completionMessage,
  randomMode = false,
  secondaryAction = null,
}) => {
  const { toast } = useToast();
  const [entries, setEntries] = useState([]);
  const [marksByTask, setMarksByTask] = useState({});
  const [selection, setSelection] = useState(null);
  const [pendingMark, setPendingMark] = useState(null);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [randomVisitedIndexes, setRandomVisitedIndexes] = useState([]);
  const [fontStatusByPage, setFontStatusByPage] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  // Free reading like the student's mushaf: any page and the index; marking stays inside the amount.
  const [viewPage, setViewPage] = useState(null);
  const [browsePage, setBrowsePage] = useState(null);
  const [mushafIndex, setMushafIndex] = useState(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const browsing = !randomMode;
  const [mushafTheme, setMushafTheme] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem('nukhab_mushaf_theme') === 'dark' ? 'dark' : 'light'
  ));
  const tasksRef = useRef(tasks);
  const loadTaskDataRef = useRef(loadTaskData);
  const toastRef = useRef(toast);
  tasksRef.current = tasks;
  loadTaskDataRef.current = loadTaskData;
  toastRef.current = toast;
  const currentTaskLoadKey = taskLoadKey(tasks);
  useNativeSurfaceTheme(mushafTheme, open);

  const changeMushafTheme = (theme) => {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    setMushafTheme(nextTheme);
    if (typeof window !== 'undefined') window.localStorage.setItem('nukhab_mushaf_theme', nextTheme);
  };

  useEffect(() => {
    if (!open || (!supervisorId && !loadTaskDataRef.current) || !currentTaskLoadKey) return;
    let active = true;
    const tasksForLoad = tasksRef.current;
    const taskDataLoader = loadTaskDataRef.current;
    setEntries([]);
    setSelection(null);
    setPendingMark(null);
    setActiveEntryIndex(0);
    setViewPage(null);
    setBrowsePage(null);
    setRandomVisitedIndexes([]);
    setFontStatusByPage({});
    setLoadError('');
    setDraftReady(false);
    setIsLoading(true);
    const loadMushaf = async () => {
      try {
        const [loaded, draft] = await Promise.all([
          Promise.all(tasksForLoad.map(async (task) => ({
            task,
            data: await (taskDataLoader
              ? taskDataLoader(task)
              : studentsApi.getSupervisorQuranTaskAyahs(supervisorId, task.id)),
          }))),
          supervisorId && student?.studentId
            ? getRecitationDraft(supervisorId, student.studentId)
            : Promise.resolve(null),
        ]);
        if (!active) return;
        const nextEntries = loaded.flatMap(({ task, data }) => (data.pages || []).map((page) => ({ task, data, page })));
        const initialRandom = randomMode
          ? pickRandomMushafEntry(nextEntries.length)
          : { index: 0, visitedIndexes: [] };
        const pageNumbers = [...new Set(nextEntries.map((entry) => Number(entry.page.page)).filter(Number.isFinite))];
        const initialPage = Number(nextEntries[Math.max(0, initialRandom.index)]?.page?.page || pageNumbers[0] || 0);
        const initialFontReady = initialPage ? await preloadMushafFonts([initialPage]) : true;
        if (!active) return;
        setFontStatusByPage(initialPage ? { [initialPage]: initialFontReady } : {});
        setEntries(nextEntries);
        setActiveEntryIndex(Math.max(0, initialRandom.index));
        setViewPage(initialPage || null);
        setRandomVisitedIndexes(initialRandom.visitedIndexes);
        const serverMarks = Object.fromEntries(loaded.map(({ task, data }) => [String(task.id), data.wordMarks || []]));
        setMarksByTask(draft?.mode === 'mushaf' ? draft.marksByTask : serverMarks);
        setDraftReady(true);
        setIsLoading(false);
        void Promise.all(pageNumbers.filter((pageNumber) => pageNumber !== initialPage).map(async (pageNumber) => ([
          pageNumber,
          await preloadMushafFonts([pageNumber]),
        ]))).then((statuses) => {
          if (active && statuses.length) {
            setFontStatusByPage((current) => ({ ...current, ...Object.fromEntries(statuses) }));
          }
        });
      } catch (error) {
        if (active) {
          setLoadError(error.message || 'تعذر تحميل صفحات المصحف.');
          toastRef.current({ title: 'تعذر تحميل المصحف', description: error.message, variant: 'destructive' });
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadMushaf();
    return () => { active = false; };
  }, [currentTaskLoadKey, loadVersion, open, randomMode, student?.studentId, supervisorId]);

  useEffect(() => {
    if (!open || !draftReady || !supervisorId || !student?.studentId) return undefined;
    const timer = window.setTimeout(() => {
      void saveRecitationDraft(supervisorId, student.studentId, { mode: 'mushaf', marksByTask });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftReady, marksByTask, open, student?.studentId, supervisorId]);

  const finishSelection = () => {
    if (!selection) return;
    const entry = entries.find((item) => (
      Number(item.task.id) === Number(selection.taskId)
      && Number(item.page.page) === Number(selection.page)
    ));
    if (!entry) return;
    const words = entry.page.words || [];
    const fromIndex = Math.min(selection.startIndex, selection.endIndex);
    const toIndex = Math.max(selection.startIndex, selection.endIndex);
    const selectedWords = words.slice(fromIndex, toIndex + 1).filter((word) => word.charType === 'word');
    if (!selectedWords.length) {
      setSelection(null);
      return;
    }
    setPendingMark({
      taskId: entry.task.id,
      page: entry.page.page,
      startLocation: selectedWords[0].location,
      endLocation: selectedWords[selectedWords.length - 1].location,
      selectedText: formatQuranSelectionText(selectedWords),
    });
  };

  const addMark = (markType, notes) => {
    if (!pendingMark) return;
    const next = { ...pendingMark, id: temporaryId(), markType, notes: String(notes || '').trim() };
    const entry = entries.find((item) => (
      Number(item.task.id) === Number(pendingMark.taskId)
      && Number(item.page.page) === Number(pendingMark.page)
    ));
    setMarksByTask((current) => ({
      ...current,
      [String(pendingMark.taskId)]: [
        ...(current[String(pendingMark.taskId)] || []).filter((mark) => (
          Number(mark.page) !== Number(pendingMark.page)
          || !entry
          || !rangesOverlap(entry.page.words || [], mark, pendingMark)
        )),
        next,
      ],
    }));
    setPendingMark(null);
    setSelection(null);
  };

  const clearPendingMarks = () => {
    if (!pendingMark) return;
    const entry = entries.find((item) => (
      Number(item.task.id) === Number(pendingMark.taskId)
      && Number(item.page.page) === Number(pendingMark.page)
    ));
    if (!entry) return;
    setMarksByTask((current) => ({
      ...current,
      [String(pendingMark.taskId)]: (current[String(pendingMark.taskId)] || []).filter((mark) => (
        Number(mark.page) !== Number(pendingMark.page)
        || !rangesOverlap(entry.page.words || [], mark, pendingMark)
      )),
    }));
    setPendingMark(null);
    setSelection(null);
    toast({ title: 'تم مسح العلامة من التحديد' });
  };

  const finishRecitation = async () => {
    setIsSaving(true);
    try {
      const saveRequestId = temporaryId();
      const saveOrder = [...tasks].sort((first, second) => (
        Number(second.fromPage || 0) - Number(first.fromPage || 0)
        || Number(second.fromSurah || 0) - Number(first.fromSurah || 0)
        || Number(second.fromAyah || 0) - Number(first.fromAyah || 0)
      ));
      const items = saveOrder.map((task) => {
        const payload = {
          requestId: `${saveRequestId}:${task.id}`,
          evaluationMode: 'mushaf',
          wordMarks: (marksByTask[String(task.id)] || []).map(({ page, startLocation, endLocation, selectedText, markType, notes }) => ({
          page,
          startLocation,
          endLocation,
          selectedText,
          markType,
          notes,
          })),
          samplePages: randomMode ? [...new Set(randomVisitedIndexes
            .map((index) => entries[index])
            .filter((entry) => String(entry?.task?.id) === String(task.id))
            .map((entry) => Number(entry.page.page)))] : [],
        };
        return { task, payload };
      });
      let results;
      let pending = false;
      if (saveSessionResults) {
        const saved = await saveSessionResults(items);
        results = saved.results || [];
        pending = Boolean(saved.pending);
      } else {
        results = [];
        for (const { task, payload } of items) {
          results.push(await (saveTaskResult
            ? saveTaskResult(task, payload)
            : studentsApi.rateSupervisorQuranTask(supervisorId, task.id, payload)));
        }
      }
      const repeatCount = results.filter((result) => !result.teacherCompleted).length;
      if (!pending) toast({
        title: repeatCount ? 'اكتمل التسميع مع إعادة' : 'اكتمل التسميع',
        description: completionMessage || (repeatCount ? `${repeatCount} وجه يحتاج إلى إعادة فعلية.` : 'اجتاز الطالب جميع الأوجه.'),
        variant: repeatCount ? 'destructive' : 'default',
      });
      onSaved?.(results);
      onOpenChange?.(false);
    } catch (error) {
      toast({ title: 'تعذر إنهاء التسميع', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const entryIndexesForPage = (pageNumber) => entries
    .map((entry, entryIndex) => (Number(entry.page.page) === Number(pageNumber) ? entryIndex : -1))
    .filter((entryIndex) => entryIndex >= 0);
  const goToPage = (pageNumber) => {
    const nextPage = clampMushafPage(pageNumber);
    setSelection(null);
    setPendingMark(null);
    setViewPage(nextPage);
    const onPage = entryIndexesForPage(nextPage);
    if (onPage.length) {
      const sameTask = onPage.find((entryIndex) => String(entries[entryIndex].task.id) === String(entries[activeEntryIndex]?.task?.id));
      setActiveEntryIndex(sameTask ?? onPage[0]);
    }
  };
  const viewingAmount = !browsing || entryIndexesForPage(viewPage).length > 0;

  useEffect(() => {
    if (!open || !browsing || mushafIndex) return undefined;
    let active = true;
    void getOfflineMushafIndex().then((loaded) => { if (active) setMushafIndex(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [browsing, mushafIndex, open]);

  useEffect(() => {
    if (!open || !browsing || !viewPage || viewingAmount || Number(browsePage?.number) === Number(viewPage)) return undefined;
    let active = true;
    setBrowsePage(null);
    void Promise.all([getOfflineMushafPage(viewPage), preloadMushafFonts([viewPage])])
      .then(([data, fontReady]) => { if (active) setBrowsePage({ number: viewPage, data, fontReady }); })
      .catch((error) => {
        if (active) toastRef.current({ title: 'تعذر فتح الصفحة', description: error.message, variant: 'destructive' });
      });
    return () => { active = false; };
  }, [browsePage?.number, browsing, open, viewPage, viewingAmount]);

  const activeEntry = entries[activeEntryIndex] || null;
  const openNextRandom = () => {
    const next = pickRandomMushafEntry(entries.length, randomVisitedIndexes, activeEntryIndex);
    if (next.index < 0) return;
    setSelection(null);
    setPendingMark(null);
    setRandomVisitedIndexes(next.visitedIndexes);
    setActiveEntryIndex(next.index);
  };
  const activePageNumber = Number(activeEntry?.page?.page || 0);
  const activeFontResolved = activePageNumber > 0
    && Object.hasOwn(fontStatusByPage, activePageNumber);
  const activeFontReady = fontStatusByPage[activePageNumber] === true;

  useEffect(() => {
    if (!open || !activePageNumber || activeFontResolved) return undefined;
    let active = true;
    void preloadMushafFonts([activePageNumber]).then((loaded) => {
      if (active) setFontStatusByPage((current) => ({ ...current, [activePageNumber]: loaded }));
    });
    return () => { active = false; };
  }, [activeFontResolved, activePageNumber, open]);

  const activePageMarks = activeEntry
    ? (marksByTask[String(activeEntry.task.id)] || []).filter((mark) => Number(mark.page) === Number(activeEntry.page.page))
    : [];
  const activeSurahName = activeEntry?.task.fromSurahName
    || activeEntry?.page.decorations?.find((decoration) => decoration.type === 'surah')?.name
    || `سورة ${activeEntry?.data.allowedRange?.fromSurah || ''}`;
  const pendingEntry = pendingMark ? entries.find((item) => (
    Number(item.task.id) === Number(pendingMark.taskId)
    && Number(item.page.page) === Number(pendingMark.page)
  )) : null;
  const pendingHasMarks = Boolean(pendingMark && pendingEntry && (
    marksByTask[String(pendingMark.taskId)] || []
  ).some((mark) => (
    Number(mark.page) === Number(pendingMark.page)
    && rangesOverlap(pendingEntry.page.words || [], mark, pendingMark)
  )));

  const _resolveMushafRecitationDialog = () => {
    if (isLoading) {
      return <output className="flex h-full items-center justify-center text-primary"  aria-label="جاري التحميل"><LoadingSpinner size="lg" /></output>;
    }
    if (loadError) {
      return <div className="flex h-full flex-col items-center justify-center gap-4 px-5 pb-[env(safe-area-inset-bottom)] text-center" role="alert">
                  <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${mushafTheme === 'light' ? 'bg-red-100 text-red-700' : 'bg-red-500/15 text-red-300'}`}>
                    <AlertTriangle className="h-7 w-7" />
                  </span>
                  <p className={`max-w-sm text-sm font-bold leading-7 ${mushafTheme === 'light' ? 'text-slate-700' : 'text-slate-200'}`}>{loadError}</p>
                  <Button type="button" onClick={() => setLoadVersion((value) => value + 1)} className="h-12 min-w-40 rounded-xl">
                    <RotateCcw className="h-4 w-4" />إعادة المحاولة
                  </Button>
                </div>;
    }
    if (browsing && entries.length && !viewingAmount) {
      if (!browsePage) return <output className="flex h-full items-center justify-center text-primary" aria-label="جاري التحميل"><LoadingSpinner size="lg" /></output>;
      return <MushafPageCarousel
                  index={viewPage - 1}
                  total={MUSHAF_PAGE_COUNT}
                  pageNumber={viewPage}
                  pageNumbers={MUSHAF_PAGES}
                  theme={mushafTheme}
                  isSaving={isSaving}
                  onFinish={finishRecitation}
                  onIndexChange={(nextIndex) => goToPage(nextIndex + 1)}
                >
                  <MadaniMushafPage
                    key={`browse-${browsePage.number}`}
                    page={browsePage.data}
                    theme={mushafTheme}
                    fontReady={browsePage.fontReady}
                  />
                </MushafPageCarousel>;
    }
    if (activeEntry && activeFontResolved) {
      return <MushafPageCarousel
                  index={browsing ? activeEntry.page.page - 1 : activeEntryIndex}
                  total={browsing ? MUSHAF_PAGE_COUNT : entries.length}
                  pageNumber={activeEntry.page.page}
                  pageNumbers={browsing ? MUSHAF_PAGES : entries.map((entry) => entry.page.page)}
                  theme={mushafTheme}
                  isSaving={isSaving}
                  onFinish={finishRecitation}
                  onNextRandom={randomMode ? openNextRandom : undefined}
                  onIndexChange={browsing ? (nextIndex) => goToPage(nextIndex + 1) : setActiveEntryIndex}
                  onInteractionCancel={() => setSelection(null)}
                >
                  <MadaniMushafPage
                    key={`${activeEntry.task.id}-${activeEntry.page.page}`}
                    page={activeEntry.page}
                    surahName={activeSurahName}
                    theme={mushafTheme}
                    fontReady={activeFontReady}
                    marks={randomMode ? [] : activePageMarks}
                    allowedRange={activeEntry.data.allowedRange}
                    markingMode
                    selection={selection?.taskId === activeEntry.task.id && selection?.page === activeEntry.page.page ? selection : null}
                    onSelectionStart={(index) => setSelection({ taskId: activeEntry.task.id, page: activeEntry.page.page, startIndex: index, endIndex: index })}
                    onSelectionMove={(index) => setSelection((current) => current?.taskId === activeEntry.task.id && current?.page === activeEntry.page.page ? { ...current, endIndex: index } : current)}
                    onSelectionEnd={finishSelection}
                  />
                </MushafPageCarousel>;
    }
    return <div className="flex h-full items-center justify-center px-4 pb-[env(safe-area-inset-bottom)] text-center font-bold text-muted-foreground">لا توجد صفحات للتسميع.</div>;
  };
  return (
    <>
      <FullScreenPage open={open} onClose={() => onOpenChange?.(false)} label="جلسة التسميع" className={mushafTheme === 'light' ? 'bg-slate-100' : 'bg-[#111827]'}>
          <div className={`flex min-h-0 flex-1 flex-col ${mushafTheme === 'light' ? 'bg-slate-100' : 'bg-[#111827]'}`}>
            <div className="flex shrink-0 items-center justify-between px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-3">
              <div className="flex items-center gap-2">
                <PageBackButton onClick={() => onOpenChange?.(false)} label="العودة" iconOnly />
                {browsing && mushafIndex && entries.length > 0 && (
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setIndexOpen(true)} aria-label="فتح فهرس المصحف">
                    <List className="h-5 w-5" />
                  </Button>
                )}
                {browsing && entries.length > 0 && !viewingAmount && (
                  <Button type="button" variant="outline" className="min-h-11 px-3" onClick={() => goToPage(entries[activeEntryIndex]?.page?.page || entries[0].page.page)}>المقدار</Button>
                )}
              </div>
              {secondaryAction}
              <MushafThemeSwitch theme={mushafTheme} onChange={changeMushafTheme} />
            </div>
            <div className="min-h-0 flex-1 sm:px-2 sm:pb-2">
              {_resolveMushafRecitationDialog()}
            </div>
          </div>
      </FullScreenPage>

      {browsing && mushafIndex && (
        <StudentMushafIndexDialog
          theme={mushafTheme}
          open={indexOpen}
          onOpenChange={setIndexOpen}
          index={mushafIndex}
          currentPage={viewPage || 1}
          onSelectPage={goToPage}
        />
      )}

      <MushafWordMarkDialog
        key={pendingMark?.id || pendingMark?.startLocation || 'empty'}
        open={Boolean(pendingMark)}
        selectedText={pendingMark?.selectedText}
        canClear={pendingHasMarks}
        onCancel={() => { setPendingMark(null); setSelection(null); }}
        onClear={clearPendingMarks}
        onSave={addMark}
      />
    </>
  );
};

export default MushafRecitationDialog;
