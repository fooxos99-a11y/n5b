import React from 'react';
import MushafPageNumber from './MushafPageNumber';

const StudentMushafPageControls = ({ pageNumber }) => (
  <div className="absolute inset-x-[4%] bottom-0 z-30 flex h-11 items-center justify-center" data-recitation-control>
    <MushafPageNumber pageNumber={pageNumber} />
  </div>
);

export default StudentMushafPageControls;
