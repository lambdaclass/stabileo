<script lang="ts">
  import type { DSMStepData } from '../../lib/engine/solver-detailed';
  import { t } from '../../lib/i18n';
  import MathEquation from './MathEquation.svelte';

  let { data }: { data: DSMStepData } = $props();

  const { nFree, nTotal, dofsPerNode, dofs } = $derived(data.dofNumbering);
  const nRestr = $derived(nTotal - nFree);

  const is3D = $derived(dofsPerNode > 3);
  // DOF name labels per type
  const eqFrame2D = '\\text{Cada nodo tiene: } u_x, \\; u_y, \\; \\theta_z';
  const eqTruss2D = '\\text{Cada nodo tiene: } u_x, \\; u_y';
  const eqFrame3D = '\\text{Cada nodo tiene: } u_x, \\; u_y, \\; u_z, \\; \\theta_x, \\; \\theta_y, \\; \\theta_z';
  const eqTruss3D = '\\text{Cada nodo tiene: } u_x, \\; u_y, \\; u_z';

  // Map local DOF index to display name
  const dofName2D = ['ux', 'uy', 'θz'];
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
  .explanation { font-size: 0.72rem; color: #bbb; line-height: 1.5; }
  .explanation p { margin: 0 0 0.3rem; }
  .free { color: #4ecdc4; font-weight: 600; }
  .restr { color: #e94560; font-weight: 600; }

  .info-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .info-card {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 60px;
  }
  .info-label { font-size: 0.55rem; color: #888; }
  .info-value { font-size: 0.9rem; font-weight: 700; color: #eee; }
  .info-value.free { color: #4ecdc4; }
  .info-value.restr { color: #e94560; }

  .dof-table-scroll { overflow: auto; max-height: 350px; }
  .dof-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.65rem;
    font-family: 'Courier New', monospace;
  }
  .dof-table th {
    background: #16213e;
    color: #888;
    padding: 0.2rem 0.4rem;
    font-weight: 600;
    position: sticky;
    top: 0;
    text-align: left;
    font-size: 0.6rem;
  }
  .dof-table td {
    padding: 0.15rem 0.4rem;
    border-bottom: 1px solid #1e1e3a;
  }
  .free-row td { color: #bbb; }
  .restr-row td { color: #999; }
  .idx { font-weight: 700; }
  .free-row .idx { color: #4ecdc4; }
  .restr-row .idx { color: #e94560; }
  .label-cell { color: #ccc; }

  .badge {
    font-size: 0.55rem;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-weight: 600;
  }
  .badge-free { background: rgba(78, 205, 196, 0.15); color: #4ecdc4; }
  .badge-restr { background: rgba(233, 69, 96, 0.15); color: #e94560; }
</style>
