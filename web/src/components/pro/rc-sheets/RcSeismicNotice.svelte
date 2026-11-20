<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { seismicAdvice, setRcOption } from '../../../lib/store/rc-sheets.svelte';

  const advice = $derived.by(() => { void modelStore.designData; void modelStore.model.loadCases; void modelStore.model.loads; return seismicAdvice(); });
</script>

{#if advice}
  <div class="rcn" class:warn={advice === 'recommend'} role="status" data-testid="rc-seismic-advice" data-advice={advice}>
    <p>{t(`rcSheets.seismicAdvice.${advice}`)}</p>
    <button type="button" class="rcn-btn" onclick={() => setRcOption('seismic', advice === 'recommend')} data-testid="rc-seismic-advice-apply">{t(`rcSheets.seismicAdvice.${advice}Button`)}</button>
  </div>
{/if}

<style>
  .rcn { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0 0 6px; padding: 6px 10px; border: 1px solid var(--st-hair); border-radius: 4px; font-size: 0.72rem; line-height: 1.45; color: var(--st-text); background: var(--st-surface-2); max-width: 120ch; }
  .rcn.warn { border-color: var(--st-warn); background: color-mix(in srgb, var(--st-warn) 10%, transparent); }
  p { margin: 0; flex: 1 1 40ch; }
  .rcn-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
</style>
