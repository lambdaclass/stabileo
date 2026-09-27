<script lang="ts">
  /**
   * How the shell contour is drawn (`store/contour-options.svelte.ts`) and the same field read
   * along a line: two points typed or picked on the model, the value sampled between them on the
   * shells they cross (`engine/shell-line.ts`), drawn against the distance and exportable.
   */
  import { modelStore, resultsStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { contourOptions } from '../../lib/store/contour-options.svelte';
  import { placementStore } from '../../lib/store/placement.svelte';
  import { editPreview } from '../../lib/store/edit-preview.svelte';
  import { downloadText } from '../../lib/store/file';
  import { shellContourField } from '../../lib/engine/shell-contour-field';
  import { sampleAlongLine, type V3 } from '../../lib/engine/shell-line';
  import { shellComponentMeta, shellComponentLabelKey } from '../../lib/engine/shell-stress';
  import { toCsv } from '../../lib/engine/result-tables';
  import XYChart from '../charts/XYChart.svelte';
  import { onDestroy } from 'svelte';

  const BANDS = [0, 5, 8, 10, 12, 16];
  const OWNER = 'shell-line';

  let aText = $state(''), bText = $state('');
  const parse = (s: string): V3 | null => {
    const v = s.split(/[;\s]+/).filter(Boolean).map((x) => Number(x.replace(',', '.')));
    return v.length === 3 && v.every(Number.isFinite) ? [v[0]!, v[1]!, v[2]!] : null;
  };
  const a = $derived(parse(aText)), b = $derived(parse(bText));
  const fmtP = (p: readonly number[]) => p.map((x) => +x.toFixed(3)).join('; ');

  function pick() {
    placementStore.pickPoints(2, (k) => tp('contour.line.pickN', { n: k }), (pts) => {
      if (pts.length === 2) { aText = fmtP(pts[0]!); bText = fmtP(pts[1]!); }
    });
  }

  const meta = $derived(shellComponentMeta(resultsStore.shellContourComponent));
  const samples = $derived.by(() => {
    const r = resultsStore.results3D;
    if (!r || !a || !b) return null;
    const nodesOf = (key: string) => (key.startsWith('p') ? modelStore.plates.get(+key.slice(1))?.nodes : modelStore.quads.get(+key.slice(1))?.nodes);
    const field = shellContourField({ plates: r.plateStresses ?? [], quads: r.quadStresses ?? [] }, nodesOf, resultsStore.shellContourComponent, contourOptions);
    const shells = [...field.corners].flatMap(([key, values]) => {
      const ids = nodesOf(key);
      const corners = ids?.map((id) => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] as V3 : null; });
      return corners && corners.every(Boolean) ? [{ corners: corners as V3[], values }] : [];
    });
    return sampleAlongLine(a, b, shells, 101);
  });
  const hits = $derived(samples ? samples.filter((s) => s.value !== null).length : 0);

  // The line on the model while it is being read.
  $effect(() => { if (a && b) editPreview.show(OWNER, null, [], [a as never, b as never]); else editPreview.clear(OWNER); });
  onDestroy(() => editPreview.clear(OWNER));

  function csv() {
    if (!samples) return;
    downloadText(toCsv(['s (m)', 'x (m)', 'y (m)', 'z (m)', `${meta.key} (${meta.unit})`],
      samples.map((s) => [s.s, s.point[0], s.point[1], s.point[2], s.value ?? ''])), 'shell-line.csv', 'text/csv;charset=utf-8');
  }
</script>

<div class="sco" data-testid="shell-contour-options">
  <div class="sco-row">
    <label><input type="radio" bind:group={contourOptions.at} value="nodes" data-testid="contour-at-nodes" /> {t('contour.atNodes')}</label>
    <label><input type="radio" bind:group={contourOptions.at} value="centre" data-testid="contour-at-centre" /> {t('contour.atCentre')}</label>
  </div>
  <div class="sco-row">
    <label><input type="checkbox" bind:checked={contourOptions.auto} data-testid="contour-auto" /> {t('contour.autoRange')}</label>
    {#if !contourOptions.auto}
      <label>{t('contour.min')} <input type="number" step="any" bind:value={contourOptions.min} data-testid="contour-min" /></label>
      <label>{t('contour.max')} <input type="number" step="any" bind:value={contourOptions.max} data-testid="contour-max" /></label>
      <span class="sco-unit">{meta.unit}</span>
    {/if}
  </div>
  <div class="sco-row">
    <label>{t('contour.bands')}
      <select bind:value={contourOptions.bands} data-testid="contour-bands">
        {#each BANDS as n (n)}<option value={n}>{n === 0 ? t('contour.smooth') : n}</option>{/each}
      </select>
    </label>
    <label><input type="checkbox" bind:checked={contourOptions.onDeformed} data-testid="contour-deformed" /> {t('contour.onDeformed')}</label>
  </div>

  <details class="sco-line" data-testid="shell-line">
    <summary>{t('contour.line.title')}</summary>
    <div class="sco-row">
      <label>A <input bind:value={aText} placeholder="x; y; z" data-testid="shell-line-a" /></label>
      <label>B <input bind:value={bText} placeholder="x; y; z" data-testid="shell-line-b" /></label>
      <button class="pk-btn" onclick={pick} data-testid="shell-line-pick">{t('contour.line.pick')}</button>
    </div>
    {#if samples}
      {#if hits === 0}
        <p class="sco-hint">{t('contour.line.noShell')}</p>
      {:else}
        <XYChart xs={samples.map((s) => s.s)} ys={samples.map((s) => s.value)} xLabel="s (m)" yLabel="{t(shellComponentLabelKey(meta.key))} ({meta.unit})" testid="shell-line-chart" />
        <div class="sco-row">
          <span class="sco-hint">{tp('contour.line.hits', { n: hits, of: samples.length })}</span>
          <button class="pk-btn" onclick={csv} data-testid="shell-line-csv">CSV</button>
        </div>
      {/if}
    {/if}
  </details>
</div>

<style>
  .sco { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; font-size: 0.64rem; color: var(--st-text-2); }
  .sco-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .sco-row label { display: inline-flex; gap: 4px; align-items: center; }
  .sco-row input[type='number'] { width: 64px; }
  .sco-row input:not([type]) { width: 96px; }
  .sco-unit, .sco-hint { font-size: 0.6rem; color: var(--st-text-3); margin: 0; }
  .sco-line summary { cursor: pointer; color: var(--st-text); }
  .sco :global(.pk-btn) { min-height: 22px; padding: 0.1rem 0.5rem; font-size: 0.62rem; }
</style>
