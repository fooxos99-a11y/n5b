import React from 'react';
import { getSummitJourneyBoardText } from '../../../shared/summit-journey-board.js';

export default function SummitJourneyBoard({ journey }) {
  return <div className="qassim-road-station" dir="rtl">
    <div className="qassim-road-station-board [font-family:var(--font-ui)]">
      <strong>{getSummitJourneyBoardText(journey)}</strong>
    </div>
  </div>;
}
