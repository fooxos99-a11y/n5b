import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MysteryGoalMarker from '@/components/summit/MysteryGoalMarker';
import QassimMapArtwork from '@/components/summit/QassimMapArtwork';
import SummitMapControls from '@/components/summit/SummitMapControls';
import SummitStageSign from '@/components/summit/SummitStageSign';
import {
  QASSIM_MAP_SIZE,
  getQassimJourneyRouteOptions,
  getQassimRoadProgress,
  getQassimRoutePosition,
} from '@/components/summit/qassimMapData';

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const initialZoom = () => {
  if (typeof window === 'undefined') return 1;
  if (window.matchMedia('(min-width: 1024px)').matches) return 1.05;
  if (window.matchMedia('(max-width: 640px)').matches) return 0.72;
  return 0.86;
};

const QassimOverviewMap = ({ journey, onStageClick }) => {
  const viewportRef = useRef(null);
  const [zoom, setZoom] = useState(initialZoom);
  const [viewMode, setViewMode] = useState('focus');
  const routeOptions = useMemo(() => getQassimJourneyRouteOptions(journey), [journey]);
  const focusStagePoints = clamp(Number(journey.activeStation ? journey.points : journey?.nextStage?.points ?? routeOptions.totalKilometers), 0, routeOptions.totalKilometers);
  const traveler = getQassimRoutePosition(journey.points, routeOptions);
  const roadProgress = getQassimRoadProgress(journey.points, routeOptions);
  const activeMapStation = journey.mapConfig?.stations?.find(({ id }) => id === journey.mapConfig?.activeStationId);

  const focusPosition = useCallback((position, behavior = 'auto') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      left: clamp((position.x * zoom) - (viewport.clientWidth / 2), 0, viewport.scrollWidth - viewport.clientWidth),
      top: clamp((position.y * zoom) - (viewport.clientHeight / 2), 0, viewport.scrollHeight - viewport.clientHeight),
      behavior,
    });
  }, [zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (viewMode === 'overview') {
        viewport.scrollTo({
          left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2),
          top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2),
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
        return;
      }
      focusPosition(getQassimRoutePosition(focusStagePoints, routeOptions), reducedMotion ? 'auto' : 'smooth');
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [focusPosition, focusStagePoints, routeOptions, viewMode]);

  const changeZoom = (amount) => {
    setViewMode('focus');
    setZoom((current) => clamp(Number((current + amount).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  };

  const fitMap = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setViewMode('overview');
    setZoom(clamp(Math.min(
      Math.max(1, viewport.clientWidth - 16) / QASSIM_MAP_SIZE.width,
      Math.max(1, viewport.clientHeight - 16) / QASSIM_MAP_SIZE.height,
    ), MIN_ZOOM, 1));
  };

  return (
    <div className="summit-overview" aria-label="خريطة رحلة القصيم من الأعلى">
      <div ref={viewportRef} className="summit-map-viewport" dir="ltr">
        <div
          className="summit-map-canvas"
          style={{
            width: `${QASSIM_MAP_SIZE.width * zoom}px`,
            height: `${QASSIM_MAP_SIZE.height * zoom}px`,
          }}
        >
          <QassimMapArtwork points={journey.points} goalEnabled={journey.mapConfig?.goal?.enabled} goalVisible={roadProgress.goalVisible} cities={journey.mapConfig?.cities} stations={activeMapStation ? [activeMapStation] : []} routeOptions={routeOptions} />

          {journey.stages.filter((stage) => !stage.isGoal).map((stage, index) => (
            <SummitStageSign
              key={stage.key}
              index={index}
              stage={stage}
              position={getQassimRoutePosition(stage.points, routeOptions)}
              isNext={journey.nextStage?.points === stage.points}
              onClick={onStageClick}
            />
          ))}

          {journey.mapConfig?.goal?.enabled && roadProgress.goalVisible && (
            <MysteryGoalMarker
              position={getQassimRoutePosition(routeOptions.totalKilometers, routeOptions)}
              revealed={roadProgress.goalVisible}
              name={journey.mapConfig.goal.name}
            />
          )}
          <div
            className="summit-location-marker"
            style={{
              left: `${(traveler.x / QASSIM_MAP_SIZE.width) * 100}%`,
              top: `${(traveler.y / QASSIM_MAP_SIZE.height) * 100}%`,
            }}
            role="img"
            aria-label={`موقعك الحالي، قطعت ${roadProgress.distanceKm.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })} كم`}
          >
            <span>{roadProgress.distanceKm.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })} كم</span>
          </div>
        </div>
      </div>

      <SummitMapControls
        canZoomIn={zoom < MAX_ZOOM}
        canZoomOut={zoom > MIN_ZOOM}
        onZoomIn={() => changeZoom(ZOOM_STEP)}
        onZoomOut={() => changeZoom(-ZOOM_STEP)}
        onFit={fitMap}
      />
    </div>
  );
};

export default QassimOverviewMap;
