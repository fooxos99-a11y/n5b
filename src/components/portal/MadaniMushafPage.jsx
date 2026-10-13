import React, { useMemo, useRef } from 'react';
import MushafLineDecoration from '@/components/portal/MushafLineDecoration';
import MushafPageFrame from '@/components/portal/MushafPageFrame';
import MushafPageHeader from '@/components/portal/MushafPageHeader';
import MushafHighlightLayer from '@/components/portal/MushafHighlightLayer';

const locationParts = (location = '') => String(location).split(':').map(Number);

const locationIndex = (words, location) => words.findIndex((word) => word.location === location);

const compareVerseInDirection = (firstSurah, firstAyah, secondSurah, secondAyah, direction = 1) => {
  if (Number(direction) >= 0) {
    return (Number(firstSurah) - Number(secondSurah)) || (Number(firstAyah) - Number(secondAyah));
  }
  return (Number(secondSurah) - Number(firstSurah)) || (Number(secondAyah) - Number(firstAyah));
};

const isVerseWithinRange = (surah, ayah, allowedRange) => {
  if (!allowedRange) return true;
  const direction = Number(allowedRange.direction || 1);
  return compareVerseInDirection(surah, ayah, allowedRange.fromSurah, allowedRange.fromAyah, direction) >= 0
    && compareVerseInDirection(surah, ayah, allowedRange.toSurah, allowedRange.toAyah, direction) <= 0;
};

