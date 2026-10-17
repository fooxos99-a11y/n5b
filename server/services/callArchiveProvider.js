import { EgressClient, RoomServiceClient, EncodedFileOutput, EncodedFileType, S3Upload, TrackType } from 'livekit-server-sdk';
import { getCallArchiveConfig } from './callArchiveConfig.js';

// Identities come from server-issued access tokens. Never count egress/agent/SIP
// participants or infer human presence from a request for an access token.
export function verifiedHumanParticipant(person) {
  const match = /^(manager|admin|supervisor|student|reciter):([1-9][0-9]*)$/.exec(String(person.identity || ''));
  if (!match || (person.kind !== undefined && Number(person.kind) !== 0)) return null;
  return { identity: person.identity, role: match[1], id: Number(match[2]), name: String(person.name || 'مستخدم').slice(0, 180),
    tracks: (person.tracks || []).filter(track => Number(track.type) === TrackType.AUDIO && track.sid).map(track => String(track.sid)) };
}

export function createCallArchiveProvider(config = getCallArchiveConfig()) {
  if (!config.configured) throw Object.assign(new Error('خدمة الأرشفة الصوتية غير مهيأة.'), { statusCode: 503 });
  const { serviceUrl, apiKey, apiSecret } = config.livekit;
  const roomClient = new RoomServiceClient(serviceUrl, apiKey, apiSecret, { requestTimeout: 15 });
  const egress = new EgressClient(serviceUrl, apiKey, apiSecret, { requestTimeout: 25 });
  const file = key => new EncodedFileOutput({ fileType: EncodedFileType.MP4,
    // Egress can run on Linux while the API runs on Windows. Its configured
    // mount path belongs to Egress, not to this process's path implementation.
    filepath: config.storage === 's3' ? key : `${config.egressPath.replaceAll('\\', '/').replace(/\/$/, '')}/${key}`,
    disableManifest: true,
    ...(config.s3 ? { output: { case: 's3', value: new S3Upload(config.s3) } } : {}),
  });
  return {
    async presence(roomName) {
      try { return (await roomClient.listParticipants(roomName)).map(verifiedHumanParticipant).filter(Boolean); }
      catch (error) { if (error.code === 'not_found' || /not.found|does not exist/i.test(String(error.message))) return []; throw error; }
    },
    async list(roomName) { return egress.listEgress({ roomName }); },
    async start(roomName, media) {
      const output = file(media.object_key);
      return media.kind === 'mixed'
        ? egress.startRoomCompositeEgress(roomName, output, { audioOnly: true })
        : egress.startTrackCompositeEgress(roomName, output, { audioTrackId: media.track_id });
    },
    stop(id) { return egress.stopEgress(id); },
  };
}
