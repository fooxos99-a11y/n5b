import QueuedPlanRanges from './QueuedPlanRanges';
import StudentPlansPauseControl from './StudentPlansPauseControl';
import ErrorState from '@/components/ui/error-state';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';
import PlanScheduleSummary from '@/components/portal/PlanScheduleSummary';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, FormGrid, ManagementEmpty, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import AyahSearchSelect from '@/components/quran/AyahSearchSelect';
import SurahSearchSelect from '@/components/quran/SurahSearchSelect';
import { expectedPlanCompletion } from '@/lib/quranPlanPreview';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate } from '../../../shared/business-date.js';
import { DEFAULT_PLAN_READING_HIZBS, MAX_PLAN_READING_HIZBS, PLAN_SAVE_MODES } from '../../../shared/quran-plan-options.js';

const getAccountId = () => Number(localStorage.getItem('wajeh_supervisor_id') || 0);

const emptyForm = {
  track: 'memorization',
  startDate: '',
  startSurah: '',
  startAyah: '',
  startPage: '',
  endSurah: '',
  endAyah: '',
  endPage: '',
  dailyPreset: '1',
  dailyPages: 1,
  linkPreset: '10',
  linkPages: 10,
  reviewPreset: '20',
  reviewPages: 20,
  reviewHizbPreset: '1',
  reviewHizbs: 1,
  readingPreset: String(DEFAULT_PLAN_READING_HIZBS),
  readingHizbs: DEFAULT_PLAN_READING_HIZBS,
  reviewSplitWeekly: false,
  reviewWeekStartDay: '0',
  reviewWeekEndDay: '6',
  reviewMinDailyPages: 1,
  priorMemorization: [],
  queuedRanges: [],
};


const numberText = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

const today = getBusinessDate;

const dailyPageOptions = [['1', 'وجه'], ['2', 'وجهان'], ['custom', 'مخصص']];
const reviewHizbOptions = [['1', 'حزب'], ['2', 'حزبان'], ['3', 'ثلاثة أحزاب'], ['4', 'أربعة أحزاب'], ['custom', 'مخصص']];
const REVIEW_HIZB_PRESETS = reviewHizbOptions.map(([value]) => value).filter((value) => value !== 'custom');
const readingHizbsOptions = reviewHizbOptions;
const MAX_REVIEW_HIZBS = 60;
const planSaveModeOptions = [
  [PLAN_SAVE_MODES.continue, 'متابعة الخطة الحالية', 'يستمر الطالب على خطته ويتغير المقدار أو النطاق فقط.'],
  [PLAN_SAVE_MODES.new, 'حفظ الحالية وبدء خطة جديدة', 'تُحفظ الخطة الحالية وتبدأ خطة جديدة بهذه البيانات.'],
];

const getPagesValue = (preset, custom, min = 1) => {
  if (preset === 'custom') return Math.max(min, Number(custom || min));
  return Number(preset || 1);
};

const getReviewHizbs = (preset, custom) => {
  if (preset === 'custom') {
    return Math.min(MAX_REVIEW_HIZBS, Math.max(1, Math.round(Number(custom || 1))));
  }
  return Number(preset || 1);
};

const getReadingHizbs = (preset, custom) => {
  if (preset === 'custom') return Math.min(MAX_PLAN_READING_HIZBS, Math.max(1, Math.round(Number(custom || 1))));
  return Number(preset) || DEFAULT_PLAN_READING_HIZBS;
};

const getPriorPageRanges = (items = []) => items
  .map((item) => {
    const startPage = Number(item.startPage || 0);
    const endPage = Number(item.endPage || 0);
    return { startPage: Math.min(startPage, endPage), endPage: Math.max(startPage, endPage) };
  })
  .filter((item) => item.startPage && item.endPage);

const pageInRanges = (page, ranges) => ranges.some((range) => Number(page) >= range.startPage && Number(page) <= range.endPage);

const rangesOverlap = (a, b) => a.startPage <= b.endPage && b.startPage <= a.endPage;

const rangeCoversRange = (target, ranges) => ranges.some((range) => range.startPage <= target.startPage && range.endPage >= target.endPage);

const countUnblockedPages = (startPage, endPage, blockedRanges) => {
  let count = 0;
  const firstPage = Math.min(Number(startPage), Number(endPage));
  const lastPage = Math.max(Number(startPage), Number(endPage));
  for (let page = firstPage; page <= lastPage; page += 1) {
    if (!pageInRanges(page, blockedRanges)) count += 1;
  }
  return count;
};

const countUnblockedQuranPlanPages = ({ startAyah, endAyah, startChapter, endChapter, chapters, blockedRanges }) => {
  if (!startAyah || !endAyah) return 0;
  if (Number(startChapter?.number) <= Number(endChapter?.number)) {
    return countUnblockedPages(startAyah.page, endAyah.page, blockedRanges);
  }
  const pages = new Set();
  chapters
    .filter((chapter) => Number(chapter.number) <= Number(startChapter.number) && Number(chapter.number) >= Number(endChapter.number))
    .forEach((chapter) => {
      const firstPage = Number(chapter.number) === Number(startChapter.number)
        ? Number(startAyah.page)
        : Number(chapter.startPage);
      const lastPage = Number(chapter.number) === Number(endChapter.number)
        ? Number(endAyah.page)
        : Number(chapter.endPage);
      for (let page = firstPage; page <= lastPage; page += 1) pages.add(page);
    });
  return [...pages].filter((page) => !pageInRanges(page, blockedRanges)).length;
};

const compareQuranRefs = (aSurah, aAyah, bSurah, bAyah) => {
  if (Number(aSurah) !== Number(bSurah)) return Number(aSurah) - Number(bSurah);
  return Number(aAyah) - Number(bAyah);
};

const normalizeQuranRefRange = (range) => {
  const first = { surah: Number(range?.startSurah || 0), ayah: Number(range?.startAyah || 0) };
  const last = { surah: Number(range?.endSurah || 0), ayah: Number(range?.endAyah || 0) };
  if (!first.surah || !first.ayah || !last.surah || !last.ayah) return null;
  return compareQuranRefs(first.surah, first.ayah, last.surah, last.ayah) <= 0
    ? { first, last }
    : { first: last, last: first };
};

const quranRefInRanges = (surah, ayah, ranges) => ranges.some((range) => {
  const normalized = normalizeQuranRefRange(range);
  if (!normalized) return false;
  return compareQuranRefs(surah, ayah, normalized.first.surah, normalized.first.ayah) >= 0
    && compareQuranRefs(surah, ayah, normalized.last.surah, normalized.last.ayah) <= 0;
});

