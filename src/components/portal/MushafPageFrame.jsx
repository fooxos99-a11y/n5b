import React from 'react';

const MushafPageFrame = ({ theme = 'dark' }) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden>
    <div className={`absolute inset-0 border ${theme === 'light' ? 'border-slate-300/80' : 'border-white/10'}`} />
    <div className={`absolute inset-x-[3%] bottom-[8%] border-b ${theme === 'light' ? 'border-slate-300/70' : 'border-white/10'}`} />
  </div>
);

export default MushafPageFrame;
