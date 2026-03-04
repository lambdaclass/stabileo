<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import MathEquation from './MathEquation.svelte';
  import VectorDisplay from './VectorDisplay.svelte';

  let { data }: { data: DSMStepData } = $props();

  const nf = $derived(data.dofNumbering.nFree);

  const eqSolve = '\\{ u_f \\} = [K_{ff}]^{-1} \\cdot \\{ F_{mod} \\}';

  // Find max displacement for highlighting
  const maxDispIdx = $derived.by(() => {
    let maxVal = 0, maxI = -1;
    for (let i = 0; i < data.uAll.length; i++) {
      if (Math.abs(data.uAll[i]) > maxVal) { maxVal = Math.abs(data.uAll[i]); maxI = i; }
    }
    return maxI >= 0 ? new Set([maxI]) : new Set<number>();
  });
</script>

<div class="step">
  <div class="explanation">
    <p>Se resuelve el sistema de ecuaciones para obtener los <strong>desplazamientos libres</strong>.</p>
  </div>

  <MathEquation equation={eqSolve} displayMode />

  <VectorDisplay
    title={`{u_f} — Desplazamientos libres (${nf} GDL)`}
    vector={data.uFree}
    labels={data.freeDofLabels}
    precision={6}
  />

  <div class="separator"></div>

  <div class="explanation">
    <p>Vector completo de desplazamientos (libres + restringidos):</p>
  </div>

  <VectorDisplay
    title={`{u} — Vector completo (${data.uAll.length} GDL)`}
    vector={data.uAll}
    labels={data.dofLabels}
    highlightIndices={maxDispIdx}
    precision={6}
  />
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: #bbb; line-height: 1.5; }
  .explanation p { margin: 0; }
  .separator { border-top: 1px solid #0f3460; margin: 0.2rem 0; }
</style>
