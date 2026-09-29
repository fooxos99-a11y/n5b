import React from 'react';

const normalizeSurahName = (name = '') => String(name).replace(/^سُ?و?رَ?ةُ?\s*/u, '').trim();

const Ornament = ({ theme }) => (
  <svg
    className="absolute inset-0 h-full w-full text-primary"
    viewBox="0 0 600 80"
    preserveAspectRatio="none"
    aria-hidden
  >
    <path
      d="M4 40 18 9h164l18-6h200l18 6h164l14 31-14 31H418l-18 6H200l-18-6H18Z"
      fill="hsl(var(--accent) / 0.78)"
      stroke="currentColor"
      strokeWidth="3"
    />
    <path
      d="M12 40 24 15h161l17-6h196l17 6h161l12 25-12 25H415l-17 6H202l-17-6H24Z"
      fill="none"
      stroke="currentColor"
      strokeOpacity="0.58"
      strokeWidth="1.5"
    />
    <path
      d="M184 15c12 0 18 10 26 15-8 5-14 15-26 15 8 5 14 15 26 15h180c12 0 18-10 26-15-8-5-14-15-26-15H210c-12 0-18-10-26-15Z"
      fill={theme === 'light' ? '#fffdf7' : '#020617'}
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <g fill="currentColor" fillOpacity="0.72">
      <path d="M38 40 54 23l16 17-16 17Zm5 0 11 11 11-11-11-11Z" fillRule="evenodd" />
      <path d="M78 40c12-18 24-18 36 0-12 18-24 18-36 0Zm8 0c7 9 13 9 20 0-7-9-13-9-20 0Z" fillRule="evenodd" />
      <path d="M124 40 139 25l15 15-15 15Zm6 0 9 9 9-9-9-9Z" fillRule="evenodd" />
      <circle cx="169" cy="40" r="5" />
    </g>
    <g transform="translate(600 0) scale(-1 1)" fill="currentColor" fillOpacity="0.72">
      <path d="M38 40 54 23l16 17-16 17Zm5 0 11 11 11-11-11-11Z" fillRule="evenodd" />
      <path d="M78 40c12-18 24-18 36 0-12 18-24 18-36 0Zm8 0c7 9 13 9 20 0-7-9-13-9-20 0Z" fillRule="evenodd" />
      <path d="M124 40 139 25l15 15-15 15Zm6 0 9 9 9-9-9-9Z" fillRule="evenodd" />
      <circle cx="169" cy="40" r="5" />
    </g>
  </svg>
);

const MushafSurahBanner = ({ surahName, theme = 'dark', className = '' }) => {
  const accessibleName = `سورة ${normalizeSurahName(surahName)}`;

  return (
    <div
      data-mushaf-no-swipe
      className={`relative flex h-full w-full max-w-[29rem] items-center justify-center overflow-hidden text-primary ${className}`}
      aria-label={accessibleName}
      translate="no"
    >
      <Ornament theme={theme} />
      <span
        className={`relative z-10 flex h-[62%] w-[48%] items-center justify-center overflow-hidden rounded-full border border-primary/70 px-1.5 text-center font-extrabold leading-none ${theme === 'light' ? 'bg-[#fffdf7] text-primary' : 'bg-[#172033] text-[#f6ead2]'}`}
        style={{ fontFamily: 'var(--font-ui)', fontSize: '3.1cqw' }}
        dir="rtl"
      >
        <span className="block max-w-full whitespace-nowrap">{accessibleName}</span>
      </span>
    </div>
  );
};

export default MushafSurahBanner;
