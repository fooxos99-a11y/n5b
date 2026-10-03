export function resolveLiveKitConfig(environment = process.env) {
  const apiKey = String(environment.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(environment.LIVEKIT_API_SECRET || '').trim();
  let url;
  try {
    url = new URL(String(environment.LIVEKIT_URL || '').trim());
  } catch {
    return null;
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['https:', 'wss:', ...(local ? ['http:', 'ws:'] : [])].includes(url.protocol)
    || url.username || url.password || url.search || url.hash || !apiKey || !apiSecret) return null;
  const serverUrl = new URL(url);
  serverUrl.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  url.protocol = serverUrl.protocol === 'wss:' ? 'https:' : 'http:';
  return { serverUrl: serverUrl.href.replace(/\/$/, ''), serviceUrl: url.href.replace(/\/$/, ''), apiKey, apiSecret };
}

export function requireLiveKitConfig() {
  const config = resolveLiveKitConfig();
  if (config) return config;
  const error = new Error('خدمة المكالمات غير مهيأة حالياً.');
  error.statusCode = 503;
  throw error;
}
