<script lang="ts">
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
    addPlateLoad, arcEdgeBetween, clearPlateMesh, deletePlate, plateEntry, plateLoadDefs, plateShellKeys, plateSides, plateStatus, setPlateHoles,
    setPlateProperties, setPlateSideArc, type PlateStatus,
  } from '../../../lib/store/physical-plates';
  import { plateArea, plateGeometry, plateLoops } from '../../../lib/model/physical/plate';
  import { removeFloorLoadDef } from '../../../lib/store/defined-loads';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import QuantityInput from '../loads/QuantityInput.svelte';
  import PlateMeshDialog from './PlateMeshDialog.svelte';

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
  const sharedThickness = $derived(entries.length && entries.every((e) => e.surface.thickness === entries[0]!.surface.thickness) ? entries[0]!.surface.thickness : null);
  const sharedMaterial = $derived(entries.length && entries.every((e) => e.surface.materialId === entries[0]!.surface.materialId) ? entries[0]!.surface.materialId : null);

  const sides = $derived.by(() => { void modelStore.model.groups; return one ? plateSides(one.id) : []; });
  let sideMid = $state<Record<number, string>>({});
  function curveSide(k: number) {
    if (!one) return;
    const id = Number((sideMid[k] ?? '').trim());
    const problem = setPlateSideArc(one.id, k, Number.isInteger(id) && modelStore.nodes.has(id) ? id : -1);
    message = problem ? t(`plates.problem.${problem}`) : t('plates.sideCurved');
  }
  let holeText = $state('');
  let loadCase = $state(1);
  let loadQ = $state(1);
  let message = $state<string | null>(null);
  let meshOpen = $state(false);

  function addHole() {
    if (!one || !loops) return;
    const hole = holeText.split(/[,;\s]+/).filter(Boolean).map(Number);
    const problem = setPlateHoles(one.id, [...loops.holes, hole]);
    message = problem ? t(`plates.problem.${problem}`) : t('plates.holeAdded');
    if (!problem) holeText = '';
  }
  function removeHole(i: number) {
    if (!one || !loops) return;
    setPlateHoles(one.id, loops.holes.filter((_, k) => k !== i));
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
    uiStore.setSelection(new Set(), new Set(), false, new Set(keys));
  }
  function remove() {
    modelStore.batch(() => { for (const id of ids) deletePlate(id); });
    uiStore.clearSelection();
  }
  const statusLabel = (s: PlateStatus) => t(`plates.status.${s}`);
</script>

