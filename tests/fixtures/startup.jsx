import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StartupProvider from '../../src/components/startup/StartupProvider';
import StartupVisual from '../../src/components/startup/StartupVisual';
import AccountLoginPage from '../../src/components/public/AccountLoginPage';
import { getSiteConfig } from '../../src/site/siteConfigs';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
function Preview() {
  const [visible, setVisible] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const params = new URLSearchParams(location.search);
  return <StartupProvider>
    <Button className="fixed bottom-2 left-2 z-50" onClick={() => setVisible(value => !value)}>تبديل الصفحة</Button>
    {submitted && <output>نجح الإرسال</output>}
    {visible && (params.has('waiting') ? <StartupVisual /> : <AccountLoginPage site={getSiteConfig()} loading={false} onLogin={() => setSubmitted(true)} />)}
  </StartupProvider>;
}
createRoot(document.getElementById('root')).render(<Preview />);
