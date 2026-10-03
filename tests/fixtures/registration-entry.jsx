import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { BrowserRouter } from '../../src/lib/router';
import { SiteProvider } from '../../src/site/SiteProvider';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
localStorage.setItem('nukhab_tenant_registration_number', '9999');
localStorage.removeItem('wajeh_role');
const originalFetch = window.fetch;
const parameters = new URLSearchParams(location.search);
const calls = [];
let failed = false;
window.fetch = async (url, options = {}) => {
  if (!String(url).includes('/api/')) return originalFetch(url, options);
  const call = { url: String(url), method: options.method || 'GET', tenant: options.headers?.['X-Registration-Number'] || '', body: options.body ? JSON.parse(options.body) : null };
  calls.push(call);
  document.getElementById('requests').textContent = JSON.stringify(calls);
  if (String(url).includes('/registration/public')) {
    if (parameters.has('fail') && !failed) {
      failed = true;
      return new Response(JSON.stringify({ message: 'المجمع غير موجود أو غير مفعّل.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return Response.json(call.method === 'POST' ? { ok: true, id: 1 } : {
      enabled: !parameters.has('closed'), juzRanges: [],
      complexes: [{id:1,name:'مجمع النور'},{id:2,name:'مجمع الفرقان'},{id:3,name:'مجمع بلا حلقات'}],
      committees: [{id:7,name:'حلقة الفجر',complexId:1},{id:8,name:'حلقة العصر',complexId:2}],
    });
  }
  return Response.json({});
};
createRoot(document.getElementById('root')).render(<BrowserRouter basename="/tests/fixtures/registration-entry.html"><SiteProvider><App /></SiteProvider></BrowserRouter>);
const output = document.createElement('output');
output.id = 'requests';
output.hidden = true;
document.body.append(output);
