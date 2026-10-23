import { ApiError } from '../lib/api/client';
import { adminAuth } from './admin-auth.svelte';
import { adminRoute, OAUTH_CALLBACK_PATH, PAGE_PATHS } from './admin-route.svelte';
import { adminErrorText, oauthErrorText } from './error-text';
import { t } from '../lib/i18n';

export type OAuthOutcome = { ok: true } | { ok: false; message: string };

export async function completeOAuthCallback(search: string): Promise<OAuthOutcome> {
  const qs = new URLSearchParams(search);
  const oauthError = qs.get('oauth_error');
  if (oauthError) return { ok: false, message: oauthErrorText(oauthError) };

  const code = qs.get('code');
  if (!code) return { ok: false, message: t('admin.oauth.err.missing_code') };

  try {
    await adminAuth.exchangeOAuthCode(code);
  } catch (e) {
    adminRoute.replace(OAUTH_CALLBACK_PATH);
    const message = e instanceof ApiError && e.status === 401
      ? t('admin.err.invalid_or_expired_code')
      : adminErrorText(e);
    return { ok: false, message };
  }
  adminRoute.replace(PAGE_PATHS.users);
  return { ok: true };
}
