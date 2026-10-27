<script lang="ts">
  import { t, i18n } from '../../lib/i18n';
  import { shouldShowDisclaimer, acknowledgeDisclaimer } from '../../lib/legal/disclaimer';
  import { legalHref, TERMS_PATH } from '../../lib/legal/legal';
  import { solveSignal } from '../../lib/telemetry/solve-signal.svelte';

  let { onAcknowledged }: { onAcknowledged?: () => void } = $props();

  const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
  let pending = $state(!automated && shouldShowDisclaimer());
  const open = $derived(pending && solveSignal.count > 0 && solveSignal.lastOk);

  function dismiss() {
    acknowledgeDisclaimer();
    pending = false;
    onAcknowledged?.();
  }
</script>

{#if open}
  <div class="disclaimer" role="region" aria-label={t('disclaimer.title')} data-testid="results-disclaimer">
    <strong class="title">{t('disclaimer.title')}</strong>
    <p>{t('disclaimer.body')}</p>
    <div class="actions">
      <button class="btn primary" onclick={dismiss} data-testid="results-disclaimer-ok">{t('disclaimer.ok')}</button>
      <a class="btn" href={legalHref(TERMS_PATH, i18n.locale)} target="_blank" rel="noopener noreferrer">{t('legal.termsLink')}</a>
    </div>
  </div>
{/if}

<style>
  .disclaimer {
    position: fixed;
    left: 50%;
    bottom: 40px;
    transform: translateX(-50%);
    z-index: 901;
    max-width: min(27rem, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 0.8rem 0.9rem;
    background: var(--st-surface-2);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
    border-left: 3px solid var(--st-accent);
    border-radius: var(--st-radius);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    font-size: 0.8rem;
    line-height: 1.45;
  }
  .title { display: block; margin-bottom: 0.35rem; }
  p { margin: 0 0 0.6rem; color: var(--st-text-2); }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .btn {
    font: inherit;
    font-size: 0.75rem;
    padding: 0.3rem 0.7rem;
    border-radius: var(--st-radius);
    border: 1px solid var(--st-hair-strong);
    background: transparent;
    color: var(--st-text);
    cursor: pointer;
    text-decoration: none;
  }
  .btn:hover { background: var(--st-surface-3); }
  .btn.primary { border-color: var(--st-accent); }
</style>
