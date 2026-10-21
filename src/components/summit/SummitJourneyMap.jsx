import React from 'react';
import QassimOverviewMap from './QassimOverviewMap';
import SummitJourneyBoard from './SummitJourneyBoard';
import { getQassimRoadProgress, getQassimJourneyRouteOptions } from './qassimMapData';
import './SummitJourneyMap.css';
export default function SummitJourneyMap({ journey, onStageClick, embedded = false }) {
  const progress = getQassimRoadProgress(journey.points, getQassimJourneyRouteOptions(journey));
  return <section className={`summit-map-shell relative isolate w-full overflow-hidden [font-family:var(--font-ui)] ${embedded ? 'is-embedded h-full' : 'h-full'}`}
    aria-label={`رحلة القصيم، قطعت ${Math.round(progress.distanceKm).toLocaleString('ar-SA-u-nu-latn')} من ${journey.totalKilometers.toLocaleString('ar-SA-u-nu-latn')} كيلومتر`}>
    {!embedded && journey.activeStation && <SummitJourneyBoard journey={journey} />}
    <QassimOverviewMap journey={journey} onStageClick={onStageClick} />
  </section>;
}
