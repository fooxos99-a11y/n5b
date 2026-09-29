const compareForwardPosition = (first, second) => {
  if (Number(first.page) !== Number(second.page)) return Number(first.page) - Number(second.page);
  if (Number(first.surah) !== Number(second.surah)) return Number(first.surah) - Number(second.surah);
  return Number(first.ayah) - Number(second.ayah);
};

export async function buildForwardQuranFaceRange({
  start,
  endLimit,
  targetFaces,
  getPageEnd,
  getNextPosition,
  getHalfPageEnd,
  getFractionalPageEnd,
}) {
  const requestedFaces = Math.max(0.25, Math.round(Math.max(0, Number(targetFaces || 1)) * 4) / 4);
  const wholeFaces = Math.floor(requestedFaces);
  const fractionalFace = Number((requestedFaces - wholeFaces).toFixed(2));
  let end = start;
  let cursor = start;
  const segments = [];

  ({ cursor, end } = await collectWholeQuranFaces(wholeFaces, cursor, getPageEnd, segments, end, endLimit, getNextPosition));

  if (fractionalFace > 0 && compareForwardPosition(end, endLimit) < 0) {
    const fractionalStart = wholeFaces > 0 ? cursor : start;
    if (fractionalStart) {
      const fractionalEnd = getFractionalPageEnd
        ? await getFractionalPageEnd(fractionalStart, fractionalFace)
        : await getHalfPageEnd(fractionalStart);
      if (!fractionalEnd) return { start, end, faces: requestedFaces, segments };
      end = compareForwardPosition(fractionalEnd, endLimit) > 0 ? endLimit : fractionalEnd;
      segments.push({ start: fractionalStart, end, faces: fractionalFace });
    }
  }

  return { start, end, faces: requestedFaces, segments };
}

/** Keep the starting boundary when no whole face can be traversed. */
async function collectWholeQuranFaces(wholeFaces, cursor, getPageEnd, segments, initialEnd, endLimit, getNextPosition) {
  let end = initialEnd;
  for (let face = 0;face < wholeFaces && cursor;face += 1) {
    const segmentEnd = await getPageEnd(cursor);
    segments.push({ start: cursor, end: segmentEnd, faces: 1 });
    end = segmentEnd;
    if (compareForwardPosition(end, endLimit) >= 0) break;
    cursor = await getNextPosition(end);
  }
  return { cursor, end };
}
