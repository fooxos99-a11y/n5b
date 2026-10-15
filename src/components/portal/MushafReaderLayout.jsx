import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getOfflineMushafIndex } from '@/services/offlineMushaf';
import './mushaf-reader.css';

const ReaderContext = createContext(null);
export const useMushafReader = () => useContext(ReaderContext);

export default function MushafReaderLayout({ theme = 'light', toolbar, children, label, className = '', index: providedIndex }) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const toolbarId = useId();
  const [loadedIndex, setLoadedIndex] = useState(null);
  const [indexError, setIndexError] = useState('');
  const toggleControls = useCallback(() => setControlsVisible((visible) => !visible), []);
  useEffect(() => {
    if (providedIndex) return undefined;
    let active = true;
    getOfflineMushafIndex().then((index) => {
      if (active) setLoadedIndex(index);
    }).catch((error) => {
      if (active) setIndexError(error.message);
    });
    return () => { active = false; };
  }, [providedIndex]);
  const context = useMemo(() => ({
    controlsVisible,
    toggleControls,
    index: providedIndex || loadedIndex,
  }), [controlsVisible, toggleControls, providedIndex, loadedIndex]);

  return (
    <ReaderContext.Provider value={context}>
      <section className={`mushaf-reader ${className}`} aria-label={label} data-reader-theme={theme} dir="rtl">
        <Button type="button" variant="ghost" className="mushaf-reader-keyboard-control" aria-expanded={controlsVisible}
          aria-controls={toolbarId} onClick={toggleControls}>
          {controlsVisible ? 'إخفاء أدوات المصحف' : 'إظهار أدوات المصحف'}
        </Button>
        <div id={toolbarId} className="mushaf-reader-toolbar-layer" data-visible={controlsVisible}
          aria-hidden={!controlsVisible} inert={controlsVisible ? undefined : ''}>
          {toolbar}
        </div>
        <div className="mushaf-reader-pages">{children}</div>
        {indexError && <span className="sr-only" role="status">{indexError}</span>}
      </section>
    </ReaderContext.Provider>
  );
}
