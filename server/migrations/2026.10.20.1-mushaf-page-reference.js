import { upReferenceRepair, downReferenceRepair } from '../services/quranReferenceRepair.js';

export const version = '2026.10.20.1';
export const up = connection => upReferenceRepair(connection, version);
export const down = connection => downReferenceRepair(connection, version);
