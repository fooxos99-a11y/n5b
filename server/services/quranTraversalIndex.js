// Quran positions are reference data. Cache per connection so tenant data never
// crosses a database boundary; released connections can be garbage collected.
const indexes = new WeakMap();
const compare = (a, b) => Number(a.page) - Number(b.page)
  || Number(a.surah) - Number(b.surah) || Number(a.ayah) - Number(b.ayah);

export function adjacentPosition(rows, position, previous = false) {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(rows[middle], position) < (previous ? 0 : 1)) low = middle + 1;
    else high = middle;
  }
  const row = rows[previous ? low - 1 : low];
  return row ? { ...row } : null;
}

async function loadPositions(connection) {
  let pending = indexes.get(connection);
  if (!pending) {
    pending = connection.query(
      'SELECT surah_number AS surah, ayah_number AS ayah, page_number AS page FROM quran_ayah_pages ORDER BY page_number, surah_number, ayah_number',
    ).then(([rows]) => rows);
    indexes.set(connection, pending);
    pending.catch(() => indexes.delete(connection));
  }
  return pending;
}

export async function loadAdjacentQuranPosition(connection, position, direction) {
  return adjacentPosition(await loadPositions(connection), position, direction === 'previous');
}

export async function loadQuranPagePositions(connection, page) {
  return (await loadPositions(connection)).filter((row) => Number(row.page) === Number(page))
    .map((row) => ({ page: Number(row.page), surah: Number(row.surah), ayah: Number(row.ayah) }));
}
