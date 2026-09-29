import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import useTeacherEvaluationData from '../../src/hooks/useTeacherEvaluationData';
import { studentsApi } from '../../src/services/studentsApi';
import { offlineRecitationStore } from '../../src/services/offlineRecitationStore';
import { refreshableSingleFlight } from '../../src/lib/asyncRequests';

const initial = { date: '2026-09-07', tasks: [{ id: 1, taskType: 'review' }], students: [] };
const slowStorage = new URLSearchParams(location.search).has('slowStorage');
let cached = slowStorage ? null : initial;
let releaseWrite;
let writing = false;
let cacheReads = 0;
const requests = [];
const renders = [];
studentsApi.getSupervisorQuranEvaluation = refreshableSingleFlight(
  () => new Promise((resolve, reject) => requests.push({ resolve, reject })), id => id,
);
offlineRecitationStore.getSnapshot = async (key) => {
  cacheReads++;
  return key.endsWith(':bootstrap') ? null : cached;
};
offlineRecitationStore.cacheSnapshot = async (_key, value) => {
  writing = true;
  if (slowStorage) await new Promise((resolve) => { releaseWrite = resolve; });
  cached = value;
};
offlineRecitationStore.getMeta = async () => null;
offlineRecitationStore.getSessions = async () => [];
offlineRecitationStore.getActions = async () => [];
const onLoaded = () => {};

function Fixture() {
  const evaluation = useTeacherEvaluationData(11, true, onLoaded);
  useLayoutEffect(() => { renders.push(evaluation.data?.tasks.length ?? null); });
  globalThis.refreshFixture = {
    evaluation, requests, renders,
    get writing() { return writing; },
    releaseWrite: () => releaseWrite?.(),
    get cacheReads() { return cacheReads; },
    finish: () => evaluation.setData((current) => ({ ...current, tasks: [] })),
  };
  return <div><output>{evaluation.data?.tasks.length ?? 'loading'}</output>
    {evaluation.data?.tasks.length > 0 && <button>مراجعة</button>}
    <p role="alert">{evaluation.loadError}</p>
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
