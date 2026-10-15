<script lang="ts">
  import { adminAuth } from './admin-auth.svelte';
  import { adminErrorText, sessionEndedText } from './error-text';
  import { t } from '../lib/i18n';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  const notice = $derived(adminAuth.endedBy ? sessionEndedText(adminAuth.endedBy) : null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      await adminAuth.login({ email: email.trim(), password });
      password = '';
    } catch (err) {
      error = adminErrorText(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="adm-login-wrap">
  <form class="adm-login" onsubmit={submit} novalidate data-testid="admin-login">
    <div class="adm-login-brand">
      <span class="adm-mark" aria-hidden="true"></span>
      <span class="adm-brand">{t('admin.brand')}</span>
      <span class="adm-tag">{t('admin.brandTag')}</span>
    </div>
    <h1 class="adm-login-title">{t('admin.login.title')}</h1>
    <p class="adm-login-lede">{t('admin.login.lede')}</p>

    {#if notice && !error}
      <p class="adm-notice" role="status" data-testid="admin-login-notice">{notice}</p>
    {/if}

    <label class="adm-field">
      <span class="adm-label">{t('admin.login.email')}</span>
      <input type="email" bind:value={email} autocomplete="username" required data-testid="admin-login-email" />
    </label>

    <label class="adm-field">
      <span class="adm-label">{t('admin.login.password')}</span>
      <input
        type="password" bind:value={password} autocomplete="current-password" required
        aria-invalid={!!error} data-testid="admin-login-password"
      />
    </label>

    {#if error}
      <p class="adm-error" role="alert" data-testid="admin-login-error">{error}</p>
    {/if}

    <button type="submit" class="adm-submit" disabled={busy || !email.trim() || !password} data-testid="admin-login-submit">
      {busy ? t('admin.login.working') : t('admin.login.submit')}
    </button>
  </form>
</div>

<style>
  .adm-login-wrap {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 24px 16px;
  }

  .adm-login {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(380px, 100%);
    padding: 22px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius-lg);
  }

  .adm-login-brand { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }

  .adm-mark {
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 12px solid var(--st-accent);
  }

  .adm-brand { font-family: var(--st-display); font-weight: 700; font-size: 1rem; color: var(--st-text); }

  .adm-tag {
    padding: 1px 6px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .adm-login-title { margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--st-text); }
  .adm-login-lede { margin: 0; font-size: 0.78rem; line-height: 1.5; color: var(--st-text-2); }

  .adm-field { display: flex; flex-direction: column; gap: 4px; }

  .adm-label {
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-2);
  }

  .adm-field input {
    padding: 7px 9px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.85rem;
  }

  .adm-field input:focus { outline: none; border-color: var(--st-accent); }
  .adm-field input[aria-invalid='true'] { border-color: var(--st-danger); }

  .adm-error, .adm-notice { margin: 0; font-size: 0.76rem; line-height: 1.45; }
  .adm-error { color: var(--st-danger); }

  .adm-notice {
    padding: 7px 9px;
    background: var(--st-surface-2);
    border-left: 2px solid var(--st-warn);
    color: var(--st-text);
  }

  .adm-submit {
    margin-top: 4px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--st-accent) 18%, var(--st-surface-2));
    border: 1px solid color-mix(in srgb, var(--st-accent) 55%, transparent);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  .adm-submit:hover:not(:disabled) { background: color-mix(in srgb, var(--st-accent) 28%, var(--st-surface-2)); }
  .adm-submit:disabled { opacity: 0.5; cursor: default; }
</style>
