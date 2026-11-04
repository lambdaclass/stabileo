<script lang="ts">
  /**
   * A stair built in the model from its flight, and designed as the same stair.
   *
   * The model's stair section (Model › Plates) built the inclined waist from two nodes of its
   * bottom edge, or tilted a slab already drawn, and it left the shells tab when stairs became
   * part of design; `designStairFromFlight` was left with no way in. It is here now, beside the
   * stairs the desk designs: the flight typed above (riser, tread, risers, waist) is built into
   * the model as its waist slab, one plate per step with the steps' weight on the dead case, and
   * the stair is designed from it and linked to those plates (`stair-link.ts`).
   */
  import { t, tp } from '../../../../lib/i18n';
  import { te } from '../../../../lib/i18n/engine-text';
  import { modelStore, uiStore } from '../../../../lib/store';
  import { checkStairSpec, flightCorners, flightGeometry, runDirection, stepWeightPerInclinedArea, type StairSpec, type Vec3 } from '../../../../lib/model/stair';
  import { buildFlightInto, convertQuadToFlight, type FlightOptions } from '../../../../lib/model/stair-convert';
  import { designStairFromFlight } from '../../../../lib/store/stair-link';
  import { defaultShellMaterial } from '../../../../lib/pro/design-home';

  let { flight, width, onDesigned }: {
    flight: StairSpec;
    /** The stair's width as the form above states it, m. */
    width: number | undefined;
    onDesigned: (stairId: string) => void;
  } = $props();

  let materialId = $state(defaultShellMaterial(modelStore.materials));
  $effect(() => { if (!modelStore.materials.has(materialId)) materialId = defaultShellMaterial(modelStore.materials); });
  const materials = $derived([...modelStore.materials.values()]);
  let flip = $state(false);
  let addStepLoad = $state(true);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  const check = $derived(checkStairSpec(flight));
  const geom = $derived(flightGeometry(flight));
  const density = $derived(modelStore.materials.get(materialId)?.rho ?? 25);

  /*
   * The two nodes of the bottom edge, by id: filled in from the selection when it holds exactly
   * two, typed otherwise. A quad to tilt, likewise, from a selection of one plate.
   */
  let edge = $state<[string, string]>(['', '']);
  $effect(() => { const n = [...uiStore.selectedNodes]; if (n.length === 2) edge = [String(n[0]), String(n[1])]; });
  const edgeNodes = $derived.by(() => {
    const ids = edge.map(Number);
    if (ids.some((n) => !Number.isFinite(n) || n <= 0) || ids[0] === ids[1]) return null;
    const ns = ids.map((id) => modelStore.nodes.get(id));
    if (ns.some((n) => !n)) return null;
    return ns.map((n) => ({ x: n!.x, y: n!.y ?? 0, z: (n as { z?: number }).z ?? 0 })) as [Vec3, Vec3];
  });
  const dir = $derived(edgeNodes ? runDirection(edgeNodes[0], edgeNodes[1], flip) : null);
  let quadId = $state('');
  $effect(() => {
    const q = [...uiStore.selectedShells].filter((k) => k[0] === 'q');
    if (q.length === 1) quadId = q[0]!.slice(1);
  });
  const quad = $derived(modelStore.model.quads.get(Number(quadId)) ?? null);
  let lowEdge = $state<0 | 1 | 2 | 3>(0);

  /** One plate per step, bounded so a mistyped count cannot mesh the model to a halt. */
  function options(): FlightOptions {
    const deadCase = modelStore.model.loadCases.find((c) => c.type === 'D')?.id ?? 1;
    return { divisions: Math.min(40, Math.max(1, Math.round(flight.steps))), materialId, waist: flight.waist, stepLoad: addStepLoad ? stepWeightPerInclinedArea(flight, density) : 0, deadCase };
  }
  function ready(): boolean {
    error = null; success = null;
    if (check.errors.length > 0) { error = te(check.errors[0]!); return false; }
    if (!modelStore.materials.has(materialId)) { error = t('pro.errMaterial'); return false; }
    return true;
  }
  function design(quads: number[], said: string) {
    const id = designStairFromFlight(flight, width ?? 1.2, quads);
    success = `${said} ${t('stair.ui.designedFromFlight')}`;
    onDesigned(id);
  }
  function build() {
    if (!ready()) return;
    if (!edgeNodes) { error = t('stair.errEdge'); return; }
    const corners = flightCorners(edgeNodes[0], edgeNodes[1], flight, flip);
    if (!corners) { error = t('stair.errEdgeVertical'); return; }
    const quads = buildFlightInto(corners, options());
    design(quads, tp('stair.built', { quads: quads.length }));
  }
  function convert() {
    if (!ready()) return;
    if (!quad || quad.nodes.length !== 4) { error = t('stair.errSelectOneQuad'); return; }
    const id = quad.id;
    const r = convertQuadToFlight(id, lowEdge, geom.rise, options());
    if (!r) { error = t('stair.errSelectOneQuad'); return; }
    uiStore.clearSelection();
    design(r.quadIds, tp('stair.converted', { id }) + (r.carriedLoads > 0 ? ` ${tp('stair.convertedLoads', { n: r.carriedLoads })}` : ''));
  }
