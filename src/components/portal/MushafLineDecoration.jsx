import React from 'react';
import MushafSurahBanner from '@/components/portal/MushafSurahBanner';

const BISMILLAH = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';

const MushafLineDecoration = ({ decoration, theme = 'dark' }) => {
  if (decoration?.type === 'surah') {
    return (
      <div data-mushaf-no-swipe className="flex h-full w-full items-center justify-center px-1.5">
        <MushafSurahBanner surahNumber={decoration.surah} surahName={decoration.name} theme={theme} className="h-[76%]" />
      </div>
    );
  }

  if (decoration?.type === 'bismillah') {
    return (
      <div data-mushaf-no-swipe className="w-full text-center leading-none text-current" style={{ fontFamily: 'Uthmanic-Hafs', fontSize: '4.1cqw' }} translate="no">
        {BISMILLAH}
      </div>
    );
  }

  return null;
};

export default MushafLineDecoration;
