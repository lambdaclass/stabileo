<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import { dsmStepsStore } from '../../lib/store';
  import MathEquation from './MathEquation.svelte';
  import MatrixDisplay from './MatrixDisplay.svelte';
  import { matrixWhy } from './dsm-text';

  let { data, editable = false }: { data: DSMStepData; editable?: boolean } = $props();

  const elem = $derived(
    data.elements.find(e => e.elementId === dsmStepsStore.selectedElemForStep)
    ?? data.elements[0]
  );

  const is3D = $derived(data.dofNumbering.dofsPerNode > 3);

  function angleDeg(rad: number): string {
    return (rad * 180 / Math.PI).toFixed(2);
  }

  /*
   * ── The matrix the bar actually has ────────────────────────────
   *
   * This always printed the fixed–fixed [k], whatever the bar was. A hinge
   * changes it — static condensation removes the released rotation, zeroes
   * its row and column, and turns 12EI/L³ into 3EI/L³ and 4EI/L into 3EI/L —
   * and a truss bar keeps only EA/L. The formula and the note say which case
   * this bar is, so the numbers under them can be read against it.
   */
  const R = '\\\\';
  const A = '\\frac{EA}{L}', nA = '-\\frac{EA}{L}';
  const fixedFixed = `[k] = \\begin{bmatrix} ${A} & 0 & 0 & ${nA} & 0 & 0 ${R} 0 & \\frac{12EI}{L^3} & \\frac{6EI}{L^2} & 0 & -\\frac{12EI}{L^3} & \\frac{6EI}{L^2} ${R} 0 & \\frac{6EI}{L^2} & \\frac{4EI}{L} & 0 & -\\frac{6EI}{L^2} & \\frac{2EI}{L} ${R} ${nA} & 0 & 0 & ${A} & 0 & 0 ${R} 0 & -\\frac{12EI}{L^3} & -\\frac{6EI}{L^2} & 0 & \\frac{12EI}{L^3} & -\\frac{6EI}{L^2} ${R} 0 & \\frac{6EI}{L^2} & \\frac{2EI}{L} & 0 & -\\frac{6EI}{L^2} & \\frac{4EI}{L} \\end{bmatrix}`;
  const hingedI = `[k] = \\begin{bmatrix} ${A} & 0 & 0 & ${nA} & 0 & 0 ${R} 0 & \\frac{3EI}{L^3} & 0 & 0 & -\\frac{3EI}{L^3} & \\frac{3EI}{L^2} ${R} 0 & 0 & 0 & 0 & 0 & 0 ${R} ${nA} & 0 & 0 & ${A} & 0 & 0 ${R} 0 & -\\frac{3EI}{L^3} & 0 & 0 & \\frac{3EI}{L^3} & -\\frac{3EI}{L^2} ${R} 0 & \\frac{3EI}{L^2} & 0 & 0 & -\\frac{3EI}{L^2} & \\frac{3EI}{L} \\end{bmatrix}`;
  const hingedJ = `[k] = \\begin{bmatrix} ${A} & 0 & 0 & ${nA} & 0 & 0 ${R} 0 & \\frac{3EI}{L^3} & \\frac{3EI}{L^2} & 0 & -\\frac{3EI}{L^3} & 0 ${R} 0 & \\frac{3EI}{L^2} & \\frac{3EI}{L} & 0 & -\\frac{3EI}{L^2} & 0 ${R} ${nA} & 0 & 0 & ${A} & 0 & 0 ${R} 0 & -\\frac{3EI}{L^3} & -\\frac{3EI}{L^2} & 0 & \\frac{3EI}{L^3} & 0 ${R} 0 & 0 & 0 & 0 & 0 & 0 \\end{bmatrix}`;
  const axialOnly = `[k] = \\frac{EA}{L} \\begin{bmatrix} 1 & 0 & 0 & -1 & 0 & 0 ${R} 0 & 0 & 0 & 0 & 0 & 0 ${R} 0 & 0 & 0 & 0 & 0 & 0 ${R} -1 & 0 & 0 & 1 & 0 & 0 ${R} 0 & 0 & 0 & 0 & 0 & 0 ${R} 0 & 0 & 0 & 0 & 0 & 0 \\end{bmatrix}`;
  const truss2D = `[k] = \\frac{EA}{L} \\begin{bmatrix} 1 & 0 & -1 & 0 ${R} 0 & 0 & 0 & 0 ${R} -1 & 0 & 1 & 0 ${R} 0 & 0 & 0 & 0 \\end{bmatrix}`;

  const formula2D = $derived.by(() => {
    if (!elem) return '';
    if (elem.type === 'truss') return truss2D;
    if (elem.hingeStart && elem.hingeEnd) return axialOnly;
    if (elem.hingeStart) return hingedI;
    if (elem.hingeEnd) return hingedJ;
    return fixedFixed;
  });

  /** Why this bar's matrix looks the way it does. */
  const matrixNote = $derived(elem ? matrixWhy(elem, is3D) : '');
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step2.explanation')}</p>
  </div>

  <div class="elem-selector">
    <label for="elem-select">{t('dsm.step2.element')}</label>
    <select id="elem-select" onchange={(e) => dsmStepsStore.selectElement(Number((e.target as HTMLSelectElement).value))}>
      {#each data.elements as el}
        <option value={el.elementId} selected={el.elementId === dsmStepsStore.selectedElemForStep}>
          E{el.elementId} (N{el.nodeI}→N{el.nodeJ})
        </option>
      {/each}
    </select>
  </div>

  {#if elem}
    <div class="props-row">
      <div class="prop"><span class="prop-label">{t('dsm.step2.type')}</span><span class="prop-val">{elem.type}</span></div>
      <div class="prop"><span class="prop-label">L</span><span class="prop-val">{elem.length.toFixed(4)} m</span></div>
      {#if !is3D}
        <div class="prop"><span class="prop-label">θ</span><span class="prop-val">{angleDeg(elem.angle)}°</span></div>
      {/if}
      <div class="prop"><span class="prop-label">E</span><span class="prop-val">{elem.E.toExponential(2)}</span></div>
      <div class="prop"><span class="prop-label">A</span><span class="prop-val">{elem.A.toExponential(2)}</span></div>
      {#if elem.type === 'frame'}
        <div class="prop"><span class="prop-label">Iz</span><span class="prop-val">{elem.Iz.toExponential(2)}</span></div>
        {#if is3D && elem.Iy !== undefined}
          <div class="prop"><span class="prop-label">Iy</span><span class="prop-val">{elem.Iy.toExponential(2)}</span></div>
        {/if}
        {#if is3D && elem.J !== undefined}
          <div class="prop"><span class="prop-label">J</span><span class="prop-val">{elem.J.toExponential(2)}</span></div>
        {/if}
      {/if}
    </div>

    {#if is3D}
      {#if elem.type === 'frame'}
        <div class="formula-note">
          {t('dsm.step2.frameNote3d')}
        </div>
      {:else}
        <div class="formula-note">
          {t('dsm.step2.trussNote3d')}
        </div>
      {/if}
    {:else}
      <div class="formula-scroll"><MathEquation equation={formula2D} displayMode /></div>
    {/if}
    {#if matrixNote}
      <div class="formula-note formula-why" data-testid="dsm-matrix-why">{matrixNote}</div>
    {/if}

    <MatrixDisplay
      title={t('dsm.step2.localMatrix').replace('{rows}', String(elem.kLocal.length)).replace('{cols}', String(elem.kLocal[0]?.length))}
      matrix={elem.kLocal}
      rowLabels={elem.dofLabels.map((_l, i) => `${i}`)}
      colLabels={elem.dofLabels.map((_l, i) => `${i}`)}
      compact
      {editable}
    />
  {/if}
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: var(--st-text-2); line-height: 1.5; }
  .explanation p { margin: 0; }

  .elem-selector {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.7rem; color: var(--st-text-2);
  }
  .elem-selector select {
    background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-surface-3);
    border-radius: 3px; padding: 0.2rem 0.4rem; font-size: 0.65rem;
  }

  .props-row { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .prop {
    background: var(--st-surface-2); border: 1px solid var(--st-surface-3); border-radius: 3px;
    padding: 0.2rem 0.4rem; display: flex; flex-direction: column; align-items: center;
  }
  .prop-label { font-size: 0.5rem; color: var(--st-text-3); }
  .prop-val { font-size: 0.65rem; color: var(--st-text); font-family: 'Courier New', monospace; }

  .formula-scroll { overflow-x: auto; }
  .formula-why { color: var(--st-text-2); border-left-color: var(--st-accent); }
  .formula-note {
    font-size: 0.65rem; color: var(--st-info);
    background: var(--st-surface-2); padding: 0.4rem 0.6rem;
    border-radius: 4px; border-left: 3px solid var(--st-info);
    line-height: 1.4;
  }
</style>
