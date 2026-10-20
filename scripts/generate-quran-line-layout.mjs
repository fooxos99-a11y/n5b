import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readPackagedQuranReference } from '../server/services/packagedQuranReference.js';

export async function generateQuranReference() {
  const { reference, layout } = await readPackagedQuranReference();
  await writeFile(new URL('../server/data/quran-pages.json', import.meta.url), `${JSON.stringify(reference)}\n`);
  await writeFile(new URL('../server/data/quranVerseLineLayout.js', import.meta.url),
    `// Generated from the same packaged word pages displayed by the Mushaf.\nexport default ${JSON.stringify(layout)};\n`);
  return { pages: 604, verses: layout.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await generateQuranReference())}\n`);
}
