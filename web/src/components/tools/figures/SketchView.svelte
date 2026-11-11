<script lang="ts">
  import type { View } from '../../examples/define';
  import { fieldColour } from './colour';

  let { view, height = 220, label }: { view: View; height?: number; label: string } = $props();
  let width = $state(0);
  const PAD = 8;
  const CLASSES = ['member', 'result', 'load'];

  const tall = $derived.by(() => {
    const [x0, y0, x1, y1] = view.bounds;
    return Math.round(Math.min(height, Math.max(height * 0.45, (Math.max(width, 1) - 2 * PAD) * (y1 - y0) / (x1 - x0 || 1) + 2 * PAD)));
  });
  const fit = $derived.by(() => {
    const [x0, y0, x1, y1] = view.bounds;
    const w = Math.max(width, 1);
    const s = Math.max(1e-9, Math.min((w - 2 * PAD) / (x1 - x0 || 1), (tall - 2 * PAD) / (y1 - y0 || 1)));
    return { s, ox: (w - s * (x1 - x0)) / 2 - s * x0, oy: (tall + s * (y1 - y0)) / 2 + s * y0 };
  });
  const px = (x: number) => fit.ox + fit.s * x;
  const py = (y: number) => fit.oy - fit.s * y;
  const signed = $derived(view.range.min < 0);
  const node = (k: number): [number, number] => [px(view.xy[2 * k]), py(view.xy[2 * k + 1])];
  const cellCount = $derived(view.cells.length / view.cellSize);
  const cellValue = (c: number) => {
    if (view.perCell) return view.values[c];
    let sum = 0;
    for (let j = 0; j < view.cellSize; j++) sum += view.values[view.cells[c * view.cellSize + j]];
    return sum / view.cellSize;
  };
  const groups = $derived.by(() => {
    if (!view.geometryOnly || view.cellSize !== 2) return [];
    const paths = new Map<number, string>();
    for (let c = 0; c < cellCount; c++) {
      const [ax, ay] = node(view.cells[2 * c]), [bx, by] = node(view.cells[2 * c + 1]);
      const category = Math.round(view.values[c]);
      paths.set(category, `${paths.get(category) ?? ''}M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`);
    }
    return [...paths].sort(([a], [b]) => (a === 1 ? 1 : 0) - (b === 1 ? 1 : 0));
  });
  const shapes = $derived.by(() => {
    if (view.geometryOnly && view.cellSize === 2) return [];
    return Array.from({ length: cellCount }, (_, c) => ({
      points: Array.from({ length: view.cellSize }, (_, j) => node(view.cells[c * view.cellSize + j]).map(v => v.toFixed(1)).join(',')).join(' '),
      colour: fieldColour(signed, cellValue(c), view.range.min, view.range.max),
    }));
  });
  const marker = $derived(view.peak && width > 0 ? { x: px(view.peak.at[0]), y: py(view.peak.at[1]) } : null);
</script>

<div class="sketch" bind:clientWidth={width} style:height={`${tall}px`}>
  {#if width > 0}
    <svg {width} height={tall} role="img" aria-label={label}>
      {#each shapes as shape, k (k)}
        {#if view.cellSize === 2}
          <polyline points={shape.points} style:stroke={shape.colour} class="field-line" />
        {:else}
          <polygon points={shape.points} style:fill={shape.colour} class="field-cell" />
        {/if}
      {/each}
      {#each groups as [category, d] (category)}
        <path {d} class={CLASSES[category] ?? 'member'} />
      {/each}
      {#if marker}
        <circle cx={marker.x} cy={marker.y} r="4.5" class="peak-dot" data-testid="sketch-peak" />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .sketch { width: 100%; min-height: 1px; }
  svg { display: block; overflow: visible; }
  path, polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .member { stroke: var(--fg-2); stroke-width: 2; }
  .load { stroke: var(--fg); stroke-width: 1.25; opacity: 0.75; }
  .result { stroke: var(--lp-accent); stroke-width: 2.25; }
  .field-line { stroke-width: 3; }
  .field-cell { stroke: var(--card, #0f1e2b); stroke-width: 0.5; }
  .peak-dot { fill: var(--lp-accent); stroke: var(--card, #0f1e2b); stroke-width: 2; }
</style>
