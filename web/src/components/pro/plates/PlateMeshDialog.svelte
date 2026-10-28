<script lang="ts">
  /**
   * Mesh one plate or many (`store/physical-plates.ts`): the settings they share, a plan of each
   * mesh before anything changes (count, quality, what kind of elements the mesher really gives,
   * what cannot be carried over), and one undo step to put them in.
   *
   * Planning runs plate by plate, with a frame between them, so a long batch shows its progress
   * and can be stopped; nothing reaches the model until Apply.
   */
  import { onDestroy, untrack } from 'svelte';
  import { uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { applyPlateMeshes, planPlateMeshes, plateEntry, type PlateMeshPlan } from '../../../lib/store/physical-plates';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import { POOR_MIN_ANGLE } from '../../../lib/model/physical/plate';
  import QuantityInput from '../loads/QuantityInput.svelte';

  let { ids, onclose }: { ids: number[]; onclose: () => void } = $props();

  // The settings it opens with: the first plate's own. Later changes to `ids` do not reset them.
  const first = untrack(() => plateEntry(ids[0]!)?.surface.mesh);
  let size = $state(first?.size ?? 0.5);
  let element = $state<'quad' | 'tri'>(first?.element ?? 'quad');
  let followMembers = $state(first?.followMembers ?? true);
  // A grid of rectangles or squares of the sides given, along the plate's first side or global X.
  let pattern = $state<'free' | 'rect' | 'square'>(first?.pattern ?? 'free');
  let sizeV = $state(first?.sizeV ?? first?.size ?? 0.5);
  let orient = $state<'plate' | 'globalX'>(first?.orient ?? 'plate');
  const gridOn = $derived(element === 'quad' && pattern !== 'free');
  let plans = $state<PlateMeshPlan[] | null>(null);
  let progress = $state<{ done: number; total: number } | null>(null);
  let result = $state<string | null>(null);
  let ctrl: AbortController | null = null;

  async function preview() {
    ctrl?.abort();
    ctrl = new AbortController();
    result = null;
    progress = { done: 0, total: ids.length };
    const r = await planPlateMeshes(ids, { size, element, followMembers, pattern, sizeV, orient }, { signal: ctrl.signal, onProgress: (done, total) => (progress = { done, total }) });
    progress = null;
    if (r) plans = r;
  }
  function cancel() { ctrl?.abort(); progress = null; }
  onDestroy(() => ctrl?.abort());
  // A first plan as soon as the dialog opens, and again when a setting changes.
  $effect(() => { void size; void element; void followMembers; void pattern; void sizeV; void orient; if (size > 0) untrack(() => void preview()); });

  const ok = $derived((plans ?? []).filter((p) => p.mesh));
  const totals = $derived({ cells: ok.reduce((s, p) => s + p.cells, 0), local: (plans ?? []).reduce((s, p) => s + p.localLoads, 0) });

  function apply() {
    if (!plans) return;
    const r = applyPlateMeshes(plans);
    uiStore.selectPlates(ids);
    result = tp('plates.meshApplied', { plates: r.plates, cells: r.cells })
      + (r.refused.length ? ' ' + tp('plates.meshRefusedSome', { n: r.refused.length }) : '')
      + (r.droppedLocalLoads ? ' ' + tp('plates.localLoadsDropped', { n: r.droppedLocalLoads }) : '');
    plans = null;
    if (!r.refused.length) onclose();
  }

  const kindOf = (p: PlateMeshPlan) => {
    if (!p.mesh) return '';
    const tri = p.mesh.cells.filter((c) => c.length === 3).length;
    if (p.spec.element === 'tri') return t('plates.meshKind.tri');
    if (p.grid) {
      const sides = { a: fmtQ(p.grid.cellA, 'length'), b: fmtQ(p.grid.cellB, 'length'), unit: unitQ('length') };
      const cells = Math.abs(p.grid.cellA - p.grid.cellB) < 1e-9 ? tp('plates.meshKind.squares', { n: p.grid.gridCells, ...sides }) : tp('plates.meshKind.rectangles', { n: p.grid.gridCells, ...sides });
      return p.grid.bandCells ? `${cells} ${tp('plates.meshKind.band', { n: p.grid.bandCells, tri: tri })}` : cells;
    }
    if (p.mesh.structured) return t('plates.meshKind.structured');
    return tri ? tp('plates.meshKind.mixed', { n: tri }) : t('plates.meshKind.fromTriangles');
  };

  // Flat drawing of a single plate's planned mesh.
  const W = 300, H = 200, PAD = 8;
  const drawing = $derived.by(() => {
    const p = plans?.length === 1 ? plans[0] : null;
    if (!p?.mesh || p.mesh.cells.length > 8000) return null;
    const { o, u, v } = p.mesh.plane;
    const uv = p.mesh.points.map((q) => { const d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; return [d[0]! * u[0] + d[1]! * u[1] + d[2]! * u[2], d[0]! * v[0] + d[1]! * v[1] + d[2]! * v[2]]; });
    const xs = uv.map((q) => q[0]!), ys = uv.map((q) => q[1]!);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-9), (H - 2 * PAD) / Math.max(y1 - y0, 1e-9));
    const sx = (x: number) => PAD + (x - x0) * k, sy = (y: number) => H - PAD - (y - y0) * k;
    return p.mesh.cells.map((c) => c.map((i) => `${sx(uv[i]![0]!).toFixed(1)},${sy(uv[i]![1]!).toFixed(1)}`).join(' '));
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<div class="pmd-overlay" onclick={onclose} role="presentation">
  <div class="pmd" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('plates.meshTitle')} data-testid="plate-mesh-dialog" tabindex="-1">
    <h3>{ids.length > 1 ? tp('plates.meshTitleMany', { n: ids.length }) : tp('plates.meshTitleOne', { name: plateEntry(ids[0]!)?.name ?? '' })}</h3>

    <div class="pmd-row">
      <div class="pmd-seg" role="group" aria-label={t('plates.element')}>
        <button class:on={element === 'quad'} aria-pressed={element === 'quad'} onclick={() => (element = 'quad')} data-testid="plate-mesh-quad">{t('plates.elementQuad')}</button>
        <button class:on={element === 'tri'} aria-pressed={element === 'tri'} onclick={() => (element = 'tri')} data-testid="plate-mesh-tri">{t('plates.elementTri')}</button>
      </div>
      <label>{gridOn ? t(pattern === 'square' ? 'plates.side' : 'plates.sideA') : t('plates.size')} <QuantityInput min={0.01} value={size} quantity="length" cls="pmd-num" testid="plate-mesh-size" onchange={(v) => { if (v > 0) size = v; }} /></label>
      {#if gridOn && pattern === 'rect'}
        <label>{t('plates.sideB')} <QuantityInput min={0.01} value={sizeV} quantity="length" cls="pmd-num" testid="plate-mesh-size-v" onchange={(v) => { if (v > 0) sizeV = v; }} /></label>
      {/if}
    </div>
    {#if element === 'quad'}
      <div class="pmd-row">
        <span>{t('plates.pattern')}</span>
        <div class="pmd-seg" role="group" aria-label={t('plates.pattern')}>
          <button class:on={pattern === 'free'} aria-pressed={pattern === 'free'} onclick={() => (pattern = 'free')} data-testid="plate-mesh-free">{t('plates.patternFree')}</button>
          <button class:on={pattern === 'rect'} aria-pressed={pattern === 'rect'} onclick={() => (pattern = 'rect')} data-testid="plate-mesh-rect">{t('plates.patternRect')}</button>
          <button class:on={pattern === 'square'} aria-pressed={pattern === 'square'} onclick={() => (pattern = 'square')} data-testid="plate-mesh-square">{t('plates.patternSquare')}</button>
        </div>
        {#if gridOn}
          <label>{t('plates.orient')}
            <select bind:value={orient} data-testid="plate-mesh-orient">
              <option value="plate">{t('plates.orientPlate')}</option>
              <option value="globalX">{t('plates.orientX')}</option>
            </select>
          </label>
        {/if}
      </div>
      {#if gridOn}<p class="pmd-hint">{t('plates.patternHint')}</p>{/if}
    {/if}
    <label class="pmd-check" title={t('plates.followMembersHint')}>
      <input type="checkbox" bind:checked={followMembers} data-testid="plate-mesh-follow" /> {t('plates.followMembers')}
    </label>
    <p class="pmd-hint">{t('plates.followMembersHint')}</p>

    {#if progress}
      <div class="pmd-progress" data-testid="plate-mesh-progress">
        {tp('plates.planning', { done: progress.done, total: progress.total })}
        <button class="pmd-btn" onclick={cancel}>{t('plates.stop')}</button>
      </div>
    {/if}

    {#if plans}
      <table class="pmd-table" data-testid="plate-mesh-plan">
        <thead><tr><th>{t('plates.plate')}</th><th>{t('plates.elements')}</th><th>{t('plates.kindHead')}</th><th>{t('plates.quality')}</th></tr></thead>
        <tbody>
          {#each plans as p (p.id)}
            <tr class:refused={!p.mesh}>
              <td>{p.name}</td>
              {#if p.mesh}
                <td>{p.cells}</td>
                <td>{kindOf(p)}</td>
                <td class:warn={!!p.quality && p.quality.poor > 0}>{p.quality ? tp('plates.qualityCell', { angle: p.quality.minAngle.toFixed(0), poor: p.quality.poor }) : ''}</td>
              {:else}
                <td colspan="3">{t(`plates.refused.${p.refused}`)}{p.refused === 'tooManyCells' ? ` (${p.cells})` : ''}</td>
              {/if}
            </tr>
            {#if p.localLoads || p.keptNodes}
              <tr class="pmd-note"><td colspan="4">
                {#if p.localLoads}{tp('plates.localLoadsWarn', { n: p.localLoads })}{/if}
                {#if p.keptNodes} {tp('plates.keptNodesNote', { n: p.keptNodes })}{/if}
              </td></tr>
            {/if}
          {/each}
        </tbody>
      </table>
      <p class="pmd-hint">{tp('plates.planTotal', { cells: totals.cells, size: fmtQ(size, 'length'), unit: unitQ('length'), angle: POOR_MIN_ANGLE })}</p>
      {#if drawing}
        <svg class="pmd-svg" viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true">
          {#each drawing as pts, i (i)}<polygon points={pts} />{/each}
        </svg>
      {/if}
    {/if}

    {#if result}<p class="pmd-msg" data-testid="plate-mesh-result">{result}</p>{/if}
    <div class="pmd-actions">
      <button class="pmd-btn" onclick={onclose}>{t('plates.close')}</button>
      <button class="pmd-btn primary" disabled={!ok.length || !!progress} onclick={apply} data-testid="plate-mesh-apply">
        {totals.local ? t('plates.applyDropping') : t('plates.apply')}
      </button>
    </div>
  </div>
</div>

<style>
  .pmd-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
  .pmd { width: min(520px, 100%); max-height: 90vh; overflow: auto; background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); padding: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 0.76rem; }
  h3 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  .pmd-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .pmd-row label, .pmd-check { display: inline-flex; gap: 5px; align-items: center; }
  .pmd select { padding: 2px 4px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; }
  .pmd :global(input.pmd-num) { width: 64px; padding: 2px 5px; background: var(--st-ink); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font-family: var(--st-font-mono, monospace); }
  .pmd-seg { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .pmd-seg button { padding: 3px 9px; background: none; border: none; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .pmd-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .pmd-seg button.on { background: var(--st-accent); color: #fff; }
  .pmd-hint { margin: 0; color: var(--st-text-3); font-size: 0.7rem; }
  .pmd-progress { display: flex; gap: 8px; align-items: center; }
  .pmd-table { width: 100%; border-collapse: collapse; }
  .pmd-table th, .pmd-table td { text-align: left; padding: 3px 5px; border-bottom: 1px solid var(--st-hair); }
  .pmd-table th { color: var(--st-text-3); font-weight: 500; }
  .pmd-table tr.refused td { color: var(--st-danger, #e06c6c); }
  .pmd-table td.warn, .pmd-note td { color: var(--st-warn, #d9a441); }
  .pmd-svg { background: var(--st-ink); border: 1px solid var(--st-hair); border-radius: var(--st-radius); align-self: center; }
  .pmd-svg polygon { fill: rgba(78, 205, 196, 0.12); stroke: var(--st-accent); stroke-width: 0.6; }
  .pmd-msg { margin: 0; color: var(--st-text); }
  .pmd-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .pmd-btn { padding: 4px 12px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .pmd-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .pmd-btn:disabled { opacity: 0.5; cursor: default; }
</style>
