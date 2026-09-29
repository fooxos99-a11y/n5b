import nodePath from 'node:path';

const sanitizeTenantKey = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');

export function getWhatsAppTenantKey(databaseName) {
  return sanitizeTenantKey(databaseName);
}

export function getWhatsAppTenantAuthPath({ basePath, databaseName, defaultDatabase }) {
  if (databaseName === defaultDatabase) return basePath;
  return nodePath.join(`${basePath}-tenants`, sanitizeTenantKey(databaseName));
}
