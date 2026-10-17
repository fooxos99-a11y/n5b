import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, RotateCcw } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import MadaniMushafPage from '@/components/portal/MadaniMushafPage';
import MushafPageCarousel from '@/components/portal/MushafPageCarousel';
import MushafReaderLayout from '@/components/portal/MushafReaderLayout';
import MushafReaderToolbar from '@/components/portal/MushafReaderToolbar';
import StudentMushafIndexDialog from '@/components/portal/StudentMushafIndexDialog';
import StudentMushafPageControls from '@/components/portal/StudentMushafPageControls';
import PageBackButton from '@/components/ui/page-back-button';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import useNativeSurfaceTheme from '@/hooks/useNativeSurfaceTheme';
import { preloadMushafFonts } from '@/lib/quranFonts';
import { resolveStudentMushafTarget } from '@/lib/studentMushafTarget';
import {
  readStudentMushafState,
  saveStudentMushafBookmarks,
  saveStudentMushafLastPage,
  saveStudentMushafToday,
} from '@/lib/studentMushafStorage';
import {
  buildTodayMushafTarget,
  clampMushafPage,
  getNearbyMushafPages,
  getOfflineMushafIndex,
  getOfflineMushafPage,
  MUSHAF_PAGE_COUNT,
  preloadCompleteOfflineMushaf,
  preloadOfflineMushafPages,
} from '@/services/offlineMushaf';
import { studentsApi } from '@/services/studentsApi';

const MUSHAF_PAGES = Array.from({ length: MUSHAF_PAGE_COUNT }, (_, index) => index + 1);

