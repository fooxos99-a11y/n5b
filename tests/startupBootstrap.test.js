import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate as settleNative } from 'node:timers/promises';

const source = readFileSync(new URL('../public/startup-bootstrap.js', import.meta.url), 'utf8');
function bootstrap({ reduced = false, loaded = true, failed = false, nativeHide, nativeProxy = true, paintDelay = 16 } = {}) {
  let now = 0, sequence = 0;
  const timers = new Map(), events = [], listeners = {};
  const schedule = (callback, ms) => { const id = ++sequence; timers.set(id, { at: now + ms, callback }); return id; };
  const advance = milliseconds => {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].callback(now);
    }
    now = end;
  };
  const logo = { src: 'https://localhost/branding/nukhab/nukhab-white-640.webp', complete: loaded || failed, naturalWidth: loaded ? 640 : 0, addEventListener: (name, callback) => { listeners[name] = callback; } };
  const recovery = { hidden: true }, content = { inert: true, removeAttribute: () => {} };
  const surface = { dataset: {}, removed: false, setAttribute: () => {}, remove() { this.removed = true; },
    querySelector: selector => selector === 'img' ? logo : selector === 'button' ? { addEventListener: (_event,callback) => { listeners.retry = callback; } } : recovery };
  const root = { dataset: {}, classList: { add: () => {} } };
  const context = vm.createContext({ document: { documentElement: root, getElementById: id => id === 'startup-splash' ? surface : content },
    URL, location: { reload: () => { listeners.reloaded = true; } },
    Capacitor: nativeHide ? { isNativePlatform: () => true, ...(nativeProxy ? { Plugins: { SplashScreen: { hide: nativeHide } } }
      : { nativePromise: (plugin, method, options) => { assert.equal(plugin, 'SplashScreen'); assert.equal(method, 'hide'); return nativeHide(options); } }) } : undefined,
    performance: { now: () => now }, matchMedia: () => ({ matches: reduced, addEventListener: () => {} }),
    setTimeout: schedule, clearTimeout: id => timers.delete(id), requestAnimationFrame: callback => schedule(callback, paintDelay), cancelAnimationFrame: id => timers.delete(id),
    Event: class { constructor(type) { this.type = type; } }, dispatchEvent: event => events.push(event.type) });
  vm.runInContext(source, context);
  return { startup: context.nukhabStartup, advance, surface, content, recovery, listeners, events, root };
}
test('startup removes the brand on an opaque background before exposing ready account content, without a two-second wait', () => {
  const state = bootstrap(); state.startup.setReady(true); state.advance(32);
  assert.equal(state.surface.dataset.brandHidden, 'true'); assert.equal(state.content.inert, true);
  state.advance(119); assert.equal(state.startup.active, true);
  state.advance(1); assert.equal(state.content.inert, false); assert.equal(state.startup.active, false);
  assert.equal(state.surface.removed, false); state.advance(140); assert.equal(state.surface.removed, true);
  assert.deepEqual(state.events, ['nukhab-startup-finished']);
  state.startup.setReady(false); state.startup.setReady(true); state.advance(500);
  assert.equal(state.events.length, 1);
});
test('a new blocking loader cancels reveal, retains the same splash and never replays its hidden brand', () => {
  const state = bootstrap(); state.startup.setReady(true); state.advance(50); state.startup.setReady(false); state.advance(1000);
  assert.equal(state.content.inert, true); assert.equal(state.surface.dataset.brandHidden, 'true');
  state.startup.setReady(true); state.advance(32);
  assert.equal(state.startup.active, false); assert.equal(state.events.length, 1);
});
test('slow or failed branding cannot reveal account content; retry completes the same startup', () => {
  const state = bootstrap({ loaded: false }); state.startup.setReady(true); state.advance(15001);
  assert.equal(state.recovery.hidden, false); assert.equal(state.content.inert, true);
  state.listeners.load(); state.advance(152);
  assert.equal(state.startup.active, false); assert.equal(state.recovery.hidden, true);
});
test('reduced motion and fatal-page recovery still release startup exactly once', () => {
  const state = bootstrap({ reduced: true }); state.startup.setReady(true); state.advance(32);
  assert.equal(state.surface.removed, true); assert.equal(state.events.length, 1);
  const failure = bootstrap({ loaded: false }); failure.startup.dismiss(); failure.advance(120);
  assert.equal(failure.startup.active, false); assert.equal(failure.content.inert, false);
});
test('unmounting a failed React tree cannot cancel the error page reveal', () => {
  const failure = bootstrap(); failure.startup.dismiss(); failure.startup.setReady(false); failure.advance(200);
  assert.equal(failure.startup.active, false); assert.equal(failure.content.inert, false);
  assert.equal(failure.events.length, 1);
});

