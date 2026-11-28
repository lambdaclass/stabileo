<script lang="ts">
  import { plateMeshReportMessage } from '../../../lib/store/plate-mesh-report';
  import PlateMeshSettings from './PlateMeshSettings.svelte';
  import { createPlateMeshPreview } from './plate-mesh-preview.svelte';
  import { uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { applyPlateMeshes, plateEntry, type PlateMeshPlan } from '../../../lib/store/physical-plates';
  import { plateRemeshMessage } from '../../../lib/engine/plate-analysis-refusal';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import { POOR_MIN_ANGLE } from '../../../lib/model/physical/plate';

  let { ids, onclose }: { ids: number[]; onclose: () => void } = $props();

  const preview = createPlateMeshPreview(() => ids);
  const plans = $derived(preview.plans);
  const progress = $derived(preview.progress);
  let applied = $state.raw<{ request: typeof preview.request; message: string } | null>(null);
  const result = $derived(applied?.request === preview.request ? applied.message : null);

  function apply() {
    const chosen = preview.take();
    if (!chosen) return;
    const r = applyPlateMeshes(chosen);
    uiStore.selectPlates(ids);
    applied = { request: preview.request, message: plateMeshReportMessage(r) };
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

    <PlateMeshSettings settings={preview.settings} />

    {#if progress}
      <div class="pmd-progress" data-testid="plate-mesh-progress">
        {tp('plates.planning', { done: progress.done, total: progress.total })}
        <button class="pmd-btn" onclick={preview.cancel}>{t('plates.stop')}</button>
      </div>
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
                <td class:warn={!!p.quality && p.quality.poor > 0}>{p.quality ? tp('plates.qualityCell', { angle: p.quality.minAngle.toFixed(0), poor: p.quality.poor }) : ''}</td>
              {:else}
                <td>{p.name}</td>
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
      <p class="pmd-hint">{tp('plates.planTotal', { cells: preview.cells, size: fmtQ(preview.settings.size, 'length'), unit: unitQ('length'), angle: POOR_MIN_ANGLE })}</p>
      {#if drawing}
        <svg class="pmd-svg" viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true">
          {#each drawing as pts, i (i)}<polygon points={pts} />{/each}
        </svg>
      {/if}
    {/if}

    {#if result}<p class="pmd-msg" data-testid="plate-mesh-result">{result}</p>{/if}
    <div class="pmd-actions">
      <button class="pmd-btn" onclick={onclose}>{t('plates.close')}</button>
      <button class="pmd-btn primary" disabled={!preview.accepted.length || !!progress} onclick={apply} data-testid="plate-mesh-apply">
        {preview.localLoads ? t('plates.applyDropping') : t('plates.apply')}
      </button>
    </div>
  </div>
</div>

<style>
  .pmd-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
  .pmd { width: min(520px, 100%); max-height: 90vh; overflow: auto; background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); padding: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 0.76rem; }
  h3 { margin: 0; font-size: 0.9rem; color: var(--st-text); }
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
