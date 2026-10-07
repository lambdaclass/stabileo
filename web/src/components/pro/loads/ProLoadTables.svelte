<script lang="ts">
  /**
   * The loads, as tables: the active case's or every case's, one table per kind, each cell edited in
   * place, the totals each case applies before anything is solved, and the operations on the loads
   * selected (copy or move to a case, scale, delete), each one undo step.
   *
   * Values in SI as they are typed; displacements and eccentricities in mm, strains in ‰.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { decimalOrKeep, parseDecimal } from '../../../lib/utils/numeric-input';
  import { plainNumber } from '../../../lib/utils/units';
  import { appliedResultant } from '../../../lib/engine/statics-check';
  import { withCaseEffects } from '../../../lib/engine/case-effects';
  import { copyLoadsToCase, moveLoadsToCase, scaleLoads, removeLoads } from '../../../lib/store/load-ops';
  import { loadedLength } from '../../../lib/model/loads/load-stretch';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import type { Load, SurfaceLoad3D } from '../../../lib/store/model.svelte';
  import { shellText, surfaceValueText, surfaceHowText } from '../../../lib/model/loads/surface-load-text';
  import { definitionName, type DefinitionModel } from '../../../lib/model/loads/floor-definitions';

  let scope = $state<'case' | 'all'>('case');
  const cases = $derived(modelStore.model.loadCases);
  const shown = $derived(modelStore.loads.filter((l) => scope === 'all' || (l.data.caseId ?? 1) === uiStore.activeLoadCaseId));
  const of = <T extends Load['type']>(type: T) => shown.filter((l) => l.type === type) as Array<Extract<Load, { type: T }>>;
  const nodal = $derived(of('nodal3d'));
  const disp = $derived(of('displacement3d'));
  const dist = $derived(of('distributed3d'));
  const point = $derived(of('pointOnElement3d'));
  const thermal = $derived(of('thermal'));
  const tendon = $derived(of('prestress3d'));
  const surface = $derived(of('surface3d'));
  /** The floor-load definition a load comes from, if any. */
  const fromDef = $derived(new Map(modelStore.loads.flatMap((l) => { const d = (l.data as { fromDef?: number }).fromDef; return d === undefined ? [] : [[l.data.id, d] as const]; })));
  const defOf = (id: number) => fromDef.get(id);
  /** A definition by the name the floor-load list shows it with. */
  const defName = (def: number) => definitionName(modelStore.model as unknown as DefinitionModel, def);
  const thermalQuad = $derived(of('thermalQuad3d'));
  const caseName = (id: number | undefined) => cases.find((c) => c.id === (id ?? 1))?.name ?? '—';

  /** The stored value, whole: two decimals showed 0,004 kN as 0,00 in a cell that edits it. */
  const fmt = (n: number | undefined, k = 1) => plainNumber((n ?? 0) * k, 6);
  /** An edit the store refused (a load put off its member, `load-stretch.ts`): said, with the member's length. */
  function refused(id: number) {
    const elementId = (modelStore.loads.find((l) => l.data.id === id)?.data as { elementId?: number } | undefined)?.elementId;
    if (elementId !== undefined) uiStore.toast(tp('loadTables.placeRefused', { L: plainNumber(loadedLength(modelStore.model as never, elementId), 3) }), 'error');
  }
  /**
   * A cell typed: read by the app's one reader; unreadable text keeps the value, `k` the shown scale.
   * An edit the store refuses (a point load's a off its member) keeps the value shown, too.
   */
  function setNum(el: HTMLInputElement, id: number, key: string, previous: number | undefined, k = 1) {
    const prev = (previous ?? 0) * k;
    const v = decimalOrKeep(el.value, prev);
    el.value = plainNumber(v, 6);
    if (v !== prev && !modelStore.updateLoad(id, { [key]: v / k })) { el.value = plainNumber(prev, 6); refused(id); }
  }
  /**
   * An a or b cell: empty is the member's end. Unreadable text, or a stretch that would not go
   * forward on the member (0 ≤ a < b ≤ L), changes nothing and the cell shows the stored value again:
   * blanking it left the old stretch in place behind a cell that said the whole member.
   */
  function setEnd(el: HTMLInputElement, id: number, key: 'a' | 'b', elementId: number, previous: number | undefined) {
    const shown = previous !== undefined ? fmt(previous) : '';
    const v = el.value.trim() === '' ? (key === 'a' ? 0 : loadedLength(modelStore.model as never, elementId)) : parseDecimal(el.value);
    if (v === null) { el.value = shown; return; }
    if (!modelStore.updateLoad(id, { [key]: v })) { el.value = shown; refused(id); }
  }

  function select(id: number, e: MouseEvent) {
    if (!modelStore.loads.some((l) => l.data.id === id)) return;
    uiStore.selectMode = 'loads';
    uiStore.selectLoad(id, e.shiftKey || e.metaKey || e.ctrlKey);
  }
  const isSel = (id: number) => uiStore.selectedLoads.has(id);

  // ── Totals per case, before solving ──
  const totals = $derived.by(() => {
    const ids = scope === 'all' ? cases.map((c) => c.id) : [uiStore.activeLoadCaseId];
    const types = new Map(cases.map((c) => [c.id, c.type]));
    // A composite case's totals are those of what it takes in (`case-effects.ts`).
    const m = withCaseEffects(modelStore.model as never, modelStore.model.loadCases, { includeSelfWeight: uiStore.includeSelfWeight, leftHand: uiStore.axisConvention3D === 'leftHand' });
    return ids.map((id) => ({ id, ...appliedResultant(m as never, id, { includeSelfWeight: uiStore.includeSelfWeight, caseTypes: types, leftHand: uiStore.axisConvention3D === 'leftHand' }) }));
  });
  // In the project's units and the reader's decimals, with the unit said: the cells are typed in SI
  // and their headers say so, and a total in tf with no unit beside them read as kN.
  const F = (v: number) => `${fmtQ(v, 'force')} ${unitQ('force')}`;
  const M = (v: number) => `${fmtQ(v, 'moment')} ${unitQ('moment')}`;

  // ── Operations on the selected loads ──
  const selected = $derived([...uiStore.selectedLoads].filter((id) => modelStore.loads.some((l) => l.data.id === id)));
  let toCase = $state<number | null>(null);
  let factorText = $state('1');
  const factor = $derived(parseDecimal(factorText));
  // A case chosen and then deleted is no destination: back to the default, never loads in no case.
  const destination = $derived((toCase !== null && cases.some((c) => c.id === toCase) ? toCase : null)
    ?? cases.find((c) => c.id !== uiStore.activeLoadCaseId)?.id ?? cases[0]?.id ?? 1);
  function del(ids: number[]) {
    const own = ids.filter((id) => defOf(id) === undefined);
    if (own.length < ids.length) uiStore.toast(t('floorLoad.readOnlyLoad'), 'info');
    removeLoads(own);
    for (const id of own) uiStore.deleteSelectedLoad(id);
  }
