import { storeProductSnapshot, type StoreProduct } from '../../domain/storeManagement';

export function storePurchaseAvailability(product: StoreProduct, balance: number | null): 'available' | 'unavailable' | 'insufficient' | 'unknown-balance' {
  if (!product.isActive || product.stock === 0) return 'unavailable';
  if (balance === null) return 'unknown-balance';
  return balance < product.pointsPrice ? 'insufficient' : 'available';
}
export function sameStoreProduct(current: StoreProduct | undefined, expected: StoreProduct): boolean {
  return !!current && storeProductSnapshot(current) === storeProductSnapshot(expected);
}
