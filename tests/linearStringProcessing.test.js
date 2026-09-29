import assert from 'node:assert/strict';
import test from 'node:test';
import { countTrailingCharacter, trimTrailingCharacter } from '../shared/string-suffix.js';
import { inspectSource } from '../scripts/check-agent-compliance.mjs';

test('suffix scans preserve URL and Base64 behavior, including long near matches', () => {
  assert.equal(trimTrailingCharacter('https://example.test/path///', '/'), 'https://example.test/path');
  assert.equal(trimTrailingCharacter('///', '/'), '');
  assert.equal(trimTrailingCharacter('', '/'), '');
  const nearMatch = `https://example.test/${'/'.repeat(100_000)}x`;
  assert.equal(trimTrailingCharacter(nearMatch, '/'), nearMatch);
  assert.equal(countTrailingCharacter('TQ==', '='), 2);
  assert.equal(countTrailingCharacter('TWE=', '='), 1);
  assert.equal(countTrailingCharacter('TWFu', '='), 0);
  assert.equal(countTrailingCharacter(`${'='.repeat(100_000)}A`, '='), 0);
  assert.equal(countTrailingCharacter('='.repeat(100_000), '='), 100_000);
});

test('empty-catch inspection retains enforcement on whitespace and bound catches', () => {
  for (const source of ['catch {}', 'catch (error) {\n\t}', `catch${' '.repeat(100_000)}{}`, 'catch { work(); } catch {}']) {
    assert.ok(inspectSource(source, 'server/example.js').some((message) => message.includes('empty catch')));
  }
  for (const source of ['catch (error) { report(error); }', `catch${' '.repeat(100_000)}!`, 'catch('.repeat(20_000)]) {
    assert.deepEqual(inspectSource(source, 'server/example.js'), []);
  }
});
