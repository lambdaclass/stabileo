<script lang="ts">
  import { i18n, tp } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import type { LineBar, LineLayout } from '../../../lib/rc-sheets/beam-line';
  import { barTrace, hookBack, hookTurn, lineSupports, stirrupPositions } from '../../../lib/rc-sheets/line-geometry';
  import { elevationLayout, textWidth, type LDim, type LText } from '../../../lib/rc-sheets/elevation-layout';
  import { chartHeight, filled, type ChartKind } from '../../../lib/rc-sheets/line-charts';
  import RcLineCharts from './RcLineCharts.svelte';

  let { line, marks = false, envelope = false, chart = 'moment', onBeam = false, cuts = [], highlight = [], foundation = false, tracks = true }: { line: LineLayout; marks?: boolean; envelope?: boolean; chart?: ChartKind; onBeam?: boolean; cuts?: Array<{ x: number; label: string }>; highlight?: string[]; tracks?: boolean; foundation?: boolean } = $props();
  const hl = (b: LineBar) => highlight.includes(b.mark);
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const W = 1200, M = 56, STUB = 10, TXT = 9.5;
  const x0 = $derived(Math.min(0, line.ends.from)), x1 = $derived(Math.max(line.length, line.ends.to));
  const sx = $derived((W - 2 * M) / Math.max(x1 - x0, 1e-6));
  const hMax = $derived(Math.max(...line.spans.map((s) => s.h), 0.1));
  const sy = $derived(84 / hMax);
  const X = (x: number) => M + (x - x0) * sx;
  const supports = $derived(lineSupports(line));
  const coverPx = $derived(Math.max(9, (line.cover + 0.012) * sy));
  const BELOW = $derived(Math.max(STUB, ...line.bars.flatMap((b) => [-hookTurn(b, 0), -hookTurn(b, 1)]).map((d) => d * sy - coverPx + 4)));
  const lay = $derived(elevationLayout({ line, X, depth: (k) => line.spans[k]!.h * sy, t: TXT, below: BELOW, marks, fmt, tr: tp, cuts, zeros: onBeam && line.envelope.length > 1, tracks }));
  const TOP = $derived(8 - lay.top);
  const yBeamBottom = $derived(TOP + hMax * sy);
  const bottomOf = (h: number) => TOP + h * sy;

  function trace(bar: LineBar): Array<{ x1: number; x2: number; y: number }> {
    if (bar.kind === 'bent') {
      const r = barTrace(line, bar)[0]!;
      return [{ x1: X(r.from), x2: X(r.to), y: TOP + (hMax - (bar.shape.pts.find((p) => p[0] >= r.from - 1e-9)?.[1] ?? 0)) * sy }];
    }
    const inner = bar.kind === 'continuous' ? 0 : 6;
    return barTrace(line, bar).map((g) => ({ x1: X(g.from), x2: X(g.to), y: bar.face === 'top' ? TOP + coverPx + inner : bottomOf(line.spans[g.span]!.h) - coverPx - inner }));
  }
  const hookTo = (bar: LineBar, y: number, end: 0 | 1) => y - hookTurn(bar, end) * sy;
  const ticks = $derived(stirrupPositions(line, (s) => Math.ceil(5 / sx / Math.max(s, 1e-6)))
    .map((p) => ({ x: X(p.x), y1: TOP + coverPx - 2, y2: bottomOf(line.spans[p.span]!.h) - coverPx + 2 })));

  const yAxisM = $derived(TOP + (hMax * sy) / 2);
  const muTop = $derived(Math.max(1e-6, ...line.envelope.flatMap((e) => [e.pos, e.neg])));
  const onBeamY = (m: number) => yAxisM + (m / muTop) * hMax * sy * 0.62;
  const muOnBeam = $derived({
    pos: filled(line.envelope.map((e) => X(e.x)), line.envelope.map((e) => onBeamY(e.pos)), yAxisM),
    neg: filled(line.envelope.map((e) => X(e.x)), line.envelope.map((e) => onBeamY(-e.neg)), yAxisM),
  });

  const yLay = (y: number) => TOP + y;
  const yChart = $derived(TOP + lay.bottom + 22);
  const showChart = $derived(envelope && (chart === 'steel' ? (line.steel?.length ?? 0) > 1 : line.envelope.length > 0));
  const yDim = $derived(showChart ? yChart + chartHeight(chart) : TOP + lay.bottom + 16);
  const H = $derived(yDim + 26);
  const anchorOf = (q: LText) => q.anchor;
