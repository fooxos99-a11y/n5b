import { db, getDatabaseContext, runWithDatabase } from '../db.js';
import { handleCallArchiveWebhook } from './callArchive.js';
import { getCallArchiveConfig } from './callArchiveConfig.js';

/** Webhooks arrive before request tenancy and carry no client tenant headers.
 * Discover ownership using server-validated active tenant contexts; only the
 * unique owning database may mutate. Never select a database from event data. */
export function createCallArchiveWebhookDispatcher({ forEachTenant }) {
  if (typeof forEachTenant !== 'function') throw new Error('A validated active-tenant iterator is required for LiveKit archive webhooks.');
  return async event => {
    if (!getCallArchiveConfig().enabled) return;
    const roomName = String(event.room?.name || event.egressInfo?.roomName || '');
    const egressId = String(event.egressInfo?.egressId || '');
    if ((!roomName && !egressId) || roomName.length > 180 || egressId.length > 120) return;
    const owners = new Map();
    // The iterator must reject registry/initialization failures. Otherwise an
    // unavailable tenant could be falsely treated as an unknown media room.
    await forEachTenant(async () => {
      const context = getDatabaseContext();
      if (!/^\w+$/.test(context.databaseName)) throw new Error('Invalid validated tenant database context.');
      const [[owner]] = await db().query(`SELECT 1 AS matched WHERE
        EXISTS (SELECT 1 FROM call_rooms WHERE livekit_room_name=?) OR
        EXISTS (SELECT 1 FROM call_archive_sessions WHERE livekit_room_name=?) OR
        EXISTS (SELECT 1 FROM call_archive_media WHERE egress_id=?)`, [roomName, roomName, egressId]);
      if (owner) owners.set(context.databaseName, context);
    });
    if (owners.size > 1) throw new Error('LiveKit archive event has ambiguous tenant ownership.');
    const context = owners.values().next().value;
    if (!context) return; // Other LiveKit rooms sharing this service are ignored.
    await runWithDatabase(context.databaseName, { tenant: context.tenant }, () => handleCallArchiveWebhook(event));
  };
}
