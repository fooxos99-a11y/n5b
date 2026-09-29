import fs from 'node:fs/promises';
import path from 'node:path';
import { stdout } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'server', 'data', 'quranVerseLineLayout.js');
const layouts = new Map();

const fetchPage = async (page) => {
  const url = `https://api.quran.com/api/v4/verses/by_page/${page}?words=true&word_fields=verse_key,page_number,line_number&per_page=50`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await globalThis.fetch(url);
    if (response.ok) return response.json();
    if (attempt === 4) throw new Error(`Page ${page} failed with ${response.status}`);
    await delay(attempt * 500);
  }
  return null;
};

for (let start = 1; start <= 604; start += 8) {
  const pages = Array.from({ length: Math.min(8, 605 - start) }, (_, index) => start + index);
  const results = await Promise.all(pages.map(fetchPage));
  results.forEach((payload) => {
    (payload?.verses || []).forEach((verse) => {
      const key = String(verse.verse_key || '');
      const words = (verse.words || []).filter((word) => Number(word.page_number) && Number(word.line_number));
      if (!key || !words.length) return;
      const first = words[0];
      const last = words[words.length - 1];
      const current = layouts.get(key);
      const next = current || [key, Number(first.page_number), Number(first.line_number), Number(last.page_number), Number(last.line_number)];
      if (!current || Number(first.page_number) < next[1] || (Number(first.page_number) === next[1] && Number(first.line_number) < next[2])) {
        next[1] = Number(first.page_number);
        next[2] = Number(first.line_number);
      }
      if (!current || Number(last.page_number) > next[3] || (Number(last.page_number) === next[3] && Number(last.line_number) > next[4])) {
        next[3] = Number(last.page_number);
        next[4] = Number(last.line_number);
      }
      layouts.set(key, next);
    });
  });
}

const rows = Array.from(layouts.values()).sort((a, b) => {
  const [aSurah, aAyah] = a[0].split(':').map(Number);
  const [bSurah, bAyah] = b[0].split(':').map(Number);
  return aSurah - bSurah || aAyah - bAyah;
});
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  `// Generated from Quran Foundation's Madani Mushaf word layout.\nexport default ${JSON.stringify(rows)};\n`,
  'utf8'
);
stdout.write(`Generated ${rows.length} verse layouts at ${outputPath}\n`);
