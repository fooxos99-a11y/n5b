import React from 'react';
import { createRoot } from 'react-dom/client';
import WhatsAppSendSection from '../../src/components/dashboard/WhatsAppSendSection';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local synthetic fixture only');
const mode = new URLSearchParams(location.search).get('mode') || 'suspended';
const calls = { connect: 0, observe: 0, send: 0 };
const state = mode === 'suspended' ? { ready: true, status: 'ready', suspended: true } : mode === 'error' ? { ready: false, status: 'error', message: 'تعذر تجهيز باركود واتساب.' } : { ready: false, status: 'starting', message: 'جاري تجهيز باركود واتساب...' };
studentsApi.getCommittees = async () => [];
studentsApi.getStudents = async () => [{ id: 99001, name: 'طالب تجريبي', guardianPhone: '00000000101' }];
studentsApi.getSupervisors = async () => [];
studentsApi.connectWhatsApp = async () => { calls.connect += 1; return { ...state }; };
studentsApi.getWhatsAppStatus = async () => { calls.observe += 1; return { ...state }; };
studentsApi.disconnectWhatsApp = async () => ({ status: 'disconnected', ready: false });
studentsApi.sendWhatsAppMessages = async () => { calls.send += 1; return { sentCount: 1, failedCount: 0 }; };
globalThis.whatsappFixture = { calls, state };
createRoot(document.getElementById('root')).render(<main style={{ padding: 12, maxWidth: 1100, margin: 'auto', fontFamily: 'var(--font-ui)' }}><WhatsAppSendSection /></main>);
