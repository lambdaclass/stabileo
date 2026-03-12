<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import { dsmStepsStore } from '../../lib/store';
  import MathEquation from './MathEquation.svelte';
  import MatrixDisplay from './MatrixDisplay.svelte';

  let { data, editable = false }: { data: DSMStepData; editable?: boolean } = $props();

  const elem = $derived(
    data.elements.find(e => e.elementId === dsmStepsStore.selectedElemForStep)
    ?? data.elements[0]
  );

  const is3D = $derived(data.dofNumbering.dofsPerNode > 3);

  function angleDeg(rad: number): string {
    return (rad * 180 / Math.PI).toFixed(2);
  }

  const cosVal = $derived(elem ? Math.cos(elem.angle).toFixed(4) : '0');
  const sinVal = $derived(elem ? Math.sin(elem.angle).toFixed(4) : '0');
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step3.explanation')}</p>
    <p>{@html t('dsm.step3.thenGlobal')}</p>
  </div>

  <MathEquation equation="[K]_e = [T]^T \\cdot [k] \\cdot [T]" displayMode />

  <div class="elem-selector">
    <label for="elem-select-3">{t('dsm.step3.element')}</label>
    <select id="elem-select-3" onchange={(e) => dsmStepsStore.selectElement(Number((e.target as HTMLSelectElement).value))}>
      {#each data.elements as el}
        <option value={el.elementId} selected={el.elementId === dsmStepsStore.selectedElemForStep}>
          E{el.elementId} (N{el.nodeI}→N{el.nodeJ})
        </option>
      {/each}
    </select>
  </div>

  {#if elem}
    {#if is3D}
      <div class="angle-info">
        {@html t('dsm.step3.cosinesNote').replace('{rows}', String(elem.T.length)).replace('{cols}', String(elem.T[0]?.length))}
      </div>
    {:else}
      <div class="angle-info">
        θ = {angleDeg(elem.angle)}° → cos θ = {cosVal}, sin θ = {sinVal}
      </div>

      {#if elem.type === 'frame'}
        <MathEquation equation={`[T] = \\begin{bmatrix} c & s & 0 & 0 & 0 & 0 \\\\ -s & c & 0 & 0 & 0 & 0 \\\\ 0 & 0 & 1 & 0 & 0 & 0 \\\\ 0 & 0 & 0 & c & s & 0 \\\\ 0 & 0 & 0 & -s & c & 0 \\\\ 0 & 0 & 0 & 0 & 0 & 1 \\end{bmatrix}`} displayMode />
      {:else}
        <MathEquation equation={`[T] = \\begin{bmatrix} c & s & 0 & 0 \\\\ -s & c & 0 & 0 \\\\ 0 & 0 & c & s \\\\ 0 & 0 & -s & c \\end{bmatrix}`} displayMode />
      {/if}
    {/if}

    <MatrixDisplay
      title={t('dsm.step3.transformation')}
      matrix={elem.T}
      precision={4}
      compact
      {editable}
    />

    <div class="separator"></div>

    <MatrixDisplay
      title={t('dsm.step3.globalStiffness')}
      matrix={elem.kGlobal}
      rowLabels={elem.dofLabels}
      colLabels={elem.dofLabels}
      compact
      {editable}
    />

    <div class="dof-mapping">
      <span class="map-label">{t('dsm.step3.dofMapping')}</span>
      {#each elem.dofIndices as dofIdx, i}
        <span class="dof-chip">{elem.dofLabels[i]} → [{dofIdx}]</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: #bbb; line-height: 1.5; }
  .explanation p { margin: 0 0 0.2rem; }

  .elem-selector {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.7rem; color: #ccc;
  }
  .elem-selector select {
    background: #16213e; color: #eee; border: 1px solid #0f3460;
    border-radius: 3px; padding: 0.2rem 0.4rem; font-size: 0.65rem;
  }

  .angle-info {
    font-size: 0.65rem; color: #aaa;
    font-family: 'Courier New', monospace;
    background: #16213e; padding: 0.3rem 0.5rem;
    border-radius: 3px; border: 1px solid #0f3460;
  }

  .separator { border-top: 1px solid #0f3460; margin: 0.2rem 0; }

  .dof-mapping {
    display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center;
    font-size: 0.6rem;
  }
  .map-label { color: #888; }
  .dof-chip {
    background: #16213e; border: 1px solid #0f3460;
    border-radius: 3px; padding: 0.1rem 0.3rem;
    color: #4ecdc4; font-family: 'Courier New', monospace;
  }
</style>
