import React from 'react';
import { List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MushafThemeSwitch from '@/components/portal/MushafThemeSwitch';
import { useMushafReader } from '@/components/portal/MushafReaderLayout';
import { formatMushafNumber, getMushafPageMetadata } from '@/lib/mushafPageMetadata';

export default function MushafReaderToolbar({ theme, onIndex, onThemeChange, pageNumber, surahName, page, bookmarkButton, children }) {
  const reader = useMushafReader();
  const metadata = getMushafPageMetadata(page || { page: pageNumber }, reader?.index, surahName);
  return (
    <header className="mushaf-reader-toolbar" aria-label="أدوات المصحف" data-recitation-control>
      <div className="mushaf-reader-toolbar-main">
        {onIndex && <Button type="button" variant="ghost" size="icon" className="mushaf-reader-icon" onClick={onIndex} aria-label="فتح فهرس المصحف">
          <List aria-hidden className="h-6 w-6" />
        </Button>}
        <div className="mushaf-reader-location">
          <div className="mushaf-reader-location-text">
            <p>{metadata.surahName || 'المصحف'}</p>
            <span>صفحة {formatMushafNumber(pageNumber || page?.page || 1)} | جزء {formatMushafNumber(metadata.juz)} | حزب {formatMushafNumber(metadata.hizb)}</span>
          </div>
          {bookmarkButton}
        </div>
        <MushafThemeSwitch theme={theme} onChange={onThemeChange} className="mushaf-reader-icon" />
      </div>
      {children && <div className="mushaf-reader-toolbar-extra">{children}</div>}
    </header>
  );
}
