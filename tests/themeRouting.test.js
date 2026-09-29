import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getDefaultThemeForPath, getPreferredThemeForPath, saveThemePreference } from '../src/lib/theme.js';

test('student preference survives login navigation and a fresh module session until explicitly switched', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const stored = new Map();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value),
  } } });
  try {
    const before = await import('../src/lib/theme.js?student-session-before');
    before.saveThemePreference('dark', '/portal');
    assert.equal(before.getPreferredThemeForPath('/login'), 'light');
    const fresh = await import('../src/lib/theme.js?student-session-test');
    assert.equal(fresh.getPreferredThemeForPath('/portal'), 'dark');
    stored.set('wajeh_role', 'student');
    assert.equal(fresh.getPreferredThemeForPath('/'), 'dark');
    assert.equal(fresh.getPreferredThemeForPath('/campus/', '/campus/'), 'dark');
    assert.equal(fresh.getPreferredThemeForPath('/portal/store'), 'dark');
    fresh.saveThemePreference('light', '/portal');
    assert.equal(fresh.getPreferredThemeForPath('/portal'), 'light');
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  }
});

test('login entry and dashboards default to light', () => {
  assert.equal(getDefaultThemeForPath('/'), 'light');
  assert.equal(getDefaultThemeForPath('/login'), 'light');
  assert.equal(getPreferredThemeForPath('/login'), 'light');
  assert.equal(getPreferredThemeForPath('/campus/login/', '/campus/'), 'light');
  assert.equal(getDefaultThemeForPath('/portal'), 'light');
  assert.equal(getDefaultThemeForPath('/portal/quran-sessions'), 'light');
  assert.equal(getDefaultThemeForPath('/dashboard-other'), 'dark');
  assert.equal(getDefaultThemeForPath('/download'), 'dark');
  assert.equal(getDefaultThemeForPath('/dashboard'), 'light');
  assert.equal(getDefaultThemeForPath('/dashboard/students'), 'light');
  assert.equal(getDefaultThemeForPath('/campus/dashboard/students', '/campus/'), 'light');
  assert.equal(getDefaultThemeForPath('/campus/portal', '/campus/'), 'light');
  assert.equal(getDefaultThemeForPath('/campus/', '/campus/'), 'light');
});

test('entry and navigation use the saved choice and only the toggle saves it', async () => {
  const [main, controller, toggle] = await Promise.all([
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/RouteThemeController.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ThemeToggle.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(main, /getPreferredThemeForPath\(window\.location\.pathname\)/);
  assert.match(controller, /getPreferredThemeForPath\(pathname\)/);
  assert.match(toggle, /applyTheme\(saveThemePreference\(/);
  assert.doesNotMatch([main, controller].join('\n'), /saveThemePreference/);
});

test('public and account choices persist independently, including unavailable storage', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const stored = new Map([['nukhab_theme', 'dark']]);
  const storage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  try {
    assert.equal(getPreferredThemeForPath('/download'), 'dark');
    assert.equal(getPreferredThemeForPath('/dashboard/attendance'), 'light');
    saveThemePreference('light', '/download');
    saveThemePreference('dark', '/portal/my-plan');
    assert.equal(stored.get('nukhab_theme_public'), 'light');
    assert.equal(stored.get('nukhab_theme_account'), 'dark');
    assert.equal(getPreferredThemeForPath('/download'), 'light');
    for (const path of ['/portal/my-plan', '/portal/recitation-sessions', '/dashboard/attendance']) {
      assert.equal(getPreferredThemeForPath(path), 'dark');
    }
    storage.getItem = storage.setItem = () => { throw new Error('Storage unavailable'); };
    saveThemePreference('dark', '/download');
    saveThemePreference('light', '/dashboard');
    assert.equal(getPreferredThemeForPath('/download'), 'dark');
    assert.equal(getPreferredThemeForPath('/portal'), 'light');
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  }
});

test('initial HTML and route controller agree before React loads', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="%BASE_URL%theme-bootstrap.js" data-base="%BASE_URL%"><\/script>/);
  const script = await readFile(new URL('../public/theme-bootstrap.js', import.meta.url), 'utf8');
  for (const basePath of ['/', '/campus/']) {
    for (const route of ['/', '/login', '/login/', '/portal', '/portal/quran-sessions', '/dashboard', '/dashboard/students', '/dashboard-other']) {
      const pathname = basePath.replace(/\/$/, '') + route;
      for (const preference of [null, 'light', 'dark', 'invalid']) {
        let applied;
        const root = { classList: { add: (theme) => { applied = theme; } }, style: {} };
        const key = getDefaultThemeForPath(pathname, basePath) === 'light' ? 'nukhab_theme_account' : 'nukhab_theme_public';
        new Function('globalThis', script)({ location: { pathname }, localStorage: { getItem: (requestedKey) => requestedKey === key ? preference : 'invalid' }, document: { documentElement: root, currentScript: { dataset: { base: basePath } } } });
        assert.equal(applied, route === '/' || route.startsWith('/login') ? 'light' : ['light', 'dark'].includes(preference) ? preference : getDefaultThemeForPath(pathname, basePath), pathname);
        assert.equal(root.style.colorScheme, applied);
      }
    }
  }
});
