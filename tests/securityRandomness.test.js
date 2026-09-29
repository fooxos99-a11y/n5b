import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { generateThreeDigitLoginNumber } from '../server/services/loginNumbers.js';

test('login number generation covers 200 students and handles an exhausted range', () => {
  const used = new Set();
  for (let index = 0; index < 900; index += 1) {
    const value = generateThreeDigitLoginNumber(used);
    assert.match(value, /^[1-9]\d{2}$/);
    assert.equal(used.size, index + 1);
  }
  assert.equal(generateThreeDigitLoginNumber(used), '');
  used.delete('500');
  assert.equal(generateThreeDigitLoginNumber(used), '500');
});

test('reported server random sources use cryptographic randomness', async () => {
  const [server, login] = await Promise.all([
    '../server/index.js', '../server/services/loginNumbers.js',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  assert.match(server, /return crypto\.randomInt\(6000, 10001\)/);
  for (const source of [server, login]) assert.doesNotMatch(source, /Math\.random\(/);
});
