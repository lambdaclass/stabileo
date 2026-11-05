<script lang="ts">
  import { authStore } from '../../lib/store/auth.svelte';
  import { errorText, fieldErrors } from '../../lib/api/error-text';
  import { t, tp, i18n, isOfferedLocale } from '../../lib/i18n';
  import { legalHref, TERMS_PATH, PRIVACY_PATH } from '../../lib/legal/legal';
  import { untrack } from 'svelte';
  import { usageConsent } from '../../lib/telemetry/consent.svelte';
  import { GoogleSignInError } from '../../lib/auth/google-popup';
  import { ApiError } from '../../lib/api/client';

  let {
    open = $bindable(false),
    reason = null,
  }: { open?: boolean; reason?: { title: string; lede: string } | null } = $props();

  let acceptTerms = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let fields = $state<Record<string, string>>({});

  type GoogleStep = { kind: 'start' } | { kind: 'waiting'; cancel: () => void } | { kind: 'terms'; token: string; email: string };
  let step = $state<GoogleStep>({ kind: 'start' });

  $effect(() => {
    if (open) untrack(() => {
      step = { kind: 'start' };
      acceptTerms = false;
      error = null;
      fields = {};
    });
  });

  function close() {
    if (step.kind === 'waiting') step.cancel();
    step = { kind: 'start' };
    open = false;
    error = null;
    fields = {};
  }

  function googleErrorText(err: unknown): string {
    if (err instanceof GoogleSignInError) {
      const known = ['popup_blocked', 'provider_error', 'email_not_verified', 'email_in_use', 'invalid_state', 'oauth_unavailable', 'account_disabled', 'user_login_disabled'];
      return known.includes(err.code) ? t(`account.google.err.${err.code}`) : t('account.google.err.callback_failed');
    }
    return errorText(err);
  }

  async function google() {
    if (busy) return;
    error = null;
    const attempt = authStore.signInWithGoogle();
    step = { kind: 'waiting', cancel: attempt.cancel };
    try {
      const outcome = await attempt.result;
      if (outcome.kind === 'signedIn') close();
      else step = { kind: 'terms', token: outcome.token, email: outcome.email };
    } catch (err) {
      step = { kind: 'start' };
      if (!(err instanceof GoogleSignInError && err.code === 'cancelled')) error = googleErrorText(err);
    }
  }

  async function completeSignup(e: SubmitEvent) {
    e.preventDefault();
    if (busy || step.kind !== 'terms') return;
    busy = true;
    error = null;
    fields = {};
    try {
      await authStore.completeGoogleSignup({
        signup_token: step.token,
        accept_terms: acceptTerms,
        usage_analytics: usageConsent.sharing,
        locale: isOfferedLocale(i18n.locale) ? i18n.locale : 'es',
      });
      if (usageConsent.sharing) usageConsent.set('granted');
      close();
    } catch (err) {
      fields = fieldErrors(err);
      error = Object.keys(fields).length ? t('account.err.validation_error') : errorText(err);
      if (err instanceof ApiError && err.code === 'invalid_or_expired_code') {
        step = { kind: 'start' };
        error = t('account.google.err.expired');
      }
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="acc-overlay" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div
      class="acc"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-labelledby="acc-auth-title"
      data-testid="auth-dialog"
    >
      {#if step.kind === 'terms'}
        <h3 class="acc-title" id="acc-auth-title">{t('account.registerTitle')}</h3>
        <p class="acc-lede" data-testid="auth-google-email">{tp('account.google.signupLede', { email: step.email })}</p>
        <form class="acc-form" onsubmit={completeSignup} novalidate>
          <label class="acc-check" class:bad={fields.accept_terms}>
            <input type="checkbox" bind:checked={acceptTerms} data-testid="auth-accept-terms" />
            <span>
              {t('legal.acceptTerms')}
              <span class="acc-legal-links">
                <a href={legalHref(TERMS_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('legal.termsLink')}</a> ·
                <a href={legalHref(PRIVACY_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('legal.privacyLink')}</a>
              </span>
            </span>
          </label>
          {#if fields.accept_terms}<span class="acc-field-err">{fields.accept_terms}</span>{/if}
          <p class="acc-hint acc-usage" data-testid="auth-usage-note">{t('legal.usageIncluded')}</p>

          {#if error}
            <p class="acc-error" role="alert" data-testid="auth-error">{error}</p>
          {/if}

          <div class="acc-footer">
            <button type="button" class="acc-btn" onclick={close}>{t('account.cancel')}</button>
            <button type="submit" class="acc-btn acc-primary" disabled={busy || !acceptTerms} data-testid="auth-submit">
              {busy ? t('account.working') : t('account.register')}
            </button>
          </div>
        </form>
      {:else}
        {#if reason}
          <h3 class="acc-title" id="acc-auth-title">{reason.title}</h3>
          <p class="acc-lede" data-testid="auth-reason">{reason.lede}</p>
        {:else}
          <h3 class="acc-title" id="acc-auth-title">{t('account.signInTitle')}</h3>
          <p class="acc-lede">{t('account.google.lede')}</p>
        {/if}

        {#if step.kind === 'waiting'}
          <p class="acc-waiting" role="status" data-testid="auth-google-waiting">{t('account.google.waiting')}</p>
        {:else}
          <button
            type="button" class="acc-google" onclick={google}
            disabled={!authStore.googleLogin} data-testid="auth-google"
          >
            <span class="acc-google-mark" aria-hidden="true"><svg viewBox="0 0 18 18" width="13" height="13">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg></span>
            {t('account.google.continue')}
          </button>
          {#if !authStore.googleLogin}
            <p class="acc-hint" data-testid="auth-google-unavailable">{t('account.google.err.oauth_unavailable')}</p>
          {/if}
        {/if}

        {#if error}
          <p class="acc-error" role="alert" data-testid="auth-error">{error}</p>
        {/if}

        <div class="acc-footer">
          <button type="button" class="acc-btn" onclick={close}>{t('account.cancel')}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .acc-overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
  }

  .acc {
    width: min(400px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 18px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
  }

  .acc-title { margin: 0 0 4px; font-size: 0.95rem; font-weight: 600; color: var(--st-text); }
  .acc-lede { margin: 0 0 14px; font-size: 0.72rem; line-height: 1.5; color: var(--st-text-3); }

  .acc-google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    width: 100%;
    padding: 8px 12px;
    background: var(--st-accent);
    border: 1px solid var(--st-accent);
    border-radius: var(--st-radius);
    color: var(--st-text-on-accent);
    font: inherit;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }

  .acc-google:hover:not(:disabled) { background: var(--st-accent-hover); border-color: var(--st-accent-hover); }
  .acc-google:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
  .acc-google:disabled { opacity: 0.45; cursor: default; }

  .acc-google-mark {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: calc(var(--st-radius) - 1px);
    flex: none;
  }

  .acc-waiting { margin: 4px 0; font-size: 0.74rem; color: var(--st-text-2); }

  .acc-form { display: flex; flex-direction: column; gap: 10px; }

  .acc-hint { font-size: 0.62rem; color: var(--st-text-3); }
  .acc-check { display: flex; align-items: flex-start; gap: 8px; font-size: 0.72rem; line-height: 1.4; color: var(--st-text-2); }
  .acc-check input { margin-top: 2px; }
  .acc-check.bad { color: var(--st-bad, #e06c75); }
  .acc-usage { margin: -4px 0 0 21px; line-height: 1.4; }
  .acc-legal-links { display: block; margin-top: 2px; font-size: 0.66rem; }
  .acc-legal-links a { color: var(--st-interactive, var(--st-accent)); }
  .acc-field-err { font-size: 0.64rem; color: var(--st-bad, #e06c75); }
  .acc-error { margin: 0; font-size: 0.7rem; color: var(--st-bad, #e06c75); }

  .acc-footer {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 6px;
    padding-top: 12px;
    border-top: 1px solid var(--st-hair);
  }

  .acc-btn {
    padding: 6px 11px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.72rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .acc-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .acc-btn:disabled { opacity: 0.45; cursor: default; }

  .acc-primary {
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border-color: color-mix(in srgb, var(--st-accent) 55%, transparent);
    color: var(--st-text);
    font-weight: 600;
  }
</style>
