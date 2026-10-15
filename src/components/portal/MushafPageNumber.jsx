import React from 'react';
import { formatMushafNumber } from '@/lib/mushafPageMetadata';

const MushafPageNumber = ({ pageNumber }) => (
  <span className="mushaf-page-number" aria-label={`رقم الصفحة ${pageNumber}`}>
    {formatMushafNumber(pageNumber)}
  </span>
);

export default MushafPageNumber;
