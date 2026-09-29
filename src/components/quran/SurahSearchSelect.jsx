import React, { useMemo } from 'react';
import SearchableQuranSelect from '@/components/quran/SearchableQuranSelect';

const SurahSearchSelect = ({ value, chapters, allChapters = chapters, placeholder = 'السورة', onChange }) => {
  const selectedChapter = allChapters.find((chapter) => String(chapter.number) === String(value));
  const visibleChapters = useMemo(() => (
    selectedChapter && !chapters.some((chapter) => String(chapter.number) === String(value))
      ? [selectedChapter, ...chapters]
      : chapters
  ), [chapters, selectedChapter, value]);
  const options = useMemo(() => visibleChapters.map((chapter) => ({
    value: String(chapter.number),
    label: chapter.name,
    searchText: `${chapter.name} ${chapter.number}`,
  })), [visibleChapters]);

  return (
    <SearchableQuranSelect
      value={value}
      options={options}
      placeholder={placeholder}
      title="اختر السورة"
      searchPlaceholder="اكتب اسم السورة أو رقمها"
      searchLabel="البحث في السور"
      onChange={onChange}
    />
  );
};

export default SurahSearchSelect;
