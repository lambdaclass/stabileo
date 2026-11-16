<script lang="ts">
  import { caseNameShown } from '../../lib/axes/case-names';
  import { selectRow, frameRow, focusRow, rowSelected } from '../../lib/actions/table-row-select';
  import { modelStore, uiStore, historyStore, resultsStore } from '../../lib/store';
  import CombosTable from './CombosTable.svelte';
  import { t } from '../../lib/i18n';
  // Values are typed in the unit system chosen under Settings and kept in SI.
  import UnitInput from '../UnitInput.svelte';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import type { DistributedLoad, PointLoadOnElement, PointLoadOnElement3D, NodalLoad, ThermalLoad, NodalLoad3D, DistributedLoad3D } from '../../lib/store/model.svelte.ts';
  import { get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical, TWO_D_NODAL_LOAD_LABELS } from '../../lib/geometry/coordinate-system';
  import { XYZ, along, modelRot, modelVec, planeGlobalValue, twoD, userRot, userVec } from '../../lib/axes/display';
  import { pruneStaleSelection } from '../../lib/store/selection-prune';
  import { setLoadCasesEnabled } from '../../lib/actions/load-cases';

  // Load cases and combinations: switched in Basic from the top of the fold, always on elsewhere.
  const casesShown = $derived(uiStore.showLoadCasePicker);
  const inBasic = $derived(uiStore.appMode === 'basico');
  /** The fold's summary line: what it holds while closed. */
  const foldSummary = $derived.by(() => {
    const parts: string[] = [];
    if (casesShown) parts.push(t('loads.casesSummary').replace('{c}', String(modelStore.loadCases.length)).replace('{k}', String(modelStore.combinations.length)));
    if (uiStore.includeSelfWeight) parts.push(t('table.selfWeight'));
    return parts.join(' · ') || t('loads.casesOff');
  });

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
    // A deleted load leaves the selection too, or the bar keeps editing nothing.
    pruneStaleSelection();
  }

  function updateLoadField(loadId: number, field: string, val: string) {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    modelStore.updateLoad(loadId, { [field]: num });
  }

  function updateUserComponent(loadId: number, keys: readonly [string, string, string], moment: boolean, m: [number, number, number], i: number, v: number) {
    const u = moment ? userRot(m[0], m[1], m[2]) : userVec(m[0], m[1], m[2]);
    u[i] = v;
    const back = moment ? modelRot(u[0], u[1], u[2]) : modelVec(u[0], u[1], u[2]);
    modelStore.updateLoad(loadId, { [keys[0]]: back[0], [keys[1]]: back[1], [keys[2]]: back[2] });
  }

  const globalAxis = (global: boolean, k: 0 | 1 | 2) => (global ? along(k) : { name: 'XYZ'[k], sign: 1 });
</script>

<!--
  Combinations live here, folded, above the loads they combine.
  
  They were a tab of their own beside Nodes and Sections, which put them among
  the things a model is MADE of. A combination is not a thing in the model — it
  is an arrangement of the loads, and it means nothing without them. Reading it
  next to the loads is reading it in the only place it makes sense.
