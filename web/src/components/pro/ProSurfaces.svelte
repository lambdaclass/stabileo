<script lang="ts">
  /**
   * The surface generator (`model/edit/surfaces.ts`): a cylinder, cone, spherical cap or zone,
   * hyperboloid or hyperbolic paraboloid as curved quadrilateral shells, placed with the ghost
   * (base centre as the anchor) or with its axis along two points picked in the model.
   */
  import { modelStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { placementStore } from '../../lib/store/placement.svelte';
  import { SURFACE_DEFAULTS, SURFACE_KINDS, surfaceFragment, surfaceMesh, type SurfaceKind, type SurfaceParams } from '../../lib/model/edit/surfaces';
  import { insertFragment } from '../../lib/model/edit/transformed-copy';
  import { compose, cross, dot, norm, rotation, translation, unit, type Vec3 } from '../../lib/model/edit/affine';

  let kind = $state<SurfaceKind>('cylinder');
  let params = $state<Record<SurfaceKind, SurfaceParams>>(Object.fromEntries(SURFACE_KINDS.map((k) => [k, { ...SURFACE_DEFAULTS[k] }])) as Record<SurfaceKind, SurfaceParams>);
  let materialId = $state(1);
  let thickness = $state(0.15);
  let done = $state<string | null>(null);

  const mesh = $derived(surfaceMesh(kind, params[kind]));
  const fragment = () => mesh ? surfaceFragment(mesh, materialId, thickness) : null;

  function place() {
    const f = fragment();
    if (!f) return;
    placementStore.start({ fragment: f, label: t(`surface.${kind}`), anchors: [[0, 0, 0]], onCommit: (r) => { if (r) done = tp('surface.done', { n: r.quads.length }); } });
  }

  /** The axis along two points: +Z turned onto p→q, the base centre at p. */
  function alongAxis() {
    placementStore.pickPoints(2, (k) => tp('surface.pickAxis', { k }), ([p, q]) => {
      const f = fragment();
      if (!f) return;
      const d = unit([q![0] - p![0], q![1] - p![1], q![2] - p![2]] as Vec3);
      const z: Vec3 = [0, 0, 1];
      const ax = cross(z, d);
      const ang = (Math.atan2(norm(ax), dot(z, d)) * 180) / Math.PI;
      const R = norm(ax) > 1e-12 ? rotation([0, 0, 0], ax, ang) : ang > 90 ? rotation([0, 0, 0], [1, 0, 0], 180) : translation([0, 0, 0]);
      const r = insertFragment(f, [compose(translation(p!), R)]);
      done = tp('surface.done', { n: r.quads.length });
    });
  }
</script>

<div class="sf" data-testid="surfaces">
  <p class="sf-hint">{t('surface.hint')}</p>
  <label class="sf-row">{t('surface.kind')}
    <select bind:value={kind} data-testid="sf-kind">{#each SURFACE_KINDS as k (k)}<option value={k}>{t(`surface.${k}`)}</option>{/each}</select>
  </label>
  <div class="sf-grid">
    {#each Object.keys(params[kind]) as key (kind + key)}
      <label>{t(`surface.field.${key}`)} <input type="number" step="0.5" bind:value={params[kind][key]} data-testid="sf-{key}" /></label>
    {/each}
  </div>
  <div class="sf-row">
    <label>{t('pro.thMaterial')} <select bind:value={materialId}>{#each [...modelStore.materials.values()] as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select></label>
    <label>{t('pro.thickness')} <input type="number" min="0.001" step="0.01" bind:value={thickness} /> m</label>
  </div>
  {#if mesh}<p class="sf-hint" data-testid="sf-summary">{tp('surface.summary', { quads: mesh.cells.length, nodes: mesh.points.length })}</p>
  {:else}<p class="sf-warn">{t('surface.invalid')}</p>{/if}
  <div class="sf-row">
    <button class="pro-btn pro-btn-accent" disabled={!mesh} onclick={place} data-testid="sf-place">{t('surface.place')}</button>
    <button class="pro-btn" disabled={!mesh} onclick={alongAxis} data-testid="sf-axis">{t('surface.axis')}</button>
  </div>
  {#if done}<p class="sf-hint" data-testid="sf-done">{done}</p>{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 5px; font-size: 0.68rem; color: var(--st-text-2); }
  .sf-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .sf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 8px; }
  .sf-grid label { display: flex; justify-content: space-between; gap: 4px; align-items: center; }
  .sf-grid input { width: 64px; }
  .sf-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .sf-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); }
</style>
