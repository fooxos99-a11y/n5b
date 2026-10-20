export const facePortionLabel = portion => portion === 'remainder' ? 'بقية وجه' : portion === 'partial' ? 'جزء من وجه' : '';
export const withFacePortionLabel = (task, text) => {
  const label = facePortionLabel(task.facePortion);
  return label && text && !String(text).startsWith(`${label}:`) ? `${label}: ${text}` : text;
};

export function splitFacePortionAmount(text = '') {
  for (const portion of ['remainder', 'partial']) {
    const label = facePortionLabel(portion);
    if (String(text).startsWith(`${label}:`)) return { label, amount: String(text).slice(label.length + 1).trim() };
  }
  return { label: '', amount: text };
}
