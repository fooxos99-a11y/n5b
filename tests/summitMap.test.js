import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSummitMapConfig, validateSummitMapConfig, getSummitActiveStation, getSummitMapTotalKilometers } from '../shared/summit-map.js';

test('map defaults preserve the reference cities and the 8000 kilometer destination without image or game settings', () => {
  const config = validateSummitMapConfig(normalizeSummitMapConfig());
  assert.deepEqual(config.cities.map(city => city.name), ['بريدة', 'عنيزة', 'المذنب', 'الرس', 'البدائع', 'البكيرية', 'عيون الجواء', 'الأسياح']);
  assert.equal(getSummitMapTotalKilometers(config), 8000);
  assert.equal(getSummitActiveStation(config), null);
  assert.doesNotMatch(JSON.stringify(config), /image|challenge|game|scene/i);
});

test('map validation rejects invalid distances, duplicate identities, unsafe text and omitted or unrelated settings', () => {
  const base = normalizeSummitMapConfig();
  for (const change of [
    config => { config.goal.kilometer = 0; },
    config => { config.goal.revealDistance = 8001; },
    config => { config.cities[1].id = config.cities[0].id; },
    config => { config.cities[1].kilometer = 8000; },
    config => { config.cities[0].name = '<script>'; },
    config => { config.cities[0].name = 'اسم\u202e'; },
    config => { config.cities[0].image = 'https://example.test/photo.jpg'; },
    config => { config.dailyChallenge = true; },
    config => { config.activeStationId = 'missing'; },
    config => { config.goal.enabled = 'true'; },
    config => { config.cities = new Array(25).fill(config.cities[0]); },
  ]) {
    const config = structuredClone(base); change(config);
    assert.throws(() => validateSummitMapConfig(config), { status: 422 });
  }
});

test('editing the destination clamps locations and reveal distance without moving the active station identity', () => {
  const config = normalizeSummitMapConfig({ ...normalizeSummitMapConfig(), goal: { enabled: true, name: 'الختام', kilometer: 500, revealDistance: 1000 },
    stations: [{ id: 'station-one', name: 'المحطة الأولى', kilometer: 400, rewardPoints: 75 }], activeStationId: 'station-one' });
  assert.equal(config.cities.at(-1).kilometer, 499);
  assert.equal(config.goal.revealDistance, 500);
  assert.equal(getSummitActiveStation(validateSummitMapConfig(config)).rewardPoints, 75);
});
