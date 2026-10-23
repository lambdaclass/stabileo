import { ApiError } from './client';
import { t, tp } from '../i18n';

const KNOWN_CODES = new Set([
  'invalid_credentials',
  'account_disabled',
  'invalid_current_password',
  'refresh_failed',
  'network_error',
  'validation_error',
  'user_login_disabled',
]);

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (KNOWN_CODES.has(e.code)) return t(`account.err.${e.code}`);
    if (e.status === 401) return t('account.err.refresh_failed');
    return e.message || t('account.err.generic');
  }
  return t('account.err.generic');
}

export function fieldText(message: string): string {
  if (message === 'has already been taken') return t('account.field.taken');
  if (message === "can't be blank") return t('account.field.blank');
  if (message === 'has invalid format' || message === 'is invalid') return t('account.field.invalid');
  if (message === 'must be a two-letter ISO code') return t('account.field.countryCode');
  if (message === 'must have @ sign and no spaces') return t('account.field.email');
  if (message === 'must be at an allowed domain') return t('account.field.domainNotAllowed');
  if (message === 'is already allowed') return t('account.field.alreadyAllowed');
  const short = /^should be at least (\d+) character/.exec(message);
  if (short) return tp('account.field.tooShort', { count: short[1] });
  const long = /^should be at most (\d+) character/.exec(message);
  if (long) return tp('account.field.tooLong', { count: long[1] });
  return message;
}

export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const [field, msgs] of Object.entries(e.details)) {
    if (msgs.length) out[field] = msgs.map(fieldText).join(' · ');
  }
  return out;
}
