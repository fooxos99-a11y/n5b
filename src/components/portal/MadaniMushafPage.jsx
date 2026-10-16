import React, { useLayoutEffect, useMemo, useRef } from 'react';
import MushafLineDecoration from '@/components/portal/MushafLineDecoration';
import MushafPageHeader from '@/components/portal/MushafPageHeader';
import MushafHighlightLayer from '@/components/portal/MushafHighlightLayer';
import { useMushafReader } from '@/components/portal/MushafReaderLayout';
import { formatMushafNumber, getMushafPageMetadata } from '@/lib/mushafPageMetadata';
import { getMushafPagePresentation } from '@/lib/mushafPagePresentation';
import './mushaf-reader.css';

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
  const presentation = useMemo(() => getMushafPagePresentation(page), [page]);
  const textRef = useRef(null);
  const reader = useMushafReader();
  const metadata = getMushafPageMetadata(page, reader?.index, surahName);
  const decorationsByLine = useMemo(() => new Map(
    presentation.decorations.map((decoration) => [Number(decoration.line), decoration])
  ), [presentation]);
  const topSurahDecoration = useMemo(() => (
    presentation.decorations.find((decoration) => decoration.type === 'surah' && Number(decoration.line) === 0)
  ), [presentation]);
  const lineShift = useMemo(() => {
    if (![1, 2].includes(Number(page?.page))) return 0;
    const occupiedLines = [
      ...words.map(presentation.lineOf),
      ...presentation.decorations.filter((decoration) => decoration.type !== 'surah').map((decoration) => Number(decoration.line)),
    ].filter((line) => line >= 1 && line <= 15);
    if (!occupiedLines.length) return 0;
    const firstLine = Math.min(...occupiedLines);
    const lastLine = Math.max(...occupiedLines);
    const targetFirstLine = Math.floor((15 - (lastLine - firstLine + 1)) / 2) + 1;
    return targetFirstLine - firstLine;
  }, [page?.page, presentation, words]);
  const lines = useMemo(() => Array.from({ length: 15 }, (_, index) => (
    words.filter((word) => presentation.lineOf(word) === index + 1 - lineShift)
  )), [lineShift, presentation, words]);
  const fontFamily = presentation.hasV1 ? `QCF-V1-P${page?.page}` : `QCF-P${page?.page}`;
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return undefined;
    const fitLines = () => {
      element.style.setProperty('--mushaf-line-scale', '1');
      const lineElements = [...element.querySelectorAll('.mushaf-line')];
      const scale = lineElements.reduce((smallest, line) => {
        const width = [...line.querySelectorAll('.mushaf-word')].reduce((sum, word) => sum + word.getBoundingClientRect().width, 0);
        const gap = Number.parseFloat(getComputedStyle(line).columnGap) || 0;
        const totalWidth = width + Math.max(0, line.querySelectorAll('.mushaf-word').length - 1) * gap;
        return totalWidth > 0 ? Math.min(smallest, (line.clientWidth - 1) / totalWidth) : smallest;
      }, 1);
      element.style.setProperty('--mushaf-line-scale', String(Math.max(.1, scale)));
    };
    fitLines();
    const observer = new ResizeObserver(fitLines);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fontReady, fontFamily, lines]);
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
        className={`mushaf-page mx-auto flex-none select-none ${markingMode ? 'touch-none' : 'touch-pan-y'}`}
        data-reader-theme={theme}
        dir="rtl"
        onPointerMove={moveSelection}
        onPointerUp={() => markingMode && onSelectionEnd?.()}
        onPointerCancel={() => markingMode && onSelectionEnd?.()}
        translate="no"
      >
        <header className="mushaf-page-meta">
          <div className="mushaf-page-meta-parts">
            <span>جزء {formatMushafNumber(metadata.juz)}</span>
            <span className="mushaf-hizb-marker">
              <svg viewBox="0 0 20 20" aria-hidden><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" /><path d="M10 1.5v8.5h8.5A8.5 8.5 0 0 0 10 1.5Z" fill="currentColor" /></svg>
              حزب {formatMushafNumber(metadata.hizb)}
            </span>
          </div>
          <span>{metadata.surahName}</span>
        </header>
        {topSurahDecoration && (
          <MushafPageHeader
            surahNumber={topSurahDecoration.surah}
            surahName={topSurahDecoration.name || surahName}
            theme={theme}
          />
        )}
        <div ref={textRef} className="mushaf-text">
          <MushafHighlightLayer containerRef={textRef} ranges={highlightRanges} fontReady={fontReady} />
          {lines.map((lineWords, lineIndex) => (
            <div
              key={`${page?.page}-${lineIndex + 1}`}
              className="mushaf-line"
              style={{
                fontFamily,
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
                    className={`mushaf-word relative z-10 transition-[background-color,box-shadow,opacity,filter] duration-150 ${selectable && markingMode ? 'cursor-crosshair touch-none' : ''} ${!withinAllowedRange ? 'pointer-events-none opacity-20 grayscale' : ''} ${wordTone(word)}`}
                    title={word.textQpcHafs}
                    style={presentation.hasV1 ? { fontFamily: `QCF-V1-P${presentation.display[word.location].pageV1}` } : undefined}
                  >
                    {fontReady ? (presentation.hasV1 ? presentation.display[word.location].codeV1 : (word.codeV2 || word.textQpcHafs)) : word.textQpcHafs}
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
