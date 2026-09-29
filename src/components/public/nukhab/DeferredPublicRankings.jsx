import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import LoadingSpinner from '@/components/ui/loading-spinner';

const NukhabPublicRankings = lazy(() => import('@/components/public/nukhab/NukhabPublicRankings'));

const rankingsPlaceholder = (
  <section
    id="public-rankings"
    className="grid min-h-72 place-items-center border-b border-border bg-secondary/25 [font-family:var(--font-ui)]"
    aria-label="تحميل لوحة التميز"
    dir="rtl"
  >
    <LoadingSpinner />
  </section>
);

const DeferredPublicRankings = () => {
  const placeholderRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const target = placeholderRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setReady(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setReady(true);
      observer.disconnect();
    }, { rootMargin: '600px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  if (ready) {
    return <Suspense fallback={rankingsPlaceholder}><NukhabPublicRankings /></Suspense>;
  }
  return <div ref={placeholderRef}>{rankingsPlaceholder}</div>;
};

export default DeferredPublicRankings;
