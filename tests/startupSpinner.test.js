import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('boot and subsequent loading share one opacity-only logo', async () => {
  const [html, react, style, native] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/loading-spinner.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/loading-spinner.css', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /rel="stylesheet" href="\/src\/styles\/loading-spinner.css"/);
  assert.match(html, /class="loading-logo loading-spinner--screen"/);
  assert.doesNotMatch(html, /startup-hexagon|startup-lines/);
  assert.doesNotMatch(html, /boot-loader__panel|boot-panel|backdrop-filter|box-shadow|boot-primary/);
  assert.match(react, /lg: 'loading-spinner--screen'/);
  assert.match(style, /branding\/nukhab\/nukhab-color-320\.webp/);
  assert.doesNotMatch(style, /transform:|rotate\(/);
  assert.match(style, /prefers-reduced-motion/);
  assert.equal(JSON.parse(native).plugins.SplashScreen.showSpinner, false);
});