</script>

{#snippet txt(q: LText, cls: string, testid?: string)}
  {#if q.leader}<line x1={q.leader[0]} y1={yLay(q.leader[1])} x2={q.leader[2]} y2={yLay(q.leader[3])} class="leader" />{/if}
  <text x={q.x} y={yLay(q.y)} class="{cls} {anchorOf(q)}" style="font-size: {q.size}px" data-testid={testid}>{q.text}</text>
{/snippet}
{#snippet dimension(d: LDim, testid?: string)}
  <line x1={d.x0} y1={yLay(d.y)} x2={d.x1} y2={yLay(d.y)} class="dimline" />
  <line x1={d.x0 - 3} y1={yLay(d.y) + 3} x2={d.x0 + 3} y2={yLay(d.y) - 3} class="dimline" />
  <line x1={d.x1 - 3} y1={yLay(d.y) + 3} x2={d.x1 + 3} y2={yLay(d.y) - 3} class="dimline" />
  {@render txt(d.text, 'small', testid)}
{/snippet}

<svg class="rcl" class:found={foundation} viewBox="0 0 {W} {H}" role="img" aria-label={line.name} data-testid="rc-line-svg">
  {#each supports as xs, j (j)}
    {@const w = Math.max(8, (line.supportWidths[j] || 0.2) * sx)}
    <rect x={X(xs) - w / 2} y={TOP - STUB} width={w} height={yBeamBottom - TOP + STUB + BELOW} class="col" />
    <line x1={X(xs)} y1={yLay(lay.top)} x2={X(xs)} y2={yDim + 6} class="axis" />
  {/each}
  {#each lay.posts as p, j (j)}
    {#if p.rect}<rect x={p.rect.x0} y={yLay(p.rect.y0)} width={p.rect.x1 - p.rect.x0} height={p.rect.y1 - p.rect.y0} class="post" data-testid="rc-line-post" />{/if}
    {#if p.name}{@render txt(p.name, 'postname')}{/if}
    {#if p.size}{@render txt(p.size, 'small')}{/if}
  {/each}
  {#each line.spans as s, i (i)}
    <rect x={X(s.x0)} y={TOP} width={(s.x1 - s.x0) * sx} height={s.h * sy} class="beam" />
  {/each}
  {#each ticks as tk, i (i)}
    <line x1={tk.x} y1={tk.y1} x2={tk.x} y2={tk.y2} class="stirrup" />
  {/each}
  {#each line.bars.filter((b) => b.kind === 'bent') as bar (bar.mark)}
    <polyline points={bar.shape.pts.map((p) => `${X(p[0]).toFixed(1)},${(TOP + (hMax - p[1]) * sy).toFixed(1)}`).join(' ')} class="bar bent" class:hl={hl(bar)} data-testid="rc-bent-bar" />
  {/each}
  {#each line.bars.filter((b) => b.kind !== 'bent') as bar (bar.mark)}
    {@const segs = trace(bar)}
    {#each segs as sg, i (i)}
      <line x1={sg.x1} y1={sg.y} x2={sg.x2} y2={sg.y} class="bar {bar.kind}" class:hl={hl(bar)} />
    {/each}
    {#if segs.length && bar.hooks[0]}<line x1={segs[0]!.x1} y1={segs[0]!.y} x2={segs[0]!.x1} y2={hookTo(bar, segs[0]!.y, 0)} class="bar {bar.kind}" />{/if}
    {#if segs.length && bar.hook180?.[0]}<line x1={segs[0]!.x1} y1={hookTo(bar, segs[0]!.y, 0)} x2={segs[0]!.x1 + hookBack(bar, 0) * sx} y2={hookTo(bar, segs[0]!.y, 0)} class="bar {bar.kind}" data-testid="rc-hook-180" />{/if}
    {#if segs.length && bar.hooks[1]}<line x1={segs[segs.length - 1]!.x2} y1={segs[segs.length - 1]!.y} x2={segs[segs.length - 1]!.x2} y2={hookTo(bar, segs[segs.length - 1]!.y, 1)} class="bar {bar.kind}" />{/if}
    {#if segs.length && bar.hook180?.[1]}<line x1={segs[segs.length - 1]!.x2} y1={hookTo(bar, segs[segs.length - 1]!.y, 1)} x2={segs[segs.length - 1]!.x2 + hookBack(bar, 1) * sx} y2={hookTo(bar, segs[segs.length - 1]!.y, 1)} class="bar {bar.kind}" data-testid="rc-hook-180" />{/if}
  {/each}
  {#each line.splices as sp, i (i)}
    {@const sg = line.spans.find((x) => sp.x >= x.x0 - 1e-9 && sp.x <= x.x1 + 1e-9) ?? line.spans[0]!}
    {@const y = sp.face === 'top' ? TOP + coverPx : bottomOf(sg.h) - coverPx}
    <line x1={X(sp.x - sp.length / 2)} y1={y} x2={X(sp.x + sp.length / 2)} y2={y} class="splice" />
  {/each}
  {#each lay.splices as q, i (i)}{@render txt(q, 'small', 'rc-splice-label')}{/each}
  {#if onBeam && line.envelope.length > 1}
    <g data-testid="rc-line-mu-on-beam">
      <path d={muOnBeam.pos} class="mu pos" />
      <path d={muOnBeam.neg} class="mu neg" />
      {#each lay.zeros as d, i (i)}
        {@const xz = supports.some((xs) => Math.abs(X(xs) - d.x0) < 0.5) ? d.x1 : d.x0}
        <line x1={xz} y1={yBeamBottom} x2={xz} y2={yLay(d.y) + 3} class="ext" />
        {@render dimension(d, 'rc-zero-dim')}
      {/each}
    </g>
  {/if}
  {#if lay.cuts.length}
    <g data-testid="rc-line-cuts">
      {#each lay.cuts as cut, i (i)}
        <line x1={cut.x} y1={yLay(cut.top.y)} x2={cut.x} y2={yLay(cut.bottom.y - cut.bottom.size)} class="cut" />
        {#each [cut.top, cut.bottom] as q, k (k)}
          <rect x={q.x - textWidth(q) / 2 - 3.5} y={yLay(q.y) - q.size - 1.5} width={textWidth(q) + 7} height={q.size + 4} rx="2" class="cutbox" />
          {@render txt(q, 'cutt', k === 0 ? 'rc-line-cut' : undefined)}
        {/each}
      {/each}
    </g>
  {/if}

  <g data-testid="rc-line-tracks">
    {#each lay.tracks as tr (tr.bar.mark)}
      {@const bar = tr.bar}
      {@const y = yLay(tr.y)}
      {#if tr.shape}
        <polyline points={tr.shape.map(([px, py]) => `${px.toFixed(1)},${yLay(py).toFixed(1)}`).join(' ')} class="bar bent" class:hl={hl(bar)} />
      {:else}
        <line x1={tr.x0} y1={y} x2={tr.x1} y2={y} class="bar {bar.kind}" class:hl={hl(bar)} data-testid="rc-track" data-mark={bar.mark} />
        {#if tr.hooks[0]}<polyline points="{tr.x0 + tr.back[0]},{y + tr.hooks[0]} {tr.x0},{y + tr.hooks[0]} {tr.x0},{y}" class="bar {bar.kind}" />{/if}
        {#if tr.hooks[1]}<polyline points="{tr.x1},{y} {tr.x1},{y + tr.hooks[1]} {tr.x1 + tr.back[1]},{y + tr.hooks[1]}" class="bar {bar.kind}" />{/if}
      {/if}
      {@render txt(tr.label, 'lab', 'rc-track-label')}
      {#each tr.dims as d, i (i)}
        <line x1={d.x0} y1={y} x2={d.x0} y2={yLay(d.y) + 3} class="ext" />
        <line x1={d.x1} y1={y} x2={d.x1} y2={yLay(d.y) + 3} class="ext" />
        {@render dimension(d, 'rc-setout')}
      {/each}
      {#each tr.legs as q, i (i)}{@render txt(q, 'small', 'rc-bent-leg')}{/each}
    {/each}
  </g>
  {#if marks}
    <g data-testid="rc-line-marks">
      {#each lay.tracks.filter((x) => x.bubble) as tr (tr.bar.mark)}
        <circle cx={tr.bubble!.x} cy={yLay(tr.bubble!.y)} r={tr.bubble!.r} class="mark onbeam {tr.bar.kind}" class:hl={hl(tr.bar)} data-testid={hl(tr.bar) ? 'rc-line-mark-hl' : undefined} data-mark={tr.bar.mark} />
        <text x={tr.bubble!.x} y={yLay(tr.bubble!.y) + 3.1} class="markt small-mark">{tr.bar.mark}</text>
      {/each}
    </g>
  {/if}

  {#each lay.zoneDims as d, i (i)}{@render dimension(d)}{/each}
  {#each lay.zones as q, i (i)}{@render txt(q, 'small', 'rc-zone-label')}{/each}

  {#if showChart}
    <RcLineCharts {line} {X} top={yChart} left={M} right={W - M} kind={chart} {fmt} />
  {/if}

  <line x1={X(0)} y1={yDim} x2={X(line.length)} y2={yDim} class="dimline" />
  {#each supports as xs, j (j)}<line x1={X(xs) - 4} y1={yDim + 4} x2={X(xs) + 4} y2={yDim - 4} class="dimline" />{/each}
  {#each line.spans as s, i (i)}
    <text x={X((s.x0 + s.x1) / 2)} y={yDim - 5} class="dim">{fmt(s.x1 - s.x0)}</text>
    <text x={X((s.x0 + s.x1) / 2)} y={yDim + 14} class="small middle">{s.name} · {fmt(s.b * 100, 0)}×{fmt(s.h * 100, 0)}</text>
  {/each}
</svg>

<style>
  .rcl { width: 100%; height: auto; background: var(--st-surface-2); border: 1px solid var(--st-hair); border-radius: 6px; margin-bottom: 8px; }
  .beam { fill: rgba(128, 128, 128, 0.08); stroke: var(--st-text-3); stroke-width: 0.8; opacity: 0.9; }
  .col { fill: rgba(128, 128, 128, 0.22); stroke: var(--st-text-3); stroke-width: 0.6; }
  .post { fill: rgba(128, 128, 128, 0.18); stroke: var(--st-text-3); stroke-width: 0.8; }
  .axis { stroke: var(--st-text-3); stroke-width: 0.6; stroke-dasharray: 6 3 1 3; }
  .stirrup { stroke: var(--st-text-3); stroke-width: 0.7; opacity: 0.7; }
  .found .bar, .found .mark { stroke: #b8692e; }
  .found .stirrup { stroke: #9c8068; opacity: 0.9; }
  .bar { stroke-width: 2.2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .bar.continuous { stroke: #6fb3d9; }
  .bar.support { stroke: var(--st-danger); }
  .bar.span { stroke: var(--st-ok); }
  .bar.bent { stroke: #b48cf2; }
  .mark.bent { stroke: #b48cf2; }
  .splice { stroke: var(--st-warn); stroke-width: 4; opacity: 0.6; }
  .dimline { stroke: var(--st-text-3); stroke-width: 0.8; }
  .ext { stroke: var(--st-text-3); stroke-width: 0.5; stroke-dasharray: 2 2; opacity: 0.8; }
  .leader { stroke: var(--st-text-3); stroke-width: 0.6; }
  .dim { font-size: 11px; fill: var(--st-text-2); text-anchor: middle; font-family: var(--st-mono); }
  .lab { fill: var(--st-text-2); font-family: var(--st-mono); }
  .postname { fill: var(--st-text-2); font-weight: 700; font-family: var(--st-mono); }
  .small { font-size: 9.5px; fill: var(--st-text-3); font-family: var(--st-mono); }
  .start { text-anchor: start; }
  .middle { text-anchor: middle; }
  .end { text-anchor: end; }
  .mark { fill: none; stroke-width: 1.4; }
  .mark.continuous { stroke: #6fb3d9; }
  .mark.support { stroke: var(--st-danger); }
  .mark.span { stroke: var(--st-ok); }
  .markt { font-size: 10px; font-weight: 700; fill: var(--st-text); text-anchor: middle; font-family: var(--st-mono); }
  .mark.onbeam { fill: var(--st-surface-2); }
  .small-mark { font-size: 9px; }
  .bar.hl { stroke-width: 4.4; filter: drop-shadow(0 0 3px var(--st-warn)); }
  .mark.hl { stroke: var(--st-warn); stroke-width: 2.6; fill: color-mix(in srgb, var(--st-warn) 30%, var(--st-surface-2)); }
  .cut { stroke: #f0b84a; stroke-width: 1; stroke-dasharray: 4 2; }
  .cutbox { fill: var(--st-surface-2); stroke: #f0b84a; stroke-width: 1; }
  .cutt { font-weight: 700; fill: #f0b84a; font-family: var(--st-mono); }
  .mu { stroke: none; }
  .mu.pos { fill: rgba(78, 205, 196, 0.22); }
  .mu.neg { fill: rgba(232, 93, 74, 0.22); }
</style>
