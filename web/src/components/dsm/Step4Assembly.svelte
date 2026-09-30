<script lang="ts">
  import FitMath from '../steps/FitMath.svelte';
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import { dsmStepsStore } from '../../lib/store';
  import MatrixDisplay from './MatrixDisplay.svelte';

  let { data, editable = false }: { data: DSMStepData; editable?: boolean } = $props();

  const n = $derived(data.K.length);

  // Highlight rows/cols for the selected element
  const hlRows = $derived.by(() => {
    const elemId = dsmStepsStore.selectedElemForStep;
    if (elemId === null) return new Set<number>();
    const elem = data.elements.find(e => e.elementId === elemId);
    return elem ? new Set(elem.dofIndices) : new Set<number>();
  });

  const hlCols = $derived(hlRows);

  const eqAssembly = '[K] = \\sum_{e=1}^{n_e} [L_e]^T \\cdot [K]_e \\cdot [L_e]';
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step4.explanation')}</p>
  </div>

  <FitMath tex={eqAssembly} narrow />

  <div class="elem-selector">
    <label for="elem-select-4">{t('dsm.step4.highlightElement')}</label>
    <select id="elem-select-4" onchange={(e) => {
      const val = (e.target as HTMLSelectElement).value;
      dsmStepsStore.selectElement(val === '' ? null! : Number(val));
    }}>
      <option value="">{t('dsm.step4.none')}</option>
      {#each data.elements as el}
        <option value={el.elementId} selected={el.elementId === dsmStepsStore.selectedElemForStep}>
          E{el.elementId} (N{el.nodeI}→N{el.nodeJ})
        </option>
      {/each}
    </select>
  </div>

  <MatrixDisplay
    title="[K] global ({n}×{n})"
    matrix={data.K}
    rowLabels={data.dofLabels}
    colLabels={data.dofLabels}
    highlightRows={hlRows}
    highlightCols={hlCols}
    compact
    precision={2}
    {editable}
  />

  <div class="size-info">
    {t('dsm.step4.sizeInfo').replaceAll('{n}', String(n)).replaceAll('{nElem}', String(data.elements.length))}
  </div>
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.82rem; color: var(--st-text); line-height: 1.45; }
  .explanation p { margin: 0; }

  .elem-selector {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.7rem; color: var(--st-text-2);
  }
  .elem-selector select {
    background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-surface-3);
    border-radius: 3px; padding: 0.2rem 0.4rem; font-size: 0.65rem;
  }

  .size-info {
    font-size: 0.6rem; color: var(--st-text-3);
    text-align: center;
  }
</style>
