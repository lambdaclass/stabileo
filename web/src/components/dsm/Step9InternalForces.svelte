<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import { dsmStepsStore } from '../../lib/store';
  import MathEquation from './MathEquation.svelte';
  import VectorDisplay from './VectorDisplay.svelte';
  import { transverseSign } from '../../lib/engine/transverse-sign-2d';

  let { data }: { data: DSMStepData } = $props();

  const elemForce = $derived(
    data.elementForces.find(e => e.elementId === dsmStepsStore.selectedElemForStep)
    ?? data.elementForces[0]
  );

  const elem = $derived(
    data.elements.find(e => e.elementId === (elemForce?.elementId ?? -1))
  );

  const eqInternal = '\\{ f \\} = [k] \\cdot [T] \\cdot \\{ u_e \\} - \\{ f_{eq} \\}';

  const is3D = $derived(data.dofNumbering.dofsPerNode > 3);
  const isFrame = $derived(elem?.type === 'frame');
  /*
   * The method's local y is x turned 90° counter-clockwise. On a plane bar
   * drawn right to left, or a column drawn upward, the drawn local z — the
   * axis the results table and the diagrams read V and M in — is the other
   * side, so there they carry the opposite sign (transverse-sign-2d.ts).
   */
  const drawnOpposite = $derived(!is3D && !!elem && transverseSign(Math.cos(elem.angle), Math.sin(elem.angle)) < 0);

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
  // const half = $derived(localLabels.length / 2); // reserved for future use
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step9.explanation')}</p>
  </div>

  <MathEquation equation={eqInternal} displayMode />

  <div class="elem-selector">
    <label for="elem-select-9">{t('dsm.step9.element')}</label>
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
      title={t('dsm.step9.globalDisp')}
      vector={elemForce.uGlobal}
      labels={elem.dofLabels}
      precision={6}
      horizontal
    />

    <VectorDisplay
      title={t('dsm.step9.localDisp')}
      vector={elemForce.uLocal}
      labels={localLabels.map((_l, i) => `${i}`)}
      precision={6}
      horizontal
    />

    <div class="separator"></div>

    <VectorDisplay
      title={t('dsm.step9.forcesBeforeFEF')}
      vector={elemForce.fLocalRaw}
      labels={localLabels}
      precision={4}
      horizontal
    />

    {#if elemForce.fixedEndForces.some(v => Math.abs(v) > 1e-10)}
      <VectorDisplay
        title={t('dsm.step9.fixedEndForces')}
        vector={elemForce.fixedEndForces}
        labels={localLabels}
        precision={4}
        horizontal
      />
    {/if}

    <div class="separator"></div>

    <VectorDisplay
      title={t('dsm.step9.finalForces')}
      vector={elemForce.fLocalFinal}
      labels={localLabels}
      precision={4}
      horizontal
    />

    {#if drawnOpposite}
      <p class="axes-note" data-testid="dsm-axes-note">{t('dsm.step9.drawnAxesNote')}</p>
    {/if}
    <div class="force-summary">
      <table class="summary-table">
        <thead>
          <tr><th>{t('dsm.step9.force')}</th><th>{t('dsm.step9.nodeI')}</th><th>{t('dsm.step9.nodeJ')}</th></tr>
        </thead>
        <tbody>
          {#if is3D && isFrame}
            <!-- 3D Frame: N, Vy, Vz, Mx, My, Mz -->
            {#each [[t('dsm.step9.axial'), 0, 6], [t('dsm.step9.shearY'), 1, 7], [t('dsm.step9.shearZ'), 2, 8], [t('dsm.step9.torsion'), 3, 9], [t('dsm.step9.momentY'), 4, 10], [t('dsm.step9.momentZ'), 5, 11]] as row (row[0])}
              {@const rowName = row[0] as string}
              {@const ri = row[1] as number}
              {@const rj = row[2] as number}
              <tr>
                <td>{rowName}</td>
                <td class:pos={elemForce.fLocalFinal[ri] > 1e-10} class:neg={elemForce.fLocalFinal[ri] < -1e-10}>{elemForce.fLocalFinal[ri]?.toFixed(4) ?? '0'}</td>
                <td class:pos={elemForce.fLocalFinal[rj] > 1e-10} class:neg={elemForce.fLocalFinal[rj] < -1e-10}>{elemForce.fLocalFinal[rj]?.toFixed(4) ?? '0'}</td>
              </tr>
            {/each}
          {:else if is3D && !isFrame}
            <!-- 3D Truss: N, Vy, Vz -->
            {#each [[t('dsm.step9.axial'), 0, 3], [t('dsm.step9.shearY'), 1, 4], [t('dsm.step9.shearZ'), 2, 5]] as row (row[0])}
              {@const rowName = row[0] as string}
              {@const ri = row[1] as number}
              {@const rj = row[2] as number}
              <tr>
                <td>{rowName}</td>
                <td class:pos={elemForce.fLocalFinal[ri] > 1e-10} class:neg={elemForce.fLocalFinal[ri] < -1e-10}>{elemForce.fLocalFinal[ri]?.toFixed(4) ?? '0'}</td>
                <td class:pos={elemForce.fLocalFinal[rj] > 1e-10} class:neg={elemForce.fLocalFinal[rj] < -1e-10}>{elemForce.fLocalFinal[rj]?.toFixed(4) ?? '0'}</td>
              </tr>
            {/each}
          {:else}
            <!-- 2D -->
            <tr>
              <td>{t('dsm.step9.axial')}</td>
              <td class:pos={elemForce.fLocalFinal[0] > 1e-10} class:neg={elemForce.fLocalFinal[0] < -1e-10}>{elemForce.fLocalFinal[0].toFixed(4)}</td>
              <td class:pos={elemForce.fLocalFinal[isFrame ? 3 : 2] > 1e-10} class:neg={elemForce.fLocalFinal[isFrame ? 3 : 2] < -1e-10}>{elemForce.fLocalFinal[isFrame ? 3 : 2].toFixed(4)}</td>
            </tr>
            <tr>
              <td>{t('dsm.step9.shearV')}</td>
              <td class:pos={elemForce.fLocalFinal[1] > 1e-10} class:neg={elemForce.fLocalFinal[1] < -1e-10}>{elemForce.fLocalFinal[1].toFixed(4)}</td>
              <td class:pos={elemForce.fLocalFinal[isFrame ? 4 : 3] > 1e-10} class:neg={elemForce.fLocalFinal[isFrame ? 4 : 3] < -1e-10}>{elemForce.fLocalFinal[isFrame ? 4 : 3].toFixed(4)}</td>
            </tr>
            {#if isFrame}
              <tr>
                <td>{t('dsm.step9.momentM')}</td>
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
  .axes-note {
    margin: 0.4rem 0;
    padding: 0.35rem 0.5rem;
    border-left: 2px solid var(--st-accent);
    font-size: 0.72rem;
    color: var(--st-text-2);
  }

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

  .separator { border-top: 1px solid var(--st-surface-3); margin: 0.2rem 0; }

  .force-summary { margin-top: 0.3rem; }
  .summary-table {
    width: 100%; border-collapse: collapse;
    font-size: 0.65rem; font-family: 'Courier New', monospace;
  }
  .summary-table th {
    background: var(--st-surface-2); color: var(--st-text-3); padding: 0.2rem 0.4rem;
    font-weight: 600; text-align: left; font-size: 0.6rem;
  }
  .summary-table td {
    padding: 0.2rem 0.4rem; border-bottom: 1px solid var(--st-surface-2);
    text-align: right; font-weight: 600;
  }
  .summary-table td:first-child { text-align: left; color: var(--st-text-2); font-weight: 400; }
  .pos { color: var(--st-value); }
  .neg { color: var(--st-accent); }
</style>
