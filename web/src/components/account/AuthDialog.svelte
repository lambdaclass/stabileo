<script lang="ts">
  import { authStore } from '../../lib/store/auth.svelte';
  import { errorText, fieldErrors } from '../../lib/api/error-text';
  import { t, i18n, isOfferedLocale } from '../../lib/i18n';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  type Mode = 'login' | 'register';

  let mode = $state<Mode>('login');
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let fields = $state<Record<string, string>>({});

  function switchMode(next: Mode) {
    mode = next;
    error = null;
    fields = {};
  }

  function close() {
    open = false;
    password = '';
    error = null;
    fields = {};
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    fields = {};
    try {
      if (mode === 'login') {
        await authStore.login({ email: email.trim(), password });
      } else {
        await authStore.register({
          email: email.trim(),
          password,
          name: name.trim(),
          locale: isOfferedLocale(i18n.locale) ? i18n.locale : 'es',
        });
      }
      close();
    } catch (err) {
      fields = fieldErrors(err);
      error = Object.keys(fields).length ? t('account.err.validation_error') : errorText(err);
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
      <h3 class="acc-title" id="acc-auth-title">
        {mode === 'login' ? t('account.signInTitle') : t('account.registerTitle')}
      </h3>
      <p class="acc-lede">{mode === 'login' ? t('account.signInLede') : t('account.registerLede')}</p>

      <div class="acc-modes" role="tablist">
        <button
          type="button" role="tab" class="acc-mode" class:on={mode === 'login'}
          aria-selected={mode === 'login'} onclick={() => switchMode('login')}
          data-testid="auth-mode-login"
        >{t('account.signIn')}</button>
        <button
          type="button" role="tab" class="acc-mode" class:on={mode === 'register'}
          aria-selected={mode === 'register'} onclick={() => switchMode('register')}
          data-testid="auth-mode-register"
        >{t('account.register')}</button>
      </div>

      <form class="acc-form" onsubmit={submit} novalidate>
        {#if mode === 'register'}
          <label class="acc-field">
            <span class="acc-label">{t('account.name')}</span>
            <input
              type="text" bind:value={name} autocomplete="name" required
              class:bad={fields.name} aria-invalid={!!fields.name} data-testid="auth-name"
            />
            {#if fields.name}<span class="acc-field-err">{fields.name}</span>{/if}
          </label>
        {/if}

        <label class="acc-field">
          <span class="acc-label">{t('account.email')}</span>
          <input
            type="email" bind:value={email} autocomplete="email" required
            class:bad={fields.email} aria-invalid={!!fields.email} data-testid="auth-email"
          />
          {#if fields.email}<span class="acc-field-err">{fields.email}</span>{/if}
        </label>

        <label class="acc-field">
          <span class="acc-label">{t('account.password')}</span>
          <input
            type="password" bind:value={password} required
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
            class:bad={fields.password} aria-invalid={!!fields.password} data-testid="auth-password"
          />
          {#if fields.password}
            <span class="acc-field-err">{fields.password}</span>
          {:else if mode === 'register'}
            <span class="acc-hint">{t('account.passwordHint')}</span>
          {/if}
        </label>

        {#if error}
          <p class="acc-error" role="alert" data-testid="auth-error">{error}</p>
        {/if}

        <div class="acc-footer">
          <button type="button" class="acc-btn" onclick={close}>{t('account.cancel')}</button>
          <button type="submit" class="acc-btn acc-primary" disabled={busy} data-testid="auth-submit">
            {busy ? t('account.working') : mode === 'login' ? t('account.signIn') : t('account.register')}
          </button>
        </div>
      </form>
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
    z-index: 200;
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

  .acc-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 14px; }

  .acc-mode {
    padding: 6px 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-left: 2px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .acc-mode:hover { background: var(--st-surface-3); color: var(--st-text); }
  .acc-mode.on { border-left-color: var(--st-accent); background: var(--st-surface-3); color: var(--st-text); }

  .acc-form { display: flex; flex-direction: column; gap: 10px; }

  .acc-field { display: flex; flex-direction: column; gap: 4px; }

  .acc-label {
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-2);
  }

  .acc-field input {
    padding: 6px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font: inherit;
    font-size: 0.78rem;
  }

  .acc-field input:focus { outline: none; border-color: var(--st-accent); }
  .acc-field input.bad { border-color: var(--st-bad, #e06c75); }

  .acc-hint { font-size: 0.62rem; color: var(--st-text-3); }
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
