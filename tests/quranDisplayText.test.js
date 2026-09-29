import assert from 'node:assert/strict';
import test from 'node:test';
import { compactQuranAmount, cleanQuranPreview } from '../shared/quran-display-text.js';

test('Quran text formatting preserves endpoints and removes only complete annotations', () => {
  assert.equal(compactQuranAmount('البقرة، من آية ٦ إلى ١٦'), 'البقرة ٦–١٦');
  assert.equal(compactQuranAmount('البقرة آية ٢٨٣ إلى آل عمران آية ٩'), 'البقرة ٢٨٣–آل عمران ٩');
  assert.equal(cleanQuranPreview(' البقرة ( وجه 12 ) - المطلوب 3 وجه '), 'البقرة');
  assert.equal(cleanQuranPreview('أ (وجه 2) ب'), 'أب');
  assert.equal(cleanQuranPreview('(وجه غير معروف)'), '(وجه غير معروف)');
  assert.equal(cleanQuranPreview('البقرة - المطلوب 3'), 'البقرة - المطلوب 3');
});

test('long non-matching whitespace and incomplete annotations remain unchanged', () => {
  const spaces = ' '.repeat(100_000);
  assert.equal(compactQuranAmount(`أ${spaces}ب`), `أ${spaces}ب`);
  assert.equal(cleanQuranPreview(`أ${spaces}(وجه 2`), `أ${spaces}(وجه 2`);
  assert.equal(cleanQuranPreview(`أ${spaces}- المطلوب 2`), `أ${spaces}- المطلوب 2`);
});
