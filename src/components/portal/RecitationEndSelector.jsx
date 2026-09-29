import React from 'react';
import InlineRecitationSelect from '@/components/portal/InlineRecitationSelect';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const keyOf = (position = {}) => `${Number(position.surah || 0)}:${Number(position.ayah || 0)}`;

const surahLabel = (position = {}) => position.surahName || `سورة ${position.surah}`;

const comparePosition = (first = {}, second = {}) => (
  Number(first.surah) === Number(second.surah)
    ? Number(first.ayah) - Number(second.ayah)
    : Number(first.surah) - Number(second.surah)
);

const RecitationEndSelector = ({
  start,
  options = [],
  value,
  onChange,
  chapters = [],
  allowedStart,
  allowedEnd,
  direction = 1,
  compact = false,
}) => {
  if (!start || !options.length) return null;
  const hasChapterRange = chapters.length > 0 && allowedStart && allowedEnd;
  const canonicalStart = hasChapterRange && comparePosition(allowedStart, allowedEnd) <= 0 ? allowedStart : allowedEnd;
  const canonicalEnd = hasChapterRange && comparePosition(allowedStart, allowedEnd) <= 0 ? allowedEnd : allowedStart;
  const rangedChapters = hasChapterRange
    ? chapters
      .filter((chapter) => Number(chapter.number) >= Number(canonicalStart.surah)
        && Number(chapter.number) <= Number(canonicalEnd.surah))
      .sort((first, second) => (Number(first.number) - Number(second.number)) * (Number(direction) >= 0 ? 1 : -1))
      .map((chapter) => ({
        surah: Number(chapter.number),
        surahName: chapter.name,
        ayahCount: Number(chapter.ayahCount),
      }))
    : [];
  const surahs = hasChapterRange
    ? rangedChapters
    : [...new Map(options.map((option) => [String(option.surah), option])).values()];
  const fallback = options.find((item) => keyOf(item) === keyOf(value)) || options[0];
  const selectedSurah = surahs.find((item) => Number(item.surah) === Number(value?.surah)) || surahs[0] || fallback;
  if (!selectedSurah) return null;
  const buildChapterAyahs = (surah) => {
    const chapter = rangedChapters.find((item) => Number(item.surah) === Number(surah));
    if (!chapter) return [];
    const minimum = Number(surah) === Number(canonicalStart.surah) ? Number(canonicalStart.ayah) : 1;
    const maximum = Number(surah) === Number(canonicalEnd.surah) ? Number(canonicalEnd.ayah) : chapter.ayahCount;
    return Array.from({ length: Math.max(0, maximum - minimum + 1) }, (_, index) => {
      const ayah = Number(direction) >= 0 ? minimum + index : maximum - index;
      const existing = options.find((option) => (
        Number(option.surah) === Number(surah) && Number(option.ayah) === ayah
      ));
      return {
        page: Number(existing?.page || 0),
        surah: Number(surah),
        surahName: chapter.surahName,
        ayah,
      };
    });
  };
  const ayahs = hasChapterRange
    ? buildChapterAyahs(selectedSurah.surah)
    : options.filter((option) => Number(option.surah) === Number(fallback.surah));
  const selected = ayahs.find((item) => keyOf(item) === keyOf(value)) || ayahs[0] || fallback;
  const selectSurah = (surah) => {
    const sameSurah = hasChapterRange
      ? buildChapterAyahs(surah)
      : options.filter((option) => Number(option.surah) === Number(surah));
    const sameAyah = sameSurah.find((option) => Number(option.ayah) === Number(selected.ayah));
    onChange?.(sameAyah || sameSurah[0]);
  };

  const controls = (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-1 gap-y-0 text-xs font-black leading-4 text-muted-foreground [font-family:var(--font-ui)] [&_[role=combobox]]:!min-h-11 [&_[role=combobox]]:!min-w-11 sm:text-sm sm:leading-5">
      <span className="whitespace-nowrap">من {surahLabel(start)} {start.ayah}</span>
      <span>إلى</span>
      <InlineRecitationSelect
        ariaLabel="سورة النهاية"
        value={selected.surah}
        options={surahs.map((option) => ({
          value: option.surah,
          label: surahLabel(option),
        }))}
        onValueChange={selectSurah}
      />
      <InlineRecitationSelect
        ariaLabel="آية النهاية"
        value={selected.ayah}
        options={ayahs.map((option) => ({
          key: keyOf(option),
          value: option.ayah,
          label: option.ayah,
        }))}
        onValueChange={(ayah) => {
          const option = ayahs.find((item) => Number(item.ayah) === Number(ayah));
          if (option) onChange?.(option);
        }}
      />
    </div>
  );
  if (!compact) return controls;
  // Same wording as the read-only amount so every card reads alike.
  const range = Number(start.surah) === Number(selected.surah)
    ? `من ${surahLabel(start)} ${start.ayah} إلى ${selected.ayah}`
    : `من ${surahLabel(start)} ${start.ayah} إلى ${surahLabel(selected)} ${selected.ayah}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="recitation-range-trigger" aria-label={`تعديل المقدار: ${range}`}>
          {range}
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="max-w-[calc(100vw-24px)] [font-family:var(--font-ui)] [&_[role=combobox]]:!min-h-11 [&_[role=combobox]]:!min-w-11">
        {controls}
      </PopoverContent>
    </Popover>
  );
};

export default RecitationEndSelector;
