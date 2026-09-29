import React from 'react';
import { createRoot } from 'react-dom/client';
import CountOnlyEvaluationDialog from '../../src/components/portal/CountOnlyEvaluationDialog';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
createRoot(document.getElementById('root')).render(<CountOnlyEvaluationDialog open items={[{ id: 1, label: 'مقطع 1' }]} secondaryAction={<Button variant="outline">لم يتم الحفظ</Button>} />);
