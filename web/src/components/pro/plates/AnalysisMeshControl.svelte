<script lang="ts">
  /**
   * Next to Analyse: the state of the plates' meshes, whether the analysis meshes the ones that
   * need it, and the way to their settings. Shown only in a model with physical plates.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { meshBeforeAnalysis, physicalPlates, platesNeedingMesh } from '../../../lib/store/physical-plates';
  import PlateMeshDialog from './PlateMeshDialog.svelte';

  const info = $derived.by(() => {
    void modelStore.modelVersion; void modelStore.model.groups;
    const all = physicalPlates();
    return { total: all.length, pending: platesNeedingMesh(), ids: all.map((p) => p.id) };
  });
  let open = $state(false);
</script>

{#if info.total > 0}
  <div class="amc" data-testid="analysis-mesh-control">
    <span class="amc-state" class:warn={info.pending.length > 0} data-testid="analysis-mesh-state">
      {info.pending.length ? tp('plates.pendingShort', { n: info.pending.length }) : t('plates.allCurrent')}
    </span>
    <label class="amc-check" title={t('plates.meshBeforeAnalysisHint')}>
      <input type="checkbox" checked={meshBeforeAnalysis.value} onchange={(e) => (meshBeforeAnalysis.value = e.currentTarget.checked)} data-testid="analysis-mesh-auto" />
      {t('plates.meshBeforeAnalysis')}
    </label>
    <button class="amc-btn" onclick={() => (open = true)} data-testid="analysis-mesh-settings">{t('plates.meshSettings')}</button>
  </div>
  {#if open}<PlateMeshDialog ids={info.pending.length ? info.pending : info.ids} onclose={() => (open = false)} />{/if}
{/if}

<style>
  .amc { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 6px; font-size: 0.66rem; color: var(--st-text-3); max-width: 150px; }
  .amc-state { color: var(--st-text-2); }
  .amc-state.warn { color: var(--st-warn, #d9a441); }
  .amc-check { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
  .amc-btn { align-self: flex-start; padding: 0 6px; background: none; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); color: var(--st-text-2); font: inherit; cursor: pointer; }
</style>
