export function assertPlanDailyThreshold(policy, dailyFaces) {
  const faces = Math.ceil(Number(dailyFaces));
  if (!policy.weeklyProgram.memorizationThresholds.some(item => Number(item.faces) === faces)) {
    throw Object.assign(new Error(`أضف حد الرسوب لمقدار ${faces} أوجه في إعدادات البرنامج الأسبوعي قبل حفظ الخطة.`), { statusCode: 422 });
  }
}
