<script lang="ts">
  /**
   * Specifications › Surfaces: whether the selected quads are curved shells, and the offset of
   * the selected shells' mid-surface. Thickness is the shell's section, set where the shell is.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import ProFoundationSprings from '../ProFoundationSprings.svelte';
  import SpecEmpty from './SpecEmpty.svelte';

  /* ── Curvature, on a shell that already exists ─────────────────────
   *
   * The `curved` flag was settable only while CREATING a quad, so "is this a
   * cáscara" had to be decided before the geometry was on screen, and a slab
   * whose corner is later lifted out of plane had no way to say so. Quads
   * only: three points are coplanar by definition, which is the same reason
   * the creator offers the tick only at four corners.
   */
  const selectedQuads = $derived(
    [...uiStore.selectedShells]
      .filter((k) => k[0] === 'q')
      .map((k) => modelStore.model.quads.get(parseInt(k.slice(1))))
      .filter((q): q is NonNullable<typeof q> => !!q),
  );
  /** Out-of-plane distance of a quad's fourth corner, metres, or null. */
  function quadOutOfPlane(nodes: [number, number, number, number]): number | null {
    const ns = nodes.map((id) => modelStore.nodes.get(id));
    if (ns.some((n) => !n)) return null;
    const p = ns.map((n) => ({ x: n!.x, y: n!.y ?? 0, z: (n! as { z?: number }).z ?? 0 }));
    const u = { x: p[1].x - p[0].x, y: p[1].y - p[0].y, z: p[1].z - p[0].z };
    const v = { x: p[2].x - p[0].x, y: p[2].y - p[0].y, z: p[2].z - p[0].z };
    const nx = u.y * v.z - u.z * v.y, ny = u.z * v.x - u.x * v.z, nz = u.x * v.y - u.y * v.x;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return null;
    const w = { x: p[3].x - p[0].x, y: p[3].y - p[0].y, z: p[3].z - p[0].z };
    return Math.abs((w.x * nx + w.y * ny + w.z * nz) / len);
  }
  const selectedAllCurved = $derived(selectedQuads.length > 0 && selectedQuads.every((q) => q.curved));
  /** The largest out-of-plane distance in the selection — what is at stake. */
  const selectedOutOfPlane = $derived.by(() => {
    let max = 0;
    for (const q of selectedQuads) max = Math.max(max, quadOutOfPlane(q.nodes) ?? 0);
    return max;
  });
  function setSelectedCurved(on: boolean) {
    modelStore.batch(() => {
      for (const q of selectedQuads) modelStore.setQuadCurved(q.id, on);
    });
  }

  // ─── Shell offset editor (operates on the selected shells) ───
  let offFrame = $state<'global' | 'local'>('local');
  let offX = $state(0);
  let offY = $state(0);
  let offZ = $state(0);
  const selectedShellKeys = $derived([...uiStore.selectedShells]);
  const shellOf = (key: string) => {
    const id = parseInt(key.slice(1));
    return key[0] === 'p' ? modelStore.model.plates.get(id) : modelStore.model.quads.get(id);
  };
  /*
   * The fields show what the selection holds: its offset when every shell has the same, "mixed"
   * when they differ. They used to open at zero whatever the shells carried, so reading an offset
   * meant overwriting it.
   */
  const current = $derived.by(() => {
    const offs = selectedShellKeys.map((k) => JSON.stringify(shellOf(k)?.offset ?? null));
    if (!offs.length) return { mixed: false, off: null as null | { frame: 'global' | 'local'; x: number; y: number; z: number } };
    return offs.every((o) => o === offs[0]) ? { mixed: false, off: JSON.parse(offs[0]!) } : { mixed: true, off: null };
  });
  $effect(() => {
    const c = current;
    if (c.off) { offFrame = c.off.frame; offX = c.off.x; offY = c.off.y; offZ = c.off.z; }
    else if (!c.mixed) { offX = 0; offY = 0; offZ = 0; }
  });

  function eachSelectedShell(fn: (kind: 'plate' | 'quad', id: number) => void) {
    for (const key of uiStore.selectedShells) {
      fn(key[0] === 'p' ? 'plate' : 'quad', parseInt(key.slice(1)));
    }
  }
  // One undo step for the whole selection.
  function applyShellOffset() {
    modelStore.batch(() => eachSelectedShell((kind, id) => modelStore.setShellOffset(kind, id, { frame: offFrame, x: offX, y: offY, z: offZ })));
  }
  function clearShellOffset() {
    modelStore.batch(() => eachSelectedShell((kind, id) => modelStore.setShellOffset(kind, id, undefined)));
  }
  /** Quick preset: offset along the shell normal by ±half its thickness so the
   *  top/bottom face sits at the node plane (slab top-of-beam, wall face). */
  function applyHalfThickness(sign: 1 | -1) {
    // Each shell by its own thickness: a slab and its thicker drop panel both get their face
    // on the node plane. The first shell's used to be applied to all.
    offFrame = 'local';
    modelStore.batch(() => eachSelectedShell((kind, id) => {
      const shell = kind === 'plate' ? modelStore.model.plates.get(id) : modelStore.model.quads.get(id);
      if (shell) modelStore.setShellOffset(kind, id, { frame: 'local', x: 0, y: 0, z: sign * shell.thickness / 2 });
    }));
  }
