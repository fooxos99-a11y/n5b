import { Capacitor } from '@capacitor/core';
import { trimTrailingCharacter } from '../../shared/string-suffix.js';

const appBase = import.meta.env.BASE_URL === '/'
  ? ''
  : import.meta.env.BASE_URL.replace(/\/$/, '');

export const apiBase = (import.meta.env.VITE_API_BASE || `${appBase}/api`).replace(/\/$/, '');

const tenantApiStorageKey = 'nukhab_tenant_api_base';
const tenantRegistrationStorageKey = 'nukhab_tenant_registration_number';

export const getApiBase = () => {
  if (!Capacitor.isNativePlatform()) return apiBase;
  return localStorage.getItem(tenantApiStorageKey)?.replace(/\/$/, '') || apiBase;
};

export const setTenantApiBase = (value) => {
  if (!Capacitor.isNativePlatform()) {
    localStorage.removeItem(tenantApiStorageKey);
    return;
  }
  const normalized = trimTrailingCharacter(String(value || '').trim(), '/');
  if (normalized) localStorage.setItem(tenantApiStorageKey, normalized);
  else localStorage.removeItem(tenantApiStorageKey);
};

export const clearTenantApiBase = () => localStorage.removeItem(tenantApiStorageKey);

export const getTenantRegistrationNumber = () => (
  localStorage.getItem(tenantRegistrationStorageKey)?.trim() || ''
);

export const setTenantRegistrationNumber = (value) => {
  const normalized = String(value || '').trim();
  if (normalized) localStorage.setItem(tenantRegistrationStorageKey, normalized);
  else localStorage.removeItem(tenantRegistrationStorageKey);
  window.dispatchEvent(new CustomEvent('nukhab-tenant-change', { detail: normalized }));
};

export const clearTenantRegistrationNumber = () => {
  localStorage.removeItem(tenantRegistrationStorageKey);
  window.dispatchEvent(new CustomEvent('nukhab-tenant-change', { detail: '' }));
};
