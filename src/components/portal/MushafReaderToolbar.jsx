import React from 'react';
import { Button } from '@/components/ui/button';
import PageBackButton from '@/components/ui/page-back-button';
import MushafThemeSwitch from '@/components/portal/MushafThemeSwitch';
import { useMushafReader } from '@/components/portal/MushafReaderLayout';
import { formatMushafNumber, getMushafPageMetadata } from '@/lib/mushafPageMetadata';

export default function MushafReaderToolbar({ theme, onBack, onIndex, onThemeChange, pageNumber, surahName, page, bookmarkButton, children }) {
  const reader = useMushafReader();
  const metadata = getMushafPageMetadata(page || { page: pageNumber }, reader?.index, surahName);
  const locationText = <>
    <span>{metadata.surahName || 'المصحف'}</span>
    <small>صفحة {formatMushafNumber(pageNumber || page?.page || 1)} | جزء {formatMushafNumber(metadata.juz)} | حزب {formatMushafNumber(metadata.hizb)}</small>
  </>;
  return (
    <header className="mushaf-reader-toolbar" aria-label="أدوات المصحف" data-recitation-control>
      <div className="mushaf-reader-toolbar-main">
        {onBack && <PageBackButton iconOnly className="mushaf-reader-icon" onClick={onBack} />}
        <div className="mushaf-reader-location">
          {onIndex ? <Button type="button" variant="ghost" className="mushaf-reader-location-text" onClick={onIndex} aria-label="فتح فهرس المصحف" aria-haspopup="dialog">{locationText}</Button>
            : <div className="mushaf-reader-location-text">{locationText}</div>}
          {bookmarkButton}
        </div>
        <MushafThemeSwitch theme={theme} onChange={onThemeChange} className="mushaf-reader-icon" />
      </div>
      {children && <div className="mushaf-reader-toolbar-extra">{children}</div>}
    </header>
  );
}
