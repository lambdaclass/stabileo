<script lang="ts">
  import { selectRow, frameRow, focusRow, rowSelected } from '../../lib/actions/table-row-select';
  import { modelStore, uiStore, historyStore, resultsStore } from '../../lib/store';
  import CombosTable from './CombosTable.svelte';
  import { t } from '../../lib/i18n';
  import type { DistributedLoad, PointLoadOnElement, PointLoadOnElement3D, NodalLoad, ThermalLoad, NodalLoad3D, DistributedLoad3D } from '../../lib/store/model.svelte.ts';
  import { get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical } from '../../lib/geometry/coordinate-system';

  /** The case self-weight goes in: the one chosen, else the first dead-load case, else the first. */
  const selfWeightCase = $derived.by(() => {
    const cases = modelStore.loadCases;
    const chosen = uiStore.selfWeightCaseId;
    if (chosen !== null && cases.some((c) => c.id === chosen)) return chosen;
    return (cases.find((c) => c.type === 'D') ?? cases[0])?.id ?? null;
  });



  function deleteLoad(index: number) {
    historyStore.pushState();
    modelStore.loads.splice(index, 1);
  }

  function updateLoadField(loadId: number, field: string, val: string) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    modelStore.updateLoad(loadId, { [field]: num });
  }
</script>

<!--
  Combinations live here, folded, above the loads they combine.
  
  They were a tab of their own beside Nodes and Sections, which put them among
  the things a model is MADE of. A combination is not a thing in the model — it
  is an arrangement of the loads, and it means nothing without them. Reading it
  next to the loads is reading it in the only place it makes sense.
