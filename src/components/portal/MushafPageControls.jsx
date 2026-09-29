import React from 'react';
import MushafPageNumber from './MushafPageNumber';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';

const CONTROL_CLASS = 'relative h-11 min-h-11 w-14 min-w-14 rounded-full bg-transparent p-0 shadow-none hover:bg-transparent';
const CONTROL_SURFACE = 'absolute bottom-[4cqw] flex h-[7cqw] w-[12cqw] items-center justify-center rounded-full text-[2.8cqw] font-black shadow-sm [font-family:var(--font-ui)]';

const MushafPageControls = ({ pageNumber, isSaving, onFinish, onNextRandom }) => (
  <nav
    className="absolute inset-x-[4%] bottom-0 z-30 flex items-center justify-between"
    aria-label="التحكم في صفحة المصحف"
    dir="rtl"
    data-recitation-control
  >
    <span className={CONTROL_CLASS}>
      <MushafPageNumber pageNumber={pageNumber} />
    </span>
    {onNextRandom && (
      <Button type="button" variant="ghost" onClick={onNextRandom} disabled={isSaving} className="relative h-11 min-h-11 w-28 min-w-28 rounded-full bg-transparent p-0 shadow-none hover:bg-transparent">
        <span className={`${CONTROL_SURFACE} !w-[24cqw] bg-secondary text-[2.3cqw] text-secondary-foreground`}>المقطع التالي</span>
      </Button>
    )}
    <Button
      type="button"
      variant="ghost"
      onClick={onFinish}
      disabled={isSaving}
      className={CONTROL_CLASS}
    >
      <span className={`${CONTROL_SURFACE} bg-primary !text-white`}>
        {isSaving ? <LoadingSpinner className="h-[3.5cqw] w-[3.5cqw] border-[0.45cqw]" /> : 'إنهاء'}
      </span>
    </Button>
  </nav>
);

export default MushafPageControls;
