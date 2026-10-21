import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Flag, MapPin, Plus, Trash2 } from 'lucide-react';
import SummitMapEventFields from '@/components/dashboard/SummitMapEventFields';
import StudentPointsDialog from '@/components/dashboard/StudentPointsDialog';
import { summitApi } from '@/services/summitApi';
import SummitMapTextInput from '@/components/dashboard/SummitMapTextInput';
import SummitJourneyMap from '@/components/summit/SummitJourneyMap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleSwitch } from '@/components/ui/setting-toggle';
import {
  SUMMIT_MAX_CONFIGURABLE_KILOMETERS,
  getSummitMapEventLocations,
  getSummitMapTotalKilometers,
  normalizeSummitMapConfig,
} from '../../../shared/summit-map.js';
import '@/components/summit/SummitJourneyMap.css';
import { secureRandomId as createId } from '../../../shared/secure-random.js';

const clampKilometer = (value, maximum = SUMMIT_MAX_CONFIGURABLE_KILOMETERS) => Math.min(maximum, Math.max(0, Math.trunc(Number(value) || 0)));
const clampReward = (value) => Math.min(10000, Math.max(0, Math.trunc(Number(value) || 0)));
const optionLabel = (entity) => `${entity.name || entity.text || 'بدون اسم'} — ${Number(entity.kilometer).toLocaleString('ar-SA-u-nu-latn')} كم`;

const EntityPicker = ({ label, icon: Icon, entities, selectedId, onSelect, onAdd, onDelete, children }) => (
  <div className="space-y-3 rounded-2xl border border-primary/15 bg-background/70 p-4 [font-family:var(--font-ui)]">
    <div className="flex items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 font-black"><Icon className="h-4 w-4" aria-hidden="true" />{label}</h4>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onAdd}><Plus className="h-4 w-4" aria-hidden="true" />إضافة</Button>
    </div>
    {entities.length ? <>
      <div className="flex items-center gap-2">
        <Select value={selectedId} onValueChange={onSelect}><SelectTrigger className="min-h-11 flex-1"><SelectValue /></SelectTrigger><SelectContent>{entities.map((entity) => <SelectItem key={entity.id} value={entity.id}>{optionLabel(entity)}</SelectItem>)}</SelectContent></Select>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-destructive" onClick={onDelete} aria-label={`حذف من ${label}`}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {children}
    </> : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">لا توجد عناصر.</p>}
  </div>
);

