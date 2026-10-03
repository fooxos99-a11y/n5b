import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config.js';

const require = createRequire(import.meta.url);
const braces = require('braces');
const micromatch = require('micromatch');
const fastGlob = require('fast-glob');
const depthError = error => error instanceof SyntaxError && error.code === 'ERR_BRACES_DEPTH';

test('the dependency graph uses the bounded braces fork', () => {
  assert.equal(require('braces/package.json').name, '@nukhab/braces-safe');
  for (const dependency of ['micromatch', 'chokidar']) {
    const consumer = createRequire(require.resolve(dependency));
    assert.equal(consumer.resolve('braces'), require.resolve('braces'));
  }
});

test('deep brace and parenthesis patterns fail safely before recursive walkers', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const input = open.repeat(4000) + 'a,b' + close.repeat(4000);
    for (const operation of ['parse', 'compile', 'expand', 'stringify']) {
      assert.throws(() => braces[operation](input), depthError, operation);
    }
    assert.throws(() => braces(input, { expand: true, rangeLimit: false }), depthError);
  }
});

test('deep or cyclic caller-supplied ASTs cannot bypass depth protection', () => {
  for (const operation of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'a' };
    for (let i = 0; i < 4000; i++) ast = { type: 'brace', nodes: [ast] };
    assert.throws(() => braces[operation](ast), depthError);
    const cycle = { type: 'root', nodes: [] };
    cycle.nodes.push(cycle);
    assert.throws(() => braces[operation](cycle), depthError);
  }
});

test('brace alternatives, ranges, escaping, and consumer globs remain compatible', () => {
  assert.equal(braces.compile('src/**/*.{js,jsx}'), 'src/**/*.(js|jsx)');
  assert.deepEqual(braces.expand('src/**/*.{js,jsx}'), ['src/**/*.js', 'src/**/*.jsx']);
  assert.deepEqual(braces.expand('item{01..03}'), ['item01', 'item02', 'item03']);
  assert.deepEqual(braces.expand('a{b,{c,d}}'), ['ab', 'ac', 'ad']);
  assert.deepEqual(braces.expand('\\{literal\\}'), ['{literal}']);
  assert.deepEqual(micromatch(['a.js', 'b.jsx', 'c.css'], '*.{js,jsx}'), ['a.js', 'b.jsx']);
  assert.deepEqual(fastGlob.sync('tests/{bracesSecurity,livekitConfig}.test.js').sort(), [
    'tests/bracesSecurity.test.js', 'tests/livekitConfig.test.js',
  ]);
  assert.throws(() => braces.expand('{1..2000}'), /range limit/);
});

test('ordinary nested patterns and long flat patterns remain supported', () => {
  const nested = '{'.repeat(60) + 'a,b' + '}'.repeat(60);
  assert.equal(typeof braces.compile(nested), 'string');
  assert.equal(braces.expand(nested).length, 2);
  assert.equal(braces.compile('a'.repeat(9000)), 'a'.repeat(9000));
});

test('Tailwind still emits theme, spacing, responsive, and animation utilities', async () => {
  const result = await postcss([tailwindcss({
    ...tailwindConfig,
    content: [{ raw: 'text-primary p-4 md:flex animate-in fade-in', extension: 'html' }],
  })]).process('@tailwind utilities;', { from: undefined });
  for (const selector of ['.text-primary', '.p-4', '.md\\:flex', '.animate-in', '.fade-in']) {
    assert.ok(result.css.includes(selector), selector);
  }
});
