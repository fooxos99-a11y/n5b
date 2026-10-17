const BUILD_ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;

export async function hasRequiredWebUpdate({ currentBuild, baseUrl, request = fetch }) {
  if (!BUILD_ID.test(String(currentBuild || ''))) return false;
  const response = await request(`${baseUrl}app-version.json?_fresh=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) return false;
  const manifest = await response.json();
  return BUILD_ID.test(String(manifest?.buildId || '')) && manifest.buildId !== currentBuild;
}
