export function getMushafPagePresentation(page) {
  const words = page?.words || [];
  const display = page?.displayLayout?.words || {};
  const hasV1 = words.length > 0 && words.every((word) => Boolean(display[word.location]?.codeV1));
  // Keep saved word locations and task page boundaries valid when the editions
  // put a boundary word on different pages. The calligraphy still uses V1.
  const useV1Lines = hasV1 && words.every((word) => Number(display[word.location].pageV1) === Number(page.page));
  const lineOf = (word) => useV1Lines ? Number(display[word.location].lineV1) : Number(word.line);
  const decorations = useV1Lines ? [] : (page?.decorations || []);
  if (useV1Lines) {
    const seenSurahs = new Set();
    for (const word of words) {
      const [surah, ayah] = word.verseKey.split(':').map(Number);
      if (ayah !== 1 || seenSurahs.has(surah)) continue;
      seenSurahs.add(surah);
      const firstLine = lineOf(word);
      const separateBismillah = surah !== 1 && surah !== 9;
      const headerLine = firstLine - (separateBismillah ? 2 : 1);
      const name = page.decorations?.find((item) => item.type === 'surah' && Number(item.surah) === surah)?.name;
      if (headerLine >= 0) decorations.push({ line: headerLine, type: 'surah', surah, name });
      if (separateBismillah && firstLine > 1) decorations.push({ line: firstLine - 1, type: 'bismillah', surah });
    }
  }
  return { hasV1, useV1Lines, display, lineOf, decorations };
}
