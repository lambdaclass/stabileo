<script lang="ts">
  import { i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { stirrupsLabel } from '../../../lib/rc-sheets/bars';
  import type { LineLayout } from '../../../lib/rc-sheets/beam-line';

  let { line }: { line: LineLayout } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const W = 1200, M = 40, top = 70, band = 50;
  const sx = $derived((W - 2 * M) / Math.max(line.length, 1e-6));
  const X = (x: number) => M + x * sx;
  const supports = $derived([0, ...line.spans.map((s) => s.x1)]);
  const lanes = $derived.by(() => {
    const out = new Map<string, number>();
    let t = 0, b = 0;
    for (const bar of line.bars) {
      if (bar.kind === 'continuous') { out.set(bar.mark, 0); continue; }
      if (bar.face === 'top') out.set(bar.mark, 1 + (t++ % 2)); else out.set(bar.mark, 1 + (b++ % 2));
    }
    return out;
  });
  const yOf = (face: 'top' | 'bottom', lane: number) => (face === 'top' ? top + 6 + lane * 7 : top + band - 6 - lane * 7);
  const H = top + band + 70;
</script>

<svg class="rcl" viewBox="0 0 {W} {H}" role="img" aria-label={line.name} data-testid="rc-line-svg">
  {#each line.spans as s (s.name)}
    <rect x={X(s.x0)} y={top} width={(s.x1 - s.x0) * sx} height={band} class="beam" />
    <text x={X((s.x0 + s.x1) / 2)} y={top + band + 52} class="dim">{s.name} · {fmt(s.x1 - s.x0)} m · {fmt(s.b * 100, 0)}×{fmt(s.h * 100, 0)}</text>
  {/each}
  {#each supports as xs, j (j)}
    <rect x={X(xs) - 5} y={top - 18} width="10" height={band + 36} class="col" />
  {/each}
  {#each line.bars as bar (bar.mark)}
    {@const y = yOf(bar.face, lanes.get(bar.mark) ?? 0)}
    <line x1={X(bar.from)} y1={y} x2={X(bar.to)} y2={y} class="bar {bar.kind}" />
    {#if bar.hooks[0]}<line x1={X(bar.from)} y1={y} x2={X(bar.from)} y2={bar.face === 'top' ? y + 10 : y - 10} class="bar {bar.kind}" />{/if}
    {#if bar.hooks[1]}<line x1={X(bar.to)} y1={y} x2={X(bar.to)} y2={bar.face === 'top' ? y + 10 : y - 10} class="bar {bar.kind}" />{/if}
    <text x={X((bar.from + bar.to) / 2)} y={bar.face === 'top' ? top - 24 - (lanes.get(bar.mark) ?? 0) * 12 : top + band + 14 + (lanes.get(bar.mark) ?? 0) * 12} class="lab">
      {bar.mark}: {bar.bars.count} Ø{bar.bars.dia} · {fmt(bar.length)} m
    </text>
  {/each}
  {#each line.zones as z, i (i)}
    <line x1={X(z.from)} y1={top + band / 2} x2={X(z.to)} y2={top + band / 2} class="zone" />
    <text x={X((z.from + z.to) / 2)} y={top + band / 2 - 3} class="zt">{stirrupsLabel(z.stirrups)}</text>
  {/each}
  {#each line.splices as sp, i (i)}
    <rect x={X(sp.x - sp.length / 2)} y={sp.face === 'top' ? top + 2 : top + band - 10} width={sp.length * sx} height="8" class="splice" />
  {/each}
</svg>

<style>
  .rcl { width: 100%; height: auto; background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: 6px; margin-bottom: 8px; }
  .beam { fill: none; stroke: var(--st-text-3); stroke-width: 1; }
  .col { fill: var(--st-surface-3, #555); opacity: 0.6; }
  .bar { stroke-width: 2.4; fill: none; }
  .bar.continuous { stroke: var(--st-text); }
  .bar.support { stroke: var(--st-danger); }
  .bar.span { stroke: var(--st-ok); }
  .lab { font-size: 10px; fill: var(--st-text-2); text-anchor: middle; font-family: var(--st-mono); }
  .dim { font-size: 10px; fill: var(--st-text-3); text-anchor: middle; }
  .zone { stroke: var(--st-text-3); stroke-dasharray: 2 3; stroke-width: 1; }
  .zt { font-size: 9px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .splice { fill: var(--st-warn); opacity: 0.45; }
</style>
