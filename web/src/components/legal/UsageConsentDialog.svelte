<script lang="ts">
  import { t, i18n } from '../../lib/i18n';
  import { usageConsent } from '../../lib/telemetry/consent.svelte';
  import { solveSignal } from '../../lib/telemetry/solve-signal.svelte';
  import { shouldShowDisclaimer } from '../../lib/legal/disclaimer';
  import { legalHref, USAGE_DATA_PATH } from '../../lib/legal/legal';
  import { authStore } from '../../lib/store/auth.svelte';

  let { disclaimerDone = false }: { disclaimerDone?: boolean } = $props();

  const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
  let solvesAtStart = $state<number | null>(null);

  $effect(() => {
    if (solvesAtStart === null && (disclaimerDone || !shouldShowDisclaimer())) solvesAtStart = solveSignal.count;
  });

  const open = $derived(
    !automated &&
      !usageConsent.decided &&
      authStore.usageTelemetryEnabled &&
      solvesAtStart !== null &&
      solveSignal.count > solvesAtStart &&
      solveSignal.lastOk,
  );

  function choose(granted: boolean) {
    usageConsent.set(granted ? 'granted' : 'denied');
    if (authStore.isAuthenticated) void authStore.recordConsent('usage_analytics', granted).catch(() => {});
  }
</script>

{#if open}
  <div class="uc-overlay">
    <div class="uc" role="dialog" aria-modal="true" aria-labelledby="uc-title" data-testid="usage-consent">
      <h3 id="uc-title">{t('usage.title')}</h3>
      <p class="lede">{t('usage.lede')}</p>
      <p class="detail">{t('usage.counted')}</p>
      <p class="detail">{t('usage.change')}</p>
      <a class="link" href={legalHref(USAGE_DATA_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('usage.whatIsSent')}</a>
      <div class="actions">
        <button class="btn" onclick={() => choose(true)} data-testid="usage-consent-share">{t('usage.share')}</button>
        <button class="btn" onclick={() => choose(false)} data-testid="usage-consent-decline">{t('usage.dontShare')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .uc-overlay {
    position: fixed;
    inset: 0;
    z-index: 950;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--st-bg) 55%, transparent);
  }
  .uc {
    width: min(30rem, calc(100vw - 32px));
    padding: 1.1rem 1.2rem;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.35);
    color: var(--st-text);
  }
  h3 { margin: 0 0 0.6rem; font-size: 1rem; font-weight: 600; text-align: center; }
  .lede { margin: 0 0 0.6rem; font-size: 0.86rem; line-height: 1.45; }
  .detail { margin: 0 0 0.5rem; font-size: 0.74rem; line-height: 1.5; color: var(--st-text-3); }
  .link { display: inline-block; margin-bottom: 0.9rem; font-size: 0.78rem; color: var(--st-interactive, var(--st-accent)); }
  .actions { display: flex; gap: 0.5rem; }
  .btn {
    flex: 1;
    padding: 0.45rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    cursor: pointer;
  }
  .btn:hover { background: var(--st-surface-3); }
</style>
