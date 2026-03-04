<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { dsmStepsStore } from '../../lib/store';
  import MathEquation from './MathEquation.svelte';
  import VectorDisplay from './VectorDisplay.svelte';

  let { data }: { data: DSMStepData } = $props();

  const elemForce = $derived(
    data.elementForces.find(e => e.elementId === dsmStepsStore.selectedElemForStep)
    ?? data.elementForces[0]
  );

  const elem = $derived(
    data.elements.find(e => e.elementId === (elemForce?.elementId ?? -1))
  );

  const eqInternal = '\\{ f \\} = [k] \\cdot [T] \\cdot \\{ u_e \\} - \\{ f_{FE} \\}';

  const is3D = $derived(data.dofNumbering.dofsPerNode > 3);
  const isFrame = $derived(elem?.type === 'frame');

  const localLabels = $derived.by(() => {
    if (is3D) {
      return isFrame
        ? ["N_i", "Vy_i", "Vz_i", "Mx_i", "My_i", "Mz_i", "N_j", "Vy_j", "Vz_j", "Mx_j", "My_j", "Mz_j"]
        : ["N_i", "Vy_i", "Vz_i", "N_j", "Vy_j", "Vz_j"];
    }
    return isFrame
      ? ["N_i", "V_i", "M_i", "N_j", "V_j", "M_j"]
      : ["N_i", "V_i", "N_j", "V_j"];
  });

  // For 3D frames: half = 6 (N,Vy,Vz,Mx,My,Mz), for 2D frames: half = 3 (N,V,M), for trusses: half = 2/3
  const half = $derived(localLabels.length / 2);
</script>

