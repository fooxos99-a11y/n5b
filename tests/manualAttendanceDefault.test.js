import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('opening evaluation cannot auto attend students', () => {
  const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /AutomaticAttendance/);
  const config = readFileSync(new URL('../server/siteConfig.js', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /AutomaticAttendance/);
  const sessions = readFileSync(new URL('../src/components/portal/home/StudentSessionWeek.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sessions, /تقييم اليوم شمل مهام/);
});
