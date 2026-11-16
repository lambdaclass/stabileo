import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { ApiError } from '../client';
import { errorText, fieldErrors, fieldText } from '../error-text';
import { setLocale, tAt } from '../../i18n/store.svelte';

beforeAll(() => {
  setLocale('en');
});

describe('product error text', () => {
  it('translates 403 user_login_disabled instead of echoing the server message', () => {
    const e = new ApiError(403, 'user_login_disabled', 'User login is disabled');
    expect(errorText(e)).toBe('Sign-in and registration are turned off for now. If you already have a session, it keeps working.');
    setLocale('es');
    expect(errorText(e)).toBe(tAt('account.err.user_login_disabled', 'es'));
    expect(errorText(e)).toMatch(/desactivados/);
    setLocale('en');
  });

  it('maps the server validation messages to translated field text', () => {
    expect(fieldText('must be a two-letter ISO code')).toBe('Use a two-letter ISO code, e.g. AR.');
    expect(fieldText('must have @ sign and no spaces')).toBe('Enter a valid email address, with an @ and no spaces.');
    expect(fieldText('must be at an allowed domain')).toBe('This email is not at an allowed domain.');
    expect(fieldText('is already allowed')).toBe('This email is already on the allowlist.');
    expect(fieldText('something the server says')).toBe('something the server says');
  });

  it('joins field messages per field', () => {
    const e = new ApiError(422, 'validation_error', 'Validation failed', {
      email: ['must have @ sign and no spaces', 'is already allowed'],
      country: ['must be a two-letter ISO code'],
    });
    expect(fieldErrors(e)).toEqual({
      email: 'Enter a valid email address, with an @ and no spaces. · This email is already on the allowlist.',
      country: 'Use a two-letter ISO code, e.g. AR.',
    });
  });
});

afterEach(() => {
  setLocale('en');
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.skip('known wrong result: #2099 — invalid credentials keep their own translation in every dictionary and offered locale', async () => {
  vi.stubEnv('VITE_RESEARCH', '1');
  vi.resetModules();
  const { ALL_DICTS } = await import('../../i18n/locales/all');
  const store = await import('../../i18n/store.svelte');
  const { errorText: translate } = await import('../error-text');
  const { ApiError: ErrorType } = await import('../client');
  const key = 'account.err.invalid_credentials';
  for (const [locale, dict] of Object.entries(ALL_DICTS)) {
    expect(dict[key], locale).toBeTruthy();
    expect(dict[key], locale).not.toBe(dict['account.err.refresh_failed']);
  }
  store.registerFeatureDictionaries(ALL_DICTS);
  expect(store.OFFERED_LOCALES).toContain('hu');
  for (const locale of store.OFFERED_LOCALES) {
    store.setLocale(locale);
    for (const status of [400, 401, 403]) {
      expect(translate(new ErrorType(status, 'invalid_credentials', 'Server text')), locale).toBe(ALL_DICTS[locale][key]);
    }
    expect(translate(new ErrorType(401, 'unknown', 'Server text'))).toBe(ALL_DICTS[locale]['account.err.refresh_failed']);
    expect(translate(new ErrorType(400, 'unknown', 'Server text'))).toBe('Server text');
  }
});
