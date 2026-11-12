<script lang="ts">
  import { i18n, t } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { stirrupsLabel } from '../../../lib/rc-sheets/bars';
  import type { LineBar, LineLayout } from '../../../lib/rc-sheets/beam-line';

  let { line, marks = false }: { line: LineLayout; marks?: boolean } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const W = 1200, M = 56, TOP = 40, STUB = 22, BELOW = 12, ROW = 30;
  const sx = $derived((W - 2 * M) / Math.max(line.length, 1e-6));
  const hMax = $derived(Math.max(...line.spans.map((s) => s.h), 0.1));
  const sy = $derived(84 / hMax);
  const X = (x: number) => M + x * sx;
  const supports = $derived([0, ...line.spans.map((s) => s.x1)]);
  const bottomOf = (h: number) => TOP + h * sy;
  const yBeamBottom = $derived(bottomOf(hMax));
  const coverPx = $derived(Math.max(9, (line.cover + 0.012) * sy));
  const spanAt = (x: number) => line.spans.find((s) => x >= s.x0 - 1e-9 && x <= s.x1 + 1e-9) ?? line.spans[0]!;

  /** A bar's trace inside the beam, span by span (the depth may change between spans). */
  function trace(bar: LineBar): Array<{ x1: number; x2: number; y: number }> {
    const inner = bar.kind === 'continuous' ? 0 : 6;
    return line.spans.filter((s) => s.x1 > bar.from + 1e-6 && s.x0 < bar.to - 1e-6).map((s) => ({
      x1: X(Math.max(s.x0, bar.from)), x2: X(Math.min(s.x1, bar.to)),
      y: bar.face === 'top' ? TOP + coverPx + inner : bottomOf(s.h) - coverPx - inner,
    }));
  }
  const hookTo = (bar: LineBar, y: number) => (bar.face === 'top' ? y + 10 : y - 10);

  const ticks = $derived(line.zones.flatMap((z) => {
    const s = spanAt((z.from + z.to) / 2), step = Math.max(z.stirrups.spacing, 5 / sx), out: number[] = [];
    for (let x = z.from + Math.min(0.05, z.stirrups.spacing / 2); x <= z.to - 1e-6; x += step) out.push(x);
    return out.map((x) => ({ x: X(x), y1: TOP + coverPx - 2, y2: bottomOf(s.h) - coverPx + 2 }));
  }));

  /** The distances a bar's ends keep from the support axes it is set out from. */
  function setOut(bar: LineBar): [string, string] | null {
    if (bar.kind === 'continuous') return null;
    if (bar.kind === 'support') {
      const xs = supports.reduce((p, q) => (Math.abs(q - (bar.from + bar.to) / 2) < Math.abs(p - (bar.from + bar.to) / 2) ? q : p));
      return [fmt(xs - bar.from), fmt(bar.to - xs)];
    }
    const s = spanAt((bar.from + bar.to) / 2);
    return [fmt(bar.from - s.x0), fmt(s.x1 - bar.to)];
  }
  const yDim = $derived(yBeamBottom + BELOW + 36);
  const ySchedule = $derived(yDim + 34);
  const H = $derived(ySchedule + line.bars.length * ROW + 8);
</script>

