<script lang="ts">
  /**
   * Stairs, as a sub-option of Plates rather than a tool of its own.
   *
   * It belongs here because what it produces IS a plate — an inclined waist
   * slab, which is how a stair is analysed. Giving it a ribbon command would
   * have claimed it is a different kind of object; it is the same object with
   * its far edge lifted, and the two ways of getting there are the two ways
   * anyone actually works: build one from the edge it starts at, or take the
   * slab you already drew and tilt it.
   *
   * See `lib/model/stair.ts` for why the steps are load and not geometry.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { te } from '../../lib/i18n/engine-text';
  import { findCoincidentNode } from '../../lib/engine/mesh-weld';
  import {
    flightGeometry, flightCorners, runDirection, checkStairSpec,
    stepWeightPerInclinedArea, treadForRun, tiltQuadToFlight, quadRunLength,
    buildFlight, blondel, type StairSpec, type Vec3,
  } from '../../lib/model/stair';

  let open = $state(false);

  /* A 2.80 m storey in sixteen risers — the flight a reader is most likely to
     be drawing, so the panel opens with something real in it rather than zeros
     that have to be cleared before anything can be computed. */
  let riser = $state(0.175);
  let tread = $state(0.28);
  let steps = $state(16);
  let waist = $state(0.15);
  let materialId = $state(1);
  let flip = $state(false);
  let addStepLoad = $state(true);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  const materials = $derived([...modelStore.materials.values()]);
  const spec = $derived<StairSpec>({ riser, tread, steps, waist });
  const geom = $derived(flightGeometry(spec));
  const check = $derived(checkStairSpec(spec));
  const stride = $derived(blondel(spec));

  /** Density of the chosen material, kN/m³ — what the steps weigh. */
  const density = $derived(modelStore.materials.get(materialId)?.rho ?? 25);
  const stepLoad = $derived(stepWeightPerInclinedArea(spec, density));

  // ── Picking the bottom edge ──────────────────────────────────────
  const picking = $derived(uiStore.shellNodePick.active && uiStore.shellNodePick.target === 'stair');
  let edgeIds = $state<[string, string]>(['', '']);

  $effect(() => {
    const p = uiStore.shellNodePick;
    if (!p.active || p.target !== 'stair') return;
    edgeIds = [String(p.picked[0] ?? ''), String(p.picked[1] ?? '')];
  });

  function togglePick() {
    if (picking) uiStore.cancelShellNodePick();
    else uiStore.startShellNodePick('stair', 2);
  }

  const edgeNodes = $derived.by(() => {
    const ids = edgeIds.map((v) => Number(v));
    if (ids.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    if (ids[0] === ids[1]) return null;
    const ns = ids.map((id) => modelStore.nodes.get(id));
    if (ns.some((n) => !n)) return null;
    return ns.map((n) => ({ x: n!.x, y: n!.y ?? 0, z: (n! as { z?: number }).z ?? 0 })) as [Vec3, Vec3];
  });

  /** Where the flight will run, for showing before it is built. */
  const dir = $derived(edgeNodes ? runDirection(edgeNodes[0], edgeNodes[1], flip) : null);
  const dirLabel = $derived(
    dir ? `(${dir.x.toFixed(2)}, ${dir.y.toFixed(2)})` : '—',
  );

  /* One quad per step: a single MITC4 over a five-metre flight reports the
     bending of a four-node element, not of a slab, and at this size the mesh
     costs nothing. Bounded so a mistyped step count cannot mesh the model to
     a halt. */
  const divisions = $derived(Math.min(40, Math.max(1, Math.round(steps))));

  /** Create the quads and, unless told not to, the step weight on each. */
  function buildInto(corners: [Vec3, Vec3, Vec3, Vec3]): number {
    const deadCase = modelStore.model.loadCases.find((c) => c.type === 'D')?.id ?? 1;
    let built = 0;
    modelStore.batch(() => {
      const r = buildFlight(
        {
          findNode: (x, y, z) => findCoincidentNode(modelStore.nodes.values(), x, y, z),
          addNode: (x, y, z) => modelStore.addNode(x, y, z !== 0 ? z : undefined),
          addQuad: (nodes) => modelStore.addQuad(nodes, materialId, waist),
        },
        corners,
        divisions,
      );
      built = r.quadIds.length;
      if (addStepLoad && stepLoad > 0) {
        /* Positive q is gravity — `convertSurfaceLoad` resolves it as
           fz = −q·A/4. Per square metre of INCLINED surface, which is the area
           that function integrates over. */
        for (const qid of r.quadIds) modelStore.addSurfaceLoad3D(qid, stepLoad, deadCase);
      }
    });
    return built;
  }

  function generate() {
    error = null; success = null;
    if (check.errors.length > 0) { error = te(check.errors[0]); return; }
    if (!edgeNodes) { error = t('stair.errEdge'); return; }
    if (!modelStore.materials.has(materialId)) { error = t('pro.errMaterial'); return; }
    const corners = flightCorners(edgeNodes[0], edgeNodes[1], spec, flip);
    if (!corners) { error = t('stair.errEdgeVertical'); return; }
    const n = buildInto(corners);
    success = tp('stair.built', { quads: n });
    uiStore.cancelShellNodePick();
    edgeIds = ['', ''];
  }

  // ── Converting a slab that is already drawn ──────────────────────
  /*
   * By id, filled in from the selection when there is exactly one.
   *
   * Selection-only would have been the tidier-looking choice and the wrong
   * one: every other creator in PRO addresses shells by the id shown in the
   * table, a reader converting a slab usually has its id in front of them, and
   * a control that is dead until something is picked in a viewport gives no
   * way to say which of two overlapping quads was meant.
   *
   * Quads only. A triangle has no opposite edge to raise, and three points are
   * coplanar by definition — the same reason curvature is a quad's question.
   */
  const selectedQuadIds = $derived(
    [...uiStore.selectedShells].filter((k) => k[0] === 'q').map((k) => parseInt(k.slice(1))),
  );
  let convertId = $state('');
  $effect(() => {
    if (selectedQuadIds.length === 1) convertId = String(selectedQuadIds[0]);
  });
  const convertTarget = $derived(
    modelStore.model.quads.get(Number(convertId)) ?? null,
  );
  let lowEdge = $state<0 | 1 | 2 | 3>(0);

  const targetCorners = $derived.by(() => {
    if (!convertTarget) return null;
    const ns = convertTarget.nodes.map((id) => modelStore.nodes.get(id));
    if (ns.some((n) => !n)) return null;
    return ns.map((n) => ({ x: n!.x, y: n!.y ?? 0, z: (n! as { z?: number }).z ?? 0 })) as [Vec3, Vec3, Vec3, Vec3];
  });

  /* The slab's own footprint is kept and only z changes, so the tread is a
     DERIVED quantity. Shown, because a conversion that silently
     re-proportions the stair is one the reader cannot check. */
  const targetRun = $derived(targetCorners ? quadRunLength(targetCorners, lowEdge) : 0);
  const derivedTread = $derived(treadForRun(targetRun, steps));

  function convert() {
    error = null; success = null;
    if (!convertTarget || !targetCorners) { error = t('stair.errSelectOneQuad'); return; }
    if (convertTarget.nodes.length !== 4) { error = t('stair.errSelectOneQuad'); return; }
    if (check.errors.length > 0) { error = te(check.errors[0]); return; }
    const tilted = tiltQuadToFlight(targetCorners, lowEdge, geom.rise);
    const id = convertTarget.id;
    modelStore.batch(() => {
      /* The original goes first, and `removeQuad` takes its surface loads with
         it — a load left pointing at a deleted quad is dropped at solve time
         with nothing said. */
      modelStore.removeQuad(id);
      buildInto(tilted);
    });
    /* The slab the selection pointed at no longer exists. */
    uiStore.clearSelection();
    success = tp('stair.converted', { id });
  }
</script>

<div class="section">
  <button class="section-toggle" onclick={() => (open = !open)} data-testid="stair-toggle">
    <span class="toggle-arrow">{open ? '▾' : '▸'}</span>
    {t('stair.title')}
  </button>
  {#if open}
    <div class="section-body">
      <div class="hint">{t('stair.intro')}</div>

      <!-- The flight, once, for both ways of making one -->
      <div class="input-row">
        <label for="stair-riser">{t('stair.riser')}:</label>
        <input id="stair-riser" type="number" bind:value={riser} step="0.005" min="0.05" class="num" data-testid="stair-riser" />
        <label for="stair-tread">{t('stair.tread')}:</label>
        <input id="stair-tread" type="number" bind:value={tread} step="0.01" min="0.1" class="num" data-testid="stair-tread" />
      </div>
      <div class="input-row">
        <label for="stair-steps">{t('stair.steps')}:</label>
        <input id="stair-steps" type="number" bind:value={steps} step="1" min="2" max="60" class="num" data-testid="stair-steps" />
        <label for="stair-waist">{t('stair.waist')}:</label>
        <input id="stair-waist" type="number" bind:value={waist} step="0.01" min="0.05" class="num" data-testid="stair-waist" />
      </div>
      <div class="input-row">
        <label for="stair-mat">{t('pro.thMaterial')}:</label>
        <select id="stair-mat" bind:value={materialId} class="mat-select">
          {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
      </div>

      <!-- What that geometry actually is -->
      <dl class="readout" data-testid="stair-readout">
        <div><dt>{t('stair.rise')}</dt><dd>{geom.rise.toFixed(2)} m</dd></div>
        <div><dt>{t('stair.run')}</dt><dd>{geom.run.toFixed(2)} m</dd></div>
        <div><dt>{t('stair.angle')}</dt><dd>{geom.angleDeg.toFixed(1)}°</dd></div>
        <div><dt>{t('stair.blondel')}</dt><dd>{stride.toFixed(3)} m</dd></div>
        <div><dt>{t('stair.stepLoad')}</dt><dd>{stepLoad.toFixed(2)} kN/m²</dd></div>
      </dl>
      <div class="hint small">{tp('stair.planFactor', { f: Math.cos(geom.angleRad).toFixed(3) })}</div>

      {#each check.warnings as w (w.key)}
        <div class="warn" data-testid="stair-warn">⚠ {te(w)}</div>
      {/each}

      <label class="check">
        <input type="checkbox" bind:checked={addStepLoad} data-testid="stair-step-load" />
        <span>{t('stair.addStepLoad')}</span>
      </label>

      <!-- 1 · From a bottom edge -->
      <div class="sub">{t('stair.fromEdge')}</div>
      <div class="input-row">
        <button
          class="dim-like" class:on={picking}
          aria-pressed={picking ? 'true' : 'false'}
          onclick={togglePick}
          data-testid="stair-pick"
        >{picking
          ? `${t('pro.drawStop')} (${uiStore.shellNodePick.picked.length}/2)`
          : t('stair.pickEdge')}</button>
        <input type="text" inputmode="numeric" bind:value={edgeIds[0]} placeholder="N1" class="node-input" data-testid="stair-n0" />
        <input type="text" inputmode="numeric" bind:value={edgeIds[1]} placeholder="N2" class="node-input" data-testid="stair-n1" />
      </div>
      <div class="input-row">
        <span class="dirline">{t('stair.direction')}: <code>{dirLabel}</code></span>
        <button class="pro-btn" onclick={() => (flip = !flip)} data-testid="stair-flip">{t('stair.flip')}</button>
      </div>
      <button
        class="pro-btn pro-btn-accent"
        onclick={generate}
        disabled={!edgeNodes || check.errors.length > 0}
        data-testid="stair-generate"
      >{t('stair.generate')}</button>

      <!-- 2 · From a slab that is already there -->
      <div class="sub">{t('stair.fromSlab')}</div>
      <div class="input-row">
        <label for="stair-quad">{t('stair.quadId')}:</label>
        <input id="stair-quad" type="text" inputmode="numeric" bind:value={convertId}
               placeholder="Q" class="node-input" data-testid="stair-quad-id" />
      </div>
      {#if !convertTarget}
        <div class="hint small">{t('stair.selectOneQuad')}</div>
      {:else}
        <div class="hint small">{tp('stair.converting', { id: convertTarget.id })}</div>
        <div class="input-row">
          <label for="stair-edge">{t('stair.lowEdge')}:</label>
          <select id="stair-edge" bind:value={lowEdge} class="mat-select" data-testid="stair-low-edge">
            {#each [0, 1, 2, 3] as e (e)}
              <option value={e}>{convertTarget.nodes[e]} → {convertTarget.nodes[(e + 1) % 4]}</option>
            {/each}
          </select>
        </div>
        <div class="hint small" data-testid="stair-derived-tread">
          {tp('stair.derivedTread', { run: targetRun.toFixed(2), tread: derivedTread.toFixed(3) })}
        </div>
      {/if}
      <button
        class="pro-btn pro-btn-accent"
        onclick={convert}
        disabled={!convertTarget || check.errors.length > 0}
        data-testid="stair-convert"
      >{t('stair.convert')}</button>

      {#if error}<div class="field-error" data-testid="stair-error">{error}</div>{/if}
      {#if success}<div class="field-success" data-testid="stair-success">{success}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .section { border-bottom: 1px solid var(--st-surface-3); }
  .section-toggle {
    width: 100%; text-align: left; padding: 8px 12px;
    font-size: 0.78rem; font-weight: 600; color: var(--st-text-2);
    background: var(--st-surface); border: none; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
  }
  .section-toggle:hover { color: var(--st-text); background: var(--st-surface-3); }
  .toggle-arrow { font-size: 0.65rem; color: var(--st-text-3); }
  .section-body {
    padding: 10px 12px 12px; background: var(--st-surface-3);
    display: flex; flex-direction: column; gap: 8px;
  }
  .input-row { display: flex; align-items: center; gap: 8px; }
  .input-row label { font-size: 0.75rem; color: var(--st-text-3); flex-shrink: 0; }
  .num, .node-input {
    width: 62px; padding: 4px 6px; background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
    color: var(--st-text); font-size: 0.78rem; font-family: monospace; text-align: center;
  }
  .node-input { width: 48px; }
  .mat-select {
    flex: 1; padding: 4px 6px; background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
    color: var(--st-text); font-size: 0.78rem;
  }
  .hint { font-size: 0.72rem; color: var(--st-text-3); line-height: 1.45; }
  .hint.small { font-size: 0.68rem; }
  .sub {
    font-size: 0.72rem; font-weight: 600; color: var(--st-text-2);
    margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--st-hair);
  }
  .readout {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
    gap: 4px 10px; margin: 0;
  }
  .readout div { display: flex; flex-direction: column; }
  .readout dt { font-size: 0.66rem; color: var(--st-text-3); }
  .readout dd {
    margin: 0; font-size: 0.78rem; color: var(--st-value);
    font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .warn {
    font-size: 0.7rem; color: var(--st-warn, #c98a00); line-height: 1.4;
  }
  .check { display: flex; align-items: center; gap: 6px; font-size: 0.73rem; color: var(--st-text-2); }
  .dirline { font-size: 0.72rem; color: var(--st-text-3); flex: 1; }
  .dirline code { font-family: monospace; color: var(--st-text-2); }
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
  .pro-btn {
    padding: 5px 10px; background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    color: var(--st-text-2); font: inherit; font-size: 0.73rem; cursor: pointer;
  }
  .pro-btn:hover:not(:disabled) { color: var(--st-text); border-color: var(--st-accent); }
  .pro-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .pro-btn-accent { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .field-error { font-size: 0.72rem; color: var(--st-danger, #d14); }
  .field-success { font-size: 0.72rem; color: var(--st-ok, #2a7); }
</style>
