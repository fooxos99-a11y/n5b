import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherEvaluationDialog from '../../src/components/portal/TeacherEvaluationDialog';
import { studentsApi } from '../../src/services/studentsApi';
import { getCachedTeacherEvaluation, prefetchRecitationTasks, syncOfflineRecitations } from '../../src/services/offlineRecitationService';
import { offlineRecitationStore } from '../../src/services/offlineRecitationStore';
import '../../src/index.css';

globalThis.recitationFixture = { getCachedTeacherEvaluation, load: studentsApi.getSupervisorQuranEvaluation,
  prefetchRecitationTasks, syncOfflineRecitations, store: offlineRecitationStore, api: studentsApi };

createRoot(document.getElementById('root')).render(<>
  <div id="dashboard-mobile-header-actions" />
  <TeacherEvaluationDialog supervisorId="990" inline />
</>);