const MadaniMushafPage = ({ page, surahName, theme = 'dark', marks = [], allowedRange, highlightRange, selection, markingMode = false, fontReady = false, onSelectionStart, onSelectionMove, onSelectionEnd, pageAction }) => {
  const words = useMemo(() => page?.words || [], [page?.words]);
  const textRef = useRef(null);
  const decorationsByLine = useMemo(() => new Map(
    (page?.decorations || []).map((decoration) => [Number(decoration.line), decoration])
  ), [page?.decorations]);
  const topSurahDecoration = useMemo(() => (
    (page?.decorations || []).find((decoration) => decoration.type === 'surah' && Number(decoration.line) === 0)
  ), [page?.decorations]);
  const lineShift = useMemo(() => {
    if (![1, 2].includes(Number(page?.page))) return 0;
    const occupiedLines = [
      ...words.map((word) => Number(word.line)),
      ...(page?.decorations || []).filter((decoration) => decoration.type !== 'surah').map((decoration) => Number(decoration.line)),
    ].filter((line) => line >= 1 && line <= 15);
    if (!occupiedLines.length) return 0;
    const firstLine = Math.min(...occupiedLines);
    const lastLine = Math.max(...occupiedLines);
    const targetFirstLine = Math.floor((15 - (lastLine - firstLine + 1)) / 2) + 1;
    return targetFirstLine - firstLine;
  }, [page?.decorations, page?.page, words]);
  const lines = useMemo(() => Array.from({ length: 15 }, (_, index) => (
    words.filter((word) => Number(word.line) === index + 1 - lineShift)
  )), [lineShift, words]);
  const fontFamily = `QCF-P${page?.page}`;
  const highlightRanges = useMemo(() => {
    const ranges = marks.flatMap((mark, index) => {
      const start = locationIndex(words, mark.startLocation);
      const end = locationIndex(words, mark.endLocation);
      return start < 0 || end < 0 ? [] : [{ start: Math.min(start, end), end: Math.max(start, end), tone: mark.markType, key: `mark:${mark.id || index}` }];
    });
    if (selection) ranges.push({ start: Math.min(selection.startIndex, selection.endIndex), end: Math.max(selection.startIndex, selection.endIndex), tone: 'selection', key: 'selection' });
    return ranges;
  }, [marks, selection, words]);

  const wordTone = (word) => {
    const [surah, ayah] = locationParts(word.location);
    if (highlightRange && word.charType === 'word' && isVerseWithinRange(surah, ayah, highlightRange)) {
      return 'rounded-sm bg-primary/10 shadow-[inset_0_-0.12em_0_hsl(var(--primary)/0.22)]';
    }
    return '';
  };

  const moveSelection = (event) => {
    if (!markingMode || !selection) return;
    const pointedElement = typeof document !== 'undefined'
      ? document.elementFromPoint(event.clientX, event.clientY)
      : event.target;
    const target = pointedElement?.closest?.('[data-mushaf-word-index]');
    if (!target) return;
    onSelectionMove?.(Number(target.dataset.mushafWordIndex));
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full flex-col items-center justify-center">
      <article
        className={`mushaf-page relative mx-auto flex aspect-[13/24] h-full max-h-full w-auto flex-none select-none flex-col overflow-hidden shadow-[0_20px_55px_rgb(2_6_23_/_0.22)] transition-none [container-type:inline-size] ${theme === 'light' ? 'bg-[#fffdf7] text-slate-950' : 'bg-[#172033] text-slate-100'} ${markingMode ? 'touch-none' : 'touch-pan-y'}`}
        style={{ maxWidth: 'min(100%, 38rem)' }}
        dir="rtl"
        onPointerMove={moveSelection}
        onPointerUp={() => markingMode && onSelectionEnd?.()}
        onPointerCancel={() => markingMode && onSelectionEnd?.()}
        translate="no"
      >
        <MushafPageFrame theme={theme} />
        {topSurahDecoration && (
          <MushafPageHeader
            surahNumber={topSurahDecoration.surah}
            surahName={topSurahDecoration.name || surahName}
            theme={theme}
          />
        )}
        <div ref={textRef} className="relative grid min-h-0 flex-1 grid-rows-[repeat(15,minmax(0,1fr))] px-[3.25%] pb-[16%] pt-[5%]">
          <MushafHighlightLayer containerRef={textRef} ranges={highlightRanges} fontReady={fontReady} />
          {lines.map((lineWords, lineIndex) => (
            <div
              key={`${page?.page}-${lineIndex + 1}`}
              className="flex min-w-0 items-center justify-center gap-0 whitespace-nowrap text-center leading-none"
              style={{
                fontFamily,
                fontSize: '4.7cqw',
              }}
            >
              {decorationsByLine.get(lineIndex + 1 - lineShift) ? (
                <MushafLineDecoration decoration={decorationsByLine.get(lineIndex + 1 - lineShift)} theme={theme} />
              ) : lineWords.map((word) => {
                const index = words.findIndex((item) => item.location === word.location);
                const [surah, ayah, position] = locationParts(word.location);
                const withinAllowedRange = isVerseWithinRange(surah, ayah, allowedRange);
                const selectable = word.charType === 'word' && withinAllowedRange;
                return (
                  <span
                    key={word.location}
                    data-mushaf-no-swipe={markingMode ? '' : undefined}
                    data-mushaf-word-index={selectable ? index : undefined}
                    data-mushaf-highlight-index={index}
                    data-mushaf-line={lineIndex + 1}
                    data-location={word.location}
                    data-surah={surah}
                    data-ayah={ayah}
                    data-position={position}
                    onPointerDown={(event) => {
                      if (!markingMode || !selectable) return;
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      onSelectionStart?.(index);
                    }}
                    aria-disabled={!withinAllowedRange || undefined}
                    className={`relative z-10 px-[0.055em] transition-[background-color,box-shadow,opacity,filter] duration-150 ${selectable && markingMode ? 'cursor-crosshair touch-none' : ''} ${!withinAllowedRange ? 'pointer-events-none opacity-20 grayscale' : ''} ${wordTone(word)}`}
                    title={word.textQpcHafs}
                  >
                    {fontReady ? (word.codeV2 || word.textQpcHafs) : word.textQpcHafs}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        {pageAction || null}
      </article>
    </div>
  );
};

export default MadaniMushafPage;
