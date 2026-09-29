import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Android verifies dependency metadata and artifacts using SHA-256', async () => {
  const metadata = await readFile(new URL('../android/gradle/verification-metadata.xml', import.meta.url), 'utf8');
  assert.match(metadata, /<verify-metadata>true<\/verify-metadata>/);
  assert.doesNotMatch(metadata, /<trusted-artifacts>/);
  const artifacts = [...metadata.matchAll(/<artifact\s[^>]+>([\s\S]*?)<\/artifact>/g)];
  assert.ok(artifacts.length > 0);
  for (const [, artifact] of artifacts) assert.match(artifact, /<sha256 value="[a-f0-9]{64}"/);
});

test('iOS installs npm packages without lifecycle scripts and enforces Swift pins', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ios-testflight.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: npm ci --ignore-scripts/);
  assert.equal((workflow.match(/-onlyUsePackageVersionsFromResolvedFile/g) || []).length, 3);
  const [packageLock, xcodeLock] = await Promise.all([
    '../ios/App/CapApp-SPM/Package.resolved',
    '../ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
  ].map(async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))));
  assert.deepEqual(packageLock, xcodeLock);
  assert.equal(packageLock.version, 2);
  assert.deepEqual(packageLock.pins.map((pin) => pin.identity), ['capacitor-swift-pm', 'keychain-swift', 'sqlcipher.swift', 'zipfoundation']);
  for (const pin of packageLock.pins) {
    assert.match(pin.state.revision, /^[a-f0-9]{40}$/);
    assert.match(pin.state.version, /^\d+\.\d+\.\d+$/);
  }
  const manifest = await readFile(new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url), 'utf8');
  assert.ok(manifest.includes(`exact: "${packageLock.pins[0].state.version}"`));
});
