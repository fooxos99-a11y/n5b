/** The points system is always on; only the features built on it can be switched. */
export const enforcePointsFeatureDependencies = (settings = {}) => {
  const next = { ...settings, pointsSystemEnabled: true };
  next.rankingsVisible = Boolean(next.studentRankingsVisible || next.familyRankingsVisible);
  if (!next.rankingsVisible) next.rankingPointsVisible = false;
  if (!next.storeEnabled) next.storePurchaseDeductsRanking = false;
  return next;
};
