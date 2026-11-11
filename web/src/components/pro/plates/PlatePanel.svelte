<script lang="ts">
  import Hint from '../Hint.svelte';
  /**
   * The physical plates selected whole (`store/physical-plates.ts`): what each one is, its holes,
   * the area loads defined on it, and its mesh, which is made, made again or taken out from here.
   *
   * One plate shows everything; several show what they share, so a batch can be given a
   * thickness or meshed together. Every change is one undo step.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import {
    addPlateLoad, clearPlateMesh, deletePlate, liftableLoads, plateEntry, plateLoadDefs, plateShellKeys, plateStatus,
    setPlateProperties, type PlateStatus,
  } from '../../../lib/store/physical-plates';
  import { closePlateHole, plateSideShapes, setPlateSideSagitta } from '../../../lib/store/plate-shape';
  import { plateArea, plateGeometry, plateLoops } from '../../../lib/model/physical/plate';
  import { removeFloorLoadDef } from '../../../lib/store/defined-loads';
  import { declarePhysicalTypology } from '../../../lib/store/physical';
  import { requestFloorLoad } from '../../../lib/store/floor-load-request.svelte';
  import { TYPOLOGIES } from '../../../lib/model/physical';
  import type { FloorLoadDef } from '../../../lib/model/loads/floor-definitions';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import PlateMeshDialog from './PlateMeshDialog.svelte';
  import PlateShapeDialog from './PlateShapeDialog.svelte';
  import { plateMeshState } from './plate-state';
  import { significantNumber } from '../../../lib/utils/unit-format';

  const ids = $derived([...uiStore.selectedPlates].filter((id) => { void modelStore.model.groups; return !!plateEntry(id); }));
  const entries = $derived.by(() => { void modelStore.modelVersion; void modelStore.model.groups; return ids.map((id) => plateEntry(id)!); });
  const one = $derived(entries.length === 1 ? entries[0]! : null);
  const status = (id: number): PlateStatus => { void modelStore.modelVersion; void modelStore.model.groups; return plateStatus(id); };
  const materials = $derived([...modelStore.materials.values()]);
  const cases = $derived(modelStore.model.loadCases);

  const area = $derived.by(() => {
    void modelStore.modelVersion;
    if (!one) return 0;
    const g = plateGeometry(modelStore, one.group);
    return g ? plateArea(g) : 0;
  });
  const loops = $derived(one ? plateLoops(one.group) : null);
  const loads = $derived.by(() => { void modelStore.model.groups; return one ? plateLoadDefs(one.id) : []; });
  const elementLoads = $derived.by(() => { void modelStore.modelVersion; void modelStore.model.groups; return one ? liftableLoads(one).cases : []; });
  const sharedThickness = $derived(entries.length && entries.every((e) => e.surface.thickness === entries[0]!.surface.thickness) ? entries[0]!.surface.thickness : null);
  const sharedMaterial = $derived(entries.length && entries.every((e) => e.surface.materialId === entries[0]!.surface.materialId) ? entries[0]!.surface.materialId : null);

  const sides = $derived.by(() => { void modelStore.modelVersion; void modelStore.model.groups; return one ? plateSideShapes(one.id) : []; });
  const curved = $derived(sides.map((s, k) => ({ ...s, k })).filter((s) => s.mid !== null));
  let loadCase = $state(1);
  let loadQ = $state(1);
  let message = $state<string | null>(null);
  let meshOpen = $state(false);
  let shapeOpen = $state<'holes' | 'sides' | null>(null);
  // What one plate's panel says belongs to that plate: another plate's message is not carried over.
  let shown = $state<number | null>(null);
  $effect(() => { const id = one?.id ?? null; if (id !== shown) { shown = id; message = null; shapeOpen = null; } });

  function straighten(k: number) {
    if (!one) return;
    const p = setPlateSideSagitta(one.id, k, 0);
    message = p ? t(`plates.shapeProblem.${p}`) : t('plates.shape.straightened');
  }
  function closeHole(k: number) {
    if (!one) return;
    const p = closePlateHole(one.id, k);
    message = p ? t(`plates.shapeProblem.${p}`) : t('plates.shape.holeClosed');
  }
  /** Definitions on the plate's level that reach it as well as its own: a slab's, by elevation. */
  const levelLoads = $derived.by(() => {
    void modelStore.model.groups; void modelStore.modelVersion;
    if (!one || one.physical.kind !== 'slab') return [];
    const g = plateGeometry(modelStore, one.group);
    if (!g || Math.abs(g.frame.n[2]) < 1 - 1e-6) return [];
    const z = g.outer[0]![2];
    return [...modelStore.model.groups.values()].filter((d) => d.kind === 'floorLoad' && (d.data as unknown as FloorLoadDef | undefined)?.target.by === 'level'
      && Math.abs(((d.data as unknown as FloorLoadDef).target as { z: number }).z - z) < 1e-3);
  });
  const typologies = $derived(one ? TYPOLOGIES[one.physical.kind] ?? [] : []);
  function openInLoads() {
    if (!one) return;
    requestFloorLoad(`g:${one.id}`);
    uiStore.proActiveTab = 'loads';
  }
  function addLoad() {
    if (!one) return;
    addPlateLoad(one.id, loadCase, loadQ);
  }
  function clearMeshes() {
    let kept = 0;
    modelStore.batch(() => { for (const e of entries) kept += clearPlateMesh(e.id).keptNodes; });
    message = kept ? tp('plates.meshClearedKept', { n: kept }) : t('plates.meshCleared');
    uiStore.selectPlates(ids);
  }
  function showElements() {
    const keys = ids.flatMap(plateShellKeys);
    if (uiStore.shellPickScope !== 'element') uiStore.toast(t('plates.scopeNowElement'), 'info');
    uiStore.shellPickScope = 'element';
    uiStore.selectPlates([]);
    uiStore.setSelection(new Set(), new Set(), false, new Set(keys));
  }
  function remove() {
    modelStore.batch(() => { for (const id of ids) deletePlate(id); });
    uiStore.clearSelection();
  }
  const meshSummary = $derived.by(() => {
    const by = new Map<string, number>();
    for (const e of entries) { const k = plateMeshState(e, status(e.id)).tone; by.set(k, (by.get(k) ?? 0) + 1); }
    return [...by].map(([k, n]) => tp(`plates.summary.${k}`, { n })).join(' · ');
  });
