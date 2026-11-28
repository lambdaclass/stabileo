<script lang="ts">
  import PlateMeshSettings from './PlateMeshSettings.svelte';
  import { createPlateMeshPreview } from './plate-mesh-preview.svelte';
  import Hint from '../Hint.svelte';
  import { uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { plateRemeshMessage } from '../../../lib/engine/plate-analysis-refusal';
  import { plateEntry, plateSides, plateStatus, type PlateMeshPlan } from '../../../lib/store/physical-plates';
  import { meshPlatesInModel } from '../../../lib/store/mesh-apply';
  import { meshProgress } from '../../../lib/store/mesh-progress.svelte';
  import MeshProgressBar from './MeshProgressBar.svelte';
  import { modelStore } from '../../../lib/store';
  import { unitQ } from '../../../lib/store/display-units.svelte';
  import { POOR_MIN_ANGLE } from '../../../lib/model/physical/plate';
  import { modalPortal } from '../../../lib/utils/portal';
  import { meshSizeText } from './plate-state';
  import { significantNumber } from '../../../lib/utils/unit-format';

  let { ids, onclose }: { ids: number[]; onclose: () => void } = $props();

  const preview = createPlateMeshPreview(() => ids);
  const plans = $derived(preview.plans);
  const progress = $derived(preview.progress);
  const { settings } = preview;
  const gridOn = $derived(settings.element === 'quad' && settings.pattern !== 'free');

  function apply() {
    if (meshProgress.now) return;
    const chosen = preview.take();
    if (!chosen) return;

    const of = [...ids];
    onclose();
    void meshPlatesInModel(chosen, of);
  }

  const remeshing = $derived(ids.filter((id) => plateStatus(id) === 'current' && !plateEntry(id)?.surface.meshed?.original).length);

  const kindOf = (p: PlateMeshPlan) => {
    if (!p.mesh) return '';
    const tri = p.mesh.cells.filter((c) => c.length === 3).length;
    if (p.spec.element === 'tri') return t('plates.meshKind.tri');
    if (p.grid) {
      const sides = { a: significantNumber(p.grid.cellA, 'length', uiStore.unitSystem, 3), b: significantNumber(p.grid.cellB, 'length', uiStore.unitSystem, 3), unit: unitQ('length') };
      const cells = Math.abs(p.grid.cellA - p.grid.cellB) < 1e-9 ? tp('plates.meshKind.squares', { n: p.grid.gridCells, ...sides }) : tp('plates.meshKind.rectangles', { n: p.grid.gridCells, ...sides });
      return p.grid.bandCells ? `${cells} ${tp('plates.meshKind.band', { n: p.grid.bandCells, tri: tri })}` : cells;
    }
    if (p.mesh.structured) return t('plates.meshKind.structured');
    return tri ? tp('plates.meshKind.mixed', { n: tri }) : t('plates.meshKind.fromTriangles');
  };

  const W = 360, H = 240, PAD = 26;
  const drawing = $derived.by(() => {
    const p = plans?.length === 1 ? plans[0] : null;
    if (!p?.mesh || p.mesh.cells.length > 8000) return null;
    const { o, u, v } = p.mesh.plane;
    const proj = (q: readonly number[]) => { const d = [q[0]! - o[0], q[1]! - o[1], q[2]! - o[2]]; return [d[0]! * u[0] + d[1]! * u[1] + d[2]! * u[2], d[0]! * v[0] + d[1]! * v[1] + d[2]! * v[2]] as [number, number]; };
    const uv = p.mesh.points.map(proj);
    const xs = uv.map((q) => q[0]), ys = uv.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.min((W - 2 * PAD) / Math.max(x1 - x0, 1e-9), (H - 2 * PAD) / Math.max(y1 - y0, 1e-9));
    const sx = (x: number) => PAD + (x - x0) * k, sy = (y: number) => H - PAD - (y - y0) * k;
    const cells = p.mesh.cells.map((c) => c.map((i) => `${sx(uv[i]![0]).toFixed(1)},${sy(uv[i]![1]).toFixed(1)}`).join(' '));
    let axes: { ax: number; ay: number; bx: number; by: number } | null = null;
    if (gridOn && p.aDir && p.bDir) {

      const on = (d: readonly number[]) => { const x = d[0]! * u[0] + d[1]! * u[1] + d[2]! * u[2], y = d[0]! * v[0] + d[1]! * v[1] + d[2]! * v[2]; const l = Math.hypot(x, y) || 1; return [x / l, -y / l] as const; };
      const [ax, ay] = on(p.aDir), [bx, by] = on(p.bDir);
      axes = { ax, ay, bx, by };
    }
    const side = plateSides(p.id)[0];
    const na = side && modelStore.nodes.get(side.from), nb = side && modelStore.nodes.get(side.to);
    const first = na && nb ? [proj([na.x, na.y, na.z ?? 0]), proj([nb.x, nb.y, nb.z ?? 0])].map(([x, y]) => [sx(x), sy(y)] as const) : null;
    return { cells, axes, first, origin: [sx(x0), sy(y0)] as const };
  });
  const totalSize = $derived(gridOn && settings.pattern === 'rect' ? `${significantNumber(settings.size, 'length', uiStore.unitSystem, 3)} × ${meshSizeText(settings.sizeV)}` : meshSizeText(settings.size));
</script>

<div class="pmd-host">
<dialog class="pmd-overlay" use:modalPortal aria-label={t('plates.meshTitle')}
  oncancel={(event) => { event.preventDefault(); onclose(); }}
  onclick={(event) => { if (event.target === event.currentTarget) onclose(); }}>
  <div class="pmd" data-testid="plate-mesh-dialog">
    <h3>{ids.length > 1 ? tp('plates.meshTitleMany', { n: ids.length }) : tp('plates.meshTitleOne', { name: plateEntry(ids[0]!)?.name ?? '' })}</h3>

    <PlateMeshSettings settings={preview.settings} />

    {#if progress}
      <div class="pmd-progress" data-testid="plate-mesh-progress">
        <MeshProgressBar phase="planning" done={progress.done} total={progress.total} />
        <button class="pmd-btn" onclick={preview.cancel}>{t('plates.stop')}</button>
      </div>
    {/if}
    {#if remeshing}
      <p class="pmd-note-line" data-testid="plate-mesh-remesh-note">{remeshing === ids.length ? (ids.length === 1 ? t('plates.remeshNoteOne') : tp('plates.remeshNoteAll', { n: remeshing })) : tp('plates.remeshNoteSome', { n: remeshing, total: ids.length })}</p>
    {/if}

    {#if plans}
      <table class="pmd-table" data-testid="plate-mesh-plan">
        <thead><tr><th>{t('plates.plate')}</th><th>{t('plates.elements')}</th><th>{t('plates.kindHead')}</th><th>{t('plates.quality')}</th></tr></thead>
        <tbody>
          {#each plans as p (p.id)}
            {@const block = p.refused && plateRemeshMessage(p.name, p.refused)}
            <tr class:refused={!p.mesh}>
              {#if block}
                <td colspan="4">{block}</td>
              {:else if p.mesh}
                <td>{p.name}</td>
                <td>{p.cells}</td>
                <td>{kindOf(p)}</td>
                <td class:warn={!!p.quality && p.quality.poor > 0}>{p.quality ? (p.quality.poor > 0 ? tp('plates.qualityPoor', { poor: p.quality.poor, cells: p.cells }) : tp('plates.qualityGood', { angle: p.quality.minAngle.toFixed(0) })) : ''}</td>
              {:else}
                <td>{p.name}</td>
                <td colspan="3">{t(`plates.refused.${p.refused}`)}{p.refused === 'tooManyCells' ? ` (${p.cells})` : ''}</td>
              {/if}
            </tr>
            {#if p.localLoads || p.keptNodes}
              <tr class="pmd-note"><td colspan="4">
                {#if p.localLoads}{p.localLoads === 1 ? t('plates.localLoadsWarnOne') : tp('plates.localLoadsWarn', { n: p.localLoads })}{/if}
                {#if p.keptNodes} {p.keptNodes === 1 ? t('plates.keptNodesNoteOne') : tp('plates.keptNodesNote', { n: p.keptNodes })}{/if}
              </td></tr>
            {/if}
          {/each}
        </tbody>
      </table>
      <p class="pmd-hint">{tp('plates.planTotalOnly', { cells: preview.cells, size: totalSize })}</p>
      {#if preview.accepted.some((p) => (p.quality?.poor ?? 0) > 0)}<Hint text={tp('plates.qualityHint', { angle: POOR_MIN_ANGLE })} />{/if}
      {#if drawing}
        <svg class="pmd-svg" viewBox="0 0 {W} {H}" width={W} height={H} role="img" aria-label={t('plates.drawingLabel')} data-testid="plate-mesh-drawing">
          {#each drawing.cells as pts, i (i)}<polygon points={pts} />{/each}
          {#if drawing.first && (!gridOn || settings.orient === 'plate')}
            <line class="pmd-first" x1={drawing.first[0]![0]} y1={drawing.first[0]![1]} x2={drawing.first[1]![0]} y2={drawing.first[1]![1]} />
            <text class="pmd-tag" x={(drawing.first[0]![0] + drawing.first[1]![0]) / 2} y={(drawing.first[0]![1] + drawing.first[1]![1]) / 2 + 14} text-anchor="middle" data-testid="plate-mesh-first-side">{t('plates.firstSide')}</text>
          {/if}
          {#if drawing.axes}
            {@const [ox, oy] = [drawing.origin[0] - 14, drawing.origin[1] + 14]}
            <g class="pmd-axes" data-testid="plate-mesh-axes">
              <line x1={ox} y1={oy} x2={ox + drawing.axes.ax * 34} y2={oy + drawing.axes.ay * 34} marker-end="url(#pmd-arrow)" />
              <line x1={ox} y1={oy} x2={ox + drawing.axes.bx * 34} y2={oy + drawing.axes.by * 34} marker-end="url(#pmd-arrow)" />
              <text x={ox + drawing.axes.ax * 56} y={oy + drawing.axes.ay * 56 + 4} text-anchor="middle">a (u)</text>
              <text x={ox + drawing.axes.bx * 50} y={oy + drawing.axes.by * 50 - 2} text-anchor="middle">b (v)</text>
            </g>
          {/if}
          <defs><marker id="pmd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
        </svg>
      {/if}
    {/if}

    <div class="pmd-actions">
      <button class="pmd-btn" onclick={onclose}>{t('plates.close')}</button>
      <button class="pmd-btn primary" disabled={!preview.accepted.length || !!progress || !!meshProgress.now} onclick={apply} data-testid="plate-mesh-apply">
        {preview.localLoads ? t('plates.applyDropping') : t('plates.apply')}
      </button>
    </div>
  </div>
</dialog>
</div>

<style>
  .pmd-host { display: contents; }
  .pmd-overlay { position: fixed; inset: 0; margin: 0; width: 100%; height: 100%; max-width: none; max-height: none; border: 0; background: transparent; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
  .pmd-overlay[open] { display: flex; }
  .pmd-overlay::backdrop { background: rgba(0, 0, 0, 0.45); }
  .pmd { width: min(520px, 100%); max-height: 90vh; overflow: auto; background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); padding: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 0.76rem; }
  h3 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
  .pmd-hint { margin: 0; color: var(--st-text-3); font-size: 0.7rem; }
  .pmd-progress { display: flex; gap: 8px; align-items: center; }
  .pmd-progress :global(.mpb) { flex: 1; }
  .pmd-table { width: 100%; border-collapse: collapse; }
  .pmd-table th, .pmd-table td { text-align: left; padding: 3px 5px; border-bottom: 1px solid var(--st-hair); }
  .pmd-table th { color: var(--st-text-3); font-weight: 500; }
  .pmd-table tr.refused td { color: var(--st-danger, #e06c6c); }
  .pmd-table td.warn, .pmd-note td { color: var(--st-warn, #d9a441); }
  .pmd-svg { background: var(--st-ink); border: 1px solid var(--st-hair); border-radius: var(--st-radius); align-self: center; }
  .pmd-svg { overflow: visible; }
  .pmd-svg polygon { fill: rgba(78, 205, 196, 0.12); stroke: var(--st-accent); stroke-width: 0.6; }
  .pmd-first { stroke: var(--st-text); stroke-width: 2.5; }
  .pmd-tag, .pmd-axes text { fill: var(--st-text); font-size: 10px; }
  .pmd-axes line { stroke: var(--st-text); stroke-width: 1.4; }
  .pmd-svg marker path { fill: var(--st-text); }
  .pmd-note-line { margin: 0; padding: 5px 8px; border-left: 2px solid var(--st-accent); background: var(--st-surface-2, rgba(255, 255, 255, 0.03)); color: var(--st-text-2); }
  .pmd-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .pmd-btn { padding: 4px 12px; background: var(--st-surface-3); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); font: inherit; cursor: pointer; }
  .pmd-btn.primary { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .pmd-btn:disabled { opacity: 0.5; cursor: default; }
</style>
