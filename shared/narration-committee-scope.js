/** Convert 'all' within a complex to its explicit circles before creating an event. */
export function narrationCommitteeIds({ complexId = 'all', committeeIds = [] }, committees) {
  const scoped = committees.filter(committee => complexId === 'all' || String(committee.complexId) === String(complexId));
  if (committeeIds.includes('all')) return complexId === 'all' ? ['all'] : scoped.map(committee => String(committee.id));
  const allowed = new Set(scoped.map(committee => String(committee.id)));
  return [...new Set(committeeIds.map(String))].filter(id => allowed.has(id));
}
