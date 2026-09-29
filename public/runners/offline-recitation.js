/* global addEventListener, CapacitorKV */
addEventListener('nukhabOfflineRecitationSync', (resolve) => {
  CapacitorKV.set('nukhab_offline_recitation_wakeup', new Date().toISOString());
  resolve({ requested: true });
});

addEventListener('consumeNukhabOfflineRecitationWakeup', (resolve) => {
  const stored = CapacitorKV.get('nukhab_offline_recitation_wakeup');
  if (stored?.value) CapacitorKV.remove('nukhab_offline_recitation_wakeup');
  resolve({ requested: Boolean(stored?.value), requestedAt: stored?.value || null });
});