-->
<details class="combos-fold">
  <summary>{t('data.combinations')}</summary>
  <div class="combos-body">
    <!-- Self-weight first: whether it counts, and in which load case. -->
    <div class="selfweight-row" title={t('table.selfWeightTooltip')}>
      <label class="sw-check">
        <input type="checkbox" bind:checked={uiStore.includeSelfWeight} data-testid="selfweight-toggle" />
        <span>{t('table.selfWeight')}</span>
      </label>
      <span class="sw-in">{t('table.selfWeightIn')}</span>
      <select class="sw-case" value={String(selfWeightCase ?? '')} disabled={!uiStore.includeSelfWeight}
        onchange={(e) => { uiStore.selfWeightCaseId = parseInt(e.currentTarget.value); resultsStore.clear(); }}
        data-testid="selfweight-case">
        {#each modelStore.loadCases as lc}
          <option value={String(lc.id)}>{lc.type ? `${lc.type} · ` : ''}{lc.name}</option>
        {/each}
      </select>
    </div>
    <CombosTable />
  </div>
</details>

<table>
  <thead>
    <tr><th>#</th><th>{t('table.case')}</th><th>{t('table.type')}</th><th>{t('table.target')}</th><th>{t('table.values')}</th><th></th></tr>
  </thead>
  <tbody>
    {#each modelStore.loads as load, i}
      <tr class:row-sel={rowSelected('load', load.data.id)} onclick={(e) => selectRow(e, 'load', load.data.id)}
        ondblclick={(e) => frameRow(e, 'load', load.data.id)} onfocusin={(e) => focusRow(e, 'load', load.data.id)}>
        <td class="id-cell">{i + 1}</td>
        <td>
          <select value={String(load.data.caseId ?? 1)} onchange={(e) => { modelStore.updateLoadCaseId(load.data.id, parseInt(e.currentTarget.value)); if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true; }}>
            {#each modelStore.loadCases as lc}
              <option value={String(lc.id)}>{lc.type || lc.name}</option>
            {/each}
          </select>
        </td>
        <td class="type-cell">{load.type === 'nodal' ? t('table.typePoint') : load.type === 'nodal3d' ? t('table.typePoint3d') : load.type === 'distributed' ? t('table.typeDist') : load.type === 'distributed3d' ? t('table.typeDist3d') : load.type === 'thermal' ? t('table.typeThermal') : t('table.typeBarPoint')}</td>
        <td>
          {#if load.type === 'nodal'}
            {t('table.nodeLabel')} {(load.data as NodalLoad).nodeId}
          {:else if load.type === 'nodal3d'}
            {t('table.nodeLabel')} {(load.data as NodalLoad3D).nodeId}
          {:else if load.type === 'distributed'}
            {t('table.elemLabel')} {(load.data as DistributedLoad).elementId}
          {:else if load.type === 'distributed3d'}
            {t('table.elemLabel')} {(load.data as DistributedLoad3D).elementId}
          {:else if load.type === 'thermal'}
            {t('table.elemLabel')} {(load.data as ThermalLoad).elementId}
          {:else if load.type === 'pointOnElement3d'}
            {t('table.elemLabel')} {(load.data as PointLoadOnElement3D).elementId}
          {:else}
            {t('table.elemLabel')} {(load.data as PointLoadOnElement).elementId}
          {/if}
        </td>
        <td class="load-values">
          {#if load.type === 'nodal'}
            {@const d = load.data as NodalLoad}
            <span class="load-field">Fx<input type="number" step="1" value={d.fx} onchange={(e) => updateLoadField(d.id, 'fx', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">Fz<input type="number" step="1" value={get2DDisplayNodalLoadVertical(d)} onchange={(e) => updateLoadField(d.id, 'fz', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">My<input type="number" step="1" value={get2DDisplayNodalLoadMoment(d)} onchange={(e) => updateLoadField(d.id, 'my', e.currentTarget.value)} /><span class="lf-unit">kN·m</span></span>
          {:else if load.type === 'nodal3d'}
            {@const d = load.data as NodalLoad3D}
            <span class="load-field">Fx<input type="number" step="1" value={d.fx} onchange={(e) => updateLoadField(d.id, 'fx', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">Fy<input type="number" step="1" value={d.fy} onchange={(e) => updateLoadField(d.id, 'fy', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">Fz<input type="number" step="1" value={d.fz} onchange={(e) => updateLoadField(d.id, 'fz', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">Mx<input type="number" step="1" value={d.mx} onchange={(e) => updateLoadField(d.id, 'mx', e.currentTarget.value)} /><span class="lf-unit">kN·m</span></span>
            <span class="load-field">My<input type="number" step="1" value={d.my} onchange={(e) => updateLoadField(d.id, 'my', e.currentTarget.value)} /><span class="lf-unit">kN·m</span></span>
            <span class="load-field">Mz<input type="number" step="1" value={d.mz} onchange={(e) => updateLoadField(d.id, 'mz', e.currentTarget.value)} /><span class="lf-unit">kN·m</span></span>
          {:else if load.type === 'distributed'}
            {@const d = load.data as DistributedLoad}
            <span class="load-field">qI<input type="number" step="1" value={d.qI} onchange={(e) => updateLoadField(d.id, 'qI', e.currentTarget.value)} /><span class="lf-unit">kN/m</span></span>
            <span class="load-field">qJ<input type="number" step="1" value={d.qJ} onchange={(e) => updateLoadField(d.id, 'qJ', e.currentTarget.value)} /><span class="lf-unit">kN/m</span></span>
            <span class="load-field">a<input type="number" step="0.1" value={d.a ?? 0} onchange={(e) => updateLoadField(d.id, 'a', e.currentTarget.value)} /><span class="lf-unit">m</span></span>
            <span class="load-field">b<input type="number" step="0.1" value={d.b ?? modelStore.getElementLength(d.elementId)} onchange={(e) => updateLoadField(d.id, 'b', e.currentTarget.value)} /><span class="lf-unit">m</span></span>
          {:else if load.type === 'distributed3d'}
            {@const d = load.data as DistributedLoad3D}
            <span class="load-field">qYI<input type="number" step="1" value={d.qYI} onchange={(e) => updateLoadField(d.id, 'qYI', e.currentTarget.value)} /><span class="lf-unit">kN/m</span></span>
            <span class="load-field">qYJ<input type="number" step="1" value={d.qYJ} onchange={(e) => updateLoadField(d.id, 'qYJ', e.currentTarget.value)} /><span class="lf-unit">kN/m</span></span>
            <span class="load-field">qZI<input type="number" step="1" value={d.qZI} onchange={(e) => updateLoadField(d.id, 'qZI', e.currentTarget.value)} /><span class="lf-unit">kN/m</span></span>
            <span class="load-field">qZJ<input type="number" step="1" value={d.qZJ} onchange={(e) => updateLoadField(d.id, 'qZJ', e.currentTarget.value)} /><span class="lf-unit">kN/m</span></span>
          {:else if load.type === 'thermal'}
            {@const d = load.data as ThermalLoad}
            <span class="load-field">&Delta;T<input type="number" step="5" value={d.dtUniform} onchange={(e) => updateLoadField(d.id, 'dtUniform', e.currentTarget.value)} /><span class="lf-unit">°C</span></span>
            <span class="load-field">&Delta;Tg<input type="number" step="5" value={d.dtGradient} onchange={(e) => updateLoadField(d.id, 'dtGradient', e.currentTarget.value)} /><span class="lf-unit">°C</span></span>
          {:else if load.type === 'pointOnElement3d'}
            <!-- It fell into the plane branch below and showed an empty P. -->
            {@const d = load.data as PointLoadOnElement3D}
            <span class="load-field">Py<input type="number" step="1" value={d.py} onchange={(e) => updateLoadField(d.id, 'py', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">Pz<input type="number" step="1" value={d.pz} onchange={(e) => updateLoadField(d.id, 'pz', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">a<input type="number" step="0.01" value={d.a} onchange={(e) => updateLoadField(d.id, 'a', e.currentTarget.value)} /><span class="lf-unit">m</span></span>
          {:else}
            {@const d = load.data as PointLoadOnElement}
            <span class="load-field">P<input type="number" step="1" value={d.p} onchange={(e) => updateLoadField(d.id, 'p', e.currentTarget.value)} /><span class="lf-unit">kN</span></span>
            <span class="load-field">a<input type="number" step="0.01" value={d.a} onchange={(e) => updateLoadField(d.id, 'a', e.currentTarget.value)} /><span class="lf-unit">m</span></span>
          {/if}
        </td>
        <td><button class="del" onclick={() => deleteLoad(i)}>&#10005;</button></td>
      </tr>
    {/each}
  </tbody>
</table>
<!-- Created with the tool above the drawing; the table lists and edits them. -->
{#if modelStore.loads.length === 0}
  <p class="empty-hint">{t('table.loadsEmpty')}</p>
{/if}

<style>
  .empty-hint { margin: 0.5rem; font-size: 0.74rem; color: var(--st-text-3); }
  tr.row-sel td { background: var(--st-selected-bg); }
  .combos-fold {
    margin: 0 0 6px;
    border: 1px solid var(--st-border);
    border-radius: var(--st-radius, 3px);
    background: var(--st-surface-2);
  }
  .combos-fold > summary {
    padding: 5px 9px;
    cursor: pointer;
    font-size: 0.74rem;
    color: var(--st-text-2);
    user-select: none;
  }
  .combos-fold > summary:hover { color: var(--st-text); }
  .combos-body { padding: 0 6px 6px; }

  table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 0.25rem 0.35rem;
    color: var(--st-text-3);
    font-weight: 500;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--st-surface-3);
    position: sticky;
    top: 0;
    background: var(--st-surface-2);
    white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem;
    border-bottom: 1px solid var(--st-bg);
    color: var(--st-text-2);
    white-space: nowrap;
  }

  .id-cell {
    color: var(--st-value);
    font-weight: 600;
  }

  .type-cell {
    font-size: 0.7rem;
  }

  td input[type="number"] {
    width: 55px;
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  td select {
    padding: 0.1rem 0.2rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
    cursor: pointer;
    max-width: 90px;
  }

  .load-values {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .load-field {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.65rem;
    color: var(--st-text-3);
  }

  /* The unit each value is typed in, legible at a glance rather than a faint hint. */
  .lf-unit {
    margin-left: 2px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    white-space: nowrap;
  }
  .load-field input {
    width: 50px;
  }

  .selfweight-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.4rem;
    font-size: 0.75rem;
    color: var(--st-text-2);
    cursor: pointer;
    background: rgba(19, 33, 45, 0.4);
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    margin-bottom: 0.3rem;
  }
  .selfweight-row input {
    accent-color: var(--st-accent);
    margin: 0;
  }
  .sw-check { display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer; }
  .sw-in { margin-left: auto; color: var(--st-text-3); }
  /* The table's own select, not the browser's white one. */
  .sw-case {
    padding: 0.1rem 0.25rem;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.72rem;
    cursor: pointer;
    max-width: 55%;
  }
  .sw-case:disabled { opacity: 0.5; }
  .selfweight-row span {
    font-weight: 500;
  }

  .del {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0.1rem 0.3rem;
  }
  .del:hover {
    color: var(--st-accent);
  }

  tr:hover {
    background: rgba(127, 212, 204, 0.05);
  }








</style>
