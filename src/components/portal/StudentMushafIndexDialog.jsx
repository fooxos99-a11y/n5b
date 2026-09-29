import './student-mushaf-index.css';
import React, { useMemo, useRef, useState } from 'react';
import { Bookmark, BookOpen, Hash, Layers, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const tabs = [
  { key: 'surahs', label: 'السور', icon: BookOpen },
  { key: 'juzs', label: 'الأجزاء', icon: Layers },
  { key: 'pages', label: 'الصفحات', icon: Hash },
  { key: 'bookmarks', label: 'العلامات', icon: Bookmark },
];

const normalizeSearch = (value) => String(value || '').trim().toLowerCase();
const normalizeDigits = (value) => String(value || '').replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const StudentMushafIndexDialog = ({ open, onOpenChange, theme = 'light', index, currentPage, bookmarks = [], onSelectPage }) => {
  const [activeTab, setActiveTab] = useState('surahs');
  const [search, setSearch] = useState('');
  const previousFocus = useRef(null);

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      setActiveTab('surahs');
      setSearch('');
    }
    onOpenChange?.(nextOpen);
  };
  const query = normalizeSearch(search);
  const numericQuery = normalizeDigits(query);
  const ayahQuery = /^(\d{1,3})\s*[:/]\s*(\d{1,3})$/.exec(numericQuery);
  const directAyah = ayahQuery ? index?.ayahs?.find((item) => (
    Number(item.surah) === Number(ayahQuery[1]) && Number(item.ayah) === Number(ayahQuery[2])
  )) : null;

  const selectPage = (page) => {
    onSelectPage?.(Number(page));
    handleOpenChange(false);
  };

  const filteredSurahs = useMemo(() => (index?.chapters || []).filter((chapter) => (
    !query
    || normalizeSearch(chapter.name).includes(query)
    || normalizeSearch(chapter.englishName).includes(query)
    || String(chapter.number) === query
  )), [index?.chapters, query]);

  const filteredPages = useMemo(() => Array.from({ length: Number(index?.pageCount || 604) }, (_, itemIndex) => itemIndex + 1)
    .filter((page) => !query || String(page).includes(query) || String(page).includes(query)), [index?.pageCount, query]);

  const filteredJuzs = useMemo(() => (index?.juzs || []).filter((juz) => (
    !query || String(juz.number).includes(query) || String(juz.number).includes(query)
  )), [index?.juzs, query]);

  const filteredBookmarks = useMemo(() => bookmarks.filter((page) => (
    !query || String(page).includes(query) || String(page).includes(query)
  )), [bookmarks, query]);

  if (!open || typeof document === 'undefined') return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="z-[100]"
        data-reader-theme={theme}
        className="student-mushaf-index z-[101] h-[min(42rem,calc(100svh-1rem))] max-w-2xl grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3 overflow-hidden p-3 [font-family:var(--font-ui)] sm:h-[min(42rem,calc(100svh-2rem))] sm:p-5"
        dir="rtl"
        aria-labelledby="student-mushaf-index-title"
        aria-describedby={undefined}
        onOpenAutoFocus={() => { previousFocus.current = document.activeElement; }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (previousFocus.current?.isConnected) previousFocus.current.focus();
        }}
      >
        <header className="flex items-center justify-between gap-3">
          <DialogTitle asChild><h2 id="student-mushaf-index-title" className="text-lg font-black text-foreground">فهرس المصحف</h2></DialogTitle>
          <Button type="button" variant="ghost" size="icon" onClick={() => handleOpenChange(false)} aria-label="إغلاق فهرس المصحف" className="shrink-0">
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 bg-background pr-10 [font-family:var(--font-ui)]"
            placeholder="اسم السورة، الصفحة، أو ٢:٢٥٥"
            aria-label="البحث في فهرس المصحف"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1" role="tablist" aria-label="أقسام فهرس المصحف">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                type="button"
                variant={selected ? 'default' : 'ghost'}
                onClick={() => setActiveTab(tab.key)}
                className="h-14 min-w-0 flex-col gap-0.5 px-1 text-[11px] sm:h-11 sm:flex-row sm:gap-1 sm:text-sm"
                role="tab"
                aria-selected={selected}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </Button>
            );
          })}
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-2">
          {directAyah && (
            <Button type="button" variant="outline" onClick={() => selectPage(directAyah.page)} className="mb-2 h-12 w-full justify-between border-primary/30 bg-primary/5 px-3 text-primary">
              <span>{directAyah.surahName}، الآية {String(directAyah.ayah)}</span>
              <span className="text-xs">ص {String(directAyah.page)}</span>
            </Button>
          )}
          {activeTab === 'surahs' && (
            <div className="grid gap-1 sm:grid-cols-2">
              {filteredSurahs.map((chapter) => (
                <Button
                  key={chapter.number}
                  type="button"
                  variant="ghost"
                  onClick={() => selectPage(chapter.startPage)}
                  className={`h-12 justify-between rounded-lg px-3 ${Number(currentPage) === Number(chapter.startPage) ? 'bg-primary/10 text-primary' : ''}`}
                >
                  <span className="min-w-0 truncate text-right">{String(chapter.number)}. {chapter.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">ص {String(chapter.startPage)}</span>
                </Button>
              ))}
            </div>
          )}

          {activeTab === 'juzs' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredJuzs.map((juz) => (
                <Button key={juz.number} type="button" variant="outline" onClick={() => selectPage(juz.startPage)} className="h-12 justify-between bg-card px-3">
                  <span>الجزء {String(juz.number)}</span>
                  <span className="text-xs text-muted-foreground">ص {String(juz.startPage)}</span>
                </Button>
              ))}
            </div>
          )}

          {activeTab === 'pages' && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {filteredPages.map((page) => (
                <Button key={page} type="button" variant={Number(currentPage) === page ? 'default' : 'outline'} onClick={() => selectPage(page)} className="h-11 px-1">
                  {String(page)}
                </Button>
              ))}
            </div>
          )}

          {activeTab === 'bookmarks' && (
            filteredBookmarks.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredBookmarks.map((page) => (
                  <Button key={page} type="button" variant="outline" onClick={() => selectPage(page)} className="h-12 justify-between bg-card px-3">
                    <span>الصفحة {String(page)}</span>
                    <Bookmark className="h-4 w-4 fill-primary text-primary" />
                  </Button>
                ))}
              </div>
            ) : <div className="flex min-h-40 items-center justify-center text-sm font-bold text-muted-foreground">لا توجد علامات محفوظة.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudentMushafIndexDialog;
