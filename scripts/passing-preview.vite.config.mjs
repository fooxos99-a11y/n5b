import { mergeConfig } from 'vite';
import baseConfig from '../vite.config.js';
export default environment => mergeConfig(baseConfig(environment), { base: '/', server: {
  host: '127.0.0.1', port: 3048, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3047' },
} });
