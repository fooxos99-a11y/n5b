const isScored = (part) => part.score !== null && part.score !== undefined;

// A juz is graded once, however many separate memorized segments it contains.
function summarizeJuz(parts) {
  const scored = parts.filter(isScored);
  const evaluated = scored.length > 0;
  return {
    evaluated,
    score: evaluated ? scored.reduce((sum, part) => sum + Number(part.score), 0) / scored.length : null,
    warningCount: parts.reduce((sum, part) => sum + Number(part.warningCount || 0), 0),
    mistakeCount: parts.reduce((sum, part) => sum + Number(part.mistakeCount || 0), 0),
    evaluatorNames: [...new Set(parts.map((part) => part.evaluatorName).filter(Boolean))],
    pendingSync: parts.some((part) => part.pendingSync),
  };
}

export function groupNarrationParts(parts = []) {
  const groups = new Map();
  for (const part of parts) {
    const juzNumber = Number(part.juzNumber);
    if (!groups.has(juzNumber)) groups.set(juzNumber, { juzNumber, parts: [] });
    groups.get(juzNumber).parts.push(part);
  }
  return [...groups.values()].sort((a, b) => a.juzNumber - b.juzNumber).map((group) => {
    const sortedParts = [...group.parts].sort((a, b) => Number(a.startSurah) - Number(b.startSurah)
      || Number(a.startAyah) - Number(b.startAyah));
    return { ...group, parts: sortedParts, ...summarizeJuz(sortedParts) };
  });
}

export function narrationOverallScore(groups = []) {
  const evaluated = groups.filter((group) => group.evaluated);
  if (!evaluated.length) return null;
  return evaluated.reduce((sum, group) => sum + Number(group.score), 0) / evaluated.length;
}

export function narrationRangeLabel(part) {
  if (part.startSurahName && part.endSurahName) {
    return `من ${part.startSurahName} ${part.startAyah} إلى ${part.endSurahName} ${part.endAyah}`;
  }
  return part.rangeLabel || `الجزء ${part.juzNumber}`;
}
