import React from 'react';
import { createRoot } from 'react-dom/client';
import CountOnlyEvaluationDialog from '../../src/components/portal/CountOnlyEvaluationDialog';
import { DEFAULT_GRADING_POLICY } from '../../shared/grading-policy.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const items = Object.freeze([1,2,3,4].map(id=>({ id, hizbNumber:id, label:`الحزب ${id}` })));
createRoot(document.getElementById('root')).render(
  <CountOnlyEvaluationDialog open title="تسميع المراجعة" taskType="review" gradingPolicy={DEFAULT_GRADING_POLICY} items={items} />,
);
