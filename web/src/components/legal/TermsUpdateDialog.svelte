<script lang="ts">
  import { t, tp, i18n } from '../../lib/i18n';
  import { authStore } from '../../lib/store/auth.svelte';
  import { errorText } from '../../lib/api/error-text';
  import { legalHref, TERMS_PATH, PRIVACY_PATH, LEGAL_VERSION } from '../../lib/legal/legal';

  let busy = $state(false);
  let error = $state<string | null>(null);

  const date = $derived(new Date(`${authStore.termsVersion ?? LEGAL_VERSION}T12:00:00Z`).toLocaleDateString(i18n.locale, { dateStyle: 'long' }));

  async function accept() {
    busy = true;
    error = null;
    try {
      await authStore.recordConsent('terms', true);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if authStore.needsTerms}
  <div class="tu-overlay">
    <div class="tu" role="dialog" aria-modal="true" aria-labelledby="tu-title" data-testid="terms-update">
      <h3 id="tu-title">{t('legal.updateTitle')}</h3>
      <p>{tp('legal.updateBody', { date })}</p>
      <p class="links">
        <a href={legalHref(TERMS_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('legal.termsLink')}</a>
        ·
        <a href={legalHref(PRIVACY_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('legal.privacyLink')}</a>
      </p>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <div class="actions">
        <button class="btn" onclick={() => authStore.logout()}>{t('legal.signOut')}</button>
        <button class="btn primary" onclick={accept} disabled={busy} data-testid="terms-update-accept">{t('legal.accept')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tu-overlay {
    position: fixed;
    inset: 0;
    z-index: 960;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
  }
  .tu {
    width: min(28rem, calc(100vw - 32px));
    padding: 1.1rem 1.2rem;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  h3 { margin: 0 0 0.5rem; font-size: 0.98rem; font-weight: 600; }
  p { margin: 0 0 0.6rem; color: var(--st-text-2); }
  .links a { color: var(--st-interactive, var(--st-accent)); }
  .err { color: var(--st-bad, #e06c75); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem; }
  .btn {
    padding: 0.4rem 0.8rem;
    font: inherit;
    font-size: 0.78rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    cursor: pointer;
  }
  .btn.primary { border-color: var(--st-accent); font-weight: 600; }
  .btn:disabled { opacity: 0.5; cursor: default; }
</style>
