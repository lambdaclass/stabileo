<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import DataTable from '../DataTable.svelte';
  import { t, tp, capitalized } from '../../lib/i18n';
  import { selectShellFamily } from '../../lib/engine/shell-family-selector';
  import type { ShellRecommendation } from '../../lib/engine/types-3d';
  import type { Vec3 } from '../../lib/engine/shell-family-selector';
  import { drawState, addShellOnCorners, CURVED_QUAD_TOL } from '../../lib/store/draw-state.svelte';
  import { createCircularPlate, createPlate, physicalPlates, plateOfShell } from '../../lib/store/physical-plates';
  import { platesFromShells } from '../../lib/store/plates-from-shells';
  import PlatePanel from './plates/PlatePanel.svelte';
  import PlateBrowser from './plates/PlateBrowser.svelte';
  import WriteInPanelButton from './WriteInPanelButton.svelte';
  import WriteCard from './WriteCard.svelte';
  import Icon from '../ribbon/Icon.svelte';
  import QuantityInput from './loads/QuantityInput.svelte';
  import { fromDisplay } from '../../lib/utils/units';

  /* The two creators' state is gone with them — see the note on `newNodeIds`.
     Three corners make a triangle and four make a quad, so one set serves. */



  // --- Error states ---

  // Available materials
  const materials = $derived([...modelStore.materials.values()]);

  // Existing plates and quads from store
  const plates = $derived(
    modelStore.model.plates ? [...modelStore.model.plates.values()] : []
  );
  const quads = $derived(
    modelStore.model.quads ? [...modelStore.model.quads.values()] : []
  );
  const plateCount = $derived(plates.length);
  const quadCount = $derived(quads.length);

  /** The panel lists what a click in the model picks: whole plates, or their mesh's elements. */
  function toScope(scope: 'plate' | 'element') {
    if (scope === uiStore.shellPickScope) return;
    uiStore.selectMode = 'shells';
    if (scope === 'plate') {
      const owners = [...new Set([...uiStore.selectedShells].map((k) => plateOfShell(k)).filter((x): x is number => x !== null))];
      uiStore.shellPickScope = 'plate';
      uiStore.selectPlates(owners);
    } else {
      const keys = new Set(uiStore.selectedShells);
      uiStore.shellPickScope = 'element';
      uiStore.selectPlates([]);
      uiStore.setSelection(new Set(), new Set(), false, keys);
    }
  }
  const physicalCount = $derived.by(() => { void modelStore.model.groups; return physicalPlates().length; });



  /** Get Vec3 positions from node IDs */

  // Collapse states for sections
  /*
   * ── One creator, because the corner count already decides ──────────
   *
   * Two creators ran side by side — "Plate (DKT triangle)" and "Quad
   * (MITC4)" — each with its own node boxes, material, thickness and family.
   * Those names are ELEMENT FORMULATIONS, and a reader drawing a slab starts
   * from its corners, not from a formulation. Three corners is a triangle and
   * four is a quad: asking which was asking a question the geometry had
   * already answered.
   */
  let newNodeIds = $state<[string, string, string, string]>(['', '', '', '']);
  /* Material, thickness and corner count are the drawing's too (`drawState`): a plate written
     here and one drawn in the model come out the same. */
  let newError = $state<string | null>(null);

  /**
   * The corners that were actually given, in order — not the first N boxes.
   *
   * Picking fills them left to right, so the two were the same thing on that
   * path. Typing does not: leave N3 empty and fill N4 and `slice(0, count)`
   * read the empty box instead of the full one, which failed with "those
   * nodes do not exist" while quietly ignoring the id the reader had typed.
   */
  /** Corner boxes of an analysis element; an outline is typed as one list (`outlineText`). */
  const cornerBoxes = $derived(drawState.plateCorners === 'outline' ? 4 : drawState.plateCorners);
  const newGiven = $derived(newNodeIds.slice(0, cornerBoxes).map((v) => v.trim()).filter((v) => v !== ''));
  let outlineText = $state('');
  const outlineIds = $derived(outlineText.split(/[,;\s]+/).map((v) => v.trim()).filter((v) => v !== '').map(Number));

  /** How many corners have been given — 3 makes a triangle, 4 a quad. */
  const newCount = $derived(newGiven.length);

  /** The corners as points, or null while one is missing or unknown. */
  const newPts = $derived.by(() => {
    const ids = newGiven.map((v) => Number(v));
    if (ids.length < 3 || ids.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    const ns = ids.map((id) => modelStore.nodes.get(id));
    if (ns.some((n) => !n)) return null;
    return ns.map((n) => ({ x: n!.x, y: n!.y ?? 0, z: (n! as { z?: number }).z ?? 0 }));
  });

  /**
   * How far the fourth corner is from the plane of the other three, metres.
   *
   * Three points are coplanar by definition, so this is a question only a
   * quad can be asked. A dome authored as flat quads is solved as facets and
   * nothing says so, and whether four points are coplanar is arithmetic
   * rather than a matter of opinion.
   */
  const newOutOfPlane = $derived.by(() => {
    if (newCount !== 4 || !newPts) return null;
    const [a, b, c, d] = newPts;
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const n = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    const len = Math.hypot(n.x, n.y, n.z);
    if (len < 1e-12) return null;
    const w = { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z };
    return Math.abs((w.x * n.x + w.y * n.y + w.z * n.z) / len);
  });

  /*
   * Derived, not recomputed by hand on `oninput`.
   *
   * It was a `$state` refreshed from the two typed inputs, which meant the
   * box stayed empty on the path this panel is built around: press "Draw
   * plate in the model", click the corners, and the picks land in
   * `newNodeIds` through the effect below without ever passing an `oninput`.
   * Typing the same ids by hand produced a recommendation; clicking them did
   * not. The corners are already derived, so this can be too, and then there
   * is no way for the two to disagree.
   */
  const newRecommendation = $derived.by((): ShellRecommendation | null => {
    if (!newPts || drawState.plateThickness <= 0) return null;
    try {
      return selectShellFamily({ nodes: newPts as Vec3[], thickness: drawState.plateThickness });
    } catch { return null; }
  });

  /** Start or stop drawing plates in the model; the corner count is the drawing bar's. */
  const drawing = $derived(uiStore.shellNodePick.target === 'quad' && (uiStore.shellNodePick.active || uiStore.shellNodePick.picked.length > 0));
  function toggleNewPick() {
    if (drawing) drawState.stop();
    else drawState.startPlate();
  }

  /*
   * Picks flow back into the boxes as they arrive, so the reader sees the
   * corners land rather than discovering them when the pick ends.
   */
  $effect(() => {
    const p = uiStore.shellNodePick;
    if (!p.active) return;
    const next: [string, string, string, string] = ['', '', '', ''];
    p.picked.forEach((id, i) => { if (i < 4) next[i] = String(id); });
    newNodeIds = next;
  });

  let circle = $state(false);
  let circleCenter = $state('0; 0; 0'), circleRadius = $state(3);
  let circleHole = $state(false), holeCenter = $state('0; 0; 0'), holeRadius = $state(0.5);
  /** A point typed as "x; y; z" in the display units, decimal comma or point, in SI. */
  const point = (s: string): [number, number, number] | null => {
    const v = s.split(/[;\s]+/).filter(Boolean).map((x) => Number(x.replace(',', '.')));
    return v.length === 3 && v.every(Number.isFinite) ? (v.map((x) => fromDisplay(x, 'length', uiStore.unitSystem)) as [number, number, number]) : null;
  };
  function cornersAs(v: 3 | 4 | 'outline') { circle = false; drawState.plateCorners = v; }

  function addShell() {
    newError = null;
    if (circle) {
      const c = point(circleCenter), h = point(holeCenter);
      const r = c && (!circleHole || h) ? createCircularPlate({ center: c, radius: circleRadius, ...(circleHole ? { hole: { center: h!, radius: holeRadius } } : {}), materialId: drawState.plateMaterialId, thickness: drawState.plateThickness }) : null;
      if (!r || 'problem' in r) { newError = t('plates.circle.invalid'); return; }
      uiStore.selectMode = 'shells';
      uiStore.selectPlates([r.id]);
      return;
    }
    if (drawState.plateCorners === 'outline') {
      // A physical plate on the outline typed, meshed later (`store/physical-plates.ts`).
      const ids = outlineIds;
      if (ids.length < 3 || ids.some((n) => !Number.isInteger(n) || !modelStore.nodes.has(n))) { newError = t('plates.problem.needNodes'); return; }
      const r = createPlate({ outline: ids, materialId: drawState.plateMaterialId, thickness: drawState.plateThickness });
      if ('problem' in r) { newError = t(`plates.problem.${r.problem}`); return; }
      uiStore.selectMode = 'shells';
      uiStore.selectPlates([r.id]);
      outlineText = '';
      return;
    }
    const ids = newGiven.map((v) => Number(v));
    if (ids.length < cornerBoxes) { newError = t('pro.shellNeedNodes'); return; }
    const r = addShellOnCorners(ids, drawState.plateMaterialId, drawState.plateThickness);
    if ('error' in r) { newError = t(r.error); return; }
    // The plate it is made into belongs to the same undo step as the shell.
    let plate: number | undefined;
    modelStore.amendLastStep(() => { [plate] = platesFromShells([r.key]); });
    if (plate !== undefined) { uiStore.selectMode = 'shells'; uiStore.selectPlates([plate]); } else uiStore.selectShell(r.key, false);
    /* The recommendation follows the corners, so clearing them clears it. */
    newNodeIds = ['', '', '', ''];
  }




</script>

<div class="pro-shells">
  <!-- Header -->
  <!--
    ── One button that uses the mouse, at the top, like every other panel ──
    There were two and neither said which was which: "pick nodes in the
    viewport" inside the form, and an Add button whose disabled label read
    "pick three or four nodes". Both were about picking; only one used the
    mouse. Drawing is now where it is in Nodes, Members, Supports and Loads —
    the top of the panel — and the form's own button only ever ADDS what the
    boxes hold.
  -->
  <div class="pro-shells-header">
    <span class="pro-shells-count" data-testid="plates-count">{tp('plates.header', { plates: physicalCount, elements: quadCount + plateCount })}</span>
    <span class="pro-shells-actions">
    <button
      class="dim-like"
      class:on={drawing}
      aria-pressed={drawing ? 'true' : 'false'}
      onclick={toggleNewPick}
      data-testid="draw-plate"
      title={drawing ? t('pro.drawStopHint') : t('pro.drawStartHint')}
    ><Icon name="shell" size={13} /><span>{drawing
      ? `${t('pro.drawStop')} (${drawState.plateCorners === 'outline' ? uiStore.shellNodePick.picked.length : `${uiStore.shellNodePick.picked.length}/${drawState.plateCorners}`})`
      : capitalized(tp('pro.drawWhat', { what: t('pro.onePlate') }))}</span></button>
    <WriteInPanelButton kind="plate" label={t('pro.onePlate')} testid="write-plate" />
    </span>
  </div>

  <div class="pro-shells-scroll">
    {#if drawState.writing === 'plate'}
      <WriteCard
        title={capitalized(tp('pro.writeWhat', { what: t('pro.onePlate') }))}
        submitLabel={capitalized(tp('pro.addWhat', { what: t('pro.onePlate') }))}
        onsubmit={addShell}
        error={newError}
        disabled={circle ? !(circleRadius > 0) : drawState.plateCorners === 'outline' ? outlineIds.length < 3 : newCount < cornerBoxes}
        testid="write-plate-card"
      >
        <div class="corner-seg" role="group" aria-label={t('drawBar.corners')}>
          <button type="button" class:on={!circle && drawState.plateCorners === 'outline'} aria-pressed={!circle && drawState.plateCorners === 'outline'} onclick={() => cornersAs('outline')} title={t('drawBar.outlineHint')} data-testid="write-corners-outline">{t('drawBar.outline')}</button>
          <button type="button" class:on={!circle && drawState.plateCorners === 3} aria-pressed={!circle && drawState.plateCorners === 3} onclick={() => cornersAs(3)} data-testid="write-corners-3">{t('drawBar.triangle')}</button>
          <button type="button" class:on={!circle && drawState.plateCorners === 4} aria-pressed={!circle && drawState.plateCorners === 4} onclick={() => cornersAs(4)} data-testid="write-corners-4">{t('drawBar.quad')}</button>
          <button type="button" class:on={circle} aria-pressed={circle} onclick={() => (circle = true)} data-testid="write-corners-circle">{t('drawBar.circle')}</button>
        </div>
        {#if circle}
          <label>{t('plates.circle.center')} <input type="text" class="node-input outline-input" placeholder="x; y; z" bind:value={circleCenter} data-testid="plate-circle-center" /></label>
          <label>{t('plates.circle.radius')} <QuantityInput min={0.01} bind:value={circleRadius} quantity="length" cls="node-input" testid="plate-circle-radius" /></label>
          <label><input type="checkbox" bind:checked={circleHole} data-testid="plate-circle-hole" /> {t('plates.circle.hole')}</label>
          {#if circleHole}
            <label>{t('plates.circle.holeCenter')} <input type="text" class="node-input outline-input" placeholder="x; y; z" bind:value={holeCenter} data-testid="plate-circle-hole-center" /></label>
            <label>{t('plates.circle.holeRadius')} <QuantityInput min={0.01} bind:value={holeRadius} quantity="length" cls="node-input" testid="plate-circle-hole-radius" /></label>
          {/if}
        {:else if drawState.plateCorners === 'outline'}
          <label>{t('plates.outlineNodes')}
            <input type="text" class="node-input outline-input" placeholder="1, 2, 3, 4" bind:value={outlineText} data-testid="plate-outline-nodes" />
          </label>
        {:else}
        <span class="node-row">
          {#each Array.from({ length: cornerBoxes }, (_, i) => i) as i (i)}
            <input
              type="text" inputmode="numeric"
              class="node-input"
              placeholder={`N${i + 1}`}
              value={newNodeIds[i]}
              oninput={(e) => { newNodeIds[i] = e.currentTarget.value; }}
              data-testid="shell-node-{i}"
            />
          {/each}
        </span>
        {/if}
        <label>{t('pro.thMaterial')}
          <select value={drawState.plateMaterialId} onchange={(e) => (drawState.plateMaterialId = Number(e.currentTarget.value))} class="mat-select">
            {#each materials as m}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </label>
        <label>{t('pro.thicknessLabel')}
          <!-- An empty or non-positive thickness keeps the last one: it used to become 0, and the
               next shell was drawn with no thickness. The unit follows the unit system. -->
          <QuantityInput min={0.001} value={drawState.plateThickness} quantity="length" cls="thick-input"
                 onchange={(v) => { if (v > 0) drawState.plateThickness = v; }} testid="shell-thickness" />
        </label>

        {#if newCount === 4 && newOutOfPlane != null && newOutOfPlane > CURVED_QUAD_TOL}
          <p class="mesh-hint" data-testid="quad-curved-hint">{tp('pro.curvedShellAuto', { mm: (newOutOfPlane * 1000).toFixed(1) })}</p>
        {/if}

        {#if newRecommendation}
          <div class="recommendation" class:warn={newRecommendation.confidence !== 'high'}>
            <span class="rec-icon">{newRecommendation.confidence === 'high' ? '\u2713' : '\u26A0'}</span>
            <span class="rec-text">{newRecommendation.reason}</span>
          </div>
          {#each newRecommendation.warnings as w}
            <div class="rec-warning">{w}</div>
          {/each}
        {/if}
      </WriteCard>
    {/if}

    <div class="pro-shells-scope" role="radiogroup" aria-label={t('plates.pickScope')} data-testid="plates-scope">
      <button role="radio" aria-checked={uiStore.shellPickScope === 'plate'} class:on={uiStore.shellPickScope === 'plate'} onclick={() => toScope('plate')} data-testid="plates-scope-plate">{tp('plates.scopePlates', { n: physicalCount })}</button>
      <button role="radio" aria-checked={uiStore.shellPickScope === 'element'} class:on={uiStore.shellPickScope === 'element'} onclick={() => toScope('element')} data-testid="plates-scope-element">{tp('plates.scopeElements', { n: quadCount + plateCount })}</button>
    </div>

    {#if uiStore.shellPickScope === 'plate'}
      <PlateBrowser />
      <PlatePanel />
    {:else}
      <p class="mesh-hint pro-shells-note">{t('plates.elementsNote')}</p>
      {#if uiStore.selectedShells.size > 0}
        {@const owner = plateOfShell([...uiStore.selectedShells][0]!)}
        <div class="pro-shells-actions-row">
          {#if owner !== null}
            <button class="pk-btn" onclick={() => toScope('plate')} data-testid="shell-select-owner">{tp('plates.selectOwner', { name: modelStore.model.groups.get(owner)?.name ?? '' })}</button>
          {/if}
          {#if uiStore.selectedShells.size === 1}
            <button class="pk-btn" onclick={() => { uiStore.specSection = 'surfaces'; uiStore.proActiveTab = 'specifications'; }} data-testid="shell-open-spec">{t('plates.openSpecElement')}</button>
          {/if}
        </div>
      {/if}
      <div class="shell-table"><DataTable pinned="plates" /></div>
    {/if}
  </div>
</div>

<style>
  .corner-seg { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .corner-seg button { padding: 2px 8px; background: none; border: none; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .corner-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .corner-seg button.on { background: var(--st-accent); color: #fff; }
  .node-row { display: inline-flex; gap: 4px; }
  .pro-shells {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /*
     Matches `DrawInModelButton`, which the other panels use. Not that
     component because this one arms the shell NODE PICK rather than a
     viewport tool — a plate is three or four corners, so it is picked by
     node and the panel counts them as they land.
  */
  /* The fourth corner is optional — three is a triangle — and the box says so
     by being dimmer rather than by a placeholder that does not fit in it. */

  .dim-like {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 0.24rem 0.45rem;
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    background: var(--st-surface-2); color: var(--st-text-2);
    font: inherit; font-size: 0.7rem; white-space: nowrap; cursor: pointer;
  }
  .dim-like:hover { color: var(--st-text); border-color: var(--st-accent); }
  .dim-like.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .dim-like:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 2px; }

  .pro-shells-actions { display: inline-flex; gap: 6px; }
  .pro-shells-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid var(--st-surface-3);
    flex-shrink: 0;
  }

  .pro-shells-count {
    font-size: 0.82rem;
    color: var(--st-value);
    font-weight: 600;
  }

.pro-shells-scope { position: sticky; top: 0; z-index: 2; background: var(--st-surface, var(--st-ink)); display: flex; margin: 6px 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .pro-shells-scope button { flex: 1; padding: 4px 8px; background: none; border: none; color: var(--st-text-2); font: inherit; font-size: 0.74rem; cursor: pointer; }
  .pro-shells-scope button + button { border-left: 1px solid var(--st-hair-strong); }
  .pro-shells-scope button.on { background: var(--st-selected-bg, var(--st-surface-3)); color: var(--st-text); font-weight: 600; }
  .pro-shells-note { margin: 0 8px 6px; }
  .pro-shells-actions-row { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 8px 6px; }
  .pro-shells-scroll {
    flex: 1;
    overflow-y: auto;
  }

  /* Collapsible sections */
  .section {
    border-bottom: 1px solid var(--st-surface-3);
  }

  .section-toggle {
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--st-text-2);
    background: var(--st-surface);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-toggle:hover {
    color: var(--st-text);
    background: var(--st-surface-3);
  }

  .toggle-arrow {
    font-size: 0.65rem;
    color: var(--st-text-3);
  }

  .section-body {
    padding: 10px 12px 12px;
    background: var(--st-surface-3);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Input rows */


  .node-input {
    width: 48px;
    padding: 4px 6px;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.78rem;
    font-family: monospace;
    text-align: center;
  }

  .node-input:focus {
    border-color: var(--st-surface-3);
    outline: none;
  }

  .mat-select {
    flex: 1;
    padding: 4px 6px;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .mat-select:focus {
    border-color: var(--st-surface-3);
    outline: none;
  }

  .pro-shells :global(input.thick-input) {
    width: 75px;
    padding: 4px 6px;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.78rem;
    font-family: monospace;
  }

  .pro-shells :global(input.thick-input:focus) {
    border-color: var(--st-surface-3);
    outline: none;
  }

  /* Buttons */
  .pro-btn {
    padding: 5px 14px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--st-text-2);
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    cursor: pointer;
    align-self: flex-start;
  }

  .pro-btn:hover {
    background: var(--st-surface-3);
    color: var(--st-text);
  }



  @keyframes pickPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 255, 0.4); }
    50% { box-shadow: 0 0 0 4px rgba(0, 255, 255, 0); }
  }

  /* Errors / success */

  .mesh-hint {
    font-size: 0.72rem;
    color: var(--st-text-3);
    font-style: italic;
    line-height: 1.4;
  }

  /* Recommendation display */

  .recommendation {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    background: rgba(127, 212, 204, 0.06);
    border: 1px solid rgba(127, 212, 204, 0.15);
    border-radius: 4px;
    font-size: 0.68rem;
    line-height: 1.45;
    color: var(--st-text-2);
  }

  .recommendation.warn {
    background: rgba(251, 191, 36, 0.06);
    border-color: rgba(251, 191, 36, 0.15);
    color: var(--st-warn);
  }

  .rec-icon {
    flex-shrink: 0;
    font-size: 0.72rem;
  }

  .rec-text {
    flex: 1;
  }

  .rec-warning {
    font-size: 0.65rem;
    color: var(--st-warn);
    padding: 2px 8px 2px 22px;
    line-height: 1.4;
  }

  .rec-warning::before {
    content: '\26A0 ';
  }
</style>
