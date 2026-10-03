import React from 'react';
import LazyCallsSection from '@/components/calls/LazyCallsSection';

export default function StudentCalls({ activeRoom, onJoinRoom, onDisplayTarget }) {
  return activeRoom ? <div ref={onDisplayTarget} /> : <LazyCallsSection embedded onJoinRoom={onJoinRoom} />;
}
