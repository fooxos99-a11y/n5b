export const AudioPresets = { speech: { maxBitrate: 24000 } };
export const Track = { Kind: { Audio: 'audio' }, Source: { ScreenShare: 'screen_share', Camera: 'camera' } };
export const RoomEvent = Object.fromEntries(['ParticipantConnected', 'ParticipantDisconnected', 'ActiveSpeakersChanged', 'TrackMuted', 'TrackUnmuted', 'TrackPublished', 'TrackUnpublished', 'LocalTrackPublished', 'LocalTrackUnpublished', 'TrackSubscribed', 'TrackUnsubscribed'].map(key => [key, key]));

export class Room {
  static instances = [];
  constructor(options) {
    this.options = options;
    this.events = new Map();
    this.connections = 0;
    this.disconnections = 0;
    this.remoteParticipants = new Map();
    this.localParticipant = { identity: 'local-test', name: 'حساب تجريبي', isMicrophoneEnabled: false, trackPublications: new Map(),
      setMicrophoneEnabled: async enabled => { this.localParticipant.isMicrophoneEnabled = enabled; },
    };
    const attached = new Set();
    this.audioTrack = { kind: 'audio', attach: () => { const element = document.createElement('audio'); attached.add(element); return element; },
      detach: element => { const elements = element ? [element] : [...attached]; elements.forEach(item => attached.delete(item)); return elements; },
    };
    Room.instances.push(this);
  }
  on(event, listener) { this.events.set(event, listener); return this; }
  async connect() { this.connections++; }
  async disconnect() { this.disconnections++; }
  subscribe() { this.events.get(RoomEvent.TrackSubscribed)?.(this.audioTrack, { source: 'microphone' }, { identity: 'remote-test' }); }
  unsubscribe() { this.events.get(RoomEvent.TrackUnsubscribed)?.(this.audioTrack, { source: 'microphone' }, { identity: 'remote-test' }); }
}
