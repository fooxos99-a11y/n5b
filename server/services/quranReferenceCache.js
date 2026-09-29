// Immutable reference data only; each database connection owns its own cache.
const caches = new WeakMap();
const chapterCaches = new WeakMap();

/** Coalesce immutable chapter reads per database pool and return caller-owned rows. */
export async function readQuranChapters(connection) {
  let pending = chapterCaches.get(connection);
  if (pending === undefined) {
    // This fixed query has no external identifiers or values to interpolate.
    pending = connection.query(`SELECT surah_number AS number, name_arabic AS name,
      name_english AS englishName, ayah_count AS ayahCount,
      start_page AS startPage, end_page AS endPage
      FROM quran_surahs ORDER BY surah_number ASC`).then(([rows]) => rows);
    chapterCaches.set(connection, pending);
    pending.catch(() => chapterCaches.delete(connection));
  }
  return (await pending).map(row => ({ ...row }));
}
async function reference(connection) {
  let pending = caches.get(connection);
  if (!pending) {
    pending = connection.query(`SELECT surah_number AS surah, surah_name AS surahName,
      ayah_number AS ayah, page_number AS page, juz_number AS juz, text_uthmani AS textUthmani
      FROM quran_ayah_pages ORDER BY page_number, surah_number, ayah_number`).then(([rows]) => {
      const values = rows.map(row => ({ ...row, surah: Number(row.surah), ayah: Number(row.ayah), page: Number(row.page), juz: Number(row.juz), textUthmani: row.textUthmani || '' }));
      return { rows: values, byAyah: new Map(values.map(row => [`${row.surah}:${row.ayah}`, row])) };
    });
    caches.set(connection, pending);
    pending.catch(() => caches.delete(connection));
  }
  return pending;
}
export async function readQuranAyah(connection, surah, ayah) {
  const row = (await reference(connection)).byAyah.get(`${Number(surah)}:${Number(ayah)}`);
  return row ? { surah: row.surah, surahName: row.surahName, ayah: row.ayah, page: row.page, juz: row.juz } : null;
}
export async function readQuranRange(connection, first, last) {
  const low = Math.min(Number(first), Number(last)), high = Math.max(Number(first), Number(last));
  return (await reference(connection)).rows.filter(row => row.page >= low && row.page <= high).map(row => ({ ...row }));
}

export async function readDescendingNextAyah(connection, position) {
  const data = await reference(connection);
  if (!data.descendingNext) {
    const sorted = [...data.rows].sort((a, b) => b.surah - a.surah || a.ayah - b.ayah);
    data.descendingRows = sorted;
    data.descendingNext = new Map(sorted.map((row, index) => [`${row.surah}:${row.ayah}`, sorted[index + 1] || null]));
  }
  const key = `${Number(position.surah)}:${Number(position.ayah)}`;
  const row = data.descendingNext.has(key) ? data.descendingNext.get(key)
    : data.descendingRows.find(item => item.surah === Number(position.surah) && item.ayah > Number(position.ayah) || item.surah < Number(position.surah));
  return row ? { surah: row.surah, ayah: row.ayah, page: row.page } : null;
}
