import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from '../../src/lib/router';
import PublicRegistration from '../../src/pages/PublicRegistration';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
createRoot(document.getElementById('root')).render(<BrowserRouter><PublicRegistration /></BrowserRouter>);
