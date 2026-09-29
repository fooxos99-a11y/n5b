export function removedFeaturesMiddleware(req, res, next) {
  const path = req.path;
  const removedFeature = path.startsWith('/game-used-questions/')
    || path.startsWith('/letter-hive/')
    || /^\/students\/\d+\/paths(?:\/|$)/.test(path)
    || path.startsWith('/activity-logs');
  if (removedFeature) {
    return res.status(410).json({ message: 'هذه الميزة محذوفة من المنصة.' });
  }
  return next();
}