<div class="step">
  <div class="explanation">
    <p>Se calculan las <strong>fuerzas internas</strong> de cada elemento transformando los desplazamientos globales a coordenadas locales.</p>
  </div>

  <MathEquation equation={eqInternal} displayMode />

  <div class="elem-selector">
    <label for="elem-select-9">Elemento:</label>
    <select id="elem-select-9" onchange={(e) => dsmStepsStore.selectElement(Number((e.target as HTMLSelectElement).value))}>
      {#each data.elementForces as ef}
        {@const el = data.elements.find(x => x.elementId === ef.elementId)}
        <option value={ef.elementId} selected={ef.elementId === dsmStepsStore.selectedElemForStep}>
          E{ef.elementId}{el ? ` (N${el.nodeI}→N${el.nodeJ})` : ''}
        </option>
      {/each}
    </select>
  </div>

  {#if elemForce && elem}
    <VectorDisplay
      title={"{u_e} global — Desplazamientos del elemento"}
      vector={elemForce.uGlobal}
      labels={elem.dofLabels}
      precision={6}
      horizontal
    />

    <VectorDisplay
      title={"{u_e} local — [T]·{u_e}"}
      vector={elemForce.uLocal}
      labels={localLabels.map((l, i) => `${i}`)}
      precision={6}
      horizontal
    />

    <div class="separator"></div>

    <VectorDisplay
      title={"[k]·{u_local} — Fuerzas antes de FEF"}
      vector={elemForce.fLocalRaw}
      labels={localLabels}
      precision={4}
      horizontal
    />

    {#if elemForce.fixedEndForces.some(v => Math.abs(v) > 1e-10)}
      <VectorDisplay
        title={"{f_FE} — Fuerzas de empotramiento"}
        vector={elemForce.fixedEndForces}
        labels={localLabels}
        precision={4}
        horizontal
      />
    {/if}

    <div class="separator"></div>

    <VectorDisplay
      title={"{f} final — Fuerzas internas del elemento"}
      vector={elemForce.fLocalFinal}
      labels={localLabels}
      precision={4}
      horizontal
    />

    <div class="force-summary">
      <table class="summary-table">
        <thead>
          <tr><th>Fuerza</th><th>Nodo i</th><th>Nodo j</th></tr>
        </thead>
        <tbody>
          {#if is3D && isFrame}
            <!-- 3D Frame: N, Vy, Vz, Mx, My, Mz -->
            {#each [['Axial (N)', 0, 6], ['Corte Y (Vy)', 1, 7], ['Corte Z (Vz)', 2, 8], ['Torsión (Mx)', 3, 9], ['Momento Y (My)', 4, 10], ['Momento Z (Mz)', 5, 11]] as [name, i, j]}
              <tr>
                <td>{name}</td>
                <td class:pos={elemForce.fLocalFinal[i] > 1e-10} class:neg={elemForce.fLocalFinal[i] < -1e-10}>{elemForce.fLocalFinal[i]?.toFixed(4) ?? '0'}</td>
                <td class:pos={elemForce.fLocalFinal[j] > 1e-10} class:neg={elemForce.fLocalFinal[j] < -1e-10}>{elemForce.fLocalFinal[j]?.toFixed(4) ?? '0'}</td>
              </tr>
            {/each}
          {:else if is3D && !isFrame}
            <!-- 3D Truss: N, Vy, Vz -->
            {#each [['Axial (N)', 0, 3], ['Corte Y (Vy)', 1, 4], ['Corte Z (Vz)', 2, 5]] as [name, i, j]}
              <tr>
                <td>{name}</td>
                <td class:pos={elemForce.fLocalFinal[i] > 1e-10} class:neg={elemForce.fLocalFinal[i] < -1e-10}>{elemForce.fLocalFinal[i]?.toFixed(4) ?? '0'}</td>
                <td class:pos={elemForce.fLocalFinal[j] > 1e-10} class:neg={elemForce.fLocalFinal[j] < -1e-10}>{elemForce.fLocalFinal[j]?.toFixed(4) ?? '0'}</td>
              </tr>
            {/each}
          {:else}
            <!-- 2D -->
            <tr>
              <td>Axial (N)</td>
              <td class:pos={elemForce.fLocalFinal[0] > 1e-10} class:neg={elemForce.fLocalFinal[0] < -1e-10}>{elemForce.fLocalFinal[0].toFixed(4)}</td>
              <td class:pos={elemForce.fLocalFinal[isFrame ? 3 : 2] > 1e-10} class:neg={elemForce.fLocalFinal[isFrame ? 3 : 2] < -1e-10}>{elemForce.fLocalFinal[isFrame ? 3 : 2].toFixed(4)}</td>
            </tr>
            <tr>
              <td>Corte (V)</td>
              <td class:pos={elemForce.fLocalFinal[1] > 1e-10} class:neg={elemForce.fLocalFinal[1] < -1e-10}>{elemForce.fLocalFinal[1].toFixed(4)}</td>
              <td class:pos={elemForce.fLocalFinal[isFrame ? 4 : 3] > 1e-10} class:neg={elemForce.fLocalFinal[isFrame ? 4 : 3] < -1e-10}>{elemForce.fLocalFinal[isFrame ? 4 : 3].toFixed(4)}</td>
            </tr>
            {#if isFrame}
              <tr>
                <td>Momento (M)</td>
                <td class:pos={elemForce.fLocalFinal[2] > 1e-10} class:neg={elemForce.fLocalFinal[2] < -1e-10}>{elemForce.fLocalFinal[2].toFixed(4)}</td>
                <td class:pos={elemForce.fLocalFinal[5] > 1e-10} class:neg={elemForce.fLocalFinal[5] < -1e-10}>{elemForce.fLocalFinal[5].toFixed(4)}</td>
              </tr>
            {/if}
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: #bbb; line-height: 1.5; }
  .explanation p { margin: 0; }

  .elem-selector {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.7rem; color: #ccc;
  }
  .elem-selector select {
    background: #16213e; color: #eee; border: 1px solid #0f3460;
    border-radius: 3px; padding: 0.2rem 0.4rem; font-size: 0.65rem;
  }

  .separator { border-top: 1px solid #0f3460; margin: 0.2rem 0; }

  .force-summary { margin-top: 0.3rem; }
  .summary-table {
    width: 100%; border-collapse: collapse;
    font-size: 0.65rem; font-family: 'Courier New', monospace;
  }
  .summary-table th {
    background: #16213e; color: #888; padding: 0.2rem 0.4rem;
    font-weight: 600; text-align: left; font-size: 0.6rem;
  }
  .summary-table td {
    padding: 0.2rem 0.4rem; border-bottom: 1px solid #1e1e3a;
    text-align: right; font-weight: 600;
  }
  .summary-table td:first-child { text-align: left; color: #ccc; font-weight: 400; }
  .pos { color: #4ecdc4; }
  .neg { color: #e94560; }
</style>
