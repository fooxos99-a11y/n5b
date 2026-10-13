const samePoint = (first, second) => first.x === second.x && first.y === second.y;

function roundedOutline(bands, radius) {
  const points = [{ x: bands[0].left, y: bands[0].top }, { x: bands[0].right, y: bands[0].top }];
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    points.push({ x: band.right, y: band.bottom });
    if (bands[index + 1]) points.push({ x: bands[index + 1].right, y: band.bottom });
  }
  const last = bands.at(-1);
  points.push({ x: last.left, y: last.bottom });
  for (let index = bands.length - 1; index >= 0; index -= 1) {
    const band = bands[index];
    points.push({ x: band.left, y: band.top });
    if (bands[index - 1]) points.push({ x: bands[index - 1].left, y: band.top });
  }
  const unique = points.filter((point, index) => !samePoint(point, points[(index + points.length - 1) % points.length]));
  const corners = unique.filter((point, index) => {
    const previous = unique[(index + unique.length - 1) % unique.length];
    const next = unique[(index + 1) % unique.length];
    return !((previous.x === point.x && next.x === point.x) || (previous.y === point.y && next.y === point.y));
  });
  const arcs = corners.map((point, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length];
    const next = corners[(index + 1) % corners.length];
    const before = Math.hypot(previous.x - point.x, previous.y - point.y);
    const after = Math.hypot(next.x - point.x, next.y - point.y);
    const distance = Math.min(radius, before / 2, after / 2);
    return {
      point,
      entry: { x: point.x + (previous.x - point.x) * distance / before, y: point.y + (previous.y - point.y) * distance / before },
      exit: { x: point.x + (next.x - point.x) * distance / after, y: point.y + (next.y - point.y) * distance / after },
    };
  });
  if (!arcs.length) return '';
  return `M ${arcs[0].entry.x} ${arcs[0].entry.y} ${arcs.map(({ entry, point, exit }) => (
    `L ${entry.x} ${entry.y} Q ${point.x} ${point.y} ${exit.x} ${exit.y}`
  )).join(' ')} Z`;
}

// Join adjacent selected lines in the space between them, preserving partial-line edges.
export function buildMushafHighlightPaths(rectangles, radius = 5) {
  const groups = [];
  for (const rectangle of [...rectangles].sort((first, second) => first.line - second.line)) {
    if (rectangle.right <= rectangle.left || rectangle.bottom <= rectangle.top) continue;
    let group = groups.at(-1);
    if (!group || rectangle.line !== group.at(-1).line + 1) {
      group = [];
      groups.push(group);
    }
    group.push({ ...rectangle });
  }
  return groups.map((rows) => {
    const bands = [];
    for (let index = 0; index < rows.length; index += 1) {
      const current = rows[index];
      const next = rows[index + 1];
      bands.push(current);
      if (!next) continue;
      const overlap = Math.min(current.right, next.right) - Math.max(current.left, next.left);
      if (overlap > 0) {
        const middle = (current.bottom + next.top) / 2;
        current.bottom = middle;
        next.top = middle;
      } else {
        // An RTL wrap can have disjoint ends; the connector stays in the inter-line gap.
        bands.push({ left: Math.min(current.left, next.left), right: Math.max(current.right, next.right), top: current.bottom, bottom: next.top });
      }
    }
    return roundedOutline(bands, radius);
  }).filter(Boolean);
}
