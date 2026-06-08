<script lang="ts">
  // Shell contour legend (CP2). Floats over the 3D viewport while a shell
  // contour colour map is active. Computes its own min/max from the shell
  // results so it never writes back into the results store, and samples the
  // SAME colour functions the contour uses so the gradient matches exactly.
  import { resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { divergingColor } from '../../lib/three/stress-heatmap';
  import { heatmapColor } from '../../lib/three/selection-helpers';
  import { shellComponentMeta, shellComponentRange } from '../../lib/engine/shell-stress';

  // Shell contour mode is selected (regardless of whether data exists).
  const shellMode = $derived(
    resultsStore.diagramType === 'colorMap'
    && (resultsStore.colorMapKind === 'shellVonMises' || resultsStore.colorMapKind === 'shellBending'),
  );
  const hasData = $derived(
    !!(resultsStore.results3D?.plateStresses?.length || resultsStore.results3D?.quadStresses?.length),
  );
  const active = $derived(shellMode && hasData);

  const meta = $derived(shellComponentMeta(resultsStore.shellContourComponent));

  const range = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r) return { min: 0, max: 0 };
    const all = [...(r.plateStresses ?? []), ...(r.quadStresses ?? [])];
    return shellComponentRange(all, resultsStore.shellContourComponent);
  });

  function hex(n: number): string {
    return '#' + n.toString(16).padStart(6, '0');
  }

  // Build a CSS gradient by sampling the contour colour function across the
  // value range, so the bar reads exactly like the painted shells.
  const gradient = $derived.by(() => {
    const { min, max } = range;
    const A = meta.signed ? Math.max(Math.abs(min), Math.abs(max)) : Math.max(max, 1e-12);
    const stops: string[] = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const v = min + t * (max - min);
      const norm = A > 1e-12 ? v / A : 0;
      const c = meta.signed ? divergingColor(norm) : heatmapColor(Math.max(0, norm));
      stops.push(`${hex(c)} ${(t * 100).toFixed(0)}%`);
    }
    return `linear-gradient(to top, ${stops.join(', ')})`;
  });

  function fmt(v: number): string {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e4 || a < 1e-2) return v.toExponential(1);
    return v.toFixed(a >= 100 ? 0 : 1);
  }

  const mid = $derived((range.min + range.max) / 2);
</script>

{#if shellMode && !hasData}
  <div class="shell-legend shell-legend-empty" role="status">
    <div class="legend-title">{meta.label}</div>
    <div class="legend-unavailable">{t('results.shellContourUnavailable')}</div>
  </div>
{:else if active}
  <div class="shell-legend" role="img" aria-label="Shell contour legend">
    <div class="legend-title">{meta.label}</div>
    <div class="legend-body">
      <div class="legend-bar" style="background:{gradient}"></div>
      <div class="legend-ticks">
        <span>{fmt(range.max)}</span>
        <span>{fmt(mid)}</span>
        <span>{fmt(range.min)}</span>
      </div>
    </div>
    <div class="legend-unit">{meta.unit}</div>
  </div>
{/if}

<style>
  .shell-legend {
    position: absolute;
    right: 12px;
    bottom: 64px;
    background: rgba(20, 24, 38, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 8px 10px;
    color: #e6e9f0;
    font-size: 11px;
    pointer-events: none;
    z-index: 20;
    user-select: none;
  }
  .legend-title { font-weight: 600; margin-bottom: 6px; text-align: center; }
  .legend-body { display: flex; gap: 6px; }
  .legend-bar {
    width: 14px;
    height: 96px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }
  .legend-ticks {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-variant-numeric: tabular-nums;
  }
  .legend-unit { margin-top: 5px; text-align: center; opacity: 0.7; }
  .legend-unavailable { font-size: 10px; opacity: 0.75; max-width: 140px; line-height: 1.3; }
  .shell-legend-empty { border-color: rgba(255, 179, 71, 0.5); }
</style>
