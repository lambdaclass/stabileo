<script lang="ts">
  import { t, i18n } from '../../lib/i18n';
  import { usageConsent } from '../../lib/telemetry/consent.svelte';
  import { legalNotices } from '../../lib/legal/notices.svelte';
  import { legalHref, USAGE_DATA_PATH } from '../../lib/legal/legal';
  import { authStore } from '../../lib/store/auth.svelte';

  const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
  const open = $derived(!automated && !usageConsent.decided && authStore.usageTelemetryEnabled && !legalNotices.disclaimerOpen);

  function acknowledge() {
    usageConsent.set('granted');
    if (authStore.isAuthenticated) void authStore.recordConsent('usage_analytics', true).catch(() => {});
  }
</script>

{#if open}
  <div class="un" role="region" aria-label={t('usage.settingsHeading')} data-testid="usage-notice">
    <p>{t('usage.notice')} <a href={legalHref(USAGE_DATA_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('usage.whatIsSent')}</a></p>
    <div class="actions">
      <button class="btn primary" onclick={acknowledge} data-testid="usage-notice-ok">{t('usage.noticeOk')}</button>
    </div>
  </div>
{/if}

<style>
  .un {
    position: fixed;
    left: 50%;
    bottom: 40px;
    transform: translateX(-50%);
    z-index: 901;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    max-width: min(40rem, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 0.6rem 0.8rem;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    font-size: 0.76rem;
    line-height: 1.45;
  }
  p { margin: 0; }
  a { color: var(--st-interactive, var(--st-accent)); white-space: nowrap; }
  .actions { display: flex; gap: 0.4rem; flex: none; }
  .btn {
    padding: 0.3rem 0.7rem;
    font: inherit;
    font-size: 0.74rem;
    background: transparent;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    cursor: pointer;
  }
  .btn:hover { background: var(--st-surface-3); }
  .btn.primary { border-color: var(--st-accent); }
  @media (max-width: 560px) {
    .un { flex-direction: column; align-items: stretch; }
  }
</style>
