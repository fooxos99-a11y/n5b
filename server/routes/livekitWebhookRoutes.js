import express from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { resolveLiveKitConfig } from '../services/livekitConfig.js';
import { invalidateLiveKitPresence } from '../services/livekitCalls.js';

const router = express.Router();
router.post('/', express.raw({ type: 'application/webhook+json', limit: '64kb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) return res.status(415).json({ message: 'نوع محتوى الحدث غير صحيح.' });
  const config = resolveLiveKitConfig();
  if (!config) return res.status(503).json({ message: 'خدمة المكالمات غير مهيأة حالياً.' });
  try {
    const event = await new WebhookReceiver(config.apiKey, config.apiSecret).receive(req.body.toString('utf8'), req.get('Authorization'));
    if (['participant_joined', 'participant_left', 'participant_connection_aborted', 'room_started', 'room_finished'].includes(event.event)) {
      invalidateLiveKitPresence(event.room?.name);
    }
    return res.sendStatus(204);
  } catch {
    return res.status(401).json({ message: 'تعذر اعتماد توقيع الحدث.' });
  }
});
export default router;
