import { createCommitteeStaffRouter } from './committeeStaffRoutes.js';
import { disconnectLiveKitCallParticipant } from '../services/livekitCalls.js';

async function disconnectReciterCalls(connection, id) {
  const [rooms] = await connection.query(`SELECT DISTINCT r.livekit_room_name AS roomName FROM call_rooms r
    LEFT JOIN call_room_participants p ON p.room_id = r.id AND p.user_role = 'reciter' AND p.user_id = ?
    WHERE p.id IS NOT NULL OR (r.created_by_role = 'reciter' AND r.created_by_id = ?)`, [id, id]);
  await disconnectLiveKitCallParticipant({ identity: `reciter:${id}`, roomNames: rooms.map(room => room.roomName) });
}

export const createReciterRouter = dependencies => createCommitteeStaffRouter(dependencies, {
  role: 'reciter', label: 'المقرئ', permission: 'reciters', onRevoke: disconnectReciterCalls,
});
