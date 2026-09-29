const normalizePages = (pages = []) => [...new Set(
  [...pages].map(Number).filter((page) => Number.isInteger(page) && page >= 1 && page <= 604),
)];

export function partitionQuranRevisionPages({
  memorizedPages = [],
  currentMemorizationPage,
  direction = 1,
  linkPages = 10,
} = {}) {
  const traversalDirection = Number(direction) < 0 ? -1 : 1;
  const currentPage = Number(currentMemorizationPage || 0);
  const orderedCompletedPages = normalizePages(memorizedPages)
    .sort((first, second) => (first - second) * traversalDirection);
  const linkCount = Math.max(0, Math.trunc(Number(linkPages || 0)));
  const memorizedSet = new Set(orderedCompletedPages);
  const linking = [];
  if (linkCount && currentPage) {
    let cursor = currentPage - traversalDirection;
    while (linking.length < linkCount && memorizedSet.has(cursor)) {
      linking.push(cursor);
      cursor -= traversalDirection;
    }
    linking.reverse();
  } else if (linkCount) {
    linking.push(...orderedCompletedPages.slice(-linkCount));
  }
  const linkingSet = new Set(linking);

  return {
    linking,
    review: orderedCompletedPages.filter((page) => !linkingSet.has(page)),
  };
}
