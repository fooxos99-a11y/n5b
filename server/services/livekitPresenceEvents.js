import { EventEmitter } from 'node:events';
import { AsyncResource } from 'node:async_hooks';

const presence = new EventEmitter();
presence.setMaxListeners(0);
export const notifyLiveKitPresence = roomName => presence.emit('changed', roomName);
export function subscribeLiveKitPresence(listener) {
  // A webhook is outside the viewer's database context; retain its tenant scope.
  const scopedListener = AsyncResource.bind(listener);
  presence.on('changed', scopedListener);
  return () => presence.off('changed', scopedListener);
}
