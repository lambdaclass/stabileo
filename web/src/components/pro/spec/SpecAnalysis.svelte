<script lang="ts">
  /**
   * Specifications › Analysis: the project's rules for how it is solved, written on the model
   * (`analysis`). How combinations with one-way behaviour are formed, linear or P-Delta per
   * combination, whether members deform in shear, and the torsional stiffness concrete beams keep
   * once cracked. Self-weight is a load of a case, and is set
   * with the cases. Every change is one undo step and retires the results on hand.
   */
  import { t } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';

  const method = $derived(modelStore.analysis?.combinationMethod ?? 'solveEach');
  const perCombination = $derived(modelStore.analysis?.perCombination ?? 'linear');
  const shear = $derived(modelStore.analysis?.shearDeformation !== 'none');
  const beamTorsion = $derived(modelStore.analysis?.beamTorsion ?? 1);
  const oneWay = $derived([...modelStore.elements.values()].some((e) => e.behaviour === 'tensionOnly' || e.behaviour === 'compressionOnly' || e.behaviour === 'cable')
    || [...modelStore.supports.values()].some((s) => s.uplift));
</script>

<div class="pk" data-testid="spec-analysis">
  <section class="pk-card">
    <h4 class="pk-heading">{t('analysisRules.combinations')}</h4>
    <label class="pk-check">
      <input type="radio" name="combo-method" checked={method === 'solveEach'} onchange={() => modelStore.setAnalysis({ combinationMethod: undefined })} data-testid="combo-solve-each" />
      {t('analysisRules.solveEach')}
    </label>
    <label class="pk-check">
      <input type="radio" name="combo-method" checked={method === 'superpose'} onchange={() => modelStore.setAnalysis({ combinationMethod: 'superpose' })} data-testid="combo-superpose" />
      {t('analysisRules.superpose')}
    </label>
    {#if !oneWay}<p class="pk-hint">{t('analysisRules.methodLinear')}</p>{/if}
    <label class="pk-check">
      {t('analysisRules.perCombination')}
      <select value={perCombination} onchange={(e) => modelStore.setAnalysis({ perCombination: e.currentTarget.value === 'pdelta' ? 'pdelta' : undefined })} data-testid="per-combination">
        <option value="linear">{t('analysisRules.linear')}</option>
        <option value="pdelta">{t('analysisRules.pdelta')}</option>
      </select>
    </label>
    {#if perCombination === 'pdelta' && oneWay}<p class="pk-warn">{t('analysisRules.pdeltaOneWay')}</p>{/if}
  </section>
  <section class="pk-card">
    <h4 class="pk-heading">{t('spec.analysis.shear')}</h4>
    <label class="pk-check">
      <input type="checkbox" checked={shear} onchange={(e) => modelStore.setAnalysis({ shearDeformation: e.currentTarget.checked ? undefined : 'none' })} data-testid="spec-shear" />
      {t('spec.analysis.shearOn')}
    </label>
    <p class="pk-hint">{t('spec.analysis.shearHint')}</p>
  </section>
  <section class="pk-card">
    <h4 class="pk-heading">{t('spec.analysis.beamTorsion')}</h4>
    <label class="pk-check">
      {t('spec.analysis.beamTorsionFactor')}
      <input type="number" min="0.01" max="1" step="0.05" value={beamTorsion} data-testid="spec-beam-torsion"
             onchange={(e) => { const v = Number(e.currentTarget.value); modelStore.setAnalysis({ beamTorsion: Number.isFinite(v) && v > 0 && v < 1 ? v : undefined }); }} />
    </label>
    <p class="pk-hint">{t('spec.analysis.beamTorsionHint')}</p>
  </section>
</div>


