import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

export function createTemporaryArtifactDirectory() {
  // Atomic creation prevents another process from pre-creating screenshot targets.
  const directory = mkdtempSync(join(tmpdir(), 'nukhab-browser-'));
  if (process.platform !== 'win32') chmodSync(directory, 0o700);
  return directory;
}