</script>

{#if selectedShellKeys.length === 0}
  <SpecEmpty kind="shells" items={[
    { title: 'pro.shellCurvature', hint: 'spec.item.curvature' },
    { title: 'pro.shellOffset', hint: 'spec.item.shellOffset' },
    { title: 'foundation.title', hint: 'spec.item.foundation' },
  ]} />
{:else}
<div class="pk" data-testid="spec-surfaces">
  <p class="sf-title">{tp('spec.surfaces.title', { n: selectedShellKeys.length })}</p>

  <section class="pk-card">
    <h4 class="pk-heading">{t('pro.shellCurvature')}</h4>
    <p class="pk-hint">{t('pro.shellCurvatureHint')}</p>
    {#if selectedQuads.length === 0}
      <p class="pk-hint">{t('pro.shellCurvatureSelect')}</p>
    {:else}
      <p class="pk-hint" data-testid="curv-oop">{tp('pro.shellCurvatureOop', { mm: (selectedOutOfPlane * 1000).toFixed(1) })}</p>
      <label class="pk-check">
        <input type="checkbox" checked={selectedAllCurved} onchange={(e) => setSelectedCurved(e.currentTarget.checked)} data-testid="curv-toggle-check" />
        {t('pro.curvedShell')}
      </label>
    {/if}
  </section>

  <section class="pk-card">
    <h4 class="pk-heading">{t('pro.shellOffset')}</h4>
    <p class="pk-hint">{t('pro.shellOffsetHint')}</p>
    {#if current.mixed}<p class="pk-hint" data-testid="shell-offset-mixed">{t('behaviour.mixed')}</p>{/if}
    <label class="pk-row">{t('pro.offsetFrame')}
      <select bind:value={offFrame}>
        <option value="local">{t('pro.offsetLocal')}</option>
        <option value="global">{t('pro.offsetGlobal')}</option>
      </select>
    </label>
    <div class="pk-row">
      <span class="pk-label">{offFrame === 'local' ? 'x, y, n (m)' : 'X, Y, Z (m)'}</span>
      <input class="sf-num" type="number" bind:value={offX} step="0.01" aria-label={offFrame === 'local' ? 'x' : 'X'} />
      <input class="sf-num" type="number" bind:value={offY} step="0.01" aria-label={offFrame === 'local' ? 'y' : 'Y'} />
      <input class="sf-num" type="number" bind:value={offZ} step="0.01" data-testid="shell-offset-z" aria-label={offFrame === 'local' ? 'n' : 'Z'} />
    </div>
    {#if offFrame === 'local'}
      <div class="pk-row">
        <button class="pk-btn" onclick={() => applyHalfThickness(1)}>{t('pro.offsetTopFace')}</button>
        <button class="pk-btn" onclick={() => applyHalfThickness(-1)}>{t('pro.offsetBottomFace')}</button>
      </div>
    {/if}
    <div class="pk-row">
      <button class="pk-btn pk-btn-primary" onclick={applyShellOffset} data-testid="shell-offset-apply">{t('pro.applyOffset')}</button>
      <button class="pk-btn" onclick={clearShellOffset}>{t('pro.clearOffset')}</button>
    </div>
    <p class="pk-hint">{t('pro.shellOffsetWarn')}</p>
  </section>

  <!-- On the selected shells, as the rest of this part: here the pointer picks shells. -->
  <section class="pk-card">
    <h4 class="pk-heading">{t('foundation.title')}</h4>
    <ProFoundationSprings />
  </section>
</div>
{/if}

<style>
  .sf-title { margin: 0; font-weight: 600; color: var(--st-text); font-size: 0.74rem; }
  .sf-num { width: 64px; }
</style>
