<!--
  After opening a project: its bars and detailing are there, its analysis results are not (they are
  not saved). Says so and offers the one action that verifies the saved work again.
-->
<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { needsRecheck, solveAndRecheck } from '../../../lib/store/recheck';
  import { resultsStore } from '../../../lib/store/results.svelte';
  import { modelStore } from '../../../lib/store/model.svelte';

  let busy = $state(false);
  const shown = $derived.by(() => { void resultsStore.results3D; void modelStore.model.elements; return needsRecheck(); });
</script>

{#if shown}
  <p class="recheck" role="status" data-testid="recheck-notice">
    {t('recheck.text')}
    <button disabled={busy} onclick={async () => { busy = true; try { await solveAndRecheck(); } finally { busy = false; } }} data-testid="recheck-run">{t('recheck.run')}</button>
  </p>
{/if}

<style>
  .recheck { margin: 0; padding: 0.3rem 0.45rem; font-size: 0.68rem; line-height: 1.35; color: var(--st-text); background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); border-radius: 4px; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  button { font-size: 0.68rem; padding: 0.1rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.55; cursor: progress; }
</style>
