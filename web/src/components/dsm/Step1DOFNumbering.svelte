<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import MathEquation from './MathEquation.svelte';
  import StepBlocks from '../steps/StepBlocks.svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { staticClassificationBlocks, dofSketch } from '../../lib/engine/steps/dsm-extras';
  import type { Block } from '../../lib/engine/steps/doc';

  let { data }: { data: DSMStepData } = $props();

  /*
   * In 2D: the static classification with its formula, and the numbering
   * drawn on the structure (the table below lists the same numbers).
   */
  const extras = $derived.by((): Block[] => {
    if (data.dofNumbering.dofsPerNode > 3) return [];
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) return [];
    return [
      { kind: 'sub', title: { key: 'steps.dsm.classification' }, blocks: staticClassificationBlocks(input) },
      { kind: 'fig', sketch: dofSketch(input, data.dofNumbering.dofs, data.dofNumbering.dofsPerNode), caption: { key: 'steps.dsm.dofFigure' } },
    ];
  });

  const { nFree, nTotal, dofsPerNode, dofs } = $derived(data.dofNumbering);
  const nRestr = $derived(nTotal - nFree);

  const is3D = $derived(dofsPerNode > 3);
  // DOF name labels per type
  const eqFrame2D = '\\text{Cada nodo tiene: } u_x, \\; u_z, \\; \\theta_y';
  const eqTruss2D = '\\text{Cada nodo tiene: } u_x, \\; u_z';
  const eqFrame3D = '\\text{Cada nodo tiene: } u_x, \\; u_y, \\; u_z, \\; \\theta_x, \\; \\theta_y, \\; \\theta_z';
  const eqTruss3D = '\\text{Cada nodo tiene: } u_x, \\; u_y, \\; u_z';

  // Map local DOF index to display name
  const dofName2D = ['ux', 'uz', 'θy'];
  const dofName3D6 = ['ux', 'uy', 'uz', 'θx', 'θy', 'θz'];
  const dofName3D3 = ['ux', 'uy', 'uz'];
  const dofNames = $derived(is3D ? (dofsPerNode === 6 ? dofName3D6 : dofName3D3) : dofName2D);
</script>

<div class="step">
  <div class="explanation">
    <p>{@html t('dsm.step1.explanation')}</p>
    <p>{@html t('dsm.step1.ordering').replace('{nFree}', String(nFree - 1)).replace('{nFreeStart}', String(nFree)).replace('{nTotal}', String(nTotal - 1))}</p>
  </div>

  <div class="info-row">
    <div class="info-card">
      <span class="info-label">{t('dsm.step1.dofPerNode')}</span>
      <span class="info-value">{dofsPerNode}</span>
    </div>
    <div class="info-card">
      <span class="info-label">{t('dsm.step1.freeDof')}</span>
      <span class="info-value free">{nFree}</span>
    </div>
    <div class="info-card">
      <span class="info-label">{t('dsm.step1.restrainedDof')}</span>
      <span class="info-value restr">{nRestr}</span>
    </div>
    <div class="info-card">
      <span class="info-label">{t('dsm.step1.totalDof')}</span>
      <span class="info-value">{nTotal}</span>
    </div>
  </div>

  {#if is3D}
    {#if dofsPerNode === 6}
      <MathEquation equation={eqFrame3D} displayMode />
    {:else}
      <MathEquation equation={eqTruss3D} displayMode />
    {/if}
  {:else}
    {#if dofsPerNode === 3}
      <MathEquation equation={eqFrame2D} displayMode />
    {:else}
      <MathEquation equation={eqTruss2D} displayMode />
    {/if}
  {/if}

  {#if extras.length}<div class="extras"><StepBlocks blocks={extras} narrow /></div>{/if}

  <div class="dof-table-scroll">
    <table class="dof-table">
      <thead>
        <tr>
          <th>{t('dsm.step1.nodeHeader')}</th>
          <th>{t('dsm.step1.localDof')}</th>
          <th>{t('dsm.step1.globalIndex')}</th>
          <th>Label</th>
          <th>{t('dsm.step1.state')}</th>
        </tr>
      </thead>
      <tbody>
        {#each dofs as dof}
          <tr class:free-row={dof.isFree} class:restr-row={!dof.isFree}>
            <td>{dof.nodeId}</td>
            <td>{dofNames[dof.localDof] ?? `dof${dof.localDof}`}</td>
            <td class="idx">{dof.globalIndex}</td>
            <td class="label-cell">{dof.label}</td>
            <td>
              <span class="badge" class:badge-free={dof.isFree} class:badge-restr={!dof.isFree}>
                {dof.isFree ? t('dsm.step1.free') : t('dsm.step1.restrained')}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .step { display: flex; flex-direction: column; gap: 0.6rem; }
  .explanation { font-size: 0.72rem; color: var(--st-text-2); line-height: 1.5; }
  .explanation p { margin: 0 0 0.3rem; }
  .free { color: var(--st-value); font-weight: 600; }
  .restr { color: var(--st-accent); font-weight: 600; }

  .info-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .info-card {
    background: var(--st-surface-2);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 60px;
  }
  .info-label { font-size: 0.55rem; color: var(--st-text-3); }
  .info-value { font-size: 0.9rem; font-weight: 700; color: var(--st-text); }
  .info-value.free { color: var(--st-value); }
  .info-value.restr { color: var(--st-accent); }

  .dof-table-scroll { overflow: auto; max-height: 350px; }
  .dof-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.65rem;
    font-family: 'Courier New', monospace;
  }
  .dof-table th {
    background: var(--st-surface-2);
    color: var(--st-text-3);
    padding: 0.2rem 0.4rem;
    font-weight: 600;
    position: sticky;
    top: 0;
    text-align: left;
    font-size: 0.6rem;
  }
  .dof-table td {
    padding: 0.15rem 0.4rem;
    border-bottom: 1px solid var(--st-surface-2);
  }
  .free-row td { color: var(--st-text-2); }
  .restr-row td { color: var(--st-text-3); }
  .idx { font-weight: 700; }
  .free-row .idx { color: var(--st-value); }
  .restr-row .idx { color: var(--st-accent); }
  .label-cell { color: var(--st-text-2); }

  .badge {
    font-size: 0.55rem;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-weight: 600;
  }
  .badge-free { background: rgba(127, 212, 204, 0.15); color: var(--st-value); }
  .badge-restr { background: rgba(229, 72, 42, 0.15); color: var(--st-accent); }
</style>
