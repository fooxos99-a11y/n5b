export function sendWhatsAppResult(res, prepared, failed, fallbackMessage) {
  const sentCount = prepared.filter((item) => item.status === 'sent').length;
  const summary = { preparedCount: prepared.length, sentCount, failedCount: failed.length, prepared, failed };
  if (sentCount === 0) {
    return res.status(502).json({ message: failed[0]?.reason || fallbackMessage, ...summary });
  }
  return res.json(summary);
}
