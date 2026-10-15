export type CallGrant = { serverUrl: string; token: string };
export function validCallGrant(grant: CallGrant | null): grant is CallGrant {
  if (!grant?.token.trim()) return false;
  try {
    const url = new URL(grant.serverUrl);
    return url.protocol === 'wss:' || (url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch { return false; }
}