<svg class="rcl" viewBox="0 0 {W} {H}" role="img" aria-label={line.name} data-testid="rc-line-svg">
  {#each supports as xs, j (j)}
    {@const w = Math.max(8, (line.supportWidths[j] || 0.2) * sx)}
    <rect x={X(xs) - w / 2} y={TOP - STUB} width={w} height={yBeamBottom - TOP + STUB + BELOW} class="col" />
    <line x1={X(xs)} y1={TOP - STUB - 6} x2={X(xs)} y2={yDim + 6} class="axis" />
  {/each}
  {#each line.spans as s, i (i)}
    <rect x={X(s.x0)} y={TOP} width={(s.x1 - s.x0) * sx} height={s.h * sy} class="beam" />
  {/each}
  {#each ticks as tk, i (i)}
    <line x1={tk.x} y1={tk.y1} x2={tk.x} y2={tk.y2} class="stirrup" />
  {/each}
  {#each line.bars as bar (bar.mark)}
    {@const segs = trace(bar)}
    {#each segs as sg, i (i)}
      <line x1={sg.x1} y1={sg.y} x2={sg.x2} y2={sg.y} class="bar {bar.kind}" />
    {/each}
    {#if segs.length && bar.hooks[0]}<line x1={segs[0]!.x1} y1={segs[0]!.y} x2={segs[0]!.x1} y2={hookTo(bar, segs[0]!.y)} class="bar {bar.kind}" />{/if}
    {#if segs.length && bar.hooks[1]}<line x1={segs[segs.length - 1]!.x2} y1={segs[segs.length - 1]!.y} x2={segs[segs.length - 1]!.x2} y2={hookTo(bar, segs[segs.length - 1]!.y)} class="bar {bar.kind}" />{/if}
  {/each}
  {#if marks}
    <g data-testid="rc-line-marks">
      {#each line.bars as bar (bar.mark)}
        {@const segs = trace(bar)}
        {#if segs.length}
          {@const mid = segs.reduce((a, b) => (b.x2 - b.x1 > a.x2 - a.x1 ? b : a))}
          {@const cy = bar.face === 'top' ? mid.y - 13 : mid.y + 13}
          <circle cx={(mid.x1 + mid.x2) / 2} cy={cy} r="7.5" class="mark onbeam {bar.kind}" />
          <text x={(mid.x1 + mid.x2) / 2} y={cy + 3.2} class="markt small-mark">{bar.mark}</text>
        {/if}
      {/each}
    </g>
  {/if}
  {#each line.splices as sp, i (i)}
    {@const sg = line.spans.find((x) => sp.x >= x.x0 - 1e-9 && sp.x <= x.x1 + 1e-9) ?? line.spans[0]!}
    {@const y = sp.face === 'top' ? TOP + coverPx : bottomOf(sg.h) - coverPx}
    <line x1={X(sp.x - sp.length / 2)} y1={y} x2={X(sp.x + sp.length / 2)} y2={y} class="splice" />
    <text x={X(sp.x)} y={sp.face === 'top' ? y + 14 : y - 7} class="small">{t('rcSheets.line.splice')} {fmt(sp.length * 100, 0)} cm</text>
  {/each}
  {#each line.zones as z, i (i)}
    <text x={X((z.from + z.to) / 2)} y={yBeamBottom + BELOW + 12} class="small">{stirrupsLabel(z.stirrups)}</text>
  {/each}

  <line x1={X(0)} y1={yDim} x2={X(line.length)} y2={yDim} class="dimline" />
  {#each supports as xs, j (j)}<line x1={X(xs) - 4} y1={yDim + 4} x2={X(xs) + 4} y2={yDim - 4} class="dimline" />{/each}
  {#each line.spans as s, i (i)}
    <text x={X((s.x0 + s.x1) / 2)} y={yDim - 5} class="dim">{fmt(s.x1 - s.x0)}</text>
    <text x={X((s.x0 + s.x1) / 2)} y={yDim + 14} class="small">{s.name} · {fmt(s.b * 100, 0)}×{fmt(s.h * 100, 0)}</text>
  {/each}

  {#each line.bars as bar, n (bar.mark)}
    {@const y = ySchedule + n * ROW + 16}
    {@const so = setOut(bar)}
    <circle cx={M - 26} cy={y} r="9" class="mark {bar.kind}" />
    <text x={M - 26} y={y + 3.5} class="markt">{bar.mark}</text>
    <line x1={X(bar.from)} y1={y} x2={X(bar.to)} y2={y} class="bar {bar.kind}" />
    {#if bar.hooks[0]}<line x1={X(bar.from)} y1={y} x2={X(bar.from)} y2={bar.face === 'top' ? y + 8 : y - 8} class="bar {bar.kind}" />{/if}
    {#if bar.hooks[1]}<line x1={X(bar.to)} y1={y} x2={X(bar.to)} y2={bar.face === 'top' ? y + 8 : y - 8} class="bar {bar.kind}" />{/if}
    <text x={X((bar.from + bar.to) / 2)} y={y - 5} class="lab">{bar.bars.count} Ø{bar.bars.dia} · L = {fmt(bar.length)} m</text>
    {#if so}
      <text x={X(bar.from) + 3} y={y + 12} class="small start">{so[0]}</text>
      <text x={X(bar.to) - 3} y={y + 12} class="small end">{so[1]}</text>
    {/if}
  {/each}
</svg>

<style>
  .rcl { width: 100%; height: auto; background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: 6px; margin-bottom: 8px; }
  .beam { fill: rgba(128, 128, 128, 0.08); stroke: var(--st-text-3); stroke-width: 0.8; stroke-dasharray: none; opacity: 0.9; }
  .col { fill: rgba(128, 128, 128, 0.22); stroke: var(--st-text-3); stroke-width: 0.6; }
  .axis { stroke: var(--st-text-3); stroke-width: 0.6; stroke-dasharray: 6 3 1 3; }
  .stirrup { stroke: var(--st-text-3); stroke-width: 0.7; opacity: 0.7; }
  .bar { stroke-width: 2.2; fill: none; stroke-linecap: round; }
  .bar.continuous { stroke: var(--st-text); }
  .bar.support { stroke: var(--st-danger); }
  .bar.span { stroke: var(--st-ok); }
  .splice { stroke: var(--st-warn); stroke-width: 4; opacity: 0.6; }
  .dimline { stroke: var(--st-text-3); stroke-width: 0.8; }
  .dim { font-size: 11px; fill: var(--st-text-2); text-anchor: middle; font-family: var(--st-mono); }
  .lab { font-size: 10.5px; fill: var(--st-text-2); text-anchor: middle; font-family: var(--st-mono); }
  .small { font-size: 9.5px; fill: var(--st-text-3); text-anchor: middle; font-family: var(--st-mono); }
  .small.start { text-anchor: start; }
  .small.end { text-anchor: end; }
  .mark { fill: none; stroke-width: 1.4; }
  .mark.continuous { stroke: var(--st-text); }
  .mark.support { stroke: var(--st-danger); }
  .mark.span { stroke: var(--st-ok); }
  .markt { font-size: 10px; font-weight: 700; fill: var(--st-text); text-anchor: middle; font-family: var(--st-mono); }
  .mark.onbeam { fill: var(--st-surface-2); }
  .small-mark { font-size: 9px; }
</style>
