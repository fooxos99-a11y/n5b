import React from 'react';

const MushafPageNumber = ({ pageNumber }) => (
  <span className="absolute bottom-[4cqw] flex h-[7cqw] min-h-7 w-[12cqw] min-w-12 items-center justify-center text-[2.8cqw] font-black text-current [font-family:var(--font-ui)]" aria-label={`رقم الصفحة ${pageNumber}`}>
    {String(pageNumber)}
  </span>
);

export default MushafPageNumber;
