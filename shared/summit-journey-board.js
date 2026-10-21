export function getSummitJourneyBoardText(journey) {
  if (journey.activeStation) return `متوقف في محطة ${journey.activeStation.name}`;
  const points = Math.max(0, Number(journey.points) || 0);
  const config = journey.mapConfig || {};
  const city = [...(config.cities || [])]
    .filter(({ kilometer }) => Number(kilometer) > points)
    .sort((a, b) => a.kilometer - b.kilometer)[0];
  const target = city || (config.goal?.enabled ? config.goal : null);
  const remaining = Math.max(0, Number(target?.kilometer ?? journey.totalKilometers ?? 8000) - points);
  const name = city?.name || (config.goal?.enabled && remaining <= Number(config.goal.revealDistance || 0) ? config.goal.name : 'الوجهة التالية');
  return remaining === 0 ? 'وصلت' : `المتبقي إلى ${name}: ${remaining.toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })} كم`;
}
