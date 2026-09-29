/** Only the latest plan can remain current; a paused replacement must not revive an older plan. */
export function currentQuranPlanSql(alias = 'p') {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid internal plan alias');
  return `${alias}.status IN ('active', 'completed') AND ${alias}.id = (SELECT MAX(current_plan.id) FROM student_quran_plans current_plan WHERE current_plan.student_id = ${alias}.student_id)`;
}

export const canContinueQuranRevision = plan => ['active', 'completed'].includes(plan?.status);
