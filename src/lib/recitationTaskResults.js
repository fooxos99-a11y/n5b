// A session may fail after one or more tasks have committed on the server.
export function recitationRejectionDetails(outcome) {
  const failed = outcome.tasks?.find(item => !['accepted', 'already_synced'].includes(item.result));
  if (!failed) return null;
  return {
    taskId: Number(failed.taskId) || null,
    code: failed.data?.code || '', reason: failed.data?.reason || '',
    requestId: failed.data?.requestId || failed.requestId || '',
  };
}

export const hasAcceptedRecitationTask = (session, item) => (
  session.status !== 'rejected_duplicate'
  && (session.status === 'synced' || ['accepted', 'already_synced'].includes(item.syncResultCode))
  && item.synced === true && item.result?.ok === true
);

export function mergeRecitationTaskResults(tasks = [], outcomes = []) {
  const byId = new Map(outcomes.map((outcome) => [Number(outcome.taskId), outcome]));
  return tasks.map((item) => {
    const outcome = byId.get(Number(item.taskId));
    if (!['accepted', 'already_synced'].includes(outcome?.result) || outcome.data?.ok !== true) return item;
    return { ...item, synced: true, syncResultCode: outcome.result, result: outcome.data };
  });
}

export function mergeEditableRecitationTasks(existing, tasks = []) {
  const accepted = (existing?.tasks || []).filter((item) => hasAcceptedRecitationTask(existing, item));
  const acceptedIds = new Set(accepted.map((item) => Number(item.taskId)));
  return [...accepted, ...tasks.filter((item) => !acceptedIds.has(Number(item.taskId)))];
}
