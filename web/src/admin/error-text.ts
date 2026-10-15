import { ApiError } from '../lib/api/client';
import { t } from '../lib/i18n';

const KNOWN_CODES = new Set([
  'invalid_credentials',
  'cannot_disable_self',
  'network_error',
  'missing_token',
  'invalid_token',
  'not_admin',
  'account_disabled',
  'refresh_failed',
]);

export function adminErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (KNOWN_CODES.has(e.code)) return t(`admin.err.${e.code}`);
    if (e.status === 404) return t('admin.err.not_found');
    if (e.status === 401) return t('admin.err.invalid_token');
  }
  return t('admin.err.generic');
}

export function sessionEndedText(code: string): string {
  return KNOWN_CODES.has(code) ? t(`admin.err.${code}`) : t('admin.err.invalid_token');
}
