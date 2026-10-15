import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep the W01 probe test explicit; the ordinary app opens authentication.
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url)),
  'export', '--platform', 'web', '--output-dir', 'dist/web'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, EXPO_PUBLIC_NATIVE_PROBES: '1' }, stdio: 'inherit', windowsHide: true,
});
child.once('error', () => { process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
