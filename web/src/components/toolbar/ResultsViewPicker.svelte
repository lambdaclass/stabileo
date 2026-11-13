<script lang="ts">
  import { caseNameShown, combinationNameShown } from '../../lib/axes/case-names';
  /**
   * Which result the drawing shows (the loads together, a case, a combination, the envelope) and
   * which to compare it with. In the results panel, and in Basic's options bar under the ribbon
   * while load cases and combinations are on (`uiStore.loadCasesEnabled`).
   */
  import { resultCaseName } from '../../lib/engine/settlement-case';
  import { uiStore, resultsStore, modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  let { showsPrimary = true, showsSecondary = false, inBar = false }: { showsPrimary?: boolean; showsSecondary?: boolean; inBar?: boolean } = $props();
  const is3D = $derived(uiStore.is3DWorkspace);
  const caseKeys = $derived(is3D ? [...resultsStore.perCase3D.keys()] : [...resultsStore.perCase.keys()]);
  const comboKeys = $derived(is3D ? [...resultsStore.perCombo3D.keys()] : [...resultsStore.perCombo.keys()]);
  const hasEnvelope = $derived(is3D ? resultsStore.fullEnvelope3D !== null : resultsStore.fullEnvelope !== null);
</script>

<div class="rvp" class:in-bar={inBar} data-testid={inBar ? 'results-view-bar' : 'results-view-panel'}>
{#if showsPrimary}
  <div class="input-group">
    <!--
      No visible label: every option names itself ("Simple loads",
      a case, a combination), so the word in front of them spent a
      third of a narrow panel's width restating the obvious. The
      accessible name stays for anyone who cannot see that.
    -->
    <select
      aria-label={t('results.primary')}
      value={resultsStore.activeView === 'envelope' ? 'envelope'
                 : resultsStore.activeCaseId !== null ? `case_${resultsStore.activeCaseId}`
                 : resultsStore.activeView === 'combo' ? `combo_${resultsStore.activeComboId ?? ''}`
                 : 'single'}
      onchange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        const clearOverlay = () => { if (is3D) resultsStore.setOverlay3D(null); else resultsStore.setOverlay(null); };
        if (val === 'single') {
          resultsStore.activeCaseId = null;
          resultsStore.activeView = 'single';
          clearOverlay();
        } else if (val === 'envelope') {
          resultsStore.activeCaseId = null;
          resultsStore.activeView = 'envelope';
          clearOverlay();
        } else if (val.startsWith('case_')) {
          resultsStore.activeCaseId = Number(val.replace('case_', ''));
          clearOverlay();
        } else if (val.startsWith('combo_')) {
          resultsStore.activeCaseId = null;
          resultsStore.activeView = 'combo';
          resultsStore.activeComboId = Number(val.replace('combo_', ''));
        }
      }}>
      <option value="single">{t('results.simpleLoads')}</option>
      {#each caseKeys as caseId}
        <option value={`case_${caseId}`}>{resultCaseName(caseId, modelStore.model.loadCases, t('svc.settlementCase'), `${t('results.caseFallback')} `)}</option>
      {/each}
      {#each comboKeys as comboId}
        {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
        <option value={`combo_${comboId}`}>{(combo ? combinationNameShown(combo) : undefined) ?? `${t('results.comboFallback')} ${comboId}`}</option>
      {/each}
      <option value="envelope">{t('results.envelope')}</option>
    </select>
  </div>
  <!--
    Comparison overlays a second DIAGRAM on the first. There is
    nothing to overlay when the result is painted onto the members
    themselves: two colours on one bar is one colour.
  -->
  {#if showsSecondary}
    <div class="input-group">
      <label>{t('results.compare')}:</label>
      <select onchange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (val === 'none') {
          if (is3D) resultsStore.setOverlay3D(null);
          else resultsStore.setOverlay(null);
        } else if (val === 'single') {
          if (is3D) resultsStore.setOverlay3D(resultsStore.singleResults3D, t('results.simpleLoads'));
          else resultsStore.setOverlay(resultsStore.singleResults, t('results.simpleLoads'));
        } else if (val === 'envelope') {
          if (is3D) resultsStore.setOverlay3D(resultsStore.fullEnvelope3D?.maxAbsResults3D ?? null, t('results.envelope'));
          else resultsStore.setOverlay(resultsStore.fullEnvelope?.maxAbsResults ?? null, t('results.envelope'));
        } else if (val.startsWith('case_')) {
          const id = Number(val.replace('case_', ''));
          const lc = modelStore.model.loadCases.find(c => c.id === id);
          const label = (lc ? caseNameShown(lc) : undefined) ?? `${t('results.caseFallback')} ${id}`;
          if (is3D) {
            const r3d = resultsStore.perCase3D.get(id);
            if (r3d) resultsStore.setOverlay3D(r3d, label);
          } else {
            const r = resultsStore.perCase.get(id);
            if (r) resultsStore.setOverlay(r, label);
          }
        } else if (val.startsWith('combo_')) {
          const id = Number(val.replace('combo_', ''));
          const combo = modelStore.model.combinations.find(c => c.id === id);
          const label = (combo ? combinationNameShown(combo) : undefined) ?? `${t('results.comboFallback')} ${id}`;
          if (is3D) {
            const r3d = resultsStore.perCombo3D.get(id);
            if (r3d) resultsStore.setOverlay3D(r3d, label);
          } else {
            const r = resultsStore.perCombo.get(id);
            if (r) resultsStore.setOverlay(r, label);
          }
        }
      }}>
        <option value="none">{t('results.noComparison')}</option>
        <option value="single">{t('results.simpleLoads')}</option>
        {#each caseKeys as caseId}
          <option value={`case_${caseId}`}>{resultCaseName(caseId, modelStore.model.loadCases, t('svc.settlementCase'), `${t('results.caseFallback')} `)}</option>
        {/each}
        {#each comboKeys as comboId}
          {@const combo = modelStore.model.combinations.find(c => c.id === comboId)}
          <option value={`combo_${comboId}`}>{(combo ? combinationNameShown(combo) : undefined) ?? `${t('results.comboFallback')} ${comboId}`}</option>
        {/each}
        {#if hasEnvelope}
          <option value="envelope">{t('results.envelope')}</option>
        {/if}
      </select>
    </div>
  {/if}
{/if}
</div>

<style>
  .rvp { display: contents; }
  .rvp.in-bar { display: flex; align-items: center; gap: 0.5rem; }
  .rvp.in-bar .input-group { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: var(--st-text-2); }
  .rvp.in-bar select {
    background: var(--st-surface-2);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 0.72rem;
  }
</style>
