import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ScreenLoadingProvider from '../../src/components/ui/screen-loading-provider';
import LoadingIndicator from '../../src/components/ui/loading-indicator';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
function Fixture() {
 const [stage, setStage] = useState(1);
 globalThis.loadingTest = setStage;
 return <ScreenLoadingProvider><div style={{ paddingTop: stage * 100, height: 1500 }}>
 {stage > 0 && stage < 4 && <div key={stage}><LoadingIndicator mode="screen" />{stage === 3 && <LoadingIndicator mode="screen" />}</div>}
 {stage === 4 && <h1>الحساب جاهز</h1>}
 </div></ScreenLoadingProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
