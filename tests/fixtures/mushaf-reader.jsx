import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentMushafSection from '@/components/portal/StudentMushafSection';
import { preloadCompleteOfflineMushaf } from '@/services/offlineMushaf';
import '@/index.css';

globalThis.mushafReaderFixture = { preloadCompleteOfflineMushaf };

const MushafReaderFixture = () => {
  const [finished, setFinished] = useState(false);
  return finished
    ? <p role="status">انتهت القراءة</p>
    : <StudentMushafSection onBack={() => setFinished(true)} />;
};

createRoot(document.getElementById('root')).render(<MushafReaderFixture />);
