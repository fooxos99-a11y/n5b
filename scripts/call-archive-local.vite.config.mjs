import { randomUUID } from 'node:crypto';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { localCallRoot, localCallUiRoots, readLocalCallEnvironment } from './call-archive-local-config.mjs';

export default async () => {
  await readLocalCallEnvironment();
  return { root: localCallRoot, envFile: false, base: '/', envPrefix: 'LOCAL_CALL_UI_', plugins: [react()],
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('/api'), 'import.meta.env.VITE_SITE_KEY': JSON.stringify('nukhab'), 'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(randomUUID()) },
    resolve: { alias: { '@': path.join(localCallRoot, 'src') } },
    server: { host: '127.0.0.1', port: 3038, strictPort: true, fs: { strict: true, allow: localCallUiRoots,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/backups/**', '**/tmp/**'] },
    proxy: { '/api': 'http://127.0.0.1:3037' } } };
};
