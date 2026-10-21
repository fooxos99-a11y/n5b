import React from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SummitMapControls = ({ canZoomIn, canZoomOut, onFit, onZoomIn, onZoomOut }) => (
  <div className="summit-map-controls" aria-label="أدوات الخريطة">
    <Button type="button" variant="ghost" size="icon" onClick={onZoomIn} disabled={!canZoomIn} aria-label="تكبير الخريطة">
      <Plus aria-hidden="true" />
    </Button>
    <Button type="button" variant="ghost" size="icon" onClick={onZoomOut} disabled={!canZoomOut} aria-label="تصغير الخريطة">
      <Minus aria-hidden="true" />
    </Button>
    <Button type="button" variant="ghost" size="icon" onClick={onFit} aria-label="عرض خريطة القصيم كاملة">
      <LocateFixed aria-hidden="true" />
    </Button>
  </div>
);

export default SummitMapControls;
