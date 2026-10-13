import test from 'node:test';
import assert from 'node:assert/strict';
import { trackLoginViewport } from '../src/lib/loginViewport.js';

function fixture() {
  const windowTarget = new EventTarget();
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 844, offsetTop: 0 });
  Object.assign(windowTarget, { innerHeight: 844, innerWidth: 390, visualViewport: viewport,
    requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame: () => {} });
  const properties = new Map();
  const documentTarget = new EventTarget();
  const input = { matches: () => true, getBoundingClientRect: () => ({ top: 260, bottom: 308 }) };
  documentTarget.activeElement = input;
  const root = { ownerDocument: documentTarget, dataset: {}, style: {
    setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key),
  } };
  const content = { scrollTop: 0, contains: element => element === input,
    getBoundingClientRect: () => ({ top: 12, bottom: viewport.height - 12 }) };
  return { windowTarget, viewport, root, content, properties, documentTarget };
}

test('keyboard resize and viewport pan keep the focused field inside the form and restore the full surface', () => {
  const state = fixture();
  const stop = trackLoginViewport(state.windowTarget, state.root, state.content);
  state.viewport.height = 280;
  state.viewport.offsetTop = 42;
  state.viewport.dispatchEvent(new Event('resize'));
  assert.equal(state.properties.get('--login-viewport-height'), '280px');
  assert.equal(state.properties.get('--login-viewport-top'), '42px');
  assert.equal(state.root.dataset.loginKeyboard, 'open');
  assert.equal(state.content.scrollTop, 48);
  state.viewport.height = 844;
  state.viewport.offsetTop = 0;
  state.viewport.dispatchEvent(new Event('scroll'));
  assert.equal(state.root.dataset.loginKeyboard, 'closed');
  assert.equal(state.properties.get('--login-viewport-height'), '844px');
  assert.equal(state.properties.get('--login-viewport-top'), '0px');
  stop();
  assert.equal(state.properties.size, 0);
  assert.equal(state.root.dataset.loginKeyboard, undefined);
  state.viewport.dispatchEvent(new Event('resize'));
  assert.equal(state.properties.size, 0);
});

test('native layout resizing retains keyboard detection and orientation starts a new height baseline', () => {
  const state = fixture();
  const stop = trackLoginViewport(state.windowTarget, state.root, state.content);
  state.windowTarget.innerHeight = state.viewport.height = 400;
  state.windowTarget.dispatchEvent(new Event('resize'));
  assert.equal(state.root.dataset.loginKeyboard, 'open');
  state.windowTarget.innerWidth = 844;
  state.windowTarget.innerHeight = state.viewport.height = 390;
  state.windowTarget.dispatchEvent(new Event('resize'));
  assert.equal(state.root.dataset.loginKeyboard, 'closed');
  stop();
});

test('without VisualViewport the page uses the layout height and ignores unrelated focus', () => {
  const state = fixture();
  delete state.windowTarget.visualViewport;
  state.documentTarget.activeElement = {};
  const stop = trackLoginViewport(state.windowTarget, state.root, state.content);
  assert.equal(state.properties.get('--login-viewport-height'), '844px');
  assert.equal(state.content.scrollTop, 0);
  stop();
});
