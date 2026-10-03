import { fileURLToPath, URL } from 'node:url';
import baseConfig from '../../vite.config.js';

const mockModule = fileURLToPath(new URL('./call-audio-livekit.js', import.meta.url)).replaceAll('\\', '/');
export default context => {
  const config = baseConfig(context);
  return { ...config, optimizeDeps: { ...config.optimizeDeps, entries: [fileURLToPath(new URL('./call-audio.html', import.meta.url))] }, plugins: [
    { name: 'local-call-audio-fixture', enforce: 'pre', transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/components/calls/AudioCallRoom.jsx')) return null;
      return code.replace("from 'livekit-client'", `from '${mockModule}'`);
    } }, ...config.plugins,
  ] };
};
