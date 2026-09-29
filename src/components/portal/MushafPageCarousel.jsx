import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import MushafPageControls from '@/components/portal/MushafPageControls';
import '@/components/portal/MushafPageCarousel.css';

const SWIPE_DISTANCE = 52;
const SWIPE_BLOCK_SELECTOR = 'button, input, textarea, [data-recitation-control], [data-mushaf-no-swipe]';

const MushafPageCarousel = ({ index, total, pageNumber, pageNumbers = [], isSaving, onFinish, onNextRandom, pageAction, onIndexChange, onInteractionCancel, previousPage, nextPage, children }) => {
  const pointer = useRef(null);
  const surface = useRef(null);
  const dragX = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const suppressClick = useRef(false);
  const previousPageNumber = useRef(Number(pageNumber));
  const currentPageNumber = Number(pageNumber);
  const _resolveTurnDirection = () => {
    if (currentPageNumber > previousPageNumber.current) {
      return 'forward';
    }
    if (currentPageNumber < previousPageNumber.current) {
      return 'backward';
    }
    return '';
  };
  const turnDirection = _resolveTurnDirection();

  useEffect(() => {
    previousPageNumber.current = currentPageNumber;
    dragX.set(0);
  }, [currentPageNumber, dragX]);

  const getPageIndex = (pageDirection) => {
    const currentPageNumber = Number(pageNumber);
    const candidates = pageNumbers
      .map((value, entryIndex) => ({ entryIndex, pageNumber: Number(value) }))
      .filter(({ pageNumber: candidatePage }) => (
        Number.isFinite(candidatePage)
        && (pageDirection < 0 ? candidatePage < currentPageNumber : candidatePage > currentPageNumber)
      ))
      .sort((first, second) => Math.abs(first.pageNumber - currentPageNumber) - Math.abs(second.pageNumber - currentPageNumber));
    return candidates[0]?.entryIndex ?? -1;
  };

  const moveTo = (nextIndex) => {
    const boundedIndex = Math.max(0, Math.min(total - 1, nextIndex));
    if (boundedIndex === index) return;
    onInteractionCancel?.();
    onIndexChange?.(boundedIndex);
  };

  const moveByPage = (pageDirection) => {
    const nextIndex = getPageIndex(pageDirection);
    if (nextIndex >= 0) moveTo(nextIndex);
  };

  useLayoutEffect(() => {
    const onKeyDown = (event) => {
      const topDialog = [...document.querySelectorAll('[role="dialog"]')].at(-1);
      if (event.defaultPrevented || (topDialog && !topDialog.contains(surface.current))
        || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') event.preventDefault();
      if (event.key === 'ArrowRight') moveByPage(1);
      if (event.key === 'ArrowLeft') moveByPage(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const startSwipe = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target.closest?.(SWIPE_BLOCK_SELECTOR)) return;
    dragX.stop();
    suppressClick.current = false;
    pointer.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: null,
    };
  };

  const moveSwipe = (event) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (current.horizontal === null && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
      current.horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    }
    if (current.horizontal) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      suppressClick.current = true;
      const canMove = getPageIndex(deltaX < 0 ? -1 : 1) >= 0;
      dragX.set(reduceMotion ? 0 : deltaX * (canMove ? 0.75 : 0.15));
    }
  };

  const endSwipe = (event) => {
    const current = pointer.current;
    if (!current || current.id !== event.pointerId) return;
    pointer.current = null;
    animate(dragX, 0, { duration: reduceMotion ? 0 : 0.22, ease: [0.22, 0.75, 0.3, 1] });
    if (!current.horizontal) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - current.startX;
    if (Math.abs(deltaX) >= SWIPE_DISTANCE) moveByPage(deltaX < 0 ? -1 : 1);
  };

  const pageControls = pageAction || (onFinish ? (
    <MushafPageControls pageNumber={pageNumber} isSaving={isSaving} onFinish={onFinish} onNextRandom={onNextRandom} />
  ) : null);
  const page = React.isValidElement(children)
    ? React.cloneElement(children, { pageAction: pageControls })
    : children;

  return (
    <div
      ref={surface}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden touch-pan-y"
      onPointerDownCapture={startSwipe}
      onPointerMoveCapture={moveSwipe}
      onPointerUpCapture={endSwipe}
      onPointerCancelCapture={() => { pointer.current = null; animate(dragX, 0, { duration: reduceMotion ? 0 : 0.22 }); }}
      onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
    >
      <motion.div style={{ x: dragX }} className="relative min-h-0 w-full flex-1 sm:px-14" data-mushaf-drag-surface>
        {nextPage && <div aria-hidden="true" inert="" className="pointer-events-none absolute inset-0 -translate-x-full">{nextPage}</div>}
        {previousPage && <div aria-hidden="true" inert="" className="pointer-events-none absolute inset-0 translate-x-full">{previousPage}</div>}
        <div
          key={currentPageNumber}
          className={`mushaf-page-turn absolute inset-0 h-full min-h-0 w-full ${turnDirection ? 'mushaf-page-turn--' + turnDirection : ''}`}
          data-page-turn-direction={turnDirection || undefined}
        >
          {page}
        </div>
      </motion.div>
    </div>
  );
};

export default MushafPageCarousel;
