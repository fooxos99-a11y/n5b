import React from 'react';
import MushafPageNumber from './MushafPageNumber';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';

const MushafPageControls = ({ pageNumber, isSaving, onFinish, onNextRandom }) => (
  <nav
    className="mushaf-page-controls"
    aria-label="التحكم في صفحة المصحف"
    dir="rtl"
    data-recitation-control
  >
    {onFinish && (
    <Button
      type="button"
      variant="ghost"
      onClick={onFinish}
      disabled={isSaving}
      className="mushaf-finish-button"
    >
      <span>
        {isSaving ? <LoadingSpinner className="h-3 w-3" /> : 'إنهاء'}
      </span>
    </Button>
    )}
    {onNextRandom && (
      <Button type="button" variant="ghost" onClick={onNextRandom} disabled={isSaving} className="mushaf-next-button">
        <span>المقطع التالي</span>
      </Button>
    )}
    <MushafPageNumber pageNumber={pageNumber} />
  </nav>
);

export default MushafPageControls;
