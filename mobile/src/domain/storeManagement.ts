import type { NativeRole, NativeSession } from './nativeSession';
import { hasManagementGrant } from './management';
import { attendanceAsciiDigits } from './attendanceManagement';
import { validSupervisorDate } from './supervisorDashboard';
import { validateStoreImageData } from './storeImage';
import { isUuid } from '../../../shared/offline-recitation.js';
import { NativeApiError } from '../services/nativeApi';

export interface StoreProduct { readonly id: number; readonly name: string; readonly imageData: string; readonly pointsPrice: number; readonly stock: number | null; readonly isActive: boolean }
export interface StoreProductDraft { name: string; imageData: string; pointsPrice: string; stock: string; isActive: boolean }
export interface StoreProductPayload { name: string; imageData?: string; pointsPrice: number; stock: number | null; isActive: boolean }
export interface StoreConfiguration { readonly pointsSystemEnabled: true; readonly storeEnabled: boolean; readonly storePurchaseDeductsRanking: boolean }
export type StoreConfigurationPatch = Partial<Pick<StoreConfiguration, 'storeEnabled' | 'storePurchaseDeductsRanking'>>;
export type StoreOrderDecision = 'accepted' | 'rejected';
export interface StoreOrder {
  readonly id: number; readonly productName: string; readonly pointsPrice: number; readonly createdAt: string;
  readonly studentName: string; readonly committeeName: string | null; readonly fulfilled: boolean;
  readonly status: 'pending' | StoreOrderDecision; readonly fulfilledAt: string | null; readonly rejectedAt: string | null;
}
export interface StoreManagementData {
  readonly scopeKey: string; readonly actor: { readonly role: NativeRole; readonly id: number; readonly name: string };
  readonly configuration: StoreConfiguration; readonly products: readonly StoreProduct[]; readonly orders: readonly StoreOrder[];
  readonly canManage: true; readonly uncertainOperation: boolean;
}
export interface StudentStoreScope { readonly apiBase: string; readonly registrationNumber: string; readonly role: 'student'; readonly id: number }
export interface StudentStoreSnapshot {
  readonly scope: StudentStoreScope; readonly scopeKey: string; readonly enabled: boolean;
  readonly products: readonly StoreProduct[]; readonly storeBalance: number | null;
}
export interface StudentStorePurchase { readonly productId: number; readonly requestId: string; readonly purchaseDate: string }
export interface StorePurchaseResult { readonly ok: true; readonly orderId: number; readonly purchaseDate: string; readonly storeBalance: number; readonly alreadySynced: boolean }
export function storeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new NativeApiError('invalid-response'); return value;
}
function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') throw new NativeApiError('invalid-response'); return value;
}
export function storeId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new NativeApiError('validation'); return value;
}
export function canManageStore(identity: NativeSession | null): boolean { return hasManagementGrant(identity, 'store'); }
export function decodeStorePublicSettings(value: unknown): { storeEnabled: boolean; storeSectionEnabled: boolean } {
  const row = storeObject(value);
  if (typeof row.storeEnabled !== 'boolean' || typeof row.storeSectionEnabled !== 'boolean') throw new NativeApiError('invalid-response');
  return { storeEnabled: row.storeEnabled, storeSectionEnabled: row.storeSectionEnabled };
}
export function decodeStudentStoreSettings(value: unknown): { storeEnabled: boolean } {
  const row = storeObject(value); if (typeof row.storeEnabled !== 'boolean') throw new NativeApiError('invalid-response'); return { storeEnabled: row.storeEnabled };
}
export function decodeStoreConfiguration(value: unknown): StoreConfiguration {
  const row = storeObject(value);
  if (row.pointsSystemEnabled !== true || typeof row.storeEnabled !== 'boolean' || typeof row.storePurchaseDeductsRanking !== 'boolean') throw new NativeApiError('invalid-response');
  return Object.freeze({ pointsSystemEnabled: true, storeEnabled: row.storeEnabled, storePurchaseDeductsRanking: row.storePurchaseDeductsRanking });
}
export function decodeStoreProduct(value: unknown): StoreProduct {
  const row = storeObject(value);
  if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 180 || typeof row.isActive !== 'boolean') throw new NativeApiError('invalid-response');
  let imageData: string;
  try { imageData = validateStoreImageData(row.imageData ?? ''); } catch { throw new NativeApiError('invalid-response'); }
  return Object.freeze({ id: integer(row.id, 1), name: row.name, imageData, pointsPrice: integer(row.pointsPrice, 1), stock: row.stock === null ? null : integer(row.stock), isActive: row.isActive });
}
export function decodeStoreProducts(value: unknown, student = false): { products: readonly StoreProduct[]; storeBalance: number | null } {
  const row = storeObject(value); if (!Array.isArray(row.products)) throw new NativeApiError('invalid-response');
  const products = row.products.map(decodeStoreProduct);
  if (new Set(products.map(product => product.id)).size !== products.length || (student && products.some(product => !product.isActive || product.stock === 0))) throw new NativeApiError('invalid-response');
  const storeBalance = student ? row.storeBalance : null;
  if (student && (typeof storeBalance !== 'number' || !Number.isFinite(storeBalance) || storeBalance < 0)) throw new NativeApiError('invalid-response');
  return { products: Object.freeze(products), storeBalance: storeBalance as number | null };
}
function timestamp(value: unknown, nullable = false): string | null {
  const result = text(value, nullable); if (result === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) throw new NativeApiError('invalid-response'); return result;
}
export function decodeStoreOrder(value: unknown): StoreOrder {
  const row = storeObject(value), createdAt = text(row.createdAt) as string;
  const fulfilledAt = timestamp(row.fulfilledAt, true), rejectedAt = timestamp(row.rejectedAt, true);
  const expectedStatus = rejectedAt ? 'rejected' : fulfilledAt ? 'accepted' : 'pending';
  if (!/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(createdAt) || !validSupervisorDate(createdAt.slice(0, 10))
    || row.status !== expectedStatus || row.fulfilled !== Boolean(fulfilledAt) || (fulfilledAt && rejectedAt)) throw new NativeApiError('invalid-response');
  return Object.freeze({ id: integer(row.id, 1), productName: text(row.productName) as string, pointsPrice: integer(row.pointsPrice, 1), createdAt,
    studentName: text(row.studentName) as string, committeeName: text(row.committeeName, true), fulfilled: row.fulfilled as boolean, status: expectedStatus, fulfilledAt, rejectedAt });
}
export function decodeStoreOrders(value: unknown): readonly StoreOrder[] {
  if (!Array.isArray(value)) throw new NativeApiError('invalid-response'); const rows = value.map(decodeStoreOrder);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new NativeApiError('invalid-response'); return Object.freeze(rows);
}
export const emptyStoreProductDraft = (): StoreProductDraft => ({ name: '', imageData: '', pointsPrice: '1', stock: '', isActive: true });
export function storeProductDraft(product: StoreProduct): StoreProductDraft { return { name: product.name, imageData: product.imageData, pointsPrice: String(product.pointsPrice), stock: product.stock === null ? '' : String(product.stock), isActive: product.isActive }; }
export function normalizeStoreProductDraft(draft: StoreProductDraft, expected?: StoreProduct): StoreProductPayload {
  if (!draft || typeof draft.name !== 'string' || typeof draft.pointsPrice !== 'string' || typeof draft.stock !== 'string' || typeof draft.imageData !== 'string' || typeof draft.isActive !== 'boolean') throw new NativeApiError('validation');
  const name = draft.name.trim(), price = attendanceAsciiDigits(draft.pointsPrice).trim(), stock = attendanceAsciiDigits(draft.stock).trim();
  if (!name || name.length > 180 || !/^\d+$/.test(price) || !Number.isSafeInteger(Number(price)) || Number(price) < 1
    || (stock && (!/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock))))) throw new NativeApiError('validation');
  const payload: StoreProductPayload = { name, pointsPrice: Number(price), stock: stock === '' ? null : Number(stock), isActive: draft.isActive };
  if (!expected || draft.imageData !== expected.imageData) payload.imageData = validateStoreImageData(draft.imageData, { forUpload: true });
  return payload;
}
export function normalizeStoreConfigurationPatch(patch: StoreConfigurationPatch): StoreConfigurationPatch {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new NativeApiError('validation');
  const keys = Object.keys(patch); if (!keys.length || keys.some(key => !['storeEnabled', 'storePurchaseDeductsRanking'].includes(key) || typeof patch[key as keyof StoreConfigurationPatch] !== 'boolean')) throw new NativeApiError('validation');
  return { ...patch };
}
export function storeConfigurationTarget(current: StoreConfiguration, patch: StoreConfigurationPatch): StoreConfiguration {
  const storeEnabled = patch.storeEnabled ?? current.storeEnabled;
  return Object.freeze({ pointsSystemEnabled: true, storeEnabled, storePurchaseDeductsRanking: storeEnabled && (patch.storePurchaseDeductsRanking ?? current.storePurchaseDeductsRanking) });
}
export function normalizeStudentStorePurchase(input: StudentStorePurchase): StudentStorePurchase {
  if (!input || typeof input.requestId !== 'string' || !isUuid(input.requestId) || typeof input.purchaseDate !== 'string' || !validSupervisorDate(input.purchaseDate)) throw new NativeApiError('validation');
  return Object.freeze({ productId: storeId(input.productId), requestId: input.requestId.toLowerCase(), purchaseDate: input.purchaseDate });
}
export function decodeStorePurchaseResult(value: unknown): StorePurchaseResult {
  const row = storeObject(value);
  if (row.ok !== true || typeof row.purchaseDate !== 'string' || !validSupervisorDate(row.purchaseDate) || typeof row.storeBalance !== 'number' || !Number.isFinite(row.storeBalance) || row.storeBalance < 0
    || (row.alreadySynced !== undefined && typeof row.alreadySynced !== 'boolean')) throw new NativeApiError('invalid-response');
  return Object.freeze({ ok: true, orderId: integer(row.orderId, 1), purchaseDate: row.purchaseDate, storeBalance: row.storeBalance, alreadySynced: row.alreadySynced === true });
}
export function decodeStorePurchase(value: unknown, expected: StudentStorePurchase): StorePurchaseResult {
  const row = decodeStorePurchaseResult(value); if (row.purchaseDate !== expected.purchaseDate) throw new NativeApiError('invalid-response'); return row;
}
export function decodeStudentStoreSnapshot(value: unknown, scope: StudentStoreScope, scopeKey: string): StudentStoreSnapshot {
  const row = storeObject(value), storedScope = storeObject(row.scope);
  if (storedScope.apiBase !== scope.apiBase || storedScope.registrationNumber !== scope.registrationNumber || storedScope.role !== scope.role || storedScope.id !== scope.id
    || row.scopeKey !== scopeKey || typeof row.enabled !== 'boolean') throw new NativeApiError('invalid-response');
  const catalog = decodeStoreProducts(row, row.enabled);
  if (!row.enabled && (catalog.products.length || row.storeBalance !== null)) throw new NativeApiError('invalid-response');
  return Object.freeze({ scope: Object.freeze({ ...scope }), scopeKey, enabled: row.enabled, products: catalog.products, storeBalance: row.enabled ? catalog.storeBalance : null });
}
export const storeProductSnapshot = (product: StoreProduct): string => JSON.stringify([product.id, product.name, product.imageData, product.pointsPrice, product.stock, product.isActive]);
export const storeConfigurationSnapshot = (configuration: StoreConfiguration): string => JSON.stringify([configuration.pointsSystemEnabled, configuration.storeEnabled, configuration.storePurchaseDeductsRanking]);
export const storeOrderSnapshot = (order: StoreOrder): string => JSON.stringify([order.id, order.productName, order.pointsPrice, order.createdAt, order.studentName, order.committeeName, order.fulfilled, order.status, order.fulfilledAt, order.rejectedAt]);
