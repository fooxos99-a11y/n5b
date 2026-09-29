/** Competition ranking: equal points share a place; the next place skips the tie. */
export function assignRankingPositions(rows) {
  let rank = 0;
  return rows.map((row, index) => {
    if (!index || Number(row.points) !== Number(rows[index - 1].points)) rank = index + 1;
    return { ...row, rank };
  });
}
