<script lang="ts">
  import { modelStore, uiStore } from '../../lib/store';
  import DataTable from '../DataTable.svelte';
  import ProStairSection from './ProStairSection.svelte';
  import { t, tp } from '../../lib/i18n';
  import { selectShellFamily } from '../../lib/engine/shell-family-selector';
  import ProMesher from './ProMesher.svelte';
  import ProSurfaces from './ProSurfaces.svelte';
  import type { ShellRecommendation } from '../../lib/engine/types-3d';
  import type { Vec3 } from '../../lib/engine/shell-family-selector';
  import { drawState, addShellOnCorners } from '../../lib/store/draw-state.svelte';
  import WriteInPanelButton from './WriteInPanelButton.svelte';
  import WriteCard from './WriteCard.svelte';
  import Icon from '../ribbon/Icon.svelte';

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

  // Nodes that connect a shell to the rest of the structure: any frame/truss
  // endpoint, any support, or a node shared by ≥2 shells. (Stabileo shells
  // couple to beams ONLY through shared nodes — there is no continuous edge
  // coupling — so a corner attached to none of these transfers no load.)
  const structureNodes = $derived.by(() => {
    const s = new Set<number>();
    for (const el of modelStore.elements.values()) { s.add(el.nodeI); s.add(el.nodeJ); }
    for (const sup of modelStore.supports.values()) s.add(sup.nodeId);
    const shellCount = new Map<number, number>();
    for (const q of quads) for (const n of q.nodes) shellCount.set(n, (shellCount.get(n) ?? 0) + 1);
    for (const p of plates) for (const n of p.nodes) shellCount.set(n, (shellCount.get(n) ?? 0) + 1);
    for (const [n, c] of shellCount) if (c >= 2) s.add(n);
    return s;
  });
  // Shells with a corner attached to nothing else (floating / no load path there).
  const disconnectedShells = $derived(
    quads.filter(q => q.nodes.some(n => !structureNodes.has(n))).length
    + plates.filter(p => p.nodes.some(n => !structureNodes.has(n))).length,
  );

  let showShellInfo = $state(true);



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
  let newCurved = $state(false);
  let newError = $state<string | null>(null);

  /**
   * The corners that were actually given, in order — not the first N boxes.
   *
   * Picking fills them left to right, so the two were the same thing on that
   * path. Typing does not: leave N3 empty and fill N4 and `slice(0, count)`
   * read the empty box instead of the full one, which failed with "those
   * nodes do not exist" while quietly ignoring the id the reader had typed.
   */
  const newGiven = $derived(newNodeIds.slice(0, drawState.plateCorners).map((v) => v.trim()).filter((v) => v !== ''));

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

  function addShell() {
    newError = null;
    const ids = newGiven.map((v) => Number(v));
    if (ids.length < drawState.plateCorners) { newError = t('pro.shellNeedNodes'); return; }
    const r = addShellOnCorners(ids, drawState.plateMaterialId, drawState.plateThickness, newCurved);
    if ('error' in r) { newError = t(r.error); return; }
    uiStore.selectShell(r.key, false);
    /* The recommendation follows the corners, so clearing them clears it. */
    newNodeIds = ['', '', '', ''];
    newCurved = false;
  }

  let showMeshGen = $state(false);



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
    <span class="pro-shells-count">{t('pro.nPlatesQuads').replace('{plates}', String(plateCount)).replace('{quads}', String(quadCount))}</span>
    <span class="pro-shells-actions">
    <button
      class="dim-like"
      class:on={drawing}
      aria-pressed={drawing ? 'true' : 'false'}
      onclick={toggleNewPick}
      data-testid="draw-plate"
      title={drawing ? t('pro.drawStopHint') : t('pro.drawStartHint')}
    ><Icon name="shell" size={13} /><span>{drawing
      ? `${t('pro.drawStop')} (${uiStore.shellNodePick.picked.length}/${drawState.plateCorners})`
      : `${t('pro.drawInModel')} ${t('pro.onePlate')}`}</span></button>
    <WriteInPanelButton kind="plate" label={t('pro.onePlate')} testid="write-plate" />
    </span>
  </div>

  <div class="pro-shells-scroll">
    <!-- Model-wide warning: shells with a corner attached to nothing else -->
    {#if disconnectedShells > 0}
      <div class="shell-warn">⚠ {t('pro.shellWarnDisconnected').replace('{n}', String(disconnectedShells))}</div>
    {/if}

    <!--
      ── ONE creator: three nodes make a triangle, four make a quad ─────
      There were two, side by side, near-identical and each with its own
      node boxes, material, thickness and family: "Plate (DKT triangle)" and
      "Quad (MITC4)". Those are ELEMENT FORMULATIONS, and a reader drawing a
      slab does not start from one — they start from the corners. How many
      corners there are already decides which formulation applies, so asking
      is asking the reader to answer a question the geometry has answered.

      Pick the nodes; three or four; the panel says what it is about to make
      and makes it.

      The formulation is still SHOWN — the recommendation below names it and
      says why — but it is no longer chooseable, and the `auto` choice the two
      creators used to write onto the element is not written either. That is
      worth knowing rather than glossing: the engine chooses the formulation by
      the shell's node count, and the `shellFamily` field that stood for a choice
      was read by nothing and has been removed.
    -->
    {#if drawState.writing === 'plate'}
      <WriteCard
        title={`${t('pro.writeIn')} ${t('pro.onePlate')}`}
        submitLabel={`${t('pro.add')} ${t('pro.onePlate')}`}
        onsubmit={addShell}
        error={newError}
        disabled={newCount < drawState.plateCorners}
        testid="write-plate-card"
      >
        <div class="corner-seg" role="group" aria-label={t('drawBar.corners')}>
          <button type="button" class:on={drawState.plateCorners === 3} aria-pressed={drawState.plateCorners === 3} onclick={() => (drawState.plateCorners = 3)} data-testid="write-corners-3">{t('drawBar.triangle')}</button>
          <button type="button" class:on={drawState.plateCorners === 4} aria-pressed={drawState.plateCorners === 4} onclick={() => (drawState.plateCorners = 4)} data-testid="write-corners-4">{t('drawBar.quad')}</button>
        </div>
        <span class="node-row">
          {#each Array.from({ length: drawState.plateCorners }, (_, i) => i) as i (i)}
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
        <label>{t('pro.thMaterial')}
          <select value={drawState.plateMaterialId} onchange={(e) => (drawState.plateMaterialId = Number(e.currentTarget.value))} class="mat-select">
            {#each materials as m}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </label>
        <label>{t('pro.thickness')}
          <input type="number" value={drawState.plateThickness} onchange={(e) => (drawState.plateThickness = Number(e.currentTarget.value) || 0)} step="any" min="0.001" class="thick-input"
                 data-testid="shell-thickness" /> m
        </label>

        <!--
          A cáscara, offered only where it can mean anything: three points
          are coplanar by definition, so a triangle is never curved. Whether
          FOUR are is arithmetic, and the panel measures it rather than
          leaving a dome to be solved as facets.
        -->
        {#if newCount === 4}
          <label class="curved-check">
            <input type="checkbox" bind:checked={newCurved} data-testid="quad-curved" />
            <span>{t('pro.curvedShell')}</span>
          </label>
          {#if newOutOfPlane != null && newOutOfPlane > 1e-6 && !newCurved}
            <div class="recommendation warn" data-testid="quad-curved-hint">
              <span class="rec-icon">⚠</span>
              <span class="rec-text">{tp('pro.curvedShellHint', { mm: (newOutOfPlane * 1000).toFixed(1) })}</span>
            </div>
          {/if}
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

    <!-- Curvature, offset and foundation springs of the selected shell are specified in
         Specifications › Surfaces; like Members, offered for one shell. Two or more get the
         group editing bar of the table, which opens it too. -->
    {#if uiStore.selectedShells.size === 1}
      <button class="pro-btn shell-open-spec" onclick={() => { uiStore.specSection = 'surfaces'; uiStore.proActiveTab = 'specifications'; }} data-testid="shell-open-spec">
        {t('spec.surfaces.open').replace('{n}', String(uiStore.selectedShells.size))}
      </button>
    {/if}

    <!-- Stairs: the same plate, with its far edge lifted -->
    <ProStairSection />

    <!-- Quick mesh generator -->
    <div class="section">
      <button class="section-toggle" onclick={() => showMeshGen = !showMeshGen}>
        <span class="toggle-arrow">{showMeshGen ? '\u25BE' : '\u25B8'}</span>
        {t('pro.meshGenerator')}
      </button>
      {#if showMeshGen}
        <div class="section-body">
          <ProMesher />
          <div class="mesh-hint" style="margin-top: 8px; font-weight: 600;">{t('surface.title')}</div>
          <ProSurfaces />

          <!-- How shells connect & transfer load (lives with the mesh tool, the
               place where node-sharing actually matters) -->
          <div class="shell-info">
            <button class="shell-info-toggle" onclick={() => showShellInfo = !showShellInfo}>
              <span>{showShellInfo ? '▾' : '▸'}</span> {t('pro.shellInfoTitle')}
            </button>
            {#if showShellInfo}
              <div class="shell-info-body">
                <p>{t('pro.shellInfoTransfer')}</p>
                <p>{t('pro.shellInfoMesh')}</p>
                <p>{t('pro.shellInfoSplit')}</p>
                <p>{t('pro.shellInfoSlab')}</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>


    <!--
      ── Tools above, the shared table below ────────────────────────────
      The panel used to draw its own two tables — one of triangles, one of
      quads — which is a third place shells are listed and a third set of
      columns to keep in step with the other two. This is the table Basic
      uses, pinned to shells because the ribbon has already chosen which
      entity you are working on.

      The shape is the same in every modelling panel: what you can DO to this
      kind of thing at the top, and what the model currently holds underneath.
    -->
    <div class="section shell-table">
      <DataTable pinned="plates" />
    </div>
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

  .thick-input {
    width: 75px;
    padding: 4px 6px;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.78rem;
    font-family: monospace;
  }

  .thick-input:focus {
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



  .shell-info {
    margin: 6px 8px 10px;
    border: 1px solid var(--st-surface-3);
    border-radius: 4px;
    background: rgba(20, 40, 60, 0.4);
  }
  .shell-info-toggle {
    width: 100%; text-align: left; background: none; border:  1px solid var(--st-hair); cursor: pointer;
    color: var(--st-text-2); font-size: 0.72rem; font-weight: 600; padding: 7px 9px;
  }
  .shell-info-body { padding: 0 10px 8px; }
  .shell-info-body p { margin: 4px 0; font-size: 0.68rem; line-height: 1.4; color: var(--st-text-2); }
  .shell-warn {
    margin: 0 8px 8px; padding: 6px 9px; border-radius: 4px;
    background: rgba(120, 80, 0, 0.25); border: 1px solid var(--st-warn);
    color: var(--st-warn); font-size: 0.68rem; line-height: 1.35;
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
  .curved-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .curved-check input { cursor: pointer; }

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
