import React, { useState } from 'react';
import LazyCallsSection from '@/components/calls/LazyCallsSection';
import LazyAudioCallRoom from '@/components/calls/LazyAudioCallRoom';

export default function StudentCalls() {
  const [room, setRoom] = useState(null);
  return room ? <LazyAudioCallRoom roomInfo={room} isOwner={room.isOwner} onLeave={() => setRoom(null)} onClosed={() => setRoom(null)} /> : <LazyCallsSection embedded onJoinRoom={setRoom} />;
}
