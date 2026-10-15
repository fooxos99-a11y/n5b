import type { NativeSessionController } from '../domain/nativeSession';
import { canManageRegistration, decodeRegistrationAcceptance, decodeRegistrationAction, decodeRegistrationManagementCommittees, decodeRegistrationOpenState,
  decodeRegistrationRequests, type RegistrationAcceptancePayload, type RegistrationAcceptanceResult,
  type RegistrationActionResult, type RegistrationManagementData } from '../domain/registrationManagement';
import { NativeApiError } from './nativeApi';

export interface RegistrationManagementApi {
  load(signal?: AbortSignal): Promise<RegistrationManagementData>;
  setOpen(enabled: boolean, signal?: AbortSignal): Promise<boolean>;
  preliminaryAccept(requestId: number, signal?: AbortSignal): Promise<RegistrationActionResult>;
  reject(requestId: number, signal?: AbortSignal): Promise<RegistrationActionResult>;
  accept(requestId: number, payload: RegistrationAcceptancePayload, signal?: AbortSignal): Promise<RegistrationAcceptanceResult>;
}

export function createRegistrationManagementApi(controller: Pick<NativeSessionController, 'getSnapshot' | 'request'>): RegistrationManagementApi {
  const initial = controller.getSnapshot();
  if (initial.status !== 'authenticated' || !initial.session) throw new NativeApiError('unauthorized');
  const identity = { id: initial.session.id, role: initial.session.role, registrationNumber: initial.session.complex.registrationNumber };
  const assertContext = () => {
    const current = controller.getSnapshot();
    if (current.status !== 'authenticated' || !current.session) throw new NativeApiError('unauthorized');
    if (current.session.id !== identity.id || current.session.role !== identity.role
      || current.session.complex.registrationNumber !== identity.registrationNumber || !canManageRegistration(current.session)) throw new NativeApiError('forbidden');
  };
  assertContext();
  const scopedRequest: NativeSessionController['request'] = async (path, options, decode) => {
    assertContext();
    const response = await controller.request(path, options, decode);
    assertContext();
    return response;
  };
  const requestPath = (requestId: number, action: string) => {
    if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new NativeApiError('validation');
    return `/registration-requests/${requestId}/${action}`;
  };
  return {
    load: async signal => {
      const [requests, committees] = await Promise.all([
        scopedRequest('/registration-requests', { signal }, decodeRegistrationRequests),
        scopedRequest('/committees', { signal }, decodeRegistrationManagementCommittees),
      ]);
      return { ...requests, committees };
    },
    setOpen: (registrationEnabled, signal) => scopedRequest('/registration-requests/config', { method: 'PUT', body: { registrationEnabled }, signal }, decodeRegistrationOpenState),
    preliminaryAccept: (requestId, signal) => scopedRequest(requestPath(requestId, 'preliminary-accept'), { method: 'POST', body: {}, signal }, decodeRegistrationAction),
    reject: (requestId, signal) => scopedRequest(requestPath(requestId, 'reject'), { method: 'POST', body: {}, signal }, decodeRegistrationAction),
    accept: (requestId, body, signal) => scopedRequest(requestPath(requestId, 'accept'), { method: 'POST', body, signal }, decodeRegistrationAcceptance),
  };
}
