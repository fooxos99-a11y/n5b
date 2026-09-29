import { getApiBase } from '@/services/apiBase';
import { versionIsOlder } from '../../shared/native-update';

export async function getRequiredNativeUpdate(info, platform) {
  const response = await fetch(`${getApiBase()}/native-update?app=${encodeURIComponent(info.id)}&platform=${platform}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('تعذر التحقق من تحديث التطبيق');
  const policy = await response.json();
  return policy.available && versionIsOlder(info.version, policy.minimumVersion) && String(policy.url).startsWith('https://') ? policy : null;
}