test('native launch hands off once after the local logo paints, and page readiness remains independent', async () => {
  const calls = [];
  const state = bootstrap({ loaded: false, nativeHide: async options => calls.push(options) });
  state.advance(1000); assert.equal(calls.length, 0); assert.equal(state.startup.nativeReady, false);
  state.listeners.load(); state.advance(31); assert.equal(calls.length, 0);
  state.advance(1); await settleNative();
  assert.equal(calls.length, 1); assert.equal(calls[0].fadeOutDuration, 0);
  assert.equal(state.startup.nativeReady, true); assert.equal(state.content.inert, true);
  state.startup.setReady(true); state.advance(152); assert.equal(state.startup.active, false);
  state.listeners.load(); state.startup.setReady(false); state.startup.setReady(true); state.advance(1000);
  assert.equal(calls.length, 1); assert.deepEqual(state.events, ['nukhab-startup-finished']);
});

test('a delayed native hide cannot uncover content, and fatal recovery still completes after handoff', async () => {
  let release;
  const state = bootstrap({ nativeProxy: false, nativeHide: () => new Promise(resolve => { release = resolve; }) });
  state.startup.setReady(true); state.advance(500);
  assert.equal(state.content.inert, true); assert.equal(state.startup.active, true);
  state.startup.dismiss(); state.startup.setReady(false); state.advance(200);
  assert.equal(state.content.inert, true);
  release(); await settleNative(); state.advance(140);
  assert.equal(state.content.inert, false); assert.equal(state.events.length, 1);
});

test('failed native handoff retries without exposing content or adding a logo', async () => {
  let calls = 0;
  const state = bootstrap({ nativeHide: async () => { if (++calls === 1) throw new Error('native temporarily unavailable'); } });
  state.startup.setReady(true); state.advance(32); await settleNative();
  assert.equal(state.root.dataset.nativeStartupError, 'unavailable'); assert.equal(state.content.inert, true);
  state.advance(282); await settleNative(); state.advance(40);
  assert.equal(calls, 2); assert.equal(state.root.dataset.nativeStartupError, undefined);
  assert.equal(state.startup.active, false); assert.equal(state.events.length, 1);
});

test('a broken local logo releases the native cover so HTML recovery can be reached before React', async () => {
  let calls = 0;
  const state = bootstrap({ loaded: false, nativeHide: async () => { calls++; } });
  state.listeners.error(); state.advance(32); await settleNative();
  assert.equal(calls, 1); assert.equal(state.startup.nativeReady, true);
  assert.equal(state.recovery.hidden, false); assert.equal(state.content.inert, true);
  state.listeners.retry(); assert.equal(state.listeners.reloaded, undefined, 'image recovery must work before React mounts');
  state.listeners.load(); state.advance(32); await settleNative();
  assert.equal(calls, 1); assert.equal(state.content.inert, true, 'the page is still not ready');
});

test('an image that failed before bootstrap is recognized immediately instead of waiting behind the native cover', async () => {
  let calls = 0;
  const state = bootstrap({ loaded: false, failed: true, nativeHide: async () => { calls++; } });
  assert.equal(state.recovery.hidden, false);
  state.advance(32); await settleNative();
  assert.equal(calls, 1); assert.equal(state.startup.nativeReady, true); assert.equal(state.content.inert, true);
});

test('a native cover cannot deadlock WebKit paints or hide recovery while the app bundle is stalled', async () => {
  let calls = 0;
  const state = bootstrap({ paintDelay: 500, nativeHide: async () => { calls++; } });
  state.advance(149); assert.equal(calls, 0);
  state.advance(1); await settleNative(); assert.equal(calls, 1); assert.equal(state.startup.nativeReady, true);
  state.advance(2000); await settleNative(); assert.equal(calls, 1);
  assert.equal(state.content.inert, true, 'the handoff must not bypass session/page readiness');
});
