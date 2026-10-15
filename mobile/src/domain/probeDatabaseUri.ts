import { ProbeFailure } from './probeFailure';

export function probeDatabaseDirectoryUri(directory: unknown): string {
  if (typeof directory !== 'string') throw new ProbeFailure('database-file-check', 'database-path-invalid');
  if (directory.startsWith('file:///')) return directory;
  if (!directory.startsWith('/') || directory.startsWith('//')) {
    throw new ProbeFailure('database-file-check', 'database-path-invalid');
  }
  // SQLite returns a raw absolute path on Android; File expects an absolute file URI.
  return `file://${directory.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
}
