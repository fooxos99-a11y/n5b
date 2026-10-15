import { normalizeNumericInput } from '../../../src/lib/numericInput.js';

export const LOGIN_NUMBER_MAX_LENGTH = 20;
export const LOGIN_PASSWORD_MAX_LENGTH = 256;
export type LoginCredentials = { loginNumber: string; password: string };
export type LoginFormErrors = { loginNumber?: string; password?: string };
export type LoginFormResult = { ok: true; credentials: LoginCredentials }
  | { ok: false; errors: LoginFormErrors };

export function normalizeLoginNumber(value: string): string {
  return normalizeNumericInput(value, LOGIN_NUMBER_MAX_LENGTH);
}

export function prepareLoginCredentials(loginNumber: string, password: string): LoginFormResult {
  const normalized = normalizeLoginNumber(loginNumber);
  const errors: LoginFormErrors = {};
  if (!normalized) errors.loginNumber = 'أدخل رقم الدخول.';
  if (password.length > LOGIN_PASSWORD_MAX_LENGTH) errors.password = 'كلمة المرور أطول من الحد المسموح.';
  if (errors.loginNumber || errors.password) return { ok: false, errors };
  // The current server accepts accounts without a password hash. It decides
  // whether an empty password is valid; preserve the submitted value exactly.
  return { ok: true, credentials: { loginNumber: normalized, password } };
}