const SummitMapEditor = ({ value, onChange, pointsDisabled = false }) => {
  const config = useMemo(() => normalizeSummitMapConfig(value), [value]);
  const [selectedCityId, setSelectedCityId] = useState(config.cities[0]?.id || '');
  const [selectedStationId, setSelectedStationId] = useState(config.stations[0]?.id || '');
  const [previewKilometer, setPreviewKilometer] = useState(0);
  const [grading, setGrading] = useState(null);
  const totalKilometers = getSummitMapTotalKilometers(config);
  const entityMaximumKilometer = config.goal.enabled
    ? Math.max(0, config.goal.kilometer - 1)
    : SUMMIT_MAX_CONFIGURABLE_KILOMETERS;

  useEffect(() => {
    if (!config.cities.some(({ id }) => id === selectedCityId)) setSelectedCityId(config.cities[0]?.id || '');
    if (!config.stations.some(({ id }) => id === selectedStationId)) setSelectedStationId(config.stations[0]?.id || '');
  }, [config, selectedCityId, selectedStationId]);

  useEffect(() => {
    setPreviewKilometer((current) => Math.min(current, totalKilometers));
  }, [totalKilometers]);

  const update = (patch) => onChange(normalizeSummitMapConfig({ ...config, ...patch }));
  const updateEntity = (collection, id, patch) => update({
    [collection]: config[collection].map((entity) => entity.id === id ? {
      ...entity,
      ...patch,
      ...(patch.kilometer !== undefined ? { kilometer: clampKilometer(patch.kilometer, entityMaximumKilometer) } : {}),
      ...(patch.rewardPoints !== undefined ? { rewardPoints: clampReward(patch.rewardPoints) } : {}),
    } : entity),
  });
  const deleteEntity = (collection, id) => update({ [collection]: config[collection].filter((entity) => entity.id !== id) });

  const addCity = () => {
    const id = createId('city');
    update({ cities: [...config.cities, { id, key: id, name: 'مدينة جديدة', kilometer: previewKilometer, notificationEnabled: false, notificationText: 'وصلت إلى المدينة', rewardPoints: 50 }] });
    setSelectedCityId(id);
  };
  const addStation = () => {
    const occupied = new Set(config.stations.map(({ kilometer }) => kilometer));
    let kilometer = previewKilometer;
    while (occupied.has(kilometer) && kilometer < entityMaximumKilometer) kilometer += 1;
    const id = createId('station');
    update({ stations: [...config.stations, { id, name: 'محطة جديدة', kilometer, notificationEnabled: false, notificationText: 'وصلت إلى المحطة', rewardPoints: 50 }] });
    setSelectedStationId(id);
  };

  const eventLocations = getSummitMapEventLocations(config);
  const previewJourney = {
    points: previewKilometer,
    totalKilometers,
    mapConfig: config,
    activeStation: config.stations.find(({ id }) => id === config.activeStationId) || null,
    stages: eventLocations.map((location) => ({ ...location, key: location.id, points: location.kilometer, unlocked: previewKilometer >= location.kilometer, completed: false })),
    nextStage: eventLocations.find((location) => location.kilometer > previewKilometer),
    reachedSummit: config.goal.enabled && previewKilometer >= totalKilometers,
  };
  const selectedCity = config.cities.find(({ id }) => id === selectedCityId);
  const selectedStation = config.stations.find(({ id }) => id === selectedStationId);

  return <div className="space-y-5 [font-family:var(--font-ui)]" dir="rtl">
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-[#e9e7da]">
      <div className="relative h-[32rem] max-h-[70dvh] overflow-hidden sm:h-[38rem]"><SummitJourneyMap embedded journey={previewJourney} onStageClick={() => {}} /></div>
      <div className="flex items-center gap-3 border-t border-primary/15 bg-card p-3"><Label htmlFor="summit-preview-km" className="shrink-0">معاينة عند</Label><Input id="summit-preview-km" type="number" min="0" max={totalKilometers} value={previewKilometer} onChange={(event) => setPreviewKilometer(clampKilometer(event.target.value, totalKilometers))} /><span className="shrink-0 text-sm font-bold text-muted-foreground">كم</span></div>
    </div>

    <div className="space-y-4 rounded-2xl border border-primary/15 bg-background/70 p-4 [font-family:var(--font-ui)]">
      <div className="flex min-h-12 items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-black"><Flag className="h-4 w-4" aria-hidden="true" />الوجهة النهائية</h4>
        <ToggleSwitch ariaLabel="إظهار الوجهة النهائية" checked={config.goal.enabled} onCheckedChange={(enabled) => update({ goal: { ...config.goal, enabled } })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="summit-goal-name">اسم الوجهة</Label><SummitMapTextInput id="summit-goal-name" value={config.goal.name} maxLength={60} disabled={!config.goal.enabled} onCommit={(name) => update({ goal: { ...config.goal, name } })} /></div>
        <div className="space-y-1.5"><Label htmlFor="summit-goal-km">كيلومتر الوصول</Label><Input id="summit-goal-km" type="number" min="1" max={SUMMIT_MAX_CONFIGURABLE_KILOMETERS} value={config.goal.kilometer} onChange={(event) => update({ goal: { ...config.goal, kilometer: event.target.value } })} /></div>
        <div className="space-y-1.5"><Label htmlFor="summit-goal-reveal">كشف الاسم قبل الوصول بـ</Label><Input id="summit-goal-reveal" type="number" min="0" max={config.goal.kilometer} value={config.goal.revealDistance} disabled={!config.goal.enabled} onChange={(event) => update({ goal: { ...config.goal, revealDistance: event.target.value } })} /></div>
      </div>
    </div>

    <EntityPicker label="المدن" icon={Building2} entities={config.cities} selectedId={selectedCityId} onSelect={setSelectedCityId} onAdd={addCity} onDelete={() => deleteEntity('cities', selectedCityId)}>
      {selectedCity && <SummitMapEventFields entity={selectedCity} idPrefix={`city-${selectedCity.id}`} maximumKilometer={entityMaximumKilometer} onChange={(patch) => updateEntity('cities', selectedCity.id, patch)} />}
    </EntityPicker>

    <EntityPicker label="المحطات" icon={MapPin} entities={config.stations} selectedId={selectedStationId} onSelect={setSelectedStationId} onAdd={addStation} onDelete={() => deleteEntity('stations', selectedStationId)}>
      {selectedStation && <SummitMapEventFields
        isStation
        entity={selectedStation}
        idPrefix={`station-${selectedStation.id}`}
        maximumKilometer={entityMaximumKilometer}
        active={config.activeStationId === selectedStation.id}
        pointsDisabled={pointsDisabled}
        onRecordPoints={() => setGrading({ id: selectedStation.id, title: selectedStation.name, pointsReward: selectedStation.rewardPoints })}
        onActiveChange={(active) => update({ activeStationId: active ? selectedStation.id : null })}
        onChange={(patch) => updateEntity('stations', selectedStation.id, patch)}
      />}
    </EntityPicker>

    <StudentPointsDialog program={grading} onClose={() => setGrading(null)} loadGrades={summitApi.getStationGrades} saveGrades={summitApi.saveStationGrades} />

  </div>;
};

export default SummitMapEditor;
