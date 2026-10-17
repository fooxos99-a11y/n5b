import path from 'node:path';
import baseConfig from './call-archive-local.vite.config.mjs';
import { localCallRoot } from './call-archive-local-config.mjs';

// A separate UI demonstration server. The actual site on3038 keeps the real SDK.
export default async () => {
  const config = await baseConfig();
  return { ...config,
    cacheDir: path.join(localCallRoot, 'node_modules/.vite-call-fixture'),
    resolve: { ...config.resolve, alias: { ...config.resolve.alias, 'livekit-client': path.join(localCallRoot, 'tests/fixtures/call-audio-livekit.js') } },
    plugins: [{ name: 'local-call-fixture-only', configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://127.0.0.1:3039').pathname;
        if (req.headers.accept?.includes('text/html') && pathname !== '/tests/fixtures/call-audio.html') {
          res.writeHead(302, { Location: '/tests/fixtures/call-audio.html?consent=1' }); res.end(); return;
        }
        if (pathname.startsWith('/api/')) { res.writeHead(403); res.end('UI demonstration only'); return; }
        next();
      });
    } }, ...config.plugins],
    server: { ...config.server, port: 3039, proxy: {} },
  };
};
