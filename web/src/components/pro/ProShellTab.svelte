<script lang="ts">
  import { untrack } from 'svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import DataTable from '../DataTable.svelte';
  import { t, tp } from '../../lib/i18n';
  import { selectShellFamily } from '../../lib/engine/shell-family-selector';
  import { findCoincidentNode, beamThrough } from '../../lib/engine/mesh-weld';
  import { buildBilinearQuadGrid } from '../../lib/engine/shell-mesh-gen';
  import type { ShellRecommendation } from '../../lib/engine/types-3d';
  import type { Vec3 } from '../../lib/engine/shell-family-selector';

  /* The two creators' state is gone with them — see the note on `newNodeIds`.
     Three corners make a triangle and four make a quad, so one set serves. */

  // --- Quick mesh generator state ---
  let meshCorners = $state<[string, string, string, string]>(['', '', '', '']);
  let meshMode = $state<'targetSize' | 'fixedDivisions'>('targetSize');
  let meshTargetSize = $state(1.0);
  let meshNx = $state(2);
  let meshNy = $state(2);
  let meshMaterialId = $state(1);
  let meshThickness = $state(0.2);
  let meshSplitBeams = $state(true); // split surrounding beams so nodes are shared
  let meshError = $state<string | null>(null);
  let meshSuccess = $state<string | null>(null);

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

  function validateNodeIds(ids: string[], count: number): number[] | null {
    const parsed = ids.slice(0, count).map(s => parseInt(s));
    if (parsed.some(isNaN)) return null;
    if (new Set(parsed).size !== count) return null;
    if (parsed.some(id => !modelStore.nodes.has(id))) return null;
    return parsed;
  }

  /** Get Vec3 positions from node IDs */






  /**
   * Quick mesh generator: given 4 corner node IDs defining a rectangular region
   * and nx x ny subdivisions, creates intermediate nodes and quad elements.
   *
   * Corner ordering:
   *   n3 --- n2
   *   |       |
   *   n0 --- n1
   *
   * Bilinear interpolation is used to place intermediate nodes, so corners
   * don't need to form a perfect rectangle — any quadrilateral works.
   *
   * Nodes are welded to existing coincident nodes (no duplicates). When
   * "split surrounding beams" is on, any beam passing through a mesh node is
   * split there (via splitElementAtPoint, which redistributes loads + preserves
   * releases) so the beam and shell SHARE that node and load transfer is
   * continuous along the edge — the model coupling is purely shared-node.
   */
  function generateMesh() {
    meshError = null;
    meshSuccess = null;

    const cornerIds = validateNodeIds(meshCorners, 4);
    if (!cornerIds) {
      meshError = t('pro.err4Corners');
      return;
    }
    if (meshMode === 'targetSize' ? meshTargetSize <= 0 : (meshNx < 1 || meshNy < 1)) {
      meshError = meshMode === 'targetSize' ? t('pro.errTargetSize') : t('pro.errSubdivisions');
      return;
    }
    if (!modelStore.materials.has(meshMaterialId)) {
      meshError = t('pro.errMaterial');
      return;
    }
    if (meshThickness <= 0) {
      meshError = t('pro.errThickness');
      return;
    }

    // Get corner positions
    const corners = cornerIds.map(id => modelStore.nodes.get(id)!);

    // Target-size mode: derive subdivisions from physical edge lengths so the
    // element size is ~uniform regardless of panel size (large picks get more
    // cells, small picks fewer) — instead of a fixed Nx×Ny for every region.
    const edgeLen = (a: typeof corners[number], b: typeof corners[number]) =>
      Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    const nx = meshMode === 'targetSize'
      ? Math.max(1, Math.round(edgeLen(corners[0], corners[1]) / meshTargetSize))
      : meshNx;
    const ny = meshMode === 'targetSize'
      ? Math.max(1, Math.round(edgeLen(corners[0], corners[3]) / meshTargetSize))
      : meshNy;

    // Build the bilinear node grid + quad cells (shared with the CAD draft
    // generator). Corner ids are reused verbatim; interior/edge nodes weld to
    // existing coincident nodes or are created in the store.
    const { nodeGrid, newNodes, quadCount } = buildBilinearQuadGrid(
      [
        { x: corners[0].x, y: corners[0].y, z: corners[0].z ?? 0 },
        { x: corners[1].x, y: corners[1].y, z: corners[1].z ?? 0 },
        { x: corners[2].x, y: corners[2].y, z: corners[2].z ?? 0 },
        { x: corners[3].x, y: corners[3].y, z: corners[3].z ?? 0 },
      ],
      nx,
      ny,
      {
        findNode: (x, y, z) => findCoincidentNode(modelStore.nodes.values(), x, y, z),
        addNode: (x, y, z) => modelStore.addNode(x, y, z !== 0 ? z : undefined),
        addQuad: (nodes) => { modelStore.addQuad(nodes, meshMaterialId, meshThickness); },
      },
      cornerIds as [number, number, number, number],
    );

    // Optionally split surrounding beams so their nodes coincide with the mesh
    // edge nodes (continuous load transfer). Each mesh node that sits on a beam
    // interior splits that beam; splitElementAtPoint reuses our node (weld).
    let splitCount = 0;
    if (meshSplitBeams) {
      for (const r of nodeGrid) {
        for (const nodeId of r) {
          const n = modelStore.nodes.get(nodeId);
          if (!n) continue;
          // A node can lie on at most a couple of collinear beams; bound the loop.
          for (let guard = 0; guard < 4; guard++) {
            const hit = beamThrough((id) => modelStore.nodes.get(id), modelStore.elements.values(), n.x, n.y, n.z ?? 0);
            if (!hit) break;
            const res = modelStore.splitElementAtPoint(hit.id, hit.t);
            if (!res) break;
            splitCount++;
          }
        }
      }
    }

    meshSuccess = t('pro.meshSuccess').replace('{nodes}', String(newNodes)).replace('{quads}', String(quadCount))
      + (meshSplitBeams ? ' ' + t('pro.meshSplitInfo').replace('{n}', String(splitCount)) : '');
  }

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
  let newMaterialId = $state(1);
  let newThickness = $state(0.2);
  let newCurved = $state(false);
  let newError = $state<string | null>(null);
  let newRecommendation = $state<ShellRecommendation | null>(null);

  /** How many corners have been given — 3 makes a triangle, 4 a quad. */
  const newCount = $derived(newNodeIds.filter((v) => v.trim() !== '').length);

  /** The corners as points, or null while one is missing or unknown. */
  const newPts = $derived.by(() => {
    const ids = newNodeIds.slice(0, newCount).map((v) => Number(v));
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

  function updateNewRecommendation() {
    newRecommendation = null;
    if (!newPts || newThickness <= 0) return;
    try {
      newRecommendation = selectShellFamily({ nodes: newPts as Vec3[], thickness: newThickness });
    } catch { newRecommendation = null; }
  }

  /** Start or stop picking corners in the model. Four slots; three is a triangle. */
  function toggleNewPick() {
    if (uiStore.shellNodePick.active) uiStore.cancelShellNodePick();
    else uiStore.startShellNodePick('quad', 4);
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
    const ids = newNodeIds.slice(0, newCount).map((v) => Number(v));
    if (ids.length < 3) { newError = t('pro.shellNeedNodes'); return; }
    if (ids.some((n) => !Number.isFinite(n) || !modelStore.nodes.has(n))) {
      newError = t('pro.errNodesExist');
      return;
    }
    if (new Set(ids).size !== ids.length) { newError = t('pro.errNodesDistinct'); return; }
    if (!modelStore.materials.has(newMaterialId)) { newError = t('pro.errMaterial'); return; }
    if (newThickness <= 0) { newError = t('pro.errThickness'); return; }

    if (ids.length === 3) {
      modelStore.addPlate(ids as [number, number, number], newMaterialId, newThickness);
    } else {
      modelStore.addQuad(ids as [number, number, number, number], newMaterialId, newThickness);
      const quads = [...modelStore.model.quads.values()];
      const last = quads[quads.length - 1];
      /* A curved quad goes to the solver as a degenerated continuum rather
         than a flat MITC4, so its curvature carries. */
      if (last && newCurved) last.curved = true;
    }
    newNodeIds = ['', '', '', ''];
    newCurved = false;
    newRecommendation = null;
    uiStore.cancelShellNodePick();
  }

  let showMeshGen = $state(false);


  // ─── Viewport node-pick → creator fields ───
  // When the user picks nodes in the 3D viewport, mirror the buffer into the
  // matching creator's node inputs (so the typed-ID path and pick path share
  // the same fields and validation). The writes (and the recommendation calls,
  // which READ those same fields) are wrapped in untrack so this effect depends
  // ONLY on shellNodePick — otherwise writing plateNodes here while
  // updatePlateRecommendation reads it would self-trigger (effect_update_depth).
  $effect(() => {
    const pick = uiStore.shellNodePick;
    const ids = pick.picked;
    const target = pick.target;
    untrack(() => {
      /* The creator is one now — see `newNodeIds`, which mirrors picks for
         itself. What is left here is the mesh generator's own corners. */
      if (target === 'mesh') {
        meshCorners = [String(ids[0] ?? ''), String(ids[1] ?? ''), String(ids[2] ?? ''), String(ids[3] ?? '')];
      }
    });
  });

  // ─── Shell offset editor (operates on the selected shells) ───
  let showOffset = $state(false);
  let offFrame = $state<'global' | 'local'>('local');
  let offX = $state(0);
  let offY = $state(0);
  let offZ = $state(0);
  const selectedShellKeys = $derived([...uiStore.selectedShells]);

  function eachSelectedShell(fn: (kind: 'plate' | 'quad', id: number) => void) {
    for (const key of uiStore.selectedShells) {
      fn(key[0] === 'p' ? 'plate' : 'quad', parseInt(key.slice(1)));
    }
  }
  function applyShellOffset() {
    eachSelectedShell((kind, id) => modelStore.setShellOffset(kind, id, { frame: offFrame, x: offX, y: offY, z: offZ }));
  }
  function clearShellOffset() {
    eachSelectedShell((kind, id) => modelStore.setShellOffset(kind, id, undefined));
  }
  /** Quick preset: offset along the shell normal by ±half its thickness so the
   *  top/bottom face sits at the node plane (slab top-of-beam, wall face). */
  function applyHalfThickness(sign: 1 | -1) {
    offFrame = 'local';
    offX = 0; offY = 0;
    // Use the first selected shell's thickness as the reference.
    const key = [...uiStore.selectedShells][0];
    if (!key) return;
    const id = parseInt(key.slice(1));
    const shell = key[0] === 'p' ? modelStore.model.plates.get(id) : modelStore.model.quads.get(id);
    const t = shell?.thickness ?? 0.2;
    offZ = sign * t / 2;
    applyShellOffset();
  }

  function isPicking(target: 'plate' | 'quad' | 'mesh'): boolean {
    return uiStore.shellNodePick.active && uiStore.shellNodePick.target === target;
  }
  function pickBtnLabel(target: 'plate' | 'quad' | 'mesh', cap: number): string {
    const p = uiStore.shellNodePick;
    if (p.active && p.target === target) return `${t('pro.picking')} ${p.picked.length}/${cap} — ${t('pro.cancel')}`;
    return `\u{1F4CD} ${t('pro.pickNodes')}`;
  }
  function togglePick(target: 'plate' | 'quad' | 'mesh', cap: number) {
    if (isPicking(target)) uiStore.cancelShellNodePick();
    else uiStore.startShellNodePick(target, cap);
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
    <span class="pro-shells-count">{t('pro.nPlatesQuads').replace('{plates}', String(plateCount)).replace('{quads}', String(quadCount))}</span>
    <button
      class="dim-like"
      class:on={uiStore.shellNodePick.active}
      aria-pressed={uiStore.shellNodePick.active ? 'true' : 'false'}
      onclick={toggleNewPick}
      data-testid="draw-plate"
      title={uiStore.shellNodePick.active ? t('pro.drawStopHint') : t('pro.drawStartHint')}
    >{uiStore.shellNodePick.active
      ? `${t('pro.drawStop')} (${uiStore.shellNodePick.picked.length}/4)`
      : `${t('pro.drawInModel')} ${t('pro.onePlate')}`}</button>
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
      and makes it. The formulation is still shown, and still overridable for
      someone who wants to, under the detail.
    -->
    <div class="section">
      <div class="shell-new">
        <div class="input-row">
          <label>{t('pro.nodes')}:</label>
          {#each [0, 1, 2, 3] as i (i)}
            <input
              type="text" inputmode="numeric"
              class="node-input"
              class:optional={i === 3}
              placeholder={`N${i + 1}`}
              title={i === 3 ? t('pro.shellFourthPh') : ''}
              value={newNodeIds[i]}
              oninput={(e) => { newNodeIds[i] = e.currentTarget.value; updateNewRecommendation(); }}
              data-testid="shell-node-{i}"
            />
          {/each}
        </div>

        <div class="input-row">
          <label>{t('pro.thMaterial')}:</label>
          <select bind:value={newMaterialId} class="mat-select">
            {#each materials as m}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </div>
        <div class="input-row">
          <label>{t('pro.thickness')}:</label>
          <input type="number" bind:value={newThickness} step="0.01" min="0.001" class="thick-input"
                 oninput={updateNewRecommendation} data-testid="shell-thickness" />
        </div>

        <!--
          A cáscara, offered only where it can mean anything: three points
          are coplanar by definition, so a triangle is never curved. Whether
          FOUR are is arithmetic, and the panel measures it rather than
          leaving a dome to be solved as facets.
        -->
        {#if newCount === 4}
          <div class="input-row">
            <label class="curved-check">
              <input type="checkbox" bind:checked={newCurved} data-testid="quad-curved" />
              <span>{t('pro.curvedShell')}</span>
            </label>
          </div>
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
        {#if newError}
          <div class="field-error" data-testid="shell-error">{newError}</div>
        {/if}

        <button
          class="pro-btn pro-btn-accent"
          onclick={addShell}
          disabled={newCount < 3}
          data-testid="shell-add"
        >{t('pro.addPlate')}</button>
      </div>
    </div>

    <!-- Quick mesh generator -->
    <div class="section">
      <button class="section-toggle" onclick={() => showMeshGen = !showMeshGen}>
        <span class="toggle-arrow">{showMeshGen ? '\u25BE' : '\u25B8'}</span>
        {t('pro.meshGenerator')}
      </button>
      {#if showMeshGen}
        <div class="section-body">
          <div class="mesh-hint">
            {t('pro.meshHint')}
          </div>
          <div class="input-row">
            <label>{t('pro.corners')}:</label>
            <input type="text" bind:value={meshCorners[0]} placeholder="N0" class="node-input" />
            <input type="text" bind:value={meshCorners[1]} placeholder="N1" class="node-input" />
            <input type="text" bind:value={meshCorners[2]} placeholder="N2" class="node-input" />
            <input type="text" bind:value={meshCorners[3]} placeholder="N3" class="node-input" />
          </div>
          <div class="input-row">
            <button class="pro-btn pro-btn-pick" class:picking={isPicking('mesh')} onclick={() => togglePick('mesh', 4)}>
              {pickBtnLabel('mesh', 4)}
            </button>
          </div>
          <div class="input-row">
            <label>{t('pro.meshMode')}:</label>
            <select bind:value={meshMode} class="mat-select">
              <option value="targetSize">{t('pro.meshModeTarget')}</option>
              <option value="fixedDivisions">{t('pro.meshModeFixed')}</option>
            </select>
          </div>
          {#if meshMode === 'targetSize'}
            <div class="input-row">
              <label>{t('pro.meshTargetSize')}:</label>
              <input type="number" bind:value={meshTargetSize} min="0.1" max="20" step="0.25" class="sub-input" />
              <span class="x-label">m</span>
            </div>
            <div class="input-row mesh-note">{t('pro.meshTargetNote')}</div>
          {:else}
            <div class="input-row">
              <label>{t('pro.subdivisions')}:</label>
              <input type="number" bind:value={meshNx} min="1" max="50" class="sub-input" />
              <span class="x-label">&times;</span>
              <input type="number" bind:value={meshNy} min="1" max="50" class="sub-input" />
            </div>
          {/if}
          <div class="input-row">
            <label>{t('pro.thMaterial')}:</label>
            <select bind:value={meshMaterialId} class="mat-select">
              {#each materials as m}
                <option value={m.id}>{m.name}</option>
              {/each}
            </select>
          </div>
          <div class="input-row">
            <label>{t('pro.thickness')}:</label>
            <input type="number" bind:value={meshThickness} step="0.01" min="0.001" class="thick-input" />
          </div>
          <label class="mesh-check">
            <input type="checkbox" bind:checked={meshSplitBeams} />
            {t('pro.meshSplitBeams')}
          </label>
          {#if meshError}
            <div class="field-error">{meshError}</div>
          {/if}
          {#if meshSuccess}
            <div class="field-success">{meshSuccess}</div>
          {/if}
          <button class="pro-btn pro-btn-accent" onclick={generateMesh}>{t('pro.generateMesh')}</button>

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

    <!-- Shell offset (eccentric mid-surface) -->
    <div class="section">
      <button class="section-toggle" onclick={() => showOffset = !showOffset}>
        <span class="toggle-arrow">{showOffset ? '▾' : '▸'}</span>
        {t('pro.shellOffset')}
      </button>
      {#if showOffset}
        <div class="section-body">
          <div class="mesh-hint">{t('pro.shellOffsetHint')}</div>
          {#if selectedShellKeys.length === 0}
            <div class="field-error">{t('pro.shellOffsetSelect')}</div>
          {:else}
            <div class="offset-sel-count">{selectedShellKeys.length} {t('pro.selected')}</div>
          {/if}
          <div class="input-row">
            <label>{t('pro.offsetFrame')}:</label>
            <select bind:value={offFrame} class="family-select">
              <option value="local">{t('pro.offsetLocal')}</option>
              <option value="global">{t('pro.offsetGlobal')}</option>
            </select>
          </div>
          <div class="input-row">
            <label>{offFrame === 'local' ? 'x,y,n (m)' : 'X,Y,Z (m)'}:</label>
            <input type="number" bind:value={offX} step="0.01" class="thick-input" />
            <input type="number" bind:value={offY} step="0.01" class="thick-input" />
            <input type="number" bind:value={offZ} step="0.01" class="thick-input" />
          </div>
          {#if offFrame === 'local'}
            <div class="input-row offset-presets">
              <button class="pro-btn" onclick={() => applyHalfThickness(1)}>{t('pro.offsetTopFace')}</button>
              <button class="pro-btn" onclick={() => applyHalfThickness(-1)}>{t('pro.offsetBottomFace')}</button>
            </div>
          {/if}
          <div class="input-row offset-actions">
            <button class="pro-btn pro-btn-accent" disabled={selectedShellKeys.length === 0} onclick={applyShellOffset}>{t('pro.applyOffset')}</button>
            <button class="pro-btn" disabled={selectedShellKeys.length === 0} onclick={clearShellOffset}>{t('pro.clearOffset')}</button>
          </div>
          <div class="rec-warning">{t('pro.shellOffsetWarn')}</div>
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
  .node-input.optional { opacity: 0.65; }

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
  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .input-row label {
    font-size: 0.75rem;
    color: var(--st-text-3);
    min-width: 70px;
    flex-shrink: 0;
  }

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

  .sub-input {
    width: 44px;
    padding: 3px 5px;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.72rem;
    font-family: monospace;
    text-align: center;
  }

  .sub-input:focus {
    border-color: var(--st-surface-3);
    outline: none;
  }

  .x-label {
    font-size: 0.72rem;
    color: var(--st-text-3);
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

  .pro-btn-accent {
    background: var(--st-surface-3);
    border-color: var(--st-text-2);
    color: var(--st-value);
  }

  .pro-btn-accent:hover {
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

  .pro-btn-pick {
    border-color: var(--st-text-3);
    color: var(--st-text);
  }
  .pro-btn-pick.picking {
    background: var(--st-hair-strong);
    border-color: var(--st-text-2);
    color: var(--st-text);
    animation: pickPulse 1.2s ease-in-out infinite;
  }
  @keyframes pickPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 255, 0.4); }
    50% { box-shadow: 0 0 0 4px rgba(0, 255, 255, 0); }
  }

  /* Errors / success */
  .field-error {
    font-size: 0.68rem;
    color: var(--st-danger);
    padding: 2px 0;
  }

  .field-success {
    font-size: 0.68rem;
    color: var(--st-text-2);
    padding: 2px 0;
  }

  .mesh-hint {
    font-size: 0.72rem;
    color: var(--st-text-3);
    font-style: italic;
    line-height: 1.4;
  }

  .mesh-check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    color: var(--st-text-2);
    cursor: pointer;
  }
  .mesh-check input { accent-color: var(--st-text-2); }

  /* Tables */
  .table-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--st-text-3);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-top: 4px;
    margin-bottom: 2px;
  }

  .pro-shells-table-wrap {
    overflow-x: auto;
  }

  .pro-shells-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.72rem;
  }

  .pro-shells-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .pro-shells-table th {
    padding: 4px 4px;
    text-align: left;
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--st-text-3);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-surface-3);
    white-space: nowrap;
  }

  .pro-shells-table td {
    padding: 3px 4px;
    border-bottom: 1px solid var(--st-surface-2);
  }

  .pro-shells-table tbody tr {
    cursor: pointer;
    transition: background 0.1s;
  }

  .pro-shells-table tbody tr:hover {
    background: rgba(127, 212, 204, 0.08);
  }

  .pro-shells-table tbody tr.selected {
    background: rgba(127, 212, 204, 0.18);
    box-shadow: inset 3px 0 0 var(--st-value);
  }

  .inline-select {
    background: transparent; border: 1px solid transparent; border-radius: 3px;
    color: var(--st-text-2); font-size: 0.72rem; padding: 2px 4px; cursor: pointer; width: 100%;
  }
  .inline-select:hover { border-color: var(--st-surface-3); }
  .inline-select:focus { background: var(--st-surface-3); border-color: var(--st-surface-3); outline: none; }
  .inline-select option { background: var(--st-surface); color: var(--st-text-2); }
  .inline-input {
    background: transparent; border: 1px solid transparent; border-radius: 3px;
    color: var(--st-text-2); font-size: 0.72rem; font-family: monospace; padding: 2px 4px; width: 70px;
  }
  .inline-input:hover { border-color: var(--st-surface-3); }
  .inline-input:focus { background: var(--st-surface-3); border-color: var(--st-surface-3); outline: none; }

  .col-id {
    width: 30px;
    color: var(--st-text-3);
    font-family: monospace;
    font-size: 0.68rem;
    text-align: center;
  }

  .col-nodes {
    font-family: monospace;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }

  .col-mat {
    font-size: 0.68rem;
    color: var(--st-text-2);
  }

  .col-thick {
    font-family: monospace;
    font-size: 0.68rem;
    color: var(--st-text-2);
    text-align: right;
  }

  .col-actions {
    width: 20px;
    text-align: center;
  }

  .pro-delete-btn {
    background: none;
    border:  none;
    color: var(--st-text-3);
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .pro-delete-btn:hover {
    color: var(--st-danger);
  }

  .pro-empty {
    text-align: center;
    color: var(--st-text-3);
    font-style: italic;
    padding: 16px 10px;
    font-size: 0.72rem;
  }

  /* Shell family selector */
  .family-select {
    flex: 1;
    padding: 4px 6px;
    background: var(--st-surface);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .family-select:focus {
    border-color: var(--st-surface-3);
    outline: none;
  }

  .family-select option:disabled {
    color: var(--st-text-3);
    font-style: italic;
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

  .col-family {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--st-text-2);
    font-family: monospace;
    white-space: nowrap;
  }
</style>
