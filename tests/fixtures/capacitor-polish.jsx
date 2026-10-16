import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClipboardCheck } from 'lucide-react';
import DashboardShell from '../../src/components/dashboard/DashboardShell';
import GradingSettingsPanel from '../../src/components/dashboard/GradingSettingsPanel';
import TeacherEvaluationDialog from '../../src/components/portal/TeacherEvaluationDialog';
import { SiteProvider } from '../../src/site/SiteProvider';
import { applyTheme } from '../../src/lib/theme';
import { offlineRecitationStore } from '../../src/services/offlineRecitationStore';
import '../../src/index.css';
import '../../src/styles/native-system-bars.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
globalThis.capacitorPolishFixture = { store: offlineRecitationStore };
const params = new URLSearchParams(location.search);
applyTheme(params.get('theme') || 'light');
if (params.has('native')) {
  const root = document.documentElement;
  root.classList.add('native-app');
  root.dataset.nativePlatform = params.get('native');
  for (const [edge, value] of Object.entries({ top: 47, bottom: 34, left: 0, right: 0 })) {
    root.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
  }
}
const sections = [
  { key: 'settings', label: 'البرنامج الأسبوعي', icon: ClipboardCheck },
  { key: 'session', label: 'جلسات التسميع', icon: ClipboardCheck },
  ...Array.from({ length: 8 }, (_, index) => ({ key: `section-${index}`, label: `قسم ${index + 1}`, icon: ClipboardCheck })),
];
function Preview() {
  const [section, setSection] = useState(params.get('view') || 'settings');
  const [status, setStatus] = useState('idle');
  return <SiteProvider><DashboardShell sections={sections} activeSection={section} onSectionChange={setSection} onLogout={() => {}}>
    {section === 'session' ? <TeacherEvaluationDialog supervisorId="990" inline />
      : <><output data-testid="autosave-status">{status}</output><GradingSettingsPanel onStatusChange={setStatus} /></>}
  </DashboardShell></SiteProvider>;
}
createRoot(document.getElementById('root')).render(<Preview />);
