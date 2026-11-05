<script lang="ts">
  import './ad-consent-i18n';
  import { tPublic as t, i18n } from '../i18n/store.svelte';
  import { legalHref, PRIVACY_PATH } from '../legal/legal';
  import { adConsent } from './ad-consent.svelte';
</script>

{#if adConsent.asking}
  <div class="ac" role="region" aria-label={t('adConsent.label')} data-testid="ad-consent">
    <p>{t('adConsent.text')} <a href={legalHref(PRIVACY_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('adConsent.privacy')}</a></p>
    <div class="actions">
      <button class="btn" onclick={() => adConsent.decide('denied')} data-testid="ad-consent-decline">{t('adConsent.decline')}</button>
      <button class="btn primary" onclick={() => adConsent.decide('granted')} data-testid="ad-consent-accept">{t('adConsent.accept')}</button>
    </div>
  </div>
{/if}

<style>
  .ac {
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: min(24rem, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 0.75rem 0.9rem;
    background: var(--st-surface-2, #1b1f27);
    color: var(--st-text-2, #c9ced8);
    border: 1px solid var(--st-hair-strong, #3a404c);
    border-radius: var(--st-radius, 6px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    font-size: 0.78rem;
    line-height: 1.45;
  }
  p { margin: 0; }
  a { color: var(--st-interactive, var(--st-accent, #6ea8ff)); }
  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .btn {
    padding: 0.35rem 0.8rem;
    font: inherit;
    background: transparent;
    border: 1px solid var(--st-hair-strong, #3a404c);
    border-radius: var(--st-radius, 6px);
    color: var(--st-text, #eef1f6);
    cursor: pointer;
  }
  .btn:hover { background: var(--st-surface-3, #262b35); }
  .btn.primary { background: var(--st-accent, #3b82f6); border-color: transparent; color: #fff; }
</style>
