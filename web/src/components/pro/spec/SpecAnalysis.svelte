<script lang="ts">
  /**
   * Specifications › Analysis: the project's rules for how it is solved, written on the model
   * (`analysis`). How combinations with one-way behaviour are formed, linear or P-Delta per
   * combination, and whether members deform in shear. Self-weight is a load of a case, and is set
   * with the cases. Every change is one undo step and retires the results on hand.
   */
  import { t } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';

  const method = $derived(modelStore.analysis?.combinationMethod ?? 'solveEach');
  const perCombination = $derived(modelStore.analysis?.perCombination ?? 'linear');
  const shear = $derived(modelStore.analysis?.shearDeformation !== 'none');
  const oneWay = $derived([...modelStore.elements.values()].some((e) => e.behaviour === 'tensionOnly' || e.behaviour === 'compressionOnly' || e.behaviour === 'cable')
    || [...modelStore.supports.values()].some((s) => s.uplift));
</script>

<div class="rules" data-testid="spec-analysis">
  <div class="block">
    <span class="title">{t('analysisRules.combinations')}</span>
    <label class="row">
      <input type="radio" name="combo-method" checked={method === 'solveEach'} onchange={() => modelStore.setAnalysis({ combinationMethod: undefined })} data-testid="combo-solve-each" />
      {t('analysisRules.solveEach')}
    </label>
    <label class="row">
      <input type="radio" name="combo-method" checked={method === 'superpose'} onchange={() => modelStore.setAnalysis({ combinationMethod: 'superpose' })} data-testid="combo-superpose" />
      {t('analysisRules.superpose')}
    </label>
    {#if !oneWay}<p class="note">{t('analysisRules.methodLinear')}</p>{/if}
    <label class="row">
      {t('analysisRules.perCombination')}
      <select value={perCombination} onchange={(e) => modelStore.setAnalysis({ perCombination: e.currentTarget.value === 'pdelta' ? 'pdelta' : undefined })} data-testid="per-combination">
        <option value="linear">{t('analysisRules.linear')}</option>
        <option value="pdelta">{t('analysisRules.pdelta')}</option>
      </select>
    </label>
    {#if perCombination === 'pdelta' && oneWay}<p class="note warn">{t('analysisRules.pdeltaOneWay')}</p>{/if}
  </div>
  <div class="block">
    <span class="title">{t('spec.analysis.shear')}</span>
    <label class="row">
      <input type="checkbox" checked={shear} onchange={(e) => modelStore.setAnalysis({ shearDeformation: e.currentTarget.checked ? undefined : 'none' })} data-testid="spec-shear" />
      {t('spec.analysis.shearOn')}
    </label>
    <p class="note">{t('spec.analysis.shearHint')}</p>
  </div>
</div>

<style>
  .rules { display: flex; flex-direction: column; gap: 8px; padding: 6px 10px; font-size: 0.68rem; color: var(--st-text-2); }
  .block { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px; }
  .title { color: var(--st-text); font-weight: 600; }
  .row { display: flex; align-items: center; gap: 6px; }
  select, input { background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3); border-radius: 3px; padding: 1px 4px; font-size: 0.66rem; }
  .note { margin: 0; font-size: 0.64rem; color: var(--st-text-3); line-height: 1.35; }
  .note.warn { color: var(--st-warn); }
</style>
