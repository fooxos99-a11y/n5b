import React from 'react';
import MushafSurahBanner from '@/components/portal/MushafSurahBanner';

const MushafPageHeader = ({ surahNumber, surahName, theme = 'dark' }) => (
  <header className="mx-[6.5%] mt-[2.5%] flex h-[5.8%] shrink-0 items-center justify-center">
    <MushafSurahBanner surahNumber={surahNumber} surahName={surahName} theme={theme} />
  </header>
);

export default MushafPageHeader;
