import React from 'react';
import MushafSurahBanner from '@/components/portal/MushafSurahBanner';

const MushafPageHeader = ({ surahNumber, surahName, theme = 'dark' }) => (
  <header className="mushaf-page-surah-opening">
    <MushafSurahBanner surahNumber={surahNumber} surahName={surahName} theme={theme} />
  </header>
);

export default MushafPageHeader;
