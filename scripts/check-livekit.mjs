import '../server/loadEnvironment.js';
import process from 'node:process';
import { RoomServiceClient } from 'livekit-server-sdk';
import { resolveLiveKitConfig } from '../server/services/livekitConfig.js';

const config = resolveLiveKitConfig();
if (!config) {
  globalThis.console.error('إعداد المكالمات غير مكتمل: يلزم LIVEKIT_URL آمن وLIVEKIT_API_KEY وLIVEKIT_API_SECRET على الخادم.');
  process.exitCode = 1;
} else if (process.argv.includes('--configuration-only')) {
  globalThis.console.log('إعداد LiveKit صالح من حيث الصيغة. لم يُختبر الاتصال بالخادم.');
} else {
  const client = new RoomServiceClient(config.serviceUrl, config.apiKey, config.apiSecret, { requestTimeout: 15 });
  try {
    await client.listRooms();
    globalThis.console.log('اجتاز LiveKit فحص الاتصال والمصادقة. يلزم فحص الصوت بين جهازين للتحقق من منافذ الوسائط.');
  } catch {
    globalThis.console.error('تعذر الاتصال بـLiveKit أو المصادقة عليه. راجع عنوان الخدمة والشهادة والمفاتيح على الخادم.');
    process.exitCode = 1;
  }
}
