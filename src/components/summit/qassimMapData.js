export const QASSIM_MAP_SIZE = Object.freeze({ width: 920, height: 1120 });
export const QASSIM_TOTAL_DISTANCE_KM = 8000;
export const QASSIM_STAGE_DISTANCE_KM = 1000;
export const QASSIM_GOAL_REVEAL_AT_KM = 7000;

export const QASSIM_GOVERNORATES = Object.freeze([
  { key: 'buraidah', name: 'بريدة', x: 455, y: 1020, capital: true },
  { key: 'unaizah', name: 'عنيزة', x: 700, y: 900 },
  { key: 'mithnab', name: 'المذنب', x: 790, y: 720 },
  { key: 'rass', name: 'الرس', x: 500, y: 640 },
  { key: 'badai', name: 'البدائع', x: 260, y: 525 },
  { key: 'bukayriyah', name: 'البكيرية', x: 170, y: 350 },
  { key: 'uyun-al-jiwa', name: 'عيون الجواء', x: 455, y: 220 },
  { key: 'asyah', name: 'الأسياح', x: 745, y: 150 },
]);

export const QASSIM_ROUTE_POINTS = Object.freeze([
  { key: 'buraidah', x: 455, y: 1020, points: 0 },
  { key: 'unaizah', x: 700, y: 900, points: 1000 },
  { key: 'mithnab', x: 790, y: 720, points: 2000 },
  { key: 'rass', x: 500, y: 640, points: 3000 },
  { key: 'badai', x: 260, y: 525, points: 4000 },
  { key: 'bukayriyah', x: 170, y: 350, points: 5000 },
  { key: 'uyun-al-jiwa', x: 455, y: 220, points: 6000 },
  { key: 'asyah', x: 745, y: 150, points: 7000 },
  { key: 'mystery-goal', x: 855, y: 60, points: 8000 },
]);

export const QASSIM_JOURNEY_PATH = [
  'M 455 1020',
  'C 525 995 625 950 700 900',
  'C 748 850 784 785 790 720',
  'C 720 680 612 650 500 640',
  'C 410 610 325 568 260 525',
  'C 215 475 182 415 170 350',
  'C 245 302 350 248 455 220',
  'C 555 188 650 160 745 150',
  'C 792 126 830 95 855 60',
].join(' ');

export const QASSIM_ROADS = Object.freeze([
  { id: 'route-highway', d: QASSIM_JOURNEY_PATH, primary: true },
  { id: 'south-bypass', d: 'M 110 1040 C 300 980 520 960 820 900', primary: true },
  { id: 'central-ring', d: 'M 95 690 C 270 665 490 650 845 690', primary: true },
  { id: 'west-connector', d: 'M 165 1030 C 210 820 235 650 170 350' },
  { id: 'east-connector', d: 'M 825 1010 C 770 835 765 610 810 390 C 830 280 810 190 745 150' },
  { id: 'north-bypass', d: 'M 110 270 C 320 230 600 205 850 245' },
]);

export const QASSIM_FARMS = Object.freeze([
  { x: 535, y: 950, width: 92, height: 50, rotate: -8 },
  { x: 740, y: 815, width: 105, height: 58, rotate: 10 },
  { x: 585, y: 540, width: 96, height: 54, rotate: -12 },
  { x: 260, y: 635, width: 108, height: 58, rotate: 7 },
  { x: 245, y: 275, width: 90, height: 50, rotate: 14 },
  { x: 570, y: 160, width: 104, height: 56, rotate: -5 },
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeRouteOptions = (options = {}) => {
  const source = typeof options === 'number' ? { totalKilometers: options } : (options || {});
  const totalKilometers = Math.max(1, Number(source.totalKilometers) || QASSIM_TOTAL_DISTANCE_KM);
  const goalEnabled = source.goal?.enabled !== false;
  const revealDistance = Math.min(
    totalKilometers,
    Math.max(0, Number(source.goal?.revealDistance ?? 1000) || 0),
  );
  const configuredMilestones = Array.isArray(source.cities)
    ? source.cities.map(({ kilometer }) => clamp(Number(kilometer) || 0, 0, totalKilometers))
    : QASSIM_ROUTE_POINTS.map(({ points }) => (points / QASSIM_TOTAL_DISTANCE_KM) * totalKilometers);
  const milestones = [...new Set([
    0,
    ...configuredMilestones,
    totalKilometers,
  ])].sort((first, second) => first - second);
  return { totalKilometers, goalEnabled, revealDistance, milestones };
};

export const getQassimJourneyRouteOptions = (journey = {}) => ({
  totalKilometers: Math.max(1, Number(journey.totalKilometers) || QASSIM_TOTAL_DISTANCE_KM),
  cities: journey.mapConfig?.cities,
  goal: journey.mapConfig?.goal,
});

export const getQassimRoadProgress = (pointsValue, options) => {
  const route = normalizeRouteOptions(options);
  const normalizedPoints = clamp(Number(pointsValue) || 0, 0, route.totalKilometers);
  const distanceKm = normalizedPoints;
  const nextMilestoneIndex = route.milestones.findIndex((kilometer) => kilometer > distanceKm);
  const segmentIndex = nextMilestoneIndex === -1
    ? Math.max(0, route.milestones.length - 2)
    : Math.max(0, nextMilestoneIndex - 1);
  const fromKilometer = route.milestones[segmentIndex] ?? 0;
  const toKilometer = route.milestones[segmentIndex + 1] ?? route.totalKilometers;
  const segmentProgress = distanceKm >= route.totalKilometers
    ? 1
    : clamp((distanceKm - fromKilometer) / Math.max(1, toKilometer - fromKilometer), 0, 1);
  const goalRevealAt = Math.max(0, route.totalKilometers - route.revealDistance);
  const goalProximity = clamp(
    (distanceKm - goalRevealAt) / Math.max(1, route.revealDistance),
    0,
    1,
  );

  return {
    distanceKm,
    segmentIndex,
    segmentProgress,
    goalProximity,
    goalVisible: route.goalEnabled && distanceKm >= goalRevealAt,
  };
};

export const getQassimRoutePosition = (pointsValue, options) => {
  const { totalKilometers } = normalizeRouteOptions(options);
  const normalizedPoints = clamp(Number(pointsValue) || 0, 0, totalKilometers);
  const routeDistance = (normalizedPoints / totalKilometers) * QASSIM_TOTAL_DISTANCE_KM;
  if (routeDistance >= QASSIM_TOTAL_DISTANCE_KM) return QASSIM_ROUTE_POINTS.at(-1);
  const segment = Math.floor(routeDistance / QASSIM_STAGE_DISTANCE_KM);
  const ratio = (routeDistance - (segment * QASSIM_STAGE_DISTANCE_KM)) / QASSIM_STAGE_DISTANCE_KM;
  const from = QASSIM_ROUTE_POINTS[segment];
  const to = QASSIM_ROUTE_POINTS[segment + 1];
  return {
    x: from.x + ((to.x - from.x) * ratio),
    y: from.y + ((to.y - from.y) * ratio),
  };
};

export const getNearestQassimKilometer = (x, y, options) => {
  const { totalKilometers } = normalizeRouteOptions(options);
  let closest = { kilometer: 0, distance: Number.POSITIVE_INFINITY };
  const step = Math.max(1, Math.round(totalKilometers / 320));
  for (let kilometer = 0; kilometer < totalKilometers; kilometer += step) {
    const position = getQassimRoutePosition(kilometer, { totalKilometers });
    const distance = Math.hypot(position.x - x, position.y - y);
    if (distance < closest.distance) closest = { kilometer, distance };
  }
  return closest.kilometer;
};
