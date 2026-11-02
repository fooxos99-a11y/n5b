/** Only the latest plan can remain current; a paused replacement must not revive an older plan. */
export function currentQuranPlanSql(alias = 'p') {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid internal plan alias');
  return `${alias}.status IN ('active', 'completed') AND ${alias}.id = (SELECT MAX(current_plan.id) FROM student_quran_plans current_plan WHERE current_plan.student_id = ${alias}.student_id)`;
}

export const canContinueQuranRevision = plan => ['active', 'completed'].includes(plan?.status);

/** Bind the session date: a queued successor must not hide that session's remaining revision. */
export function pendingSessionQuranPlanSql(planAlias = 'p', taskAlias = 't') {
  if (![planAlias, taskAlias].every(alias => /^[a-z_]+$/.test(alias))) throw new Error('Invalid internal plan alias');
  return `(${planAlias}.status = 'completed' AND ${taskAlias}.task_type IN ('review', 'link')
    AND EXISTS (SELECT 1 FROM student_quran_plans session_successor
      WHERE session_successor.student_id = ${planAlias}.student_id
        AND session_successor.previous_plan_id = ${planAlias}.id
        AND session_successor.queue_parent_id = ${planAlias}.id
        AND ${currentQuranPlanSql('session_successor')}
        AND COALESCE(session_successor.effective_from, session_successor.start_date) > ?))`;
}