const StudentMushafSection = ({ studentId, onBack, initialTarget = null }) => {
  const { toast } = useToast();
  const [index, setIndex] = useState(null);
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState(null);
  const [todayTarget, setTodayTarget] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [fontReady, setFontReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pageError, setPageError] = useState('');
  const [indexOpen, setIndexOpen] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [indexLoadVersion, setIndexLoadVersion] = useState(0);
  const [neighbors, setNeighbors] = useState({});
  const [theme, setTheme] = useState(() => (
    localStorage.getItem('nukhab_student_mushaf_theme') === 'dark' ? 'dark' : 'light'
  ));
  const readerStorageId = studentId || `reader-${localStorage.getItem('wajeh_role') || 'staff'}`;
  useNativeSurfaceTheme(theme);

  useEffect(() => {
    const startPreload = () => { preloadCompleteOfflineMushaf(); };
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(startPreload, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(idleId);
    }
    const timer = window.setTimeout(startPreload, 800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      setIsInitializing(true);
      const stored = readStudentMushafState(readerStorageId);
      const cachedToday = stored.today;
      try {
        const localIndex = await getOfflineMushafIndex();
        if (!active) return;
        const target = resolveStudentMushafTarget(initialTarget || buildTodayMushafTarget(cachedToday), localIndex);
        setIndex(localIndex);
        setTodayTarget(target);
        setBookmarks(stored.bookmarks);
        setPage(target?.page || stored.lastPage || 1);
        // The packaged reader must not wait for the assignment API to become usable.
        if (!initialTarget && studentId && (typeof navigator === 'undefined' || navigator.onLine)) {
          void studentsApi.getStudentQuranToday(studentId).then(today => {
            if (!active) return;
            saveStudentMushafToday(studentId, today);
            setTodayTarget(resolveStudentMushafTarget(buildTodayMushafTarget(today), localIndex));
          }).catch(error => {
            if (active && !stored.today) toast({ title: 'تعذر تحديث حفظ اليوم', description: error.message, variant: 'destructive' });
          });
        }
      } catch (error) {
        if (active) toast({ title: 'تعذر فتح المصحف', description: error.message, variant: 'destructive' });
      } finally {
        if (active) setIsInitializing(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [initialTarget, indexLoadVersion, readerStorageId, studentId, toast]);

  useEffect(() => {
    if (!index) return;
    let active = true;
    const loadPage = async () => {
      setPageError('');
      try {
        const nextPage = await getOfflineMushafPage(page);
        const fontLoaded = await preloadMushafFonts([page]);
        if (!active) return;
        setPageData(nextPage);
        setFontReady(fontLoaded);
        saveStudentMushafLastPage(readerStorageId, page);
        preloadOfflineMushafPages(page, 10);
        preloadMushafFonts(getNearbyMushafPages(page, 10));
        const nearby = await Promise.allSettled([page - 1, page + 1].filter((number) => number >= 1 && number <= MUSHAF_PAGE_COUNT).map(async (number) => {
          const [data, ready] = await Promise.all([getOfflineMushafPage(number), preloadMushafFonts([number])]);
          return [number, { data, ready }];
        }));
        if (active) setNeighbors(Object.fromEntries(nearby.filter((result) => result.status === 'fulfilled').map((result) => result.value)));
      } catch (error) {
        if (active) {
          setPageError(error.message);
          toast({ title: 'تعذر فتح الصفحة', description: error.message, variant: 'destructive' });
        }
      }
    };
    void loadPage();
    return () => { active = false; };
  }, [index, loadVersion, page, readerStorageId, toast]);

  const activeSurahNumber = Number(pageData?.words?.[0]?.verseKey?.split(':')?.[0] || 0);
  const displayedPage = Number(pageData?.page || page);
  const activeChapter = useMemo(() => index?.chapters?.find((chapter) => (
    activeSurahNumber
      ? Number(chapter.number) === activeSurahNumber
      : (displayedPage >= Number(chapter.startPage) && displayedPage <= Number(chapter.endPage))
  )), [activeSurahNumber, displayedPage, index?.chapters]);
  const isBookmarked = bookmarks.includes(displayedPage);

  const goToPage = (nextPage) => {
    const boundedPage = clampMushafPage(nextPage);
    if (boundedPage === displayedPage) return;
    setPage(boundedPage);
  };

  const changeTheme = (nextTheme) => {
    setTheme(nextTheme);
    localStorage.setItem('nukhab_student_mushaf_theme', nextTheme);
  };

  const toggleBookmark = () => {
    const next = isBookmarked ? bookmarks.filter((item) => item !== displayedPage) : [...bookmarks, displayedPage].sort((a, b) => a - b);
    setBookmarks(next);
    saveStudentMushafBookmarks(readerStorageId, next);
    toast({ title: isBookmarked ? 'أزيلت العلامة' : 'حُفظت علامة الصفحة' });
  };

  const renderNeighbor = (number) => neighbors[number] && <MadaniMushafPage
    page={neighbors[number].data} theme={theme} fontReady={neighbors[number].ready}
    pageAction={<StudentMushafPageControls pageNumber={number} onFinish={onBack} />} />;

  if (isInitializing) return <DashboardLoader className="min-h-[calc(100svh-8rem)]" />;

  if (!index) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
        <PageBackButton onClick={onBack} iconOnly />
        <p className="font-bold text-muted-foreground">تعذر فتح حزمة المصحف المحلية.</p>
        <Button type="button" variant="outline" onClick={() => setIndexLoadVersion((value) => value + 1)} className="h-11"><RotateCcw className="h-4 w-4" />إعادة المحاولة</Button>
      </div>
    );
  }

  const _resolveStudentMushafSection = () => {
    if (pageData) {
      return <MushafPageCarousel
            index={displayedPage - 1}
            total={MUSHAF_PAGE_COUNT}
            pageNumber={displayedPage}
            pageNumbers={MUSHAF_PAGES}
            theme={theme}
            previousPage={renderNeighbor(displayedPage - 1)}
            nextPage={renderNeighbor(displayedPage + 1)}
            pageAction={<StudentMushafPageControls pageNumber={displayedPage} onFinish={onBack} />}
            onIndexChange={(nextIndex) => goToPage(nextIndex + 1)}
          >
            <MadaniMushafPage
              key={displayedPage}
              page={pageData}
              surahName={activeChapter?.name}
              theme={theme}
              fontReady={fontReady}
            />
          </MushafPageCarousel>;
    }
    if (pageError) {
      return <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <PageBackButton onClick={onBack} iconOnly />
            <p className="font-bold text-muted-foreground">{pageError}</p>
            <Button type="button" variant="outline" onClick={() => setLoadVersion((value) => value + 1)} className="h-11"><RotateCcw className="h-4 w-4" />إعادة المحاولة</Button>
          </div>;
    }
    return <DashboardLoader className="h-full min-h-0" />;
  };
  return (
    <MushafReaderLayout
      theme={theme}
      label="مصحف الطالب"
      className="student-mushaf-reader h-dvh min-h-0 w-full"
      index={index}
      toolbar={<MushafReaderToolbar
        theme={theme}
        onBack={onBack}
        onIndex={() => setIndexOpen(true)}
        onThemeChange={changeTheme}
        pageNumber={displayedPage}
        page={pageData}
        surahName={activeChapter?.name}
        bookmarkButton={studentId && (
          <Button type="button" variant="ghost" size="icon" onClick={toggleBookmark}
            className="mushaf-reader-icon h-11 w-11 shrink-0"
            aria-label={isBookmarked ? 'إزالة علامة الصفحة' : 'حفظ علامة الصفحة'}
            aria-pressed={isBookmarked}>
            <Bookmark className={`h-5 w-5 ${isBookmarked ? 'fill-current' : ''}`} />
          </Button>
        )}
      >
        {todayTarget?.ranges?.length > 1 && <div className="flex gap-2 overflow-x-auto" aria-label="مقاطع المقدار">
          {todayTarget.ranges.map((target) => <Button key={`${target.page}:${target.preview}`} type="button" variant="ghost"
            className="min-h-11 shrink-0" onClick={() => goToPage(target.page)}>{target.preview}</Button>)}
        </div>}
      </MushafReaderToolbar>}
    >
      <div className="relative min-h-0 flex-1">
        {_resolveStudentMushafSection()}
        {pageError && pageData && <div role="alert" className="absolute inset-x-4 bottom-4 z-40 rounded-xl bg-background p-3 text-center text-foreground shadow-lg">
          <p>{pageError}</p><Button variant="outline" onClick={() => setLoadVersion((value) => value + 1)}>إعادة المحاولة</Button>
        </div>}
      </div>


      <StudentMushafIndexDialog
        theme={theme}
        open={indexOpen}
        onOpenChange={setIndexOpen}
        index={index}
        currentPage={displayedPage}
        bookmarks={bookmarks}
        onSelectPage={goToPage}
      />
    </MushafReaderLayout>
  );
};

export default StudentMushafSection;
