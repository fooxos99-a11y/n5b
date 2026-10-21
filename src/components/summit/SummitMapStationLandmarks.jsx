import React from 'react';
import { getQassimRoutePosition } from '@/components/summit/qassimMapData';

const SummitMapStationLandmarks = ({ stations = [], routeOptions }) => (
  <g className="qassim-map-stations">
    {stations.map((station) => {
      const position = getQassimRoutePosition(station.kilometer, routeOptions);
      return (
        <g key={station.id} className="qassim-map-station" transform={`translate(${position.x} ${position.y})`}>
          <path className="qassim-map-station-shadow" d="M -34 20 L 0 38 L 34 20 L 0 3 Z" />
          <path className="qassim-map-station-building" d="M -27 18 V -15 L 0 -29 L 27 -15 V 18 L 0 31 Z" />
          <path className="qassim-map-station-roof" d="M -32 -13 L 0 -34 L 32 -13 L 27 -7 L 0 -25 L -27 -7 Z" />
          <rect className="qassim-map-station-door" x="-7" y="-3" width="14" height="25" rx="2" />
          <path className="qassim-map-station-stripe" d="M -27 -2 H 27 V 7 H -27 Z" />
          <text className="qassim-map-station-label" y="-45" textAnchor="middle">{station.name}</text>
          <text className="qassim-map-station-distance" y="49" textAnchor="middle">
            {Number(station.kilometer).toLocaleString('ar-SA-u-nu-latn')} كم
          </text>
        </g>
      );
    })}
  </g>
);

export default SummitMapStationLandmarks;