-->
<details class="combos-fold">
  <summary>{t('data.combinations')} <span class="fold-sum">{foldSummary}</span></summary>
  <div class="combos-body">
    <!--
      Basic: load cases and combinations, first in the fold. Off, the model reads as one load case
      (no case picker, no case column, no results by case, combination or envelope). Self-weight
      stands apart: it counts with them on or off.
    -->
    {#if inBasic}
      <label class="cases-switch" title={t('loads.casesSwitchTip')}>
        <input type="checkbox" checked={uiStore.loadCasesEnabled} onchange={(e) => setLoadCasesEnabled(e.currentTarget.checked)} data-testid="load-cases-toggle" />
        <span>{t('loads.casesSwitch')}</span>
      </label>
    {/if}
    <!-- Self-weight: whether it counts, and (with load cases shown) in which case. -->
    <div class="selfweight-row" title={t('table.selfWeightTooltip')}>
      <label class="sw-check">
        <input type="checkbox" bind:checked={uiStore.includeSelfWeight} data-testid="selfweight-toggle" />
        <span>{t('table.selfWeight')}</span>
      </label>
      {#if casesShown}
        <span class="sw-in">{t('table.selfWeightIn')}</span>
        <select class="sw-case" value={String(selfWeightCase ?? '')} disabled={!uiStore.includeSelfWeight}
          onchange={(e) => { uiStore.selfWeightCaseId = parseInt(e.currentTarget.value); resultsStore.clear(); }}
          data-testid="selfweight-case">
          {#each modelStore.loadCases as lc}
            <option value={String(lc.id)}>{lc.type ? `${lc.type} · ` : ''}{caseNameShown(lc)}</option>
          {/each}
        </select>
      {/if}
    </div>
    {#if casesShown}<CombosTable />{/if}
  </div>
</details>

<table>
  <thead>
    <tr><th>#</th>{#if casesShown}<th>{t('table.case')}</th>{/if}<th>{t('table.type')}</th><th>{t('table.target')}</th><th>{t('table.values')}</th><th></th></tr>
  </thead>
  <tbody>
    {#each modelStore.loads as load, i}
      <tr class:row-sel={rowSelected('load', load.data.id)} onclick={(e) => selectRow(e, 'load', load.data.id)}
        ondblclick={(e) => frameRow(e, 'load', load.data.id)} onfocusin={(e) => focusRow(e, 'load', load.data.id)}>
        <!-- The load's own number, the one selection by number and the drawing use. -->
        <td class="id-cell">{load.data.id}</td>
        {#if casesShown}
        <td>
          <select value={String(load.data.caseId ?? 1)} onchange={(e) => { modelStore.updateLoadCaseId(load.data.id, parseInt(e.currentTarget.value)); if (resultsStore.hasCombinations) resultsStore.combinationsDirty = true; }}>
            {#each modelStore.loadCases as lc}
              <option value={String(lc.id)}>{lc.type || caseNameShown(lc)}</option>
            {/each}
          </select>
        </td>
        {/if}
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
            <span class="load-field">{TWO_D_NODAL_LOAD_LABELS.horizontal}<UnitInput value={twoD.x(d.fx)} qty="force" onchange={(v) => updateLoadField(d.id, 'fx', String(twoD.fromX(v)))} unit={false} /><span class="lf-unit">{unitQ('force')}</span></span>
            <span class="load-field">{TWO_D_NODAL_LOAD_LABELS.vertical}<UnitInput value={twoD.z(get2DDisplayNodalLoadVertical(d))} qty="force" onchange={(v) => updateLoadField(d.id, 'fz', String(twoD.fromZ(v)))} unit={false} /><span class="lf-unit">{unitQ('force')}</span></span>
            <span class="load-field">{TWO_D_NODAL_LOAD_LABELS.moment}<UnitInput value={twoD.rot(get2DDisplayNodalLoadMoment(d))} qty="moment" onchange={(v) => updateLoadField(d.id, 'my', String(twoD.fromRot(v)))} unit={false} /><span class="lf-unit">{unitQ('moment')}</span></span>
          {:else if load.type === 'nodal3d'}
            {@const d = load.data as NodalLoad3D}
            {@const f = [d.fx, d.fy, d.fz] as [number, number, number]}
            {@const m = [d.mx, d.my, d.mz] as [number, number, number]}
            {@const fu = userVec(f[0], f[1], f[2])}
            {@const mu = userRot(m[0], m[1], m[2])}
            {#each XYZ as a, i (a)}
              <span class="load-field">F{a}<UnitInput value={fu[i]} qty="force" onchange={(v) => updateUserComponent(d.id, ['fx', 'fy', 'fz'], false, f, i, v)} unit={false} /><span class="lf-unit">{unitQ('force')}</span></span>
            {/each}
            {#each XYZ as a, i (a)}
              <span class="load-field">M{a}<UnitInput value={mu[i]} qty="moment" onchange={(v) => updateUserComponent(d.id, ['mx', 'my', 'mz'], true, m, i, v)} unit={false} /><span class="lf-unit">{unitQ('moment')}</span></span>
            {/each}
          {:else if load.type === 'distributed'}
            {@const d = load.data as DistributedLoad}
            <span class="load-field">qI<UnitInput value={d.isGlobal ? planeGlobalValue(d.qI) : d.qI} qty="distributedLoad" onchange={(v) => updateLoadField(d.id, 'qI', String(d.isGlobal ? planeGlobalValue(v) : v))} unit={false} /><span class="lf-unit">{unitQ('distributedLoad')}</span></span>
            <span class="load-field">qJ<UnitInput value={d.isGlobal ? planeGlobalValue(d.qJ) : d.qJ} qty="distributedLoad" onchange={(v) => updateLoadField(d.id, 'qJ', String(d.isGlobal ? planeGlobalValue(v) : v))} unit={false} /><span class="lf-unit">{unitQ('distributedLoad')}</span></span>
            <span class="load-field">a<UnitInput value={d.a ?? 0} qty="length" onchange={(v) => updateLoadField(d.id, 'a', String(v))} unit={false} /><span class="lf-unit">{unitQ('length')}</span></span>
            <span class="load-field">b<UnitInput value={d.b ?? modelStore.getElementLength(d.elementId)} qty="length" onchange={(v) => updateLoadField(d.id, 'b', String(v))} unit={false} /><span class="lf-unit">{unitQ('length')}</span></span>
          {:else if load.type === 'distributed3d'}
            {@const d = load.data as DistributedLoad3D}
            {@const qa = (k: 0 | 1 | 2) => globalAxis(d.frame === 'global' || d.frame === 'projected', k)}
            {#each [[1, 'qYI', d.qYI], [1, 'qYJ', d.qYJ], [2, 'qZI', d.qZI], [2, 'qZJ', d.qZJ]] as const as [k, f, q] (f)}
              <span class="load-field">q{qa(k).name}{f[2]}<UnitInput value={qa(k).sign * q} qty="distributedLoad" onchange={(v) => updateLoadField(d.id, f, String(qa(k).sign * v))} unit={false} /><span class="lf-unit">{unitQ('distributedLoad')}</span></span>
            {/each}
            <!-- qX loads the member in every frame (along X, or along the member): never hidden while
                 it is not zero. The axes the components are read on, unless the member's own. -->
            {#if d.frame === 'global' || d.frame === 'projected' || d.qXI || d.qXJ}
              {#each [['qXI', d.qXI ?? 0], ['qXJ', d.qXJ ?? 0]] as const as [f, q] (f)}
                <span class="load-field">q{qa(0).name}{f[2]}<UnitInput value={qa(0).sign * q} qty="distributedLoad" onchange={(v) => updateLoadField(d.id, f, String(qa(0).sign * v))} unit={false} /><span class="lf-unit">{unitQ('distributedLoad')}</span></span>
              {/each}
            {/if}
            {#if d.frame === 'global' || d.frame === 'projected'}
              <span class="load-field" data-testid="load-frame">{d.frame === 'global' ? t('float.frameGlobal') : t('loads.frame.projected')}</span>
            {/if}
          {:else if load.type === 'thermal'}
            {@const d = load.data as ThermalLoad}
            <span class="load-field" title={t('float.thermalUniformTip')}>ΔTg<UnitInput value={d.dtUniform} qty="temperatureDelta" onchange={(v) => updateLoadField(d.id, 'dtUniform', String(v))} unit={false} /><span class="lf-unit">{unitQ('temperatureDelta')}</span></span>
            <span class="load-field" title={t('float.thermalGradientTip')}>∇T<UnitInput value={d.dtGradient} qty="temperatureDelta" onchange={(v) => updateLoadField(d.id, 'dtGradient', String(v))} unit={false} /><span class="lf-unit">{unitQ('temperatureDelta')}</span></span>
          {:else if load.type === 'pointOnElement3d'}
            <!-- It fell into the plane branch below and showed an empty P. -->
            {@const d = load.data as PointLoadOnElement3D}
            {@const pa = (k: 0 | 1 | 2) => globalAxis(d.frame === 'global', k)}
            {#each [...(d.frame === 'global' || d.px ? [[0, 'px', d.px ?? 0]] as const : []), [1, 'py', d.py], [2, 'pz', d.pz]] as const as [k, f, p] (f)}
              <span class="load-field">P{pa(k).name.toLowerCase()}<UnitInput value={pa(k).sign * p} qty="force" onchange={(v) => updateLoadField(d.id, f, String(pa(k).sign * v))} unit={false} /><span class="lf-unit">{unitQ('force')}</span></span>
            {/each}
            <span class="load-field">a<UnitInput value={d.a} qty="length" onchange={(v) => updateLoadField(d.id, 'a', String(v))} unit={false} /><span class="lf-unit">{unitQ('length')}</span></span>
          {:else}
            {@const d = load.data as PointLoadOnElement}
            <span class="load-field">P<UnitInput value={d.isGlobal ? planeGlobalValue(d.p) : d.p} qty="force" onchange={(v) => updateLoadField(d.id, 'p', String(d.isGlobal ? planeGlobalValue(v) : v))} unit={false} /><span class="lf-unit">{unitQ('force')}</span></span>
            <span class="load-field">a<UnitInput value={d.a} qty="length" onchange={(v) => updateLoadField(d.id, 'a', String(v))} unit={false} /><span class="lf-unit">{unitQ('length')}</span></span>
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
  .fold-sum { margin-left: 0.4rem; color: var(--st-text-3); font-size: 0.7rem; }
  /* The switch first, on its own line and in the fold's own weight. */
  .cases-switch {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.4rem;
    margin-bottom: 0.3rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--st-text);
    cursor: pointer;
  }
  .cases-switch input { accent-color: var(--st-accent); margin: 0; }

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

  td :global(input[type="number"]) {
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
  .load-field :global(input) {
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