</script>

<details class="sb" data-testid="stair-from-model">
  <summary>{t('stair.ui.fromModel')}</summary>
  <p class="muted">{t('stair.intro')}</p>
  <div class="sb-row">
    <label>{t('pro.thMaterial')}
      <select bind:value={materialId} data-testid="stair-material">{#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select>
    </label>
    <label class="sb-check"><input type="checkbox" bind:checked={addStepLoad} data-testid="stair-step-load" /> {t('stair.addStepLoad')}</label>
  </div>
  {#each check.warnings as w (w.key)}<p class="sb-warn" data-testid="stair-warn">{te(w)}</p>{/each}

  <h5>{t('stair.fromEdge')}</h5>
  <div class="sb-row">
    <label>N1 <input inputmode="numeric" bind:value={edge[0]} data-testid="stair-n0" /></label>
    <label>N2 <input inputmode="numeric" bind:value={edge[1]} data-testid="stair-n1" /></label>
    <span class="muted">{t('stair.direction')}: {dir ? `(${dir.x.toFixed(2)}, ${dir.y.toFixed(2)})` : '—'}</span>
    <button onclick={() => (flip = !flip)} data-testid="stair-flip">{t('stair.flip')}</button>
    <button class="sb-primary" disabled={!edgeNodes || check.errors.length > 0} onclick={build} data-testid="stair-generate">{t('stair.generate')}</button>
  </div>

  <h5>{t('stair.fromSlab')}</h5>
  <div class="sb-row">
    <label>{t('stair.quadId')} <input inputmode="numeric" bind:value={quadId} data-testid="stair-quad-id" /></label>
    {#if quad}
      <label>{t('stair.lowEdge')}
        <select bind:value={lowEdge} data-testid="stair-low-edge">
          {#each [0, 1, 2, 3] as e (e)}<option value={e}>{quad.nodes[e]} → {quad.nodes[(e + 1) % 4]}</option>{/each}
        </select>
      </label>
    {:else}<span class="muted">{t('stair.selectOneQuad')}</span>{/if}
    <button class="sb-primary" disabled={!quad || check.errors.length > 0} onclick={convert} data-testid="stair-convert">{t('stair.convert')}</button>
  </div>
  {#if error}<p class="sb-error" data-testid="stair-error">{error}</p>{/if}
  {#if success}<p class="sb-ok" data-testid="stair-success">{success}</p>{/if}
</details>

<style>
  .sb { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sb summary { cursor: pointer; font-weight: 600; }
  .sb h5 { margin: 0.3rem 0 0; font-size: 0.68rem; color: var(--st-text-2); }
  .sb-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; }
  .sb-row label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .sb-row .sb-check { flex-direction: row; align-items: center; gap: 0.3rem; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  input { font-size: 0.72rem; width: 4.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  input[type='checkbox'] { width: auto; }
  select { font-size: 0.72rem; max-width: 14rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: default; }
  .sb-primary { border-color: var(--st-accent); }
  .sb-warn { margin: 0; font-size: 0.68rem; color: var(--st-warn); }
  .sb-error { margin: 0; font-size: 0.7rem; color: var(--st-danger); }
  .sb-ok { margin: 0; font-size: 0.7rem; color: var(--st-ok); }
</style>
