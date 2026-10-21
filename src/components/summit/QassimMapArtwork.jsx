import React from 'react';
import SummitMapStationLandmarks from '@/components/summit/SummitMapStationLandmarks';
import {
  QASSIM_FARMS,
  QASSIM_GOVERNORATES,
  QASSIM_JOURNEY_PATH,
  QASSIM_MAP_SIZE,
  QASSIM_ROADS,
  getQassimRoutePosition,
} from '@/components/summit/qassimMapData';

const QassimMapArtwork = ({ points, goalEnabled = true, goalVisible, cities = QASSIM_GOVERNORATES, stations = [], routeOptions }) => {
  const totalKilometers = Math.max(1, Number(routeOptions?.totalKilometers) || 8000);
  const completedLength = (Math.min(totalKilometers, Math.max(0, Number(points) || 0)) / totalKilometers) * 8000;

  return (
    <svg
      className="qassim-map-artwork"
      viewBox={`0 0 ${QASSIM_MAP_SIZE.width} ${QASSIM_MAP_SIZE.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="qassim-sand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3f1e7" />
          <stop offset=".52" stopColor="#ebe9dc" />
          <stop offset="1" stopColor="#e2dfcf" />
        </linearGradient>
        <pattern id="qassim-buildings" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <rect width="18" height="18" fill="#e9e4d8" />
          <rect x="2" y="2" width="6" height="5" rx="1" fill="#d2c9b8" />
          <rect x="11" y="8" width="5" height="7" rx="1" fill="#d9d0c0" />
        </pattern>
        <pattern id="qassim-farms" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#b8c79f" />
          <path d="M 0 4 H 16 M 0 12 H 16" stroke="#dae2c7" strokeWidth="2" opacity=".8" />
        </pattern>
        <filter id="qassim-route-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#18324a" floodOpacity=".32" />
        </filter>
      </defs>

      <rect width={QASSIM_MAP_SIZE.width} height={QASSIM_MAP_SIZE.height} fill="url(#qassim-sand)" />
      <path
        className="qassim-region-boundary"
        d="M 760 34 C 860 95 895 205 856 318 C 910 430 882 568 828 668 C 885 790 820 925 700 982 C 615 1088 458 1125 295 1094 C 138 1075 52 968 82 824 C 20 690 68 545 142 452 C 100 320 150 195 274 142 C 350 52 500 18 620 54 C 665 25 716 18 760 34 Z"
      />

      {QASSIM_FARMS.map((farm) => (
        <rect
          key={`${farm.x}-${farm.y}`}
          x={farm.x}
          y={farm.y}
          width={farm.width}
          height={farm.height}
          rx="9"
          fill="url(#qassim-farms)"
          opacity=".78"
          transform={`rotate(${farm.rotate} ${farm.x + (farm.width / 2)} ${farm.y + (farm.height / 2)})`}
        />
      ))}

      <g className="qassim-road-network">
        {QASSIM_ROADS.map((road) => (
          <React.Fragment key={road.id}>
            <path className={road.primary ? 'qassim-road-edge is-primary' : 'qassim-road-edge'} d={road.d} />
            <path className={road.primary ? 'qassim-road is-primary' : 'qassim-road'} d={road.d} />
          </React.Fragment>
        ))}
      </g>

      <g className="qassim-route" filter="url(#qassim-route-shadow)">
        <path className="qassim-route-casing" d={QASSIM_JOURNEY_PATH} />
        <path className="qassim-route-future" d={QASSIM_JOURNEY_PATH} pathLength="8000" />
        <path
          className="qassim-route-progress-casing"
          d={QASSIM_JOURNEY_PATH}
          pathLength="8000"
          strokeDasharray={`${completedLength} 8000`}
        />
        <path
          className="qassim-route-progress"
          d={QASSIM_JOURNEY_PATH}
          pathLength="8000"
          strokeDasharray={`${completedLength} 8000`}
        />
      </g>

      <SummitMapStationLandmarks stations={stations} routeOptions={routeOptions} />

      {goalEnabled && !goalVisible && <ellipse className="qassim-map-goal-fog" cx="855" cy="60" rx="96" ry="106" />}

      <g className="qassim-governorates">
        {cities.map((place, index) => {
          const position = Number.isFinite(Number(place.kilometer))
            ? getQassimRoutePosition(place.kilometer, routeOptions)
            : QASSIM_GOVERNORATES.find((item) => item.key === place.key) || QASSIM_GOVERNORATES[index];
          const capital = Number(place.kilometer) === 0;
          return (
          <g key={place.id || place.key} transform={`translate(${position.x} ${position.y})`}>
            <circle className={capital ? 'qassim-city-area is-capital' : 'qassim-city-area'} r={capital ? 36 : 27} />
            <circle className="qassim-city-center" r={capital ? 7 : 5} />
            <text className="qassim-city-label" y={capital ? -48 : -37} textAnchor="middle">{place.name}</text>
          </g>
          );
        })}
      </g>
    </svg>
  );
};

export default QassimMapArtwork;
