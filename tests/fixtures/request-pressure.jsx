import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorState from '../../src/components/ui/error-state';
import { request, studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';

globalThis.pressureFixture = { request, studentsApi };
function Fixture() {
  const [retryAt, setRetryAt] = useState(0);
  const [count, setCount] = useState(0);
  globalThis.pressureFixture.wait = () => setRetryAt(Date.now() + 2000);
  return <div className="p-4" dir="rtl"><ErrorState message="طلبات كثيرة. حاول مرة أخرى بعد قليل." retryAt={retryAt} onRetry={() => setCount(count + 1)} /><output>{count}</output></div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
