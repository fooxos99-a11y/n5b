import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('startup owns the branding while later loading uses a neutral progress indicator', async () => {
  const [html, react, style, native] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/loading-spinner.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/loading-spinner.css', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /rel="stylesheet" href="\/src\/styles\/loading-spinner.css"/);
  assert.match(html, /id="startup-splash" class="boot-loader startup-splash"/);
  assert.match(html, /startup-brand-logo/);
  assert.doesNotMatch(html, /class="loading-logo loading-spinner--screen"/);
  assert.ok(html.indexOf('startup-bootstrap.js') < html.indexOf('/src/main.jsx'));
  assert.doesNotMatch(html, /startup-hexagon|startup-lines/);
  assert.doesNotMatch(html, /boot-loader__panel|boot-panel|backdrop-filter|box-shadow|boot-primary/);
  assert.match(react, /lg: 'loading-spinner--screen'/);
  assert.match(react, /Loader2/);
  assert.match(react, /motion-safe:animate-spin/);
  assert.doesNotMatch(react, /loading-logo/);
  assert.doesNotMatch(style, /branding\/nukhab|loading-logo-breathe/);
  assert.doesNotMatch(style, /transform:|rotate\(/);
  assert.match(style, /prefers-reduced-motion/);
  assert.equal(JSON.parse(native).plugins.SplashScreen.showSpinner, false);
});