</script>

{#if entries.length}
  <section class="pp" data-testid="plate-panel">
    <header class="pp-head">
      <strong data-testid="plate-panel-title">{one ? one.name : tp('plates.nSelected', { n: entries.length })}</strong>
      {#if one}<span class="pp-kind">{t(`plates.kind.${one.physical.kind === 'wall' ? 'wall' : 'slab'}`)} · {fmtQ(area, 'planArea')} {unitQ('planArea')}</span>
      {:else}<span class="pp-kind">{entries.slice(0, 8).map((e) => e.name).join(', ')}{entries.length > 8 ? '…' : ''}</span>{/if}
    </header>

    <div class="pp-row">
      <label>{t('pro.thMaterial')}
        <select value={sharedMaterial ?? ''} onchange={(e) => { const v = Number(e.currentTarget.value); modelStore.batch(() => { for (const id of ids) setPlateProperties(id, { materialId: v }); }); }} data-testid="plate-material">
          {#if sharedMaterial === null}<option value="" disabled>{t('plates.mixed')}</option>{/if}
          {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
      </label>
      <label>{t('pro.thicknessLabel')}
        <QuantityInput min={0.001} value={sharedThickness ?? 0} quantity="length" cls="pp-num" testid="plate-thickness"
          onchange={(v) => { if (v > 0) modelStore.batch(() => { for (const id of ids) setPlateProperties(id, { thickness: v }); }); }} />
      </label>
      {#if one && typologies.length}
        <label>{t('physical.typology')}
          <select value={one.physical.typology ?? ''} onchange={(e) => one && declarePhysicalTypology(one.id, e.currentTarget.value || null)} data-testid="plate-typology">
            <option value="">—</option>
            {#each typologies as ty (ty)}<option value={ty}>{t(`physical.typ.${ty}`)}</option>{/each}
          </select>
        </label>
      {/if}
    </div>

    <div class="pp-mesh" data-testid="plate-mesh-status">
      <span class="pp-label">{t('plates.meshHeading')}</span>
      {#if one}
        {@const st = plateMeshState(one, status(one.id))}
        <span class="tone-{st.tone}" data-testid="plate-status-{one.id}">{st.text}</span>
        {#if one.surface.meshed && !one.surface.meshed.original && one.surface.meshed.quality.poor > 0 && status(one.id) === 'current'}<span class="pp-warn">{tp('plates.poorCells', { n: one.surface.meshed.quality.poor })}</span>{/if}
      {:else}
        <span data-testid="plate-mesh-summary">{meshSummary}</span>
      {/if}
      <div class="pp-actions">
        <button class="pp-btn primary" onclick={() => (meshOpen = true)} data-testid="plate-mesh-open">{entries.some((e) => e.surface.meshed && !e.surface.meshed.original) ? t('plates.remesh') : t('plates.mesh')}…</button>
        <button class="pp-btn" disabled={!entries.some((e) => e.surface.meshed)} onclick={clearMeshes} data-testid="plate-mesh-clear">{t('plates.clearMesh')}</button>
        <button class="pp-btn" disabled={!entries.some((e) => e.surface.meshed)} onclick={showElements} data-testid="plate-show-elements">{t('plates.showElements')}</button>
      </div>
    </div>

    <button class="pp-link" onclick={() => { uiStore.specSection = 'surfaces'; uiStore.proActiveTab = 'specifications'; }} data-testid="shell-open-spec">{one ? tp('plates.openSpec', { name: one.name }) : tp('plates.openSpecMany', { n: entries.length })} ›</button>

    {#if one && loops}
      <div class="pp-block" data-testid="plate-shape">
        <span class="pp-label">{t('plates.shape.title')}</span>
        <span class="pp-dim" data-testid="plate-shape-summary">{tp('plates.shape.summary', { sides: sides.length, curved: curved.length, holes: loops.holes.length })}</span>
        {#each curved as c (c.k)}
          <div class="pp-line" data-testid="plate-curved-side-{c.k}">
            <span>{tp('plates.shape.sideN', { n: c.k + 1 })}: {c.followsMember ? t('plates.shape.followsMember') : tp('plates.shape.sagittaOf', { s: significantNumber(c.sagitta, 'length', uiStore.unitSystem, 3), unit: unitQ('length') })}</span>
            {#if !c.followsMember}<button class="pp-x" onclick={() => straighten(c.k)} title={t('plates.sideStraighten')} data-testid="plate-side-straight-{c.k}">×</button>{/if}
          </div>
        {/each}
        {#each loops.holes as h, i (i)}
          <div class="pp-line" data-testid="plate-hole-{i}"><span>{tp('plates.shape.holeN', { n: i + 1, corners: h.length })}</span><button class="pp-x" onclick={() => closeHole(i)} title={t('plates.shape.closeHole')}>×</button></div>
        {/each}
        <div class="pp-actions">
          <button class="pp-btn" onclick={() => (shapeOpen = 'holes')} data-testid="plate-shape-open-holes">{t('plates.shape.editHoles')}…</button>
          <button class="pp-btn" onclick={() => (shapeOpen = 'sides')} data-testid="plate-shape-open-sides">{t('plates.shape.editSides')}…</button>
        </div>
      </div>

      <details class="pp-block" open={loads.length + elementLoads.length > 0}>
        <summary class="pp-label" data-testid="plate-loads-toggle">{t('plates.areaLoads')} ({loads.length + elementLoads.length})</summary>
        {#each elementLoads as l (l.caseId)}
          <div class="pp-line" data-testid="plate-element-load-{l.caseId}">
            <span>{cases.find((c) => c.id === l.caseId)?.name ?? `#${l.caseId}`}: {fmtQ(l.q, 'areaLoad')} {unitQ('areaLoad')} <span class="pp-dim">{t('plates.onItsElements')}</span></span>
            <button class="pp-x" onclick={() => modelStore.removeLoads(l.ids)} title={t('plates.removeLoad')}>×</button>
          </div>
        {/each}
        {#each loads as d (d.id)}
          {@const def = d.data as { caseId: number; q: number }}
          <div class="pp-line">
            <span>{cases.find((c) => c.id === def.caseId)?.name ?? `#${def.caseId}`}: {fmtQ(def.q, 'areaLoad')} {unitQ('areaLoad')}</span>
            <button class="pp-x" onclick={() => removeFloorLoadDef(d.id)} title={t('plates.removeLoad')}>×</button>
          </div>
        {/each}
        <div class="pp-line">
          <select bind:value={loadCase} data-testid="plate-load-case">
            {#each cases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
          <QuantityInput value={loadQ} quantity="areaLoad" cls="pp-num" testid="plate-load-q" onchange={(v) => (loadQ = v)} />
          <button class="pp-btn" onclick={addLoad} data-testid="plate-load-add">{t('plates.addLoad')}</button>
        </div>
        {#each levelLoads as d (d.id)}
          {@const def = d.data as unknown as FloorLoadDef}
          <div class="pp-line" data-testid="plate-level-load-{d.id}">
            <span>{cases.find((c) => c.id === def.caseId)?.name ?? `#${def.caseId}`}: {fmtQ(def.q, 'areaLoad')} {unitQ('areaLoad')} <span class="pp-dim">{tp('plates.fromLevel', { name: d.name })}</span></span>
          </div>
        {/each}
        <Hint text={t(one.physical.kind === 'wall' ? 'plates.areaLoadHintWall' : 'plates.areaLoadHint')} />
        <button class="pp-link" onclick={openInLoads} data-testid="plate-open-loads">{t('plates.openInLoads')} ›</button>
      </details>
    {/if}

    {#if message}<p class="pp-msg" data-testid="plate-message">{message}</p>{/if}
    <div class="pp-actions">
      <button class="pp-btn danger" onclick={remove} data-testid="plate-delete">{entries.length > 1 ? t('plates.deleteMany') : t('plates.delete')}</button>
    </div>
  </section>
  {#if meshOpen}<PlateMeshDialog ids={ids} onclose={() => (meshOpen = false)} />{/if}
  {#if shapeOpen && one}{#key one.id}<PlateShapeDialog id={one.id} start={shapeOpen} onclose={() => (shapeOpen = null)} />{/key}{/if}
{/if}

<style>
  .pp { margin: 6px 8px 10px; padding: 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); background: var(--st-surface-2); display: flex; flex-direction: column; gap: 8px; font-size: 0.74rem; color: var(--st-text-2); }
  .pp-head { display: flex; flex-direction: column; gap: 2px; }
  .pp-head strong { color: var(--st-text); font-size: 0.8rem; }
  .pp-kind, .pp-dim { color: var(--st-text-3); }
  .pp-row, .pp-line, .pp-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pp-row label { display: inline-flex; align-items: center; gap: 4px; }
  .pp-block, .pp-mesh { display: flex; flex-direction: column; gap: 4px; }
  .pp-label { font-weight: 600; color: var(--st-text-2); cursor: pointer; }
  .pp-link { align-self: flex-start; padding: 0; background: none; border: none; color: var(--st-accent); font: inherit; cursor: pointer; }
  .pp-link:hover { text-decoration: underline; }
  .tone-none, .tone-raw { color: var(--st-text-3); }
  .tone-ok { color: var(--st-ok, #5cb85c); }
  .tone-warn { color: var(--st-warn, #d9a441); }
  .tone-bad { color: var(--st-danger, #e06c6c); }
  .pp-warn { color: var(--st-warn, #d9a441); }
  .pp-msg { margin: 0; color: var(--st-text-3); font-size: 0.7rem; }
  .pp-msg { color: var(--st-text-2); }
  .pp select, .pp-text, .pp :global(input.pp-num) { padding: 2px 5px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; }
  .pp :global(input.pp-num) { width: 64px; font-family: var(--st-font-mono, monospace); }
  .pp-text { flex: 1 1 120px; min-width: 0; }
  .pp-btn { padding: 3px 9px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .pp-btn:hover:not(:disabled) { color: var(--st-text); }
  .pp-btn:disabled { opacity: 0.5; cursor: default; }
  .pp-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .pp-btn.danger { color: var(--st-danger, #e06c6c); }
  .pp-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.9rem; }
</style>
