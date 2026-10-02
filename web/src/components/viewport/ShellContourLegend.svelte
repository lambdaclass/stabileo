<script lang="ts">
  // Shell contour legend (CP2). Floats over the 3D viewport while a shell
  // contour colour map is active. Computes its own min/max from the shell
  // results so it never writes back into the results store, and samples the
  // SAME colour functions the contour uses so the gradient matches exactly.
  import { resultsStore, modelStore } from '../../lib/store';
  import { contourOptions } from '../../lib/store/contour-options.svelte';
  import { shellContourField } from '../../lib/engine/shell-contour-field';
  import { bandValue, bandEdges } from '../../lib/engine/contour-scale';
  import { t } from '../../lib/i18n';
  import { shellContourColor } from '../../lib/three/stress-heatmap';
  import { shellComponentLabelKey, shellComponentMeta, shellComponentStats } from '../../lib/engine/shell-stress';

  // Shell contour mode is selected (regardless of whether data exists).
  const shellMode = $derived(
    resultsStore.diagramType === 'colorMap'
    && (resultsStore.colorMapKind === 'shellVonMises'
      || resultsStore.colorMapKind === 'shellBending'
      /* The combined stress view paints shells too, unless that kind is off —
         and a painted field with no scale beside it is a picture of nothing. */
      || (resultsStore.colorMapKind === 'stress' && resultsStore.stressShowShells)),
  );
  const hasData = $derived(
    !!(resultsStore.results3D?.plateStresses?.length || resultsStore.results3D?.quadStresses?.length),
  );
  const active = $derived(shellMode && hasData);
  /*
   * "No shell results" is news only when shells were asked for: a shell map, or the combined
   * stress view on a model that has shells. On a model of bars the combined view paints the bars,
   * and a card saying there is nothing to contour sat beside them.
   */
  const modelHasShells = $derived((modelStore.model.plates?.size ?? 0) + (modelStore.model.quads?.size ?? 0) > 0);
  const sayEmpty = $derived(shellMode && !hasData && (resultsStore.colorMapKind !== 'stress' || modelHasShells));

  const meta = $derived(shellComponentMeta(resultsStore.shellContourComponent));

  const allShells = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r) return [];
    return [...(r.plateStresses ?? []), ...(r.quadStresses ?? [])];
  });

  // The same field the shells are painted from, so the scale reads what they show.
  const range = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r) return { min: 0, max: 0 };
    return shellContourField(
      { plates: r.plateStresses ?? [], quads: r.quadStresses ?? [] },
      (key) => (key.startsWith('p') ? modelStore.plates.get(+key.slice(1))?.nodes : modelStore.quads.get(+key.slice(1))?.nodes),
      resultsStore.shellContourComponent,
      contourOptions,
    ).range;
  });
  const bands = $derived(contourOptions.bands);

  // Honest status of the selected component for THIS result set.
  const stat = $derived(shellComponentStats(allShells)[resultsStore.shellContourComponent]);

  function hex(n: number): string {
    return '#' + n.toString(16).padStart(6, '0');
  }

  // Build a CSS gradient by sampling the contour colour function across the
  // value range, so the bar reads exactly like the painted shells.
  const gradient = $derived.by(() => {
    const { min, max } = range;
    const stops: string[] = [];
    /* Twenty stops, not ten: the ramp has five hues now, so ten samples put a
       visible corner at each of them. Same function the shells are painted
       with, so the bar cannot say a different thing from the model. */
    if (bands > 0) {
      // One hard-edged block per band, in the colour the band paints.
      for (let k = 0; k < bands; k++) {
        const c = hex(shellContourColor(bandValue(min + ((k + 0.5) / bands) * (max - min), min, max, bands), min, max));
        stops.push(`${c} ${((k / bands) * 100).toFixed(2)}%`, `${c} ${(((k + 1) / bands) * 100).toFixed(2)}%`);
      }
      return `linear-gradient(to top, ${stops.join(', ')})`;
    }
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const v = min + t * (max - min);
      stops.push(`${hex(shellContourColor(v, min, max))} ${(t * 100).toFixed(0)}%`);
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

{#if sayEmpty}
  <div class="shell-legend shell-legend-empty" role="status">
    <div class="legend-title">{t(shellComponentLabelKey(meta.key))}</div>
    <div class="legend-unavailable">{t('results.shellContourUnavailable')}</div>
  </div>
{:else if active && stat?.status === 'negligible'}
  <div class="shell-legend shell-legend-flat" role="status">
    <div class="legend-title">{t(shellComponentLabelKey(meta.key))} <span class="legend-unit-inline">[{meta.unit}]</span></div>
    <div class="legend-flat-note">{t('results.shellContourNegligible')}</div>
    <div class="legend-flat-range">{t('shell.peak')} ≈ {fmt(stat.peak)} {meta.unit}</div>
  </div>
{:else if active}
  <div class="shell-legend" role="img" aria-label={t('shell.legend')}>
    <div class="legend-title">{t(shellComponentLabelKey(meta.key))} <span class="legend-unit-inline">[{meta.unit}]</span></div>
    {#if stat?.status === 'uniform'}
      <div class="legend-flat-note">{t('results.shellContourUniform').replace('{v}', fmt(mid) + ' ' + meta.unit)}</div>
    {:else}
      <div class="legend-body">
        <div class="legend-bar" style="background:{gradient}"></div>
        <div class="legend-ticks">
          {#if bands > 0 && bands <= 8}
            {#each bandEdges(range.min, range.max, bands).reverse() as v, i (i)}<span>{fmt(v)}</span>{/each}
          {:else}
            <span>{fmt(range.max)}</span>
            <span>{fmt(mid)}</span>
            <span>{fmt(range.min)}</span>
          {/if}
        </div>
      </div>
    {/if}
    <div class="legend-unit">{meta.unit}{#if !contourOptions.auto} · {t('contour.fixedRange')}{/if}{#if contourOptions.at === 'centre'} · {t('contour.atCentre')}{/if}</div>
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
  .legend-unit-inline { font-weight: 400; opacity: 0.6; font-size: 10px; }
  .legend-unavailable { font-size: 10px; opacity: 0.75; max-width: 140px; line-height: 1.3; }
  .shell-legend-empty { border-color: rgba(255, 179, 71, 0.5); }
  .shell-legend-flat { border-color: rgba(120, 140, 170, 0.5); }
  .legend-flat-note { font-size: 10px; opacity: 0.85; max-width: 150px; line-height: 1.35; }
  .legend-flat-range { font-size: 10px; opacity: 0.6; margin-top: 4px; font-variant-numeric: tabular-nums; }
</style>