</script>

<div class="lt-bar">
  <div class="seg" role="radiogroup" aria-label={t('loadTables.scope')}>
    <button type="button" role="radio" aria-checked={scope === 'case'} class:on={scope === 'case'} onclick={() => (scope = 'case')} data-testid="lt-scope-case">{t('loadTables.activeCase')}</button>
    <button type="button" role="radio" aria-checked={scope === 'all'} class:on={scope === 'all'} onclick={() => (scope = 'all')} data-testid="lt-scope-all">{t('loadTables.allCases')}</button>
  </div>
</div>

{#if selected.length > 0}
  <div class="lt-ops" data-testid="lt-ops">
    <span class="lt-ops-n">{tp('loadTables.selected', { n: selected.length })}</span>
    <select value={destination} onchange={(e) => (toCase = Number(e.currentTarget.value))} data-testid="lt-ops-case" aria-label={t('loadTables.toCase')}>
      {#each cases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
    </select>
    <label>× <input type="text" class="lt-k" bind:value={factorText} data-testid="lt-ops-factor" /></label>
    <button type="button" class="pk-btn" disabled={factor === null} onclick={() => copyLoadsToCase(selected, destination, factor ?? 1)} data-testid="lt-ops-copy">{t('loadTables.copy')}</button>
    <button type="button" class="pk-btn" onclick={() => moveLoadsToCase(selected.filter((id) => defOf(id) === undefined), destination)} data-testid="lt-ops-move">{t('loadTables.move')}</button>
    <button type="button" class="pk-btn" disabled={factor === null} onclick={() => scaleLoads(selected.filter((id) => defOf(id) === undefined), factor ?? 1)} data-testid="lt-ops-scale">{t('loadTables.scale')}</button>
    <button type="button" class="pk-btn lt-danger" onclick={() => del(selected)} data-testid="lt-ops-delete">{t('loadTables.delete')}</button>
  </div>
{/if}

{#snippet caseCell(id: number | undefined)}{#if scope === 'all'}<td class="col-case">{caseName(id)}</td>{/if}{/snippet}
{#snippet caseHead()}{#if scope === 'all'}<th>{t('loadTables.case')}</th>{/if}{/snippet}
<!-- A load written by a floor-load definition is edited through it: it is rewritten from it. -->
{#snippet x(id: number)}
  {@const def = defOf(id)}
  {#if def !== undefined}<td class="col-def" title={tp('loads.surface.fromDef', { name: defName(def) })}>⟲ {defName(def)}</td>
  {:else}<td><button class="pro-delete-btn" onclick={(e) => { e.stopPropagation(); del([id]); }} aria-label={t('loadTables.delete')}>×</button></td>{/if}
{/snippet}
{#snippet cell(id: number, key: string, v: number | undefined, k?: number)}
  {#if defOf(id) !== undefined}<td class="col-num">{fmt(v, k ?? 1)}</td>
  {:else}<td class="col-num"><input class="inp-cell" value={fmt(v, k ?? 1)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, id, key, v, k ?? 1)} /></td>{/if}
{/snippet}

<div class="pro-loads-table-wrap" data-testid="load-tables">
  {#if nodal.length}
    <div class="pro-load-section-title">{t('pro.nodalLoads')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('pro.thNode')}</th><th>Fx (kN)</th><th>Fy (kN)</th><th>Fz (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>Mz (kN·m)</th><th></th></tr></thead><tbody>
      {#each nodal as l (l.data.id)}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)}>
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{l.data.nodeId}</td>
          {#each ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as k (k)}{@render cell(l.data.id, k, l.data[k as 'fx'])}{/each}
          {@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if disp.length}
    <div class="pro-load-section-title">{t('loadTables.imposed')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('pro.thNode')}</th><th>dx (mm)</th><th>dy (mm)</th><th>dz (mm)</th><th>drx (rad)</th><th>dry (rad)</th><th>drz (rad)</th><th></th></tr></thead><tbody>
      {#each disp as l (l.data.id)}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)}>
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{l.data.nodeId}</td>
          {#each ['dx', 'dy', 'dz'] as k (k)}{@render cell(l.data.id, k, l.data[k as 'dx'], 1000)}{/each}
          {#each ['drx', 'dry', 'drz'] as k (k)}{@render cell(l.data.id, k, l.data[k as 'drx'])}{/each}
          {@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if dist.length}
    <div class="pro-load-section-title">{t('pro.distLoads')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('table.elemLabel')}</th><th>{t('loads.frame')}</th><th>qx_i (kN/m)</th><th>qx_j</th><th>qY_i</th><th>qY_j</th><th>qZ_i</th><th>qZ_j</th><th>a (m)</th><th>b (m)</th><th></th></tr></thead><tbody>
      {#each dist as l (l.data.id)}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)} data-testid="lt-dist-row">
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{l.data.elementId}</td>
          {#if defOf(l.data.id) !== undefined}
            <!-- Read-only, as its values: a definition's load is changed through the definition. -->
            <td>{t(`loads.frame.${l.data.frame ?? 'local'}`)}</td>
            {#each ['qXI', 'qXJ', 'qYI', 'qYJ', 'qZI', 'qZJ'] as k (k)}{@render cell(l.data.id, k, l.data[k as 'qYI'])}{/each}
            <td class="col-num">{l.data.a !== undefined ? fmt(l.data.a) : ''}</td>
            <td class="col-num">{l.data.b !== undefined ? fmt(l.data.b) : ''}</td>
          {:else}
          <td><select class="inp-cell" value={l.data.frame ?? 'local'} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { frame: e.currentTarget.value })}>
            <option value="local">{t('loads.frame.local')}</option><option value="global">{t('loads.frame.global')}</option><option value="projected">{t('loads.frame.projected')}</option>
          </select></td>
          {#each ['qXI', 'qXJ', 'qYI', 'qYJ', 'qZI', 'qZJ'] as k (k)}{@render cell(l.data.id, k, l.data[k as 'qYI'])}{/each}
          <td class="col-num"><input class="inp-cell" value={l.data.a !== undefined ? fmt(l.data.a) : ''} placeholder="0" onclick={(e) => e.stopPropagation()} onchange={(e) => setEnd(e.currentTarget, l.data.id, 'a', l.data.elementId, l.data.a)} data-testid="lt-dist-a" /></td>
          <td class="col-num"><input class="inp-cell" value={l.data.b !== undefined ? fmt(l.data.b) : ''} placeholder="L" onclick={(e) => e.stopPropagation()} onchange={(e) => setEnd(e.currentTarget, l.data.id, 'b', l.data.elementId, l.data.b)} data-testid="lt-dist-b" /></td>
          {/if}
          {@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if point.length}
    <div class="pro-load-section-title">{t('pro.pointLoads')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('table.elemLabel')}</th><th>{t('loads.frame')}</th><th>a (m)</th><th>Px (kN)</th><th>Py</th><th>Pz</th><th>Mx (kN·m)</th><th>My</th><th>Mz</th><th></th></tr></thead><tbody>
      {#each point as l (l.data.id)}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)} data-testid="lt-point-row">
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{l.data.elementId}</td>
          <td><select class="inp-cell" value={l.data.frame ?? 'local'} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { frame: e.currentTarget.value })}>
            <option value="local">{t('loads.frame.local')}</option><option value="global">{t('loads.frame.global')}</option>
          </select></td>
          {@render cell(l.data.id, 'a', l.data.a)}
          {#each ['px', 'py', 'pz', 'mx', 'my', 'mz'] as k (k)}{@render cell(l.data.id, k, l.data[k as 'py'])}{/each}
          {@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if thermal.length}
    <div class="pro-load-section-title">{t('loadTables.thermal')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('table.elemLabel')}</th><th>ΔT (°C)</th><th>ΔTgz (°C)</th><th>ΔTgy (°C)</th><th>ε₀ (‰)</th><th></th></tr></thead><tbody>
      {#each thermal as l (l.data.id)}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)} data-testid="lt-thermal-row">
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{l.data.elementId}</td>
          {@render cell(l.data.id, 'dtUniform', l.data.dtUniform)}{@render cell(l.data.id, 'dtGradient', l.data.dtGradient)}
          {@render cell(l.data.id, 'dtGradientY', l.data.dtGradientY)}{@render cell(l.data.id, 'strain', l.data.strain, 1000)}
          {@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if tendon.length}
    <div class="pro-load-section-title">{t('loads.prestress')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('table.elemLabel')}</th><th>P (kN)</th><th>e I (mm)</th><th>e {t('writeLoad.middle')}</th><th>e J</th><th></th></tr></thead><tbody>
      {#each tendon as l (l.data.id)}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)}>
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{l.data.elementId}</td>
          {@render cell(l.data.id, 'force', l.data.force)}
          {#each ['eI', 'eM', 'eJ'] as k (k)}{@render cell(l.data.id, k, l.data[k as 'eI'], 1000)}{/each}
          {@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if surface.length}
    <div class="pro-load-section-title">{t('pro.surfaceLoads')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('pro.slab')}</th><th>q (kN/m²)</th><th>{t('loads.surface.how')}</th><th></th></tr></thead><tbody>
      {#each surface as l (l.data.id)}
        {@const d = l.data as SurfaceLoad3D}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)}>
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{shellText(d)}</td>
          {#if d.qNodes || d.vary}<td class="col-num">{surfaceValueText(d)}</td>{:else}{@render cell(l.data.id, 'q', l.data.q)}{/if}
          <td class="col-how">{surfaceHowText(d, defName)}</td>{@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if thermalQuad.length}
    <div class="pro-load-section-title">{t('pro.thermalQuadLoads')}</div>
    <table class="pro-loads-table"><thead><tr><th>ID</th>{@render caseHead()}<th>{t('pro.slab')}</th><th>{t('pro.dtUniform')} (°C)</th><th>{t('pro.dtGradient')} (°C)</th><th></th></tr></thead><tbody>
      {#each thermalQuad as l (l.data.id)}
        <tr class:selected={isSel(l.data.id)} onclick={(e) => select(l.data.id, e)}>
          <td class="col-id">{l.data.id}</td>{@render caseCell(l.data.caseId)}<td class="col-num">{l.data.quadId}</td>
          {@render cell(l.data.id, 'dtUniform', l.data.dtUniform)}{@render cell(l.data.id, 'dtGradient', l.data.dtGradient)}{@render x(l.data.id)}
        </tr>
      {/each}
    </tbody></table>
  {/if}

  {#if shown.length === 0}<div class="pro-empty">{t('pro.noLoads')}</div>{/if}

  <!-- What each case applies, about the origin, before solving: the statics check's own reading. -->
  <div class="lt-totals" data-testid="lt-totals">
    <div class="pro-load-section-title">{t('loadTables.totals')}</div>
    {#each totals as r (r.id)}
      <div class="lt-total-row" data-testid="lt-total-{r.id}">
        <span class="lt-total-case">{caseName(r.id)}</span>
        <span>ΣFx {F(r.applied.fx)}</span><span>ΣFy {F(r.applied.fy)}</span><span>ΣFz {F(r.applied.fz)}</span>
        <span>ΣMx {M(r.applied.mx)}</span><span>ΣMy {M(r.applied.my)}</span><span>ΣMz {M(r.applied.mz)}</span>
        {#if r.selfWeightIncluded}<span class="lt-note">{t('loadTables.withSelfWeight')}</span>{/if}
        {#if r.uncovered.length}<span class="lt-warn">{tp('loadTables.uncovered', { list: r.uncovered.join(', ') })}</span>{/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .lt-bar { display: flex; justify-content: flex-end; padding: 4px 10px 0; }
  .seg { display: inline-flex; border: 1px solid var(--st-hair); border-radius: var(--st-radius); overflow: hidden; }
  .seg button { background: none; border: none; color: var(--st-text-3); font-size: 0.66rem; padding: 2px 8px; cursor: pointer; }
  .seg button.on { background: var(--st-surface-3); color: var(--st-text); }
  .lt-ops { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 10px 0; padding: 5px 8px; border: 1px solid var(--st-interactive); border-radius: var(--st-radius); font-size: 0.68rem; color: var(--st-text-2); }
  .lt-ops select, .lt-k { padding: 2px 4px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text); font-size: 0.7rem; }
  .lt-k { width: 46px; font-family: var(--st-mono); }
  .lt-ops-n { font-weight: 600; }
  .pk-btn { padding: 2px 8px; font-size: 0.66rem; background: var(--st-surface-3); border: 1px solid var(--st-hair); border-radius: 4px; color: var(--st-text-2); cursor: pointer; }
  .pk-btn:disabled { opacity: 0.5; cursor: default; }
  .lt-danger { color: var(--st-danger); }
  .pro-load-section-title { padding: 8px 12px 4px; font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 6px; }
  .pro-loads-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .pro-loads-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-loads-table th { padding: 6px 6px; text-align: left; font-size: 0.66rem; font-weight: 600; color: var(--st-text-3); text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3); }
  .col-how { font-size: 0.64rem; color: var(--st-text-3); }
  .col-def { font-size: 0.64rem; color: var(--st-text-3); white-space: nowrap; }
  .pro-loads-table td { padding: 4px 6px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .pro-loads-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .pro-loads-table tbody tr:hover { background: rgba(127, 212, 204, 0.08); }
  .pro-loads-table tbody tr.selected { background: rgba(127, 212, 204, 0.18); box-shadow: inset 3px 0 0 var(--st-value); }
  .inp-cell { background: transparent; border: 1px solid transparent; border-radius: 3px; color: var(--st-text-2); font-size: 0.72rem; font-family: monospace; padding: 2px 4px; width: 60px; text-align: right; }
  .inp-cell:hover { border-color: var(--st-surface-3); }
  .inp-cell:focus { background: var(--st-surface-3); border-color: var(--st-surface-3); outline: none; }
  select.inp-cell { width: auto; text-align: left; font-family: var(--st-sans); }
  .col-id { width: 32px; color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-case { font-size: 0.66rem; color: var(--st-text-3); white-space: nowrap; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.75rem; }
  .pro-delete-btn { background: none; border: none; color: var(--st-text-3); font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: var(--st-danger); }
  .pro-empty { text-align: center; color: var(--st-text-3); font-style: italic; padding: 30px 10px; font-size: 0.78rem; }
  .lt-totals { padding-bottom: 8px; }
  .lt-total-row { display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 2px 12px; font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-2); }
  .lt-total-case { font-family: var(--st-sans); font-weight: 600; color: var(--st-text); min-width: 6rem; }
  .lt-note { font-family: var(--st-sans); color: var(--st-text-3); }
  .lt-warn { font-family: var(--st-sans); color: var(--st-warn); }
</style>
