import React from 'react';
import { createRoot } from 'react-dom/client';
import CallsSection from '@/components/calls/CallsSection';
import { callArchiveApi } from '@/services/callArchiveApi';
import { studentsApi } from '@/services/studentsApi';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const reviewer = new URLSearchParams(location.search).get('role') !== 'student';
const room = { id: '17', name: 'غرفة المقرئ أحمد — تسجيل تجريبي محلي', status: 'closed', sessionCount: 2 };
const session = { id: 'session-22', sequence: 1, participants: [{ name: 'المقرئ التجريبي' }, { name: 'الطالب التجريبي' }], roomId: '17', roomName: room.name, state: 'ready', reportState: 'ready', startedAt: '2026-10-18T06:00:00Z', endedAt: '2026-10-18T06:15:00Z', recordingGap: false, canReview: reviewer };
let review = null;
const report = () => ({ summary: 'مثال محلي: قرأ الطالب مقطعًا وراجع المقرئ معه موضعًا يحتاج إعادة.', passage: 'مقطع تجريبي',
  observations: [{ id: 'observation-1', atSeconds: 2, endSeconds: 4, category: 'possible_error', detail: 'موضع تجريبي يحتاج مراجعة المقرئ.', correction: 'طلب المقرئ إعادة الموضع.', response: 'أعاد الطالب القراءة.', confidence: 'medium' },
    { id: 'observation-2', atSeconds: 6, endSeconds: 8, category: 'teacher_correction', detail: 'توجيه مسموع من المقرئ.', correction: '', response: '', confidence: 'high' }],
  followUp: ['مراجعة الموضع في الجلسة التالية.'], limitations: ['هذا تقرير تجريبي محلي ولا يثبت دقة تحليل صوت حقيقي.'], review });
const wave = new Uint8Array(44 + 8000 * 2 * 10), view = new DataView(wave.buffer);
const text = (offset, value) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
text(0, 'RIFF'); view.setUint32(4, wave.length - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, wave.length - 44, true);
const audioUrl = URL.createObjectURL(new Blob([wave], { type: 'audio/wav' }));
Object.assign(callArchiveApi, {
  rooms: async () => ({ rooms: [room], capabilities: { configured: true } }),
  room: async (_roomId, before) => ({ room, sessions: before ? [{ ...session, id: 'session-23', sequence: 2, state: 'failed', recordingGap: true, reportState: 'failed' }] : [session], nextCursor: before ? null : 'session-22' }),
  session: async id => {
    if (window.__archiveDenied || new URLSearchParams(location.search).has('denied')) throw Object.assign(new Error('الجلسة غير متاحة لحسابك.'), { status: 403 });
    return { session: { ...session, id, ...(id === 'session-23' ? { state: 'failed', recordingGap: true, reportState: 'failed' } : {}), ...(id === 'session-24' ? { state: 'failed', recordingGap: true, reportState: 'failed', active: true, lastError: 'تعذر بدء التسجيل التجريبي.' } : {}) }, participants: [{ identity: 'reciter:7', name: 'المقرئ التجريبي', joinedAt: session.startedAt, leftAt: session.endedAt }, { identity: 'student:3', name: 'الطالب التجريبي', joinedAt: session.startedAt, leftAt: session.endedAt }], media: id === 'session-24' ? [] : [{ id: 'media-1', kind: 'mixed', available: true }, { id: 'media-2', kind: 'participant', available: true, identity: 'student:3' }], report: ['session-23', 'session-24'].includes(id) ? null : report(), canReview: reviewer };
  },
  playback: async () => ({ url: audioUrl }),
  review: async (_id, value) => { if (!reviewer) throw new Error('غير مصرح'); review = { ...value, reviewedBy: { name: 'المقرئ التجريبي', role: 'reciter', id: '7' }, reviewedAt: new Date().toISOString() }; window.__archiveReview = review; },
  retry: async () => { window.__archiveRetried = true; },
});
studentsApi.getCallRooms = async () => ({ rooms: [], committees: [], livekitConfigured: false, canAccessArchive: true });
const original = window.fetch;
window.fetch = (input, options) => String(input).endsWith('/calls/events') ? Promise.reject(new Error('Local archive fixture; no media connection')) : original(input, options);
createRoot(document.getElementById('root')).render(<main dir="rtl" className="mx-auto max-w-5xl p-3 sm:p-6"><CallsSection /><Toaster /></main>);
