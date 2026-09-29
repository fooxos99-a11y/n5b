import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('narration day uses header actions and compact completed student cards', async () => {
  const [section, studentPanel, server] = await Promise.all([
    readFile(new URL('../src/components/dashboard/NarrationDaySection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/NarrationStudentPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(section, /<DashboardMobileHeaderActions>/);
  assert.match(section, /aria-label="فتح يوم سرد"/);
  assert.match(section, /aria-label="إنهاء يوم السرد"/);
  assert.match(section, /aria-label="أرشيف أيام السرد"/);
  assert.doesNotMatch(section, /<CardHeader/);
  assert.match(studentPanel, /if \(student\.status === 'completed'\) \{\s*return 'تم الانتهاء';/);
  assert.match(studentPanel, /bg-emerald-600/);
  assert.match(await readFile(new URL('../src/lib/narrationParts.js', import.meta.url), 'utf8'), /part\.rangeLabel \|\| `الجزء \$\{part\.juzNumber\}`/);
  assert.doesNotMatch(studentPanel, /صفحة \{part\.startPage\}|تم تقييم \{evaluatedParts\.length\}/);
  assert.match(studentPanel, /أسماء المسمعين/);
  assert.match(studentPanel, /evaluatorNames\.map/);
  assert.match(server, /sp\.name\) AS evaluatorName/);
  assert.match(server, /evaluated_by = \?/);
});