const quranRangesOverlap = (firstRange, secondRange) => {
  const first = normalizeQuranRefRange(firstRange);
  const second = normalizeQuranRefRange(secondRange);
  if (!first || !second) return false;
  return compareQuranRefs(first.first.surah, first.first.ayah, second.last.surah, second.last.ayah) <= 0
    && compareQuranRefs(second.first.surah, second.first.ayah, first.last.surah, first.last.ayah) <= 0;
};

const StudentPlansSection = ({ hideCommitteeFilter = false }) => {
  const { toast } = useToast();
  const [committeeId, setCommitteeId] = useState('all');
  const [committees, setCommittees] = useState([]);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [weeklyHolidayDays, setWeeklyHolidayDays] = useState([5, 6]);
  const [loadError, setLoadError] = useState('');
  const visibleRows = rows.filter(row => !search.trim() || String(row.studentName).includes(search.trim()));
  const [chapters, setChapters] = useState([]);
  const [juzRanges, setJuzRanges] = useState([]);
  const [startAyahs, setStartAyahs] = useState([]);
  const [endAyahs, setEndAyahs] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [memorizedRow, setMemorizedRow] = useState(null);
  const [deletePlanRow, setDeletePlanRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [priorDialogOpen, setPriorDialogOpen] = useState(false);
  const [confirmPlanSaveOpen, setConfirmPlanSaveOpen] = useState(false);
  const [planSaveMode, setPlanSaveMode] = useState(PLAN_SAVE_MODES.continue);
  const [newPlanStartDate, setNewPlanStartDate] = useState('');
  const [priorForm, setPriorForm] = useState({ startSurah: '', startAyah: '', startPage: '', endSurah: '', endAyah: '', endPage: '' });
  const [priorStartAyahs, setPriorStartAyahs] = useState([]);
  const [priorEndAyahs, setPriorEndAyahs] = useState([]);
  const [quranReferenceMode, setQuranReferenceMode] = useState('ayah');
  const [minimumPlanStartDate, setMinimumPlanStartDate] = useState(today);
  const [isCreatingNewPlan, setIsCreatingNewPlan] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingMemorized, setIsDeletingMemorized] = useState(false);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [closingPlan, setClosingPlan] = useState(null);
  const keepPlanDialogOpen = (event) => event.preventDefault();

  const startAyah = startAyahs.find((ayah) => String(ayah.ayah) === String(form.startAyah));
  const endAyah = endAyahs.find((ayah) => String(ayah.ayah) === String(form.endAyah));
  const startChapter = chapters.find((chapter) => String(chapter.number) === String(form.startSurah));
  const endChapter = chapters.find((chapter) => String(chapter.number) === String(form.endSurah));
  const savedPriorMemorization = useMemo(
    () => selectedRow?.priorMemorization || selectedRow?.plan?.priorMemorization || [],
    [selectedRow]
  );
  const stagedPriorPageRanges = useMemo(() => getPriorPageRanges(form.priorMemorization), [form.priorMemorization]);
  const savedPriorPageRanges = useMemo(
    () => getPriorPageRanges(savedPriorMemorization),
    [savedPriorMemorization]
  );
  const completedPageRanges = useMemo(
    () => getPriorPageRanges(selectedRow?.plan?.completedMemorization || []),
    [selectedRow]
  );
  const unavailableQuranRanges = useMemo(
    () => [
      ...savedPriorMemorization,
      ...(form.priorMemorization || []),
      ...(selectedRow?.plan?.completedMemorization || []),
    ],
    [form.priorMemorization, savedPriorMemorization, selectedRow]
  );
  const unavailablePageRanges = useMemo(
    () => [...savedPriorPageRanges, ...stagedPriorPageRanges, ...completedPageRanges],
    [completedPageRanges, savedPriorPageRanges, stagedPriorPageRanges]
  );
  const currentPlanBoundaryPages = useMemo(() => new Set(
    !isCreatingNewPlan && selectedRow?.plan
      ? [selectedRow.plan.startPage, selectedRow.plan.endPage].filter(Boolean).map(String)
      : []
  ), [isCreatingNewPlan, selectedRow]);
  const availablePlanPages = useMemo(
    () => quranPages.filter((page) => (
      form.track === 'mastery' || currentPlanBoundaryPages.has(String(page)) || !pageInRanges(page, unavailablePageRanges)
    )),
    [form.track, currentPlanBoundaryPages, unavailablePageRanges]
  );
  const availableChapters = useMemo(() => chapters.filter((chapter) => {
    if (form.track === 'mastery') return true;
    if (!isCreatingNewPlan && [form.startSurah, form.endSurah].some(surah => Number(surah) === Number(chapter.number))) return true;
    const startPage = Number(chapter.startPage || 0);
    const endPage = Number(chapter.endPage || 0);
    if (!startPage || !endPage) return true;
    return !rangeCoversRange({ startPage, endPage }, unavailablePageRanges);
  }), [chapters, form.track, form.startSurah, form.endSurah, isCreatingNewPlan, unavailablePageRanges]);
  const startAyahOptions = useMemo(
    () => startAyahs.filter((ayah) => form.track === 'mastery' || (!isCreatingNewPlan && Number(ayah.ayah) === Number(form.startAyah)) || !quranRefInRanges(form.startSurah, ayah.ayah, unavailableQuranRanges)),
    [form.track, form.startSurah, form.startAyah, isCreatingNewPlan, startAyahs, unavailableQuranRanges]
  );
  const endAyahOptions = useMemo(
    () => endAyahs.filter((ayah) => form.track === 'mastery' || (!isCreatingNewPlan && Number(ayah.ayah) === Number(form.endAyah)) || !quranRefInRanges(form.endSurah, ayah.ayah, unavailableQuranRanges)),
    [form.track, endAyahs, form.endSurah, form.endAyah, isCreatingNewPlan, unavailableQuranRanges]
  );
  const priorStartAyahOptions = useMemo(
    () => priorStartAyahs.filter((ayah) => !quranRefInRanges(priorForm.startSurah, ayah.ayah, unavailableQuranRanges)),
    [priorForm.startSurah, priorStartAyahs, unavailableQuranRanges]
  );
  const priorEndAyahOptions = useMemo(
    () => priorEndAyahs.filter((ayah) => !quranRefInRanges(priorForm.endSurah, ayah.ayah, unavailableQuranRanges)),
    [priorEndAyahs, priorForm.endSurah, unavailableQuranRanges]
  );

  const preview = useMemo(() => {
    let pages;
    if (quranReferenceMode === 'page') {
      const startPage = Number(form.startPage || 0);
      const endPage = Number(form.endPage || 0);
      if (!startPage || !endPage) return null;
      pages = countUnblockedPages(startPage, endPage, form.track === 'mastery' ? [] : unavailablePageRanges);
      if (startPage < 1 || startPage > 604 || endPage < 1 || endPage > 604) return { error: 'بداية الخطة ونهايتها يجب أن تكونا ضمن صفحات المصحف.' };
    } else {
      if (!startAyah || !endAyah) return null;
      pages = countUnblockedQuranPlanPages({
        startAyah,
        endAyah,
        startChapter,
        endChapter,
        chapters,
        blockedRanges: form.track === 'mastery' ? [] : unavailablePageRanges,
      });
    }
    const dailyPages = getPagesValue(form.dailyPreset, form.dailyPages, 0.25);
    return {
      pages,
      dailyPages,
      linkPages: getPagesValue(form.linkPreset, form.linkPages),
      reviewHizbs: getReviewHizbs(form.reviewHizbPreset, form.reviewHizbs),
      readingHizbs: getReadingHizbs(form.readingPreset, form.readingHizbs),
      ...expectedPlanCompletion({ pages, dailyPages, startDate: form.startDate > minimumPlanStartDate ? form.startDate : minimumPlanStartDate, weeklyHolidayDays }),
    };
  }, [form.track, weeklyHolidayDays, form.startDate, minimumPlanStartDate, chapters, endAyah, endChapter, form.dailyPages, form.dailyPreset, form.endPage, form.linkPages, form.linkPreset, form.readingHizbs, form.readingPreset, form.reviewHizbPreset, form.reviewHizbs, form.startPage, quranReferenceMode, startAyah, startChapter, unavailablePageRanges]);

  const loadRows = useCallback(async () => {
    setLoadError('');
    setIsLoading(true);
    try {
      const [families, planRows, quranChapters, quranJuzRanges, publicSettings] = await Promise.all([
        hideCommitteeFilter ? Promise.resolve([]) : loadOfflineSnapshot(getAccountId(), 'plans:committees', () => studentsApi.getCommittees()),
        loadOfflineSnapshot(getAccountId(), `plans:rows:${committeeId}`, () => studentsApi.getStudentPlans({ committeeId })),
        loadOfflineSnapshot(getAccountId(), 'quran:chapters', () => studentsApi.getQuranChapters()),
        loadOfflineSnapshot(getAccountId(), 'quran:juz-ranges', () => studentsApi.getQuranJuzRanges()),
        loadOfflineSnapshot(getAccountId(), 'settings:public', () => studentsApi.getPublicSettings()),
      ]);
      setCommittees(families);
      setRows(planRows);
      setChapters(quranChapters);
      setJuzRanges(quranJuzRanges);
      setWeeklyHolidayDays(Array.isArray(publicSettings?.weeklyHolidayDays) ? publicSettings.weeklyHolidayDays : [5, 6]);
      setQuranReferenceMode(publicSettings?.quranReferenceMode === 'page' ? 'page' : 'ayah');
      const currentDate = today();
      setMinimumPlanStartDate(
        publicSettings?.currentTermStartDate && publicSettings.currentTermStartDate > currentDate
          ? publicSettings.currentTermStartDate
          : currentDate
      );
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل خطط الطلاب.');
      toast({ title: 'تعذر تحميل خطط الطلاب', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [committeeId, hideCommitteeFilter, toast]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!form.startSurah) {
      setStartAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${form.startSurah}`, () => studentsApi.getQuranAyahs(form.startSurah))
      .then(setStartAyahs).catch(() => setStartAyahs([]));
  }, [form.startSurah]);

  useEffect(() => {
    if (!form.endSurah) {
      setEndAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${form.endSurah}`, () => studentsApi.getQuranAyahs(form.endSurah))
      .then(setEndAyahs).catch(() => setEndAyahs([]));
  }, [form.endSurah]);

  const openPlanDialog = (row, { createNew = false } = {}) => {
    const plan = row.plan;
    setSelectedRow(row);
    setIsCreatingNewPlan(createNew);
    const _resolveReviewPreset = () => {
      if (['20', '40', '60'].includes(String(plan.reviewPages))) {
        return String(plan.reviewPages);
      }
      return 'custom';
    };
    const _resolveReviewHizbPreset = () => (
      REVIEW_HIZB_PRESETS.includes(String(plan.reviewHizbs ?? 1)) ? String(plan.reviewHizbs ?? 1) : 'custom'
    );
    const _resolveReadingPreset = () => {
      const hizbs = Number(plan.readingHizbs) || DEFAULT_PLAN_READING_HIZBS;
      return REVIEW_HIZB_PRESETS.includes(String(hizbs)) ? String(hizbs) : 'custom';
    };
    const _resolveOpenPlanDialog = () => {
      if (plan && !createNew) {
        return {
      track: plan.track || 'memorization',
      startDate: plan.startDate || minimumPlanStartDate,
      startSurah: String(plan.startSurah),
      startAyah: String(plan.startAyah),
      startPage: String(plan.startPage || ''),
      endSurah: String(plan.endSurah),
      endAyah: String(plan.endAyah),
      endPage: String(plan.endPage || ''),
      dailyPreset: ['1', '2'].includes(String(plan.dailyPages)) ? String(plan.dailyPages) : 'custom',
      dailyPages: plan.dailyPages,
      linkPreset: ['10', '20'].includes(String(plan.linkPages)) ? String(plan.linkPages) : 'custom',
      linkPages: plan.linkPages,
      reviewPreset: _resolveReviewPreset(),
      reviewPages: plan.reviewPages,
      reviewHizbPreset: _resolveReviewHizbPreset(),
      reviewHizbs: plan.reviewHizbs ?? 1,
      readingPreset: _resolveReadingPreset(),
      readingHizbs: Number(plan.readingHizbs) || DEFAULT_PLAN_READING_HIZBS,
      // Splitting the review over a week is no longer offered; saving converts such plans to ahzab.
      reviewSplitWeekly: false,
      reviewWeekStartDay: String(plan.reviewWeekStartDay ?? 0),
      reviewWeekEndDay: String(plan.reviewWeekEndDay ?? 6),
      reviewMinDailyPages: plan.reviewMinDailyPages || 1,
      queuedRanges: plan.queuedRanges || [],
      priorMemorization: Array.isArray(plan.priorMemorization) ? plan.priorMemorization : [],
    };
      }
      return { ...emptyForm, startDate: minimumPlanStartDate };
    };
    setForm(_resolveOpenPlanDialog());
  };

  useEffect(() => {
    if (quranReferenceMode !== 'page' || form.track === 'mastery') return;
    setForm((current) => {
      const startBlocked = current.startPage
        && !currentPlanBoundaryPages.has(String(current.startPage))
        && pageInRanges(current.startPage, unavailablePageRanges);
      const endBlocked = current.endPage
        && !currentPlanBoundaryPages.has(String(current.endPage))
        && pageInRanges(current.endPage, unavailablePageRanges);
      if (!startBlocked && !endBlocked) return current;
      return {
        ...current,
        startPage: startBlocked ? '' : current.startPage,
        endPage: endBlocked ? '' : current.endPage,
      };
    });
  }, [form.track, currentPlanBoundaryPages, quranReferenceMode, unavailablePageRanges]);

  const savePlan = async ({ confirmed = false, mode = PLAN_SAVE_MODES.continue } = {}) => {
    if (!selectedRow) return;
    const isPageMode = quranReferenceMode === 'page';
    const planRangeMissing = isPageMode
      ? (!form.startPage || !form.endPage)
      : (!form.startSurah || !form.startAyah || !form.endSurah || !form.endAyah);
    if (form.queuedRanges.some(range => isPageMode ? !range.startPage || !range.endPage : !range.startSurah || !range.startAyah || !range.endSurah || !range.endAyah)) {
      toast({ title: 'الخطة التالية غير مكتملة', description: 'اختر بداية ونهاية كل خطة تالية.', variant: 'destructive' });
      return;
    }
    if (planRangeMissing || preview?.error) {
      toast({ title: 'الخطة غير مكتملة', description: preview?.error || 'اختر بداية ونهاية الخطة.', variant: 'destructive' });
      return;
    }
    if ((!selectedRow.plan || isCreatingNewPlan) && (form.startDate || minimumPlanStartDate) < minimumPlanStartDate) {
      toast({ title: 'بداية الخطة غير صحيحة', description: `اختر تاريخ ${formatHijriDate(minimumPlanStartDate)} أو تاريخًا بعده.`, variant: 'destructive' });
      return;
    }
    if (selectedRow.plan && !isCreatingNewPlan && !confirmed) {
      setPlanSaveMode(PLAN_SAVE_MODES.continue);
      setNewPlanStartDate(minimumPlanStartDate);
      setConfirmPlanSaveOpen(true);
      return;
    }
    const startsNewPlan = isCreatingNewPlan || mode === PLAN_SAVE_MODES.new;
    if (startsNewPlan && !isCreatingNewPlan && (newPlanStartDate || minimumPlanStartDate) < minimumPlanStartDate) {
      toast({ title: 'بداية الخطة غير صحيحة', description: `اختر تاريخ ${formatHijriDate(minimumPlanStartDate)} أو تاريخًا بعده.`, variant: 'destructive' });
      return;
    }
    const _resolveStartDate = () => {
      if (isCreatingNewPlan || !selectedRow.plan) return form.startDate || minimumPlanStartDate;
      return startsNewPlan ? newPlanStartDate || minimumPlanStartDate : form.startDate;
    };
    setConfirmPlanSaveOpen(false);
    setIsSaving(true);
    try {
      await studentsApi.saveStudentPlan(selectedRow.studentId, {
        mode: startsNewPlan ? PLAN_SAVE_MODES.new : PLAN_SAVE_MODES.continue,
        track: form.track,
        queuedRanges: form.queuedRanges,
        startDate: _resolveStartDate(),
        ...(isPageMode ? {
          startPage: Number(form.startPage),
          endPage: Number(form.endPage),
        } : {
          startSurah: Number(form.startSurah),
          startAyah: Number(form.startAyah),
          endSurah: Number(form.endSurah),
          endAyah: Number(form.endAyah),
        }),
        dailyPages: getPagesValue(form.dailyPreset, form.dailyPages, 0.25),
        linkPages: getPagesValue(form.linkPreset, form.linkPages),
        reviewPages: getPagesValue(form.reviewPreset, form.reviewPages),
        reviewHizbs: getReviewHizbs(form.reviewHizbPreset, form.reviewHizbs),
        readingHizbs: getReadingHizbs(form.readingPreset, form.readingHizbs),
        reviewSplitWeekly: false,
        reviewWeekStartDay: Number(form.reviewWeekStartDay),
        reviewWeekEndDay: Number(form.reviewWeekEndDay),
        reviewMinDailyPages: Number(form.reviewMinDailyPages || 1),
        priorMemorization: (form.priorMemorization || []).map((item) => ({
          startPage: Number(item.startPage),
          endPage: Number(item.endPage),
          startSurah: Number(item.startSurah || 0),
          startAyah: Number(item.startAyah || 0),
          endSurah: Number(item.endSurah || 0),
          endAyah: Number(item.endAyah || 0),
        })),
      });
      toast({ title: 'تم الحفظ', description: 'تم حفظ خطة الطالب.' });
      setSelectedRow(null);
      await loadRows();
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!priorForm.startSurah) {
      setPriorStartAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${priorForm.startSurah}`, () => studentsApi.getQuranAyahs(priorForm.startSurah))
      .then(setPriorStartAyahs).catch(() => setPriorStartAyahs([]));
  }, [priorForm.startSurah]);

  useEffect(() => {
    if (!priorForm.endSurah) {
      setPriorEndAyahs([]);
      return;
    }
    loadOfflineSnapshot(getAccountId(), `quran:ayahs:${priorForm.endSurah}`, () => studentsApi.getQuranAyahs(priorForm.endSurah))
      .then(setPriorEndAyahs).catch(() => setPriorEndAyahs([]));
  }, [priorForm.endSurah]);

  const chapterName = useCallback((surah) => chapters.find((chapter) => String(chapter.number) === String(surah))?.name || `سورة ${surah}`, [chapters]);
  const quranRangeLabel = (item) => (
    quranReferenceMode === 'page' || !item.startSurah || !item.endSurah
      ? `صفحة ${numberText(item.startPage)} إلى ${numberText(item.endPage)}`
      : `${chapterName(item.startSurah)} ${item.startAyah} إلى ${chapterName(item.endSurah)} ${item.endAyah}`
  );

  const memorizedSegments = useMemo(() => {
    const ranges = memorizedRow?.priorMemorization || memorizedRow?.plan?.priorMemorization || [];
    if (!ranges.length || !juzRanges.length) return [];
    return juzRanges.map((juz) => {
      const pages = new Set();
      let endRef = {
        surahName: juz.endSurahName,
        ayah: juz.endAyah,
        page: 0,
      };
      for (const range of ranges) {
        const from = Math.max(Number(range.startPage), Number(juz.startPage));
        const to = Math.min(Number(range.endPage), Number(juz.endPage));
        if (from > to) continue;
        for (let page = from; page <= to; page += 1) pages.add(page);
        if (to <= Number(juz.endPage) && to >= Number(endRef.page || 0)) {
          endRef = {
            surahName: Number(range.endPage) <= Number(juz.endPage) ? chapterName(range.endSurah) : juz.endSurahName,
            ayah: Number(range.endPage) <= Number(juz.endPage) ? range.endAyah : juz.endAyah,
            page: to,
          };
        }
      }
      if (!pages.size) return null;
      const isComplete = pages.size >= Number(juz.endPage) - Number(juz.startPage) + 1;
      const segmentFromPage = Math.min(...pages);
      const segmentToPage = Math.max(...pages);
      const _resolveLabel = () => {
        if (isComplete) {
          return `الجزء ${numberText(juz.juz)} كامل`;
        }
        if (quranReferenceMode === 'page') {
          return `الجزء ${numberText(juz.juz)}: صفحة ${numberText(segmentFromPage)} إلى ${numberText(segmentToPage)}`;
        }
        return `الجزء ${numberText(juz.juz)}: صفحة ${numberText(segmentFromPage)} إلى ${numberText(segmentToPage)}`;
      };
      return {
        juz: juz.juz,
        fromPage: segmentFromPage,
        toPage: segmentToPage,
        label: _resolveLabel(),
      };
    }).filter(Boolean);
  }, [chapterName, juzRanges, memorizedRow, quranReferenceMode]);

  const openMemorizedDialog = (row) => {
    setMemorizedRow(row);
  };

  const deleteMemorizedSegment = async (segment) => {
    if (!memorizedRow?.studentId || !segment) return;
    setIsDeletingMemorized(true);
    try {
      await studentsApi.deleteStudentPriorMemorization(memorizedRow.studentId, {
        fromPage: segment.fromPage,
        toPage: segment.toPage,
      });
      toast({ title: 'تم الحذف', description: 'تم حذف المحفوظ المجتاز من الطالب.' });
      setMemorizedRow(null);
      await loadRows();
    } catch (error) {
      toast({ title: 'تعذر حذف المحفوظ', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingMemorized(false);
    }
  };

  const deletePlan = async () => {
    if (!deletePlanRow?.studentId) return;
    setIsDeletingPlan(true);
    try {
      await studentsApi.deleteStudentPlan(deletePlanRow.studentId);
      toast({ title: 'تم الحذف', description: 'تم حذف خطة الطالب الحالية.' });
      setDeletePlanRow(null);
      await loadRows();
    } catch (error) {
      toast({ title: 'تعذر حذف الخطة', description: error.message, variant: 'destructive' });
    } finally {
      setIsDeletingPlan(false);
    }
  };

  const setSurahWithDefaultAyah = async ({ value, mode, setAyahs, setState, surahKey, ayahKey }) => {
    setState((current) => ({ ...current, [surahKey]: value, [ayahKey]: '' }));
    try {
      const ayahs = await loadOfflineSnapshot(
        getAccountId(),
        `quran:ayahs:${value}`,
        () => studentsApi.getQuranAyahs(value),
      );
      setAyahs(ayahs);
      const availableAyahs = ayahs.filter((ayah) => (setState === setForm && form.track === 'mastery') || !quranRefInRanges(value, ayah.ayah, unavailableQuranRanges));
      const nextAyah = mode === 'end' ? availableAyahs[availableAyahs.length - 1] : availableAyahs[0];
      if (nextAyah) {
        setState((current) => (
          String(current[surahKey]) === String(value)
            ? { ...current, [ayahKey]: String(nextAyah.ayah) }
            : current
        ));
      }
    } catch {
      setAyahs([]);
    }
  };

  const addPriorMemorization = () => {
    if (quranReferenceMode === 'page') {
      const startPage = Number(priorForm.startPage || 0);
      const endPage = Number(priorForm.endPage || 0);
      if (!startPage || !endPage || startPage < 1 || endPage > 604 || startPage > endPage) {
        toast({ title: 'المحفوظ المجتاز غير صحيح', description: 'تأكد من بداية ونهاية المقطع.', variant: 'destructive' });
        return;
      }
      const newRange = { startPage, endPage };
      if (unavailablePageRanges.some((range) => rangesOverlap(newRange, range))) {
        toast({ title: 'المحفوظ المجتاز موجود', description: 'اختر مقطعاً غير مضاف سابقاً.', variant: 'destructive' });
        return;
      }
      setForm((current) => ({
        ...current,
        priorMemorization: [
          ...(current.priorMemorization || []),
          { startPage, endPage },
        ],
      }));
      setPriorForm({ startSurah: '', startAyah: '', startPage: '', endSurah: '', endAyah: '', endPage: '' });
      return;
    }
    if (!priorForm.startSurah || !priorForm.startAyah || !priorForm.endSurah || !priorForm.endAyah) {
      toast({ title: 'المحفوظ المجتاز غير مكتمل', description: 'اختر بداية ونهاية المقطع.', variant: 'destructive' });
      return;
    }
    const startAyahInfo = priorStartAyahs.find((ayah) => String(ayah.ayah) === String(priorForm.startAyah));
    const endAyahInfo = priorEndAyahs.find((ayah) => String(ayah.ayah) === String(priorForm.endAyah));
    if (
      !startAyahInfo ||
      !endAyahInfo ||
      startAyahInfo.page > endAyahInfo.page ||
      compareQuranRefs(priorForm.startSurah, priorForm.startAyah, priorForm.endSurah, priorForm.endAyah) > 0
    ) {
      toast({ title: 'المحفوظ المجتاز غير صحيح', description: 'تأكد من بداية ونهاية المقطع.', variant: 'destructive' });
      return;
    }
    const newRange = {
      startSurah: Number(priorForm.startSurah),
      startAyah: Number(priorForm.startAyah),
      startPage: Math.min(startAyahInfo.page, endAyahInfo.page),
      endSurah: Number(priorForm.endSurah),
      endAyah: Number(priorForm.endAyah),
      endPage: Math.max(startAyahInfo.page, endAyahInfo.page),
    };
    if (unavailableQuranRanges.some((range) => quranRangesOverlap(newRange, range))) {
      toast({ title: 'المحفوظ المجتاز موجود', description: 'اختر مقطعاً غير مضاف سابقاً.', variant: 'destructive' });
      return;
    }
    setForm((current) => ({
      ...current,
      priorMemorization: [
        ...(current.priorMemorization || []),
        {
          ...newRange,
        },
      ],
    }));
    setPriorForm({ startSurah: '', startAyah: '', startPage: '', endSurah: '', endAyah: '', endPage: '' });
  };

  const removePriorMemorization = (index) => {
    setForm((current) => ({
      ...current,
      priorMemorization: (current.priorMemorization || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const rowActionClass = 'h-11 w-11 border-transparent bg-transparent';
  const dialogClassName = 'bg-card p-4 text-foreground sm:p-6 [font-family:var(--font-ui)]';
  const renderRowActions = (row) => {
    if (!row.plan) {
      return <><Button variant="outline" onClick={() => openPlanDialog(row)} className="h-11 gap-2" title="إضافة خطة">
        <Plus className="h-4 w-4" />إضافة خطة
      </Button>{row.priorMemorization?.length > 0 && <Button variant="outline" className="h-11" onClick={() => openMemorizedDialog(row)}>المحفوظ المجتاز</Button>}</>;
    }
    return <>
      <StudentPlansPauseControl studentId={row.studentId} studentName={row.studentName} initialState={row.planPause} onChange={loadRows} />
      {row.plan.queuedRanges?.length > 0 && <Button variant="outline" className="h-11" onClick={() => setClosingPlan(row)}>إغلاق الحالية</Button>}
      {Number(row.plan.progressPercent || 0) >= 100 && (
        <ManagementIconButton
          className={rowActionClass}
          onClick={() => openPlanDialog(row, { createNew: true })}
          tone="primary"
          title="خطة جديدة"
          aria-label={`إضافة خطة جديدة لـ ${row.studentName}`}
        >
          <Plus className="h-4 w-4" />
        </ManagementIconButton>
      )}
      <ManagementIconButton
        className={rowActionClass}
        onClick={() => openPlanDialog(row)}
        tone="primary"
        title="تعديل الخطة"
        aria-label={`تعديل خطة ${row.studentName}`}
      >
        <Edit3 className="h-4 w-4" />
      </ManagementIconButton>
      <ManagementIconButton
        className={rowActionClass}
        onClick={() => openMemorizedDialog(row)}
        tone="destructive"
        title="إدارة الحذف"
        aria-label={`إدارة حذف خطة ومحفوظات ${row.studentName}`}
      >
        <Trash2 className="h-4 w-4" />
      </ManagementIconButton>
    </>;
  };

  const _resolveStudentPlansSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (loadError) return <ErrorState message={loadError} onRetry={loadRows} />;
    if (visibleRows.length === 0) {
      return <ManagementEmpty>لا يوجد طلاب حالياً.</ManagementEmpty>;
    }
    return <ul aria-label="خطط الطلاب" className="divide-y divide-border">
      {visibleRows.map((row) => {
        const progress = Math.max(0, Math.min(100, Number(row.plan?.progressPercent || 0)));
        return (
          <li key={row.studentId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-nowrap sm:px-6">
            <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
              <div className="truncate text-base font-bold text-foreground">{row.studentName}</div>
              <div className="mt-0.5 truncate text-sm text-muted-foreground">{row.committeeName || 'بدون حلقة'}</div>
              {row.rehifz?.map(item => <p key={item.id} className="mt-1 text-xs font-bold text-primary">إعادة حفظ الجزء {item.juzNumber} كاملًا</p>)}
            </div>
            {row.plan ? (
              <div className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
                <div className="mb-1 text-xs text-muted-foreground">{row.plan.trackLabel}</div>
                <PlanScheduleSummary plan={row.plan} />
                <div className="mb-1.5 text-xs font-bold text-muted-foreground">نسبة الإنجاز {numberText(row.plan.progressPercent)}٪</div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted" title={`${numberText(row.plan.progressPercent)}٪`}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                </div>

              </div>
            ) : <div className="hidden sm:block sm:flex-1" />}
            <div className="flex flex-wrap shrink-0 items-center gap-1">
              {renderRowActions(row)}
            </div>
          </li>
        );
      })}
    </ul>;
  };
  return (
    <>
      <Dialog open={Boolean(closingPlan)} onOpenChange={open => !open && !isSaving && setClosingPlan(null)}>
        <DialogContent dir="rtl"><DialogHeader><DialogTitle>إغلاق الخطة الحالية</DialogTitle></DialogHeader>
          <p className="text-sm">يُحفظ التنفيذ السابق وتُفتح الخطة التالية، ويبدأ جدولها من الغد.</p>
          <DialogFooter><Button variant="outline" disabled={isSaving} onClick={() => setClosingPlan(null)}>إلغاء</Button>
            <Button loading={isSaving} onClick={async () => {
              setIsSaving(true);
              try { await studentsApi.closeStudentPlan(closingPlan.studentId, closingPlan.plan.id); setClosingPlan(null); await loadRows(); }
              catch (error) { toast({ title: 'تعذر إغلاق الخطة', description: error.message, variant: 'destructive' }); }
              finally { setIsSaving(false); }
            }}>إغلاق وفتح التالية</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ManagementPanel>
        <ManagementToolbar><Input type="search" aria-label="ابحث بالاسم" placeholder="ابحث بالاسم" value={search} onChange={event => setSearch(event.target.value)} className="h-11 min-w-0 flex-1 basis-40 sm:max-w-sm" />
        {!hideCommitteeFilter && (
            <Select value={committeeId} onValueChange={setCommitteeId}>
              <SelectTrigger aria-label="الحلقة" className="h-11 min-w-0 flex-1 basis-40 sm:max-w-xs">
                <SelectValue placeholder="اختر الحلقة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحلقات</SelectItem>
                {committees.map((committee) => (
                  <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
        )}
        <StudentPlansPauseControl onChange={loadRows} />
        </ManagementToolbar>
        {_resolveStudentPlansSection()}
      </ManagementPanel>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => {
        if (!open) {
          setSelectedRow(null);
          setConfirmPlanSaveOpen(false);
        }
      }}>
        <DialogContent
          className={`max-w-2xl ${dialogClassName}`}
          dir="rtl"
          onInteractOutside={keepPlanDialogOpen}
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <DialogTitle className="text-primary">{selectedRow?.plan && !isCreatingNewPlan ? 'تعديل الخطة' : 'إضافة خطة'}</DialogTitle>
            <Button type="button" variant="outline" onClick={() => setPriorDialogOpen(true)} className="h-11 gap-2">
              <Plus className="h-4 w-4" />
              المحفوظ المجتاز
            </Button>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <FormGrid>
              <FormField label="بداية الخطة">
                {/* A plan that already started keeps its start; one starting today or later can move forward. */}
                {selectedRow?.plan && !isCreatingNewPlan && String(selectedRow.plan.startDate || '') < minimumPlanStartDate ? (
                  <div className="flex h-11 items-center rounded-xl bg-muted/60 px-3 text-sm font-bold text-foreground">
                    {formatHijriDate(form.startDate)}
                  </div>
                ) : (
                  <div className="w-full">
                    <DashboardDatePicker value={form.startDate || minimumPlanStartDate} min={minimumPlanStartDate} ariaLabel="بداية الخطة" onChange={(startDate) => setForm((current) => ({ ...current, startDate }))} />
                  </div>
                )}
              </FormField>
              <FormField label="المسار">
                <Select value={form.track} onValueChange={track => setForm(current => ({ ...current, track }))}>
                  <SelectTrigger aria-label="مسار الخطة"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="memorization">حفظ</SelectItem><SelectItem value="mastery">إتقان</SelectItem></SelectContent>
                </Select>
              </FormField>
              <FormField label="بداية الخطة">
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={form.startPage}
                    onChange={(value) => setForm((current) => ({ ...current, startPage: value }))}
                    placeholder="صفحة البداية"
                    pages={availablePlanPages}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={form.startSurah}
                    ayahValue={form.startAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={startAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'start',
                      setAyahs: setStartAyahs,
                      setState: setForm,
                      surahKey: 'startSurah',
                      ayahKey: 'startAyah',
                    })}
                    onAyahChange={(value) => setForm((current) => ({ ...current, startAyah: value }))}
                  />
                )}
              </FormField>
              <FormField label="نهاية الخطة">
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={form.endPage}
                    onChange={(value) => setForm((current) => ({ ...current, endPage: value }))}
                    placeholder="صفحة النهاية"
                    pages={availablePlanPages}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={form.endSurah}
                    ayahValue={form.endAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={endAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'end',
                      setAyahs: setEndAyahs,
                      setState: setForm,
                      surahKey: 'endSurah',
                      ayahKey: 'endAyah',
                    })}
                    onAyahChange={(value) => setForm((current) => ({ ...current, endAyah: value }))}
                  />
                )}
              </FormField>
            </FormGrid>

            <QueuedPlanRanges value={form.queuedRanges} onChange={queuedRanges => setForm(current => ({ ...current, queuedRanges }))} chapters={chapters} pageMode={quranReferenceMode === 'page'} currentRange={form} />

            <FormGrid className="items-end border-t border-border pt-5 min-[390px]:grid-cols-2">
              <PlanAmount label="المقدار اليومي" form={form} setForm={setForm} presetKey="dailyPreset" valueKey="dailyPages" options={dailyPageOptions} min="0.25" step="0.25" inputMode="decimal" />
              <PlanAmount label="الربط" form={form} setForm={setForm} presetKey="linkPreset" valueKey="linkPages" options={[['10', '10 أوجه'], ['20', 'جزء'], ['custom', 'مخصص']]} />
              <PlanAmount
                label="المراجعة (أحزاب)"
                form={form}
                setForm={setForm}
                presetKey="reviewHizbPreset"
                valueKey="reviewHizbs"
                options={reviewHizbOptions}
                max={String(MAX_REVIEW_HIZBS)}
                placeholder="عدد الأحزاب"
                onPresetChange={(value) => setForm((current) => ({
                  ...current,
                  reviewHizbPreset: value,
                  reviewHizbs: REVIEW_HIZB_PRESETS.includes(value) ? Number(value) : current.reviewHizbs,
                  reviewSplitWeekly: false,
                }))}
              />
              <PlanAmount
                label="القراءة الذاتية اليومية (أحزاب)"
                form={form}
                setForm={setForm}
                presetKey="readingPreset"
                valueKey="readingHizbs"
                options={readingHizbsOptions}
                max={String(MAX_PLAN_READING_HIZBS)}
                onPresetChange={(value) => setForm((current) => ({
                  ...current,
                  readingPreset: value,
                  readingHizbs: Number(value) || current.readingHizbs || DEFAULT_PLAN_READING_HIZBS,
                }))}
              />
            </FormGrid>

            {(form.priorMemorization || []).length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-xl bg-muted/40">
                {form.priorMemorization.map((item, index) => (
                  <li key={`${item.startSurah}-${item.startAyah}-${item.endSurah}-${item.endAyah}-${index}`} className="flex items-center gap-3 px-3 py-1.5">
                    <div className="min-w-0 flex-1 text-sm font-bold text-foreground">
                      {quranRangeLabel(item)}
                    </div>
                    <ManagementIconButton className={rowActionClass} onClick={() => removePriorMemorization(index)} tone="destructive" aria-label="حذف المحفوظ المجتاز">
                      <Trash2 className="h-4 w-4" />
                    </ManagementIconButton>
                  </li>
                ))}
              </ul>
            )}

            {preview && (
              <div className={`rounded-xl p-4 text-sm font-bold ${preview.error ? 'bg-destructive/10 text-destructive' : 'bg-primary/5 text-foreground'}`}>
                {preview.error || <><span>أيام التنفيذ المتوقعة: {numberText(preview.days)}</span>{preview.endDate && <span className="ms-3 inline-block">الانتهاء المتوقع: {formatHijriDate(preview.endDate)}</span>}</>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRow(null)}>إغلاق</Button>
            <Button onClick={() => savePlan()} disabled={isSaving}>{isSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPlanSaveOpen} onOpenChange={setConfirmPlanSaveOpen}>
        <DialogContent className={`max-w-md ${dialogClassName}`} dir="rtl" onInteractOutside={keepPlanDialogOpen}>
          <DialogHeader>
            <DialogTitle className="text-primary">تأكيد تعديل الخطة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm font-bold text-foreground">
            <div role="radiogroup" aria-label="طريقة حفظ التعديل" className="grid gap-2">
              {planSaveModeOptions.map(([value, label, description]) => {
                const selected = planSaveMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPlanSaveMode(value)}
                    className={`min-h-11 rounded-xl border p-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:bg-muted/40'}`}
                  >
                    <span className="block font-black">{label}</span>
                    <span className="mt-1 block text-xs font-bold text-muted-foreground">{description}</span>
                  </button>
                );
              })}
            </div>
            {planSaveMode === PLAN_SAVE_MODES.new && (
              <FormField label="بداية الخطة الجديدة">
                <DashboardDatePicker value={newPlanStartDate || minimumPlanStartDate} min={minimumPlanStartDate} ariaLabel="بداية الخطة الجديدة" onChange={setNewPlanStartDate} />
              </FormField>
            )}
            <p>المحفوظ المجتاز والحفظ المعتمد من مشرف المسار لن يتم حذفهما.</p>
            <div className="rounded-xl bg-muted/50 p-3 text-muted-foreground">
              {preview?.pages === 0
                ? 'كل نطاق الخطة الجديدة محفوظ حاليًا.'
                : `المتبقي للحفظ داخل النطاق الجديد: ${numberText(preview?.pages || 0)} وجه.`}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPlanSaveOpen(false)}>إلغاء</Button>
            <Button onClick={() => savePlan({ confirmed: true, mode: planSaveMode })} disabled={isSaving}>
              {isSaving ? 'جاري الحفظ...' : 'تأكيد الحفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={priorDialogOpen} onOpenChange={setPriorDialogOpen}>
        <DialogContent className={`max-w-lg ${dialogClassName}`} dir="rtl" onInteractOutside={keepPlanDialogOpen}>
          <DialogHeader>
            <DialogTitle className="text-primary">المحفوظ المجتاز</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormGrid>
              <FormField label="من">
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={priorForm.startPage}
                    onChange={(value) => setPriorForm({ ...priorForm, startPage: value })}
                    placeholder="صفحة البداية"
                    pages={availablePlanPages}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={priorForm.startSurah}
                    ayahValue={priorForm.startAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={priorStartAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'start',
                      setAyahs: setPriorStartAyahs,
                      setState: setPriorForm,
                      surahKey: 'startSurah',
                      ayahKey: 'startAyah',
                    })}
                    onAyahChange={(value) => setPriorForm({ ...priorForm, startAyah: value })}
                  />
                )}
              </FormField>
              <FormField label="إلى">
                {quranReferenceMode === 'page' ? (
                  <PageSelect
                    value={priorForm.endPage}
                    onChange={(value) => setPriorForm({ ...priorForm, endPage: value })}
                    placeholder="صفحة النهاية"
                    pages={availablePlanPages.filter((page) => !priorForm.startPage || Number(page) >= Number(priorForm.startPage))}
                  />
                ) : (
                  <QuranRefFields
                    surahValue={priorForm.endSurah}
                    ayahValue={priorForm.endAyah}
                    chapters={availableChapters}
                    allChapters={chapters}
                    ayahOptions={priorEndAyahOptions}
                    onSurahChange={(value) => setSurahWithDefaultAyah({
                      value,
                      mode: 'end',
                      setAyahs: setPriorEndAyahs,
                      setState: setPriorForm,
                      surahKey: 'endSurah',
                      ayahKey: 'endAyah',
                    })}
                    onAyahChange={(value) => setPriorForm({ ...priorForm, endAyah: value })}
                  />
                )}
              </FormField>
            </FormGrid>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriorDialogOpen(false)}>إغلاق</Button>
            <Button type="button" onClick={addPriorMemorization} className="h-11 gap-2"><Plus className="h-4 w-4" />إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(memorizedRow)} onOpenChange={(open) => !open && setMemorizedRow(null)}>
        <DialogContent className={`max-w-lg ${dialogClassName}`} dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">إدارة الحذف - {memorizedRow?.studentName}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {memorizedSegments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا يوجد محفوظ مجتاز لهذا الطالب.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {memorizedSegments.map((segment) => (
                  <li key={`${segment.juz}-${segment.fromPage}-${segment.toPage}`} className="flex items-center gap-3 py-1.5">
                    <div className="min-w-0 flex-1 text-sm font-bold text-foreground">{segment.label}</div>
                    <ManagementIconButton
                      className={rowActionClass}
                      onClick={() => deleteMemorizedSegment(segment)}
                      disabled={isDeletingMemorized}
                      tone="destructive"
                      title="حذف هذا المحفوظ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </ManagementIconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setMemorizedRow(null)}>إغلاق</Button>
            <Button
              variant="destructive"
              disabled={!memorizedRow?.plan}
              onClick={() => {
                setDeletePlanRow(memorizedRow);
                setMemorizedRow(null);
              }}
            >
              حذف الخطة الحالية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletePlanRow)} onOpenChange={(open) => !open && setDeletePlanRow(null)}>
        <DialogContent className={`max-w-md ${dialogClassName}`} dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">حذف الخطة</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold leading-6 text-muted-foreground">
            هل تريد حذف الخطة الحالية للطالب {deletePlanRow?.studentName}؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePlanRow(null)} disabled={isDeletingPlan}>إلغاء</Button>
            <Button variant="destructive" onClick={deletePlan} disabled={isDeletingPlan}>
              {isDeletingPlan ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const PlanAmount = ({
  label,
  form,
  setForm,
  presetKey,
  valueKey,
  options,
  onPresetChange,
  min = '1',
  max,
  step = '1',
  inputMode = 'numeric',
  placeholder = 'عدد الأوجه',
}) => (
  <FormField label={label}>
    {form[presetKey] === 'custom' ? (
      <div className="flex h-12 items-center rounded-xl border border-input bg-card px-2 focus-within:ring-2 focus-within:ring-ring">
        <Input
          aria-label={label}
          type="number"
          inputMode={inputMode}
          min={min}
          max={max}
          step={step}
          className="h-11 border-0 bg-transparent px-2 text-right shadow-none focus-visible:ring-0"
          value={form[valueKey]}
          onChange={(event) => setForm((current) => ({ ...current, [valueKey]: Number(event.target.value || 1) }))}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="ghost"
          className="h-9 shrink-0 px-2 text-xs"
          onClick={() => setForm((current) => ({
            ...current,
            [presetKey]: options[0][0],
            [valueKey]: Number(options[0][0]) || current[valueKey],
            ...(presetKey === 'reviewHizbPreset' ? { reviewSplitWeekly: false } : {}),
          }))}
        >
          اختيار
        </Button>
      </div>
    ) : (
      <Select value={form[presetKey]} onValueChange={(value) => (onPresetChange ? onPresetChange(value) : setForm((current) => ({ ...current, [presetKey]: value })))}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    )}
  </FormField>
);

const quranPages = Array.from({ length: 604 }, (_, index) => String(index + 1));

const PageSelect = ({ value, onChange, placeholder, pages = quranPages }) => (
  <Select value={String(value || '')} onValueChange={onChange}>
    <SelectTrigger aria-label={placeholder} className="h-12 bg-background text-center font-bold [&>span]:w-full [&>span]:text-center">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className="max-h-72">
      {pages.map((page) => (
        <SelectItem key={page} value={page}>{page}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const QuranRefFields = ({
  surahValue,
  ayahValue,
  chapters,
  allChapters,
  ayahOptions,
  onSurahChange,
  onAyahChange,
}) => (
  <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_108px]">
    <SurahSearchSelect
      value={surahValue}
      chapters={chapters}
      allChapters={allChapters}
      placeholder="السورة"
      onChange={onSurahChange}
    />
    <AyahSearchSelect value={ayahValue} ayahs={ayahOptions} onChange={onAyahChange} />
  </div>
);

export default StudentPlansSection;
