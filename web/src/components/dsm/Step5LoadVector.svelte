<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import MathEquation from './MathEquation.svelte';
  import VectorDisplay from './VectorDisplay.svelte';

  let { data }: { data: DSMStepData } = $props();

  // Group contributions by DOF for detail table
  const contributionsByDof = $derived.by(() => {
    const map = new Map<number, typeof data.loadContributions>();
    for (const c of data.loadContributions) {
      if (!map.has(c.dofIndex)) map.set(c.dofIndex, []);
      map.get(c.dofIndex)!.push(c);
    }
    return map;
  });

  const eqLoadVector = '\\{ F \\} = \\{ F_{\\text{nodal}} \\} + \\{ F_{\\text{equiv}} \\}';

  // DOFs that have non-zero loads
  const nonZeroDofs = $derived(
    data.F.reduce((acc, val, i) => {
      if (Math.abs(val) > 1e-10) acc.add(i);
      return acc;
    }, new Set<number>())
  );
</script>

<div class="step">
  <div class="explanation">
    <p>Se ensambla el <strong>vector de cargas</strong> {'{F}'} combinando cargas nodales directas, fuerzas equivalentes de cargas distribuidas, y otros aportes.</p>
  </div>

  <MathEquation equation={eqLoadVector} displayMode />

  <VectorDisplay
    title={"Vector {F} global"}
    vector={data.F}
    labels={data.dofLabels}
    highlightIndices={nonZeroDofs}
    precision={4}
  />

  {#if data.loadContributions.length > 0}
    <div class="contrib-section">
      <div class="contrib-title">Contribuciones detalladas</div>
      <div class="contrib-scroll">
        <table class="contrib-table">
          <thead>
            <tr>
              <th>GDL</th>
              <th>Valor</th>
              <th>Origen</th>
            </tr>
          </thead>
          <tbody>
            {#each data.loadContributions as c}
              <tr>
                <td class="dof-cell">{c.dofLabel} [{c.dofIndex}]</td>
                <td class="val-cell" class:pos={c.value > 1e-10} class:neg={c.value < -1e-10}>
                  {c.value.toFixed(4)}
                </td>
                <td class="src-cell">{c.source}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="no-loads">No hay cargas aplicadas.</div>
  {/if}
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: #bbb; line-height: 1.5; }
  .explanation p { margin: 0; }

  .contrib-section { margin-top: 0.3rem; }
  .contrib-title { font-size: 0.7rem; color: #888; font-weight: 600; margin-bottom: 0.25rem; }
  .contrib-scroll { overflow: auto; max-height: 250px; }
  .contrib-table {
    width: 100%; border-collapse: collapse;
    font-size: 0.6rem; font-family: 'Courier New', monospace;
  }
  .contrib-table th {
    background: #16213e; color: #888; padding: 0.2rem 0.4rem;
    font-weight: 600; position: sticky; top: 0; text-align: left;
    font-size: 0.55rem;
  }
  .contrib-table td {
    padding: 0.15rem 0.4rem; border-bottom: 1px solid #1e1e3a;
  }
  .dof-cell { color: #ccc; }
  .val-cell { text-align: right; }
  .val-cell.pos { color: #4ecdc4; }
  .val-cell.neg { color: #e94560; }
  .src-cell { color: #999; font-size: 0.55rem; }

  .no-loads { font-size: 0.7rem; color: #666; text-align: center; padding: 1rem; }
</style>
