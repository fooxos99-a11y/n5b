import React from 'react';
import { DEFAULT_NEWS_TEXT_COLOR } from '../../../../shared/student-news';

export default function StudentNewsArtwork({ entry, expanded = false }) {
  return <div className={`relative isolate overflow-hidden bg-slate-900 [font-family:var(--font-ui)] ${expanded ? 'min-h-[280px] rounded-xl' : 'h-[280px] sm:h-[320px]'}`}>
    {entry.image && <img src={entry.image} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" draggable={false} />}
    <div className="absolute inset-0 -z-10 bg-black/35" />
    <div data-news-text="" className={`pointer-events-none space-y-3 p-5 text-start sm:p-6 ${expanded ? '' : 'flex h-full flex-col justify-center'}`} style={{ color: entry.textColor || DEFAULT_NEWS_TEXT_COLOR }}>
      <h3 className={`break-words text-lg font-bold leading-relaxed sm:text-xl ${expanded ? '' : 'line-clamp-2'}`}>{entry.title}</h3>
      {entry.body && <p className={`whitespace-pre-wrap break-words text-sm leading-7 ${expanded ? '' : 'line-clamp-4'}`}>{entry.body}</p>}
    </div>
  </div>;
}
