export const MUSHAF_DATA_VERSION = 2;

export const versionedMushafAsset = (path) => path.endsWith('.json')
  ? `${path}?v=${MUSHAF_DATA_VERSION}`
  : path;