{#if entries.length}
  <section class="pp" data-testid="plate-panel">
    <header class="pp-head">
      <strong>{one ? one.name : tp('plates.nSelected', { n: entries.length })}</strong>
      {#if one}<span class="pp-kind">{t(`plates.kind.${one.physical.kind === 'wall' ? 'wall' : 'slab'}`)} · {fmtQ(area, 'planArea')} {unitQ('planArea')}</span>{/if}
    </header>

    <div class="pp-row">
      <label>{t('pro.thMaterial')}
        <select value={sharedMaterial ?? ''} onchange={(e) => { const v = Number(e.currentTarget.value); for (const id of ids) setPlateProperties(id, { materialId: v }); }} data-testid="plate-material">
          {#if sharedMaterial === null}<option value="" disabled>{t('plates.mixed')}</option>{/if}
          {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
      </label>
      <label>{t('pro.thicknessLabel')}
        <QuantityInput min={0.001} value={sharedThickness ?? 0} quantity="length" cls="pp-num" testid="plate-thickness"
          onchange={(v) => { if (v > 0) modelStore.batch(() => { for (const id of ids) setPlateProperties(id, { thickness: v }); }); }} />
      </label>
    </div>

    <div class="pp-mesh" data-testid="plate-mesh-status">
      {#each entries as e (e.id)}
        {@const s = status(e.id)}
        <div class="pp-mesh-line">
          {#if !one}<span class="pp-name">{e.name}</span>{/if}
          <span class="chip chip-{s}" data-testid="plate-status-{e.id}">{statusLabel(s)}</span>
          {#if e.surface.meshed && s !== 'unmeshed'}
            <span class="pp-dim">{tp('plates.meshSummary', { cells: e.surface.meshed.cells, size: fmtQ(e.surface.mesh.size, 'length'), unit: unitQ('length') })}</span>
            {#if e.surface.meshed.quality.poor > 0}<span class="pp-warn">{tp('plates.poorCells', { n: e.surface.meshed.quality.poor })}</span>{/if}
          {/if}
        </div>
      {/each}
      <div class="pp-actions">
        <button class="pp-btn primary" onclick={() => (meshOpen = true)} data-testid="plate-mesh-open">{entries.some((e) => e.surface.meshed) ? t('plates.remesh') : t('plates.mesh')}…</button>
        <button class="pp-btn" disabled={!entries.some((e) => e.surface.meshed)} onclick={clearMeshes} data-testid="plate-mesh-clear">{t('plates.clearMesh')}</button>
        <button class="pp-btn" disabled={!entries.some((e) => e.surface.meshed)} onclick={showElements} data-testid="plate-show-elements">{t('plates.showElements')}</button>
      </div>
    </div>

    {#if one && loops}
      <details class="pp-block" data-testid="plate-sides" open={sides.some((x) => x.mid !== null)}>
        <summary class="pp-label">{t('plates.sides')} ({tp('plates.sidesSummary', { n: sides.length, curved: sides.filter((x) => x.mid !== null).length })})</summary>
        {#each sides as sd, k (k)}
          {@const member = arcEdgeBetween(sd.from, sd.to)}
          <div class="pp-line">
            <span class="pp-dim">{sd.from} → {sd.to}</span>
            {#if sd.mid !== null}
              <span>{member ? tp('plates.sideFollows', { id: member.arcId }) : tp('plates.sideCurvedThrough', { n: sd.mid })}</span>
              <button class="pp-x" onclick={() => one && setPlateSideArc(one.id, k, null)} title={t('plates.sideStraighten')} data-testid="plate-side-straight-{k}">×</button>
            {:else}
              <input class="pp-text pp-mid" placeholder={t('plates.sideThrough')} value={sideMid[k] ?? ''} oninput={(e) => (sideMid = { ...sideMid, [k]: e.currentTarget.value })} data-testid="plate-side-mid-{k}" />
              <button class="pp-btn" disabled={!(sideMid[k] ?? '').trim()} onclick={() => curveSide(k)} data-testid="plate-side-curve-{k}">{t('plates.sideCurve')}</button>
            {/if}
          </div>
        {/each}
      </details>

      <details class="pp-block">
        <summary class="pp-label">{t('plates.holes')} ({loops.holes.length})</summary>
        {#each loops.holes as h, i (i)}
          <div class="pp-line"><span class="pp-dim">{h.join(', ')}</span><button class="pp-x" onclick={() => removeHole(i)} title={t('plates.removeHole')}>×</button></div>
        {/each}
        <div class="pp-line">
          <input class="pp-text" placeholder={t('plates.holeNodes')} bind:value={holeText} data-testid="plate-hole-nodes" />
          <button class="pp-btn" disabled={!holeText.trim()} onclick={addHole} data-testid="plate-hole-add">{t('plates.addHole')}</button>
        </div>
      </details>

      <details class="pp-block" open={loads.length > 0}>
        <summary class="pp-label" data-testid="plate-loads-toggle">{t('plates.areaLoads')} ({loads.length})</summary>
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
        <p class="pp-hint">{t('plates.areaLoadHint')}</p>
      </details>
    {/if}

    {#if message}<p class="pp-msg" data-testid="plate-message">{message}</p>{/if}
    <div class="pp-actions">
      <button class="pp-btn danger" onclick={remove} data-testid="plate-delete">{entries.length > 1 ? t('plates.deleteMany') : t('plates.delete')}</button>
    </div>
  </section>
  {#if meshOpen}<PlateMeshDialog ids={ids} onclose={() => (meshOpen = false)} />{/if}
{/if}

<style>
  .pp { margin: 6px 8px 10px; padding: 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); background: var(--st-surface-2); display: flex; flex-direction: column; gap: 8px; font-size: 0.74rem; color: var(--st-text-2); }
  .pp-head { display: flex; flex-direction: column; gap: 2px; }
  .pp-head strong { color: var(--st-text); font-size: 0.8rem; }
  .pp-kind, .pp-dim { color: var(--st-text-3); }
  .pp-row, .pp-line, .pp-actions, .pp-mesh-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pp-row label { display: inline-flex; align-items: center; gap: 4px; }
  .pp-block, .pp-mesh { display: flex; flex-direction: column; gap: 4px; }
  .pp-label { font-weight: 600; color: var(--st-text-2); cursor: pointer; }
  .pp-name { min-width: 36px; color: var(--st-text); }
  .pp-warn { color: var(--st-warn, #d9a441); }
  .pp-hint, .pp-msg { margin: 0; color: var(--st-text-3); font-size: 0.7rem; }
  .pp-msg { color: var(--st-text-2); }
  .pp select, .pp-text, .pp :global(input.pp-num) { padding: 2px 5px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; }
  .pp :global(input.pp-num) { width: 64px; font-family: var(--st-font-mono, monospace); }
  .pp-text { flex: 1 1 120px; min-width: 0; }
  .pp-mid { flex: 0 1 90px; }
  .pp-btn { padding: 3px 9px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .pp-btn:hover:not(:disabled) { color: var(--st-text); }
  .pp-btn:disabled { opacity: 0.5; cursor: default; }
  .pp-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .pp-btn.danger { color: var(--st-danger, #e06c6c); }
  .pp-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.9rem; }
  .chip { padding: 1px 6px; border-radius: 9px; font-size: 0.68rem; border: 1px solid var(--st-hair-strong); }
  .chip-current { color: var(--st-ok, #5cb85c); border-color: currentColor; }
  .chip-stale { color: var(--st-warn, #d9a441); border-color: currentColor; }
  .chip-unmeshed { color: var(--st-text-3); }
  .chip-invalid { color: var(--st-danger, #e06c6c); border-color: currentColor; }
</style>
