import { rmSync } from 'node:fs';
import path from 'node:path';

const platform = String(process.argv[2] || '').trim().toLowerCase();
const platformDownloadDirectories = {
  android: ['android', 'app', 'src', 'main', 'assets', 'public', 'downloads'],
  ios: ['ios', 'App', 'App', 'public', 'downloads'],
};

const segments = platformDownloadDirectories[platform];
if (!segments) throw new Error('Use android or ios.');

rmSync(path.resolve(process.cwd(), ...segments), { recursive: true, force: true });
