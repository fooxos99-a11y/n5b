import type { ReportManagementData } from '../../domain/reportManagement';
import { NativeApiError } from '../../services/nativeApi';

export type ReportReadMetadata = Pick<ReportManagementData, 'grants' | 'settings' | 'committees' | 'complexes' | 'archives'>;
/** Recovery keeps only verified choices for this API instance; report payloads never enter this cache. */
export function createReportReadState() {
  let owner: object | null = null; let metadata: ReportReadMetadata | null = null;
  return {
    bind(api: object): ReportReadMetadata | null {
      if (owner !== api) { owner = api; metadata = null; }
      return metadata;
    },
    accepted(api: object, result: ReportManagementData) {
      if (owner !== api) return false;
      metadata = { grants: { ...result.grants }, settings: { ...result.settings }, committees: result.committees.map(row => ({ ...row })),
        complexes: result.complexes.map(row => ({ ...row })), archives: result.archives.map(row => ({ ...row })) };
      return true;
    },
    failed(api: object, cause: unknown) {
      if (owner === api && cause instanceof NativeApiError && ['forbidden', 'unauthorized', 'cancelled'].includes(cause.code)) { metadata = null; return true; }
      return false;
    },
  };
}
