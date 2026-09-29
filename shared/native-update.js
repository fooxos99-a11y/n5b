export function versionIsOlder(current, minimum) {
  if (![current, minimum].every(value => /^\d+(\.\d+){1,3}$/.test(String(value)))) return false;
  const a = current.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}
