import { describe, it, expect, beforeAll } from 'vitest';
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
