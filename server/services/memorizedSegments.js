// Keep gaps and surah boundaries visible; a partial juz must never look fully saved.
export function memorizedSegments(ayahs, isMemorized) {
  const segments = [];
  let current = null;
  for (const item of ayahs) {
    if (!isMemorized(item)) { current = null; continue; }
    if (current?.toSurah !== Number(item.surah) || current.toAyah + 1 !== Number(item.ayah)) {
      current = {
        fromPage: Number(item.page), toPage: Number(item.page),
        fromSurah: Number(item.surah), toSurah: Number(item.surah),
        fromAyah: Number(item.ayah), toAyah: Number(item.ayah),
        fromSurahName: item.surahName, toSurahName: item.surahName,
      };
      segments.push(current);
    } else { current.toAyah = Number(item.ayah); current.toPage = Number(item.page); }
  }
  return segments;
}
