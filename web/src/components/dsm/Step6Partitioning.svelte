<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import MathEquation from './MathEquation.svelte';
  import MatrixDisplay from './MatrixDisplay.svelte';
  import VectorDisplay from './VectorDisplay.svelte';

  let { data, editable = false }: { data: DSMStepData; editable?: boolean } = $props();

  const nf = $derived(data.dofNumbering.nFree);
  const nr = $derived(data.dofNumbering.nTotal - nf);

  const hasPrescribed = $derived(data.uPrescribed.some(v => Math.abs(v) > 1e-10));

  const eqPartition = '\\begin{bmatrix} K_{ff} & K_{fr} \\\\ K_{rf} & K_{rr} \\end{bmatrix} \\begin{Bmatrix} u_f \\\\ u_r \\end{Bmatrix} = \\begin{Bmatrix} F_f \\\\ F_r \\end{Bmatrix}';
  const eqFmod = '\\{ F_{mod} \\} = \\{ F_f \\} - [K_{fr}] \\cdot \\{ u_r \\}';
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step6.explanation')}</p>
  </div>

  <MathEquation equation={eqPartition} displayMode />

  <div class="info-row">
    <div class="info-card">
      <span class="info-label">{t('dsm.step6.freeDof')}</span>
      <span class="info-value free">{nf}</span>
    </div>
    <div class="info-card">
      <span class="info-label">{t('dsm.step6.restrainedDof')}</span>
      <span class="info-value restr">{nr}</span>
    </div>
  </div>

  <MatrixDisplay
    title="[K_ff] ({nf}×{nf})"
    matrix={data.Kff}
    rowLabels={data.freeDofLabels}
    colLabels={data.freeDofLabels}
    compact
    precision={2}
    {editable}
  />

  {#if data.Kfr.length > 0 && data.Kfr[0]?.length > 0}
    <MatrixDisplay
      title="[K_fr] ({nf}×{nr})"
      matrix={data.Kfr}
      rowLabels={data.freeDofLabels}
      colLabels={data.restrDofLabels}
      compact
      precision={2}
      {editable}
    />
  {/if}

  <div class="separator"></div>

  <VectorDisplay title={"{F_f}"} vector={data.Ff} labels={data.freeDofLabels} precision={4} />

  {#if hasPrescribed}
    <VectorDisplay title={"{u_r} (" + t('dsm.step6.prescribedDisp') + ")"} vector={data.uPrescribed} labels={data.restrDofLabels} precision={6} />
    <div class="explanation">
      <p>{@html t('dsm.step6.prescribedNote')}</p>
    </div>
    <MathEquation equation={eqFmod} displayMode />
  {/if}

  <VectorDisplay
    title={t('dsm.step6.loadVectorToSolve').replace('{name}', hasPrescribed ? '{F_mod}' : '{F_f}')}
    vector={data.FfMod}
    labels={data.freeDofLabels}
    precision={4}
  />
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: #bbb; line-height: 1.5; }
  .explanation p { margin: 0; }

  .info-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .info-card {
    background: #16213e; border: 1px solid #0f3460; border-radius: 4px;
    padding: 0.3rem 0.5rem; display: flex; flex-direction: column; align-items: center; flex: 1;
  }
  .info-label { font-size: 0.55rem; color: #888; }
  .info-value { font-size: 0.9rem; font-weight: 700; color: #eee; }
  .info-value.free { color: #4ecdc4; }
  .info-value.restr { color: #e94560; }

  .separator { border-top: 1px solid #0f3460; margin: 0.2rem 0; }
</style>
