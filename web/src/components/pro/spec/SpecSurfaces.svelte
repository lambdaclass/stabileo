<script lang="ts">
  /**
   * Specifications › Surfaces: whether the selected quads are curved shells, and the offset of
   * the selected shells' mid-surface. Thickness is the shell's section, set where the shell is.
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';

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
</script>

<div class="sf" data-testid="spec-surfaces">
  <section>
    <h5>{t('pro.shellCurvature')}</h5>
    <p class="sf-hint">{t('pro.shellCurvatureHint')}</p>
    {#if selectedQuads.length === 0}
      <p class="sf-hint">{t('pro.shellCurvatureSelect')}</p>
    {:else}
      <div>{selectedQuads.length} {t('pro.selected')}</div>
      <p class="sf-hint" data-testid="curv-oop">{tp('pro.shellCurvatureOop', { mm: (selectedOutOfPlane * 1000).toFixed(1) })}</p>
      <label class="sf-row">
        <input type="checkbox" checked={selectedAllCurved} onchange={(e) => setSelectedCurved(e.currentTarget.checked)} data-testid="curv-toggle-check" />
        {t('pro.curvedShell')}
      </label>
    {/if}
  </section>

  <section>
    <h5>{t('pro.shellOffset')}</h5>
    <p class="sf-hint">{t('pro.shellOffsetHint')}</p>
    {#if selectedShellKeys.length === 0}
      <p class="sf-hint">{t('pro.shellOffsetSelect')}</p>
    {:else}
      <div>{selectedShellKeys.length} {t('pro.selected')}</div>
    {/if}
    <label class="sf-row">{t('pro.offsetFrame')}
      <select bind:value={offFrame}>
        <option value="local">{t('pro.offsetLocal')}</option>
        <option value="global">{t('pro.offsetGlobal')}</option>
      </select>
    </label>
    <div class="sf-row">
      <span>{offFrame === 'local' ? 'x, y, n (m)' : 'X, Y, Z (m)'}</span>
      <input type="number" bind:value={offX} step="0.01" />
      <input type="number" bind:value={offY} step="0.01" />
      <input type="number" bind:value={offZ} step="0.01" data-testid="shell-offset-z" />
    </div>
    {#if offFrame === 'local'}
      <div class="sf-row">
        <button onclick={() => applyHalfThickness(1)}>{t('pro.offsetTopFace')}</button>
        <button onclick={() => applyHalfThickness(-1)}>{t('pro.offsetBottomFace')}</button>
      </div>
    {/if}
    <div class="sf-row">
      <button class="sf-go" disabled={selectedShellKeys.length === 0} onclick={applyShellOffset} data-testid="shell-offset-apply">{t('pro.applyOffset')}</button>
      <button disabled={selectedShellKeys.length === 0} onclick={clearShellOffset}>{t('pro.clearOffset')}</button>
    </div>
    <p class="sf-warn">{t('pro.shellOffsetWarn')}</p>
  </section>
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 8px; padding: 6px 10px; font-size: 0.68rem; color: var(--st-text-2); }
  section { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--st-hair); padding-top: 6px; }
  section:first-child { border-top: none; padding-top: 0; }
  h5 { margin: 0; font-size: 0.66rem; font-weight: 600; color: var(--st-text); }
  .sf-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .sf-row input[type='number'] { width: 60px; }
  .sf-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .sf-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); }
  .sf-go { background: var(--st-accent); color: var(--st-text-on-accent); border: none; border-radius: var(--st-radius); padding: 2px 8px; }
</style>
