<script lang="ts">
  import { i18n, t } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { stirrupsLabel } from '../../../lib/rc-sheets/bars';
  import type { LineBar, LineLayout } from '../../../lib/rc-sheets/beam-line';
  import { barTrace, hookLegOf, lineSupports, setOut as setOutOf, stirrupPositions } from '../../../lib/rc-sheets/line-geometry';

  let { line, marks = false, envelope = false, cuts = [], highlight = [] }: { line: LineLayout; marks?: boolean; envelope?: boolean; cuts?: Array<{ x: number; label: string }>; highlight?: string[] } = $props();
  const hl = (b: LineBar) => highlight.includes(b.mark);
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const W = 1200, M = 56, TOP = 40, STUB = 22, BELOW = 12, ROW = 30;
  const x0 = $derived(Math.min(0, line.ends.from)), x1 = $derived(Math.max(line.length, line.ends.to));
  const sx = $derived((W - 2 * M) / Math.max(x1 - x0, 1e-6));
  const hMax = $derived(Math.max(...line.spans.map((s) => s.h), 0.1));
  const sy = $derived(84 / hMax);
  const X = (x: number) => M + (x - x0) * sx;
  const supports = $derived(lineSupports(line));
  const bottomOf = (h: number) => TOP + h * sy;
  const yBeamBottom = $derived(bottomOf(hMax));
  const coverPx = $derived(Math.max(9, (line.cover + 0.012) * sy));

  function trace(bar: LineBar): Array<{ x1: number; x2: number; y: number }> {
    if (bar.kind === 'bent') {
      const r = barTrace(line, bar)[0]!;
      return [{ x1: X(r.from), x2: X(r.to), y: TOP + (hMax - (bar.shape.pts.find((p) => p[0] >= r.from - 1e-9)?.[1] ?? 0)) * sy }];
    }
    const inner = bar.kind === 'continuous' ? 0 : 6;
    return barTrace(line, bar).map((g) => ({ x1: X(g.from), x2: X(g.to), y: bar.face === 'top' ? TOP + coverPx + inner : bottomOf(line.spans[g.span]!.h) - coverPx - inner }));
  }
  const hookTo = (bar: LineBar, y: number) => {
    const leg = Math.max(8, Math.min(hMax * sy - 2 * coverPx, hookLegOf(bar) * sy));
    return bar.face === 'top' ? y + leg : y - leg;
  };

  const ticks = $derived(stirrupPositions(line, (s) => Math.ceil(5 / sx / Math.max(s, 1e-6)))
    .map((p) => ({ x: X(p.x), y1: TOP + coverPx - 2, y2: bottomOf(line.spans[p.span]!.h) - coverPx + 2 })));

  function setOut(bar: LineBar): [string, string] | null {
    const so = setOutOf(line, bar);
    return so ? [fmt(so.d[0]), fmt(so.d[1])] : null;
  }
  const ENV_M = 96, ENV_V = 88, ENV_GAP = 18;
  const yEnv = $derived(yBeamBottom + BELOW + 30);
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  const muTop = $derived(Math.max(1e-6, ...line.envelope.flatMap((e) => [e.pos, e.neg])));
  const vuTop = $derived(Math.max(1e-6, ...line.shear.flatMap((e) => [e.vPos, e.vNeg])));
  const mMax = $derived(Math.max(1.25 * muTop, Math.min(1.05 * phiMTop, 3 * muTop))), vMax = $derived(Math.max(1.25 * vuTop, Math.min(1.05 * phiVTop, 3 * vuTop)));
  const phiMTop = $derived(Math.max(0, ...line.envelope.flatMap((e) => [finite(e.phiPos), finite(e.phiNeg)])));
  const phiVTop = $derived(Math.max(0, ...line.shear.map((e) => finite(e.phiVn))));
  const yDimEnvelope = $derived(yV + ENV_V / 2 + 14);
  const yM = $derived(yEnv + ENV_M / 2);
  const yV = $derived(yEnv + ENV_M + ENV_GAP + ENV_V / 2);
  const mY = (m: number) => yM + (m / mMax) * (ENV_M / 2 - 4);
  const vY = (v: number) => yV - (v / vMax) * (ENV_V / 2 - 4);
  const path = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  /** Mu below the axis where it sags and above where it hogs, as it is drawn on the tension side. */
  const muPos = $derived(path([[X(line.envelope[0]?.x ?? 0), yM], ...line.envelope.map((e) => [X(e.x), mY(e.pos)] as [number, number]), [X(line.envelope[line.envelope.length - 1]?.x ?? 0), yM]]) + ' Z');
  const muNeg = $derived(path([[X(line.envelope[0]?.x ?? 0), yM], ...line.envelope.map((e) => [X(e.x), mY(-e.neg)] as [number, number]), [X(line.envelope[line.envelope.length - 1]?.x ?? 0), yM]]) + ' Z');
  /** A capacity line split where it leaves the scale: the part inside drawn, the part outside held at the edge, faint. */
  function capacity(pts: Array<{ x: number; v: number }>, top: number, toY: (v: number) => number): { inside: string; outside: string } {
    const inside: string[] = [], outside: string[] = [];
    let a: Array<[number, number]> = [], b: Array<[number, number]> = [];
    const flush = () => { if (a.length > 1) inside.push(path(a)); if (b.length > 1) outside.push(path(b)); a = []; b = []; };
    let was: boolean | null = null;
    for (const p of pts) {
      const over = Math.abs(p.v) > top;
      if (was !== null && over !== was) { const keep = (over ? a : b).at(-1); flush(); if (keep) (over ? b : a).push(keep); }
      (over ? b : a).push([X(p.x), toY(Math.sign(p.v) * Math.min(Math.abs(p.v), top))]);
      was = over;
    }
    flush();
    return { inside: inside.join(' '), outside: outside.join(' ') };
  }
  const phiPos = $derived(capacity(line.envelope.map((e) => ({ x: e.x, v: finite(e.phiPos) })), mMax, mY));
  const phiNeg = $derived(capacity(line.envelope.map((e) => ({ x: e.x, v: -finite(e.phiNeg) })), mMax, mY));
  const vuPos = $derived(path([[X(line.shear[0]?.x ?? 0), yV], ...line.shear.map((e) => [X(e.x), vY(e.vPos)] as [number, number]), [X(line.shear[line.shear.length - 1]?.x ?? 0), yV]]) + ' Z');
  const vuNeg = $derived(path([[X(line.shear[0]?.x ?? 0), yV], ...line.shear.map((e) => [X(e.x), vY(-e.vNeg)] as [number, number]), [X(line.shear[line.shear.length - 1]?.x ?? 0), yV]]) + ' Z');
  const phiVPos = $derived(capacity(line.shear.map((e) => ({ x: e.x, v: finite(e.phiVn) })), vMax, vY));
  const phiVNeg = $derived(capacity(line.shear.map((e) => ({ x: e.x, v: -finite(e.phiVn) })), vMax, vY));
  const yDim = $derived(envelope && line.envelope.length ? yDimEnvelope + 16 : yBeamBottom + BELOW + 36);
  const ySchedule = $derived(yDim + 34);
  const rowTop = $derived(line.bars.reduce<number[]>((acc, b, i) => { acc.push(i ? acc[i - 1]! + (line.bars[i - 1]!.kind === 'bent' ? 2 * ROW : ROW) : 0); return acc; }, []));
  const H = $derived(ySchedule + line.bars.reduce((acc, b) => acc + (b.kind === 'bent' ? 2 * ROW : ROW), 0) + 8);
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
  {#each line.bars.filter((b) => b.kind === 'bent') as bar (bar.mark)}
    <polyline points={bar.shape.pts.map((p) => `${X(p[0]).toFixed(1)},${(TOP + (hMax - p[1]) * sy).toFixed(1)}`).join(' ')} class="bar bent" class:hl={hl(bar)} data-testid="rc-bent-bar" />
  {/each}
  {#each line.bars.filter((b) => b.kind !== 'bent') as bar (bar.mark)}
    {@const segs = trace(bar)}
    {#each segs as sg, i (i)}
      <line x1={sg.x1} y1={sg.y} x2={sg.x2} y2={sg.y} class="bar {bar.kind}" class:hl={hl(bar)} />
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
          <circle cx={(mid.x1 + mid.x2) / 2} cy={cy} r="7.5" class="mark onbeam {bar.kind}" class:hl={hl(bar)} data-testid={hl(bar) ? 'rc-line-mark-hl' : undefined} data-mark={bar.mark} />
          <text x={(mid.x1 + mid.x2) / 2} y={cy + 3.2} class="markt small-mark">{bar.mark}</text>
        {/if}
      {/each}
    </g>
  {/if}
  {#if cuts.length}
    <g data-testid="rc-line-cuts">
      {#each cuts as cut, i (i)}
        <line x1={X(cut.x)} y1={TOP - STUB - 2} x2={X(cut.x)} y2={yBeamBottom + BELOW - 2} class="cut" />
        <rect x={X(cut.x) - 8} y={TOP - STUB - 16} width="16" height="13" rx="2" class="cutbox" />
        <text x={X(cut.x)} y={TOP - STUB - 6} class="cutt" data-testid="rc-line-cut">{cut.label}</text>
        <rect x={X(cut.x) - 8} y={yBeamBottom + BELOW - 2} width="16" height="13" rx="2" class="cutbox" />
        <text x={X(cut.x)} y={yBeamBottom + BELOW + 8} class="cutt">{cut.label}</text>
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

  {#if envelope && line.envelope.length}
    <g data-testid="rc-line-envelope">
      <line x1={X(0)} y1={yM} x2={X(line.length)} y2={yM} class="envaxis" />
      <path d={muPos} class="mu pos" />
      <path d={muNeg} class="mu neg" />
      <path d={phiPos.inside} class="phim" data-testid="rc-env-phimn-pos" />
      <path d={phiNeg.inside} class="phim" />
      <path d={phiPos.outside} class="phim off" />
      <path d={phiNeg.outside} class="phim off" />
      <text x={M - 6} y={yM - ENV_M / 2 + 10} class="small end">Mu⁻</text>
      <text x={M - 6} y={yM + ENV_M / 2 - 2} class="small end">Mu⁺</text>
      <text x={W - M + 4} y={yM - ENV_M / 2 + 10} class="small start">φMn</text>
      <line x1={X(0)} y1={yV} x2={X(line.length)} y2={yV} class="envaxis" />
      <path d={vuPos} class="vu" />
      <path d={vuNeg} class="vu" />
      <path d={phiVPos.inside + ' ' + phiVNeg.inside} class="phiv" data-testid="rc-env-phivn" />
      <path d={phiVPos.outside + ' ' + phiVNeg.outside} class="phiv off" />
      <text x={M - 6} y={yV - ENV_V / 2 + 10} class="small end">Vu</text>
      <text x={W - M + 4} y={yV - ENV_V / 2 + 10} class="small start">±φVn</text>
      <text x={W - M + 4} y={yM + 4} class="small start">{fmt(muTop, 0)}</text>
      <text x={W - M + 4} y={yV - 2} class="small start">{fmt(vuTop, 0)}</text>
      {#if phiMTop > mMax}<text x={W - M + 4} y={yM + ENV_M / 2 - 2} class="small start" data-testid="rc-env-phimn-off">↧ {fmt(phiMTop, 0)}</text>{/if}
      {#if phiVTop > vMax}<text x={W - M + 4} y={yV - ENV_V / 2 + 22} class="small start" data-testid="rc-env-phivn-off">↥ {fmt(phiVTop, 0)}</text>{/if}
    </g>
  {/if}

  <line x1={X(0)} y1={yDim} x2={X(line.length)} y2={yDim} class="dimline" />
  {#each supports as xs, j (j)}<line x1={X(xs) - 4} y1={yDim + 4} x2={X(xs) + 4} y2={yDim - 4} class="dimline" />{/each}
  {#each line.spans as s, i (i)}
    <text x={X((s.x0 + s.x1) / 2)} y={yDim - 5} class="dim">{fmt(s.x1 - s.x0)}</text>
    <text x={X((s.x0 + s.x1) / 2)} y={yDim + 14} class="small">{s.name} · {fmt(s.b * 100, 0)}×{fmt(s.h * 100, 0)}</text>
  {/each}

  {#each line.bars as bar, n (bar.mark)}
    {@const y = ySchedule + rowTop[n]! + (bar.kind === 'bent' ? ROW : 0) + 16}
    {@const so = setOut(bar)}
    <circle cx={M - 26} cy={y} r="9" class="mark {bar.kind}" class:hl={hl(bar)} />
    <text x={M - 26} y={y + 3.5} class="markt">{bar.mark}</text>
    {#if bar.kind === 'bent'}
      {@const base = Math.min(...bar.shape.pts.map((p) => p[1]))}
      <polyline points={bar.shape.pts.map((p) => `${X(p[0]).toFixed(1)},${(y + 8 - (p[1] - base) * Math.min(sy, 60) * 0.35).toFixed(1)}`).join(' ')} class="bar bent" />
    {:else}
      <line x1={X(bar.from)} y1={y} x2={X(bar.to)} y2={y} class="bar {bar.kind}" />
      {#if bar.hooks[0]}<line x1={X(bar.from)} y1={y} x2={X(bar.from)} y2={bar.face === 'top' ? y + 8 : y - 8} class="bar {bar.kind}" />{/if}
      {#if bar.hooks[1]}<line x1={X(bar.to)} y1={y} x2={X(bar.to)} y2={bar.face === 'top' ? y + 8 : y - 8} class="bar {bar.kind}" />{/if}
    {/if}
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
  .bar.bent { stroke: #b48cf2; }
  .mark.bent { stroke: #b48cf2; }
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
  .bar.hl { stroke-width: 4.4; filter: drop-shadow(0 0 3px var(--st-warn)); }
  .mark.hl { stroke: var(--st-warn); stroke-width: 2.6; fill: color-mix(in srgb, var(--st-warn) 30%, var(--st-surface-2)); }
  .cut { stroke: #f0b84a; stroke-width: 1; stroke-dasharray: 4 2; }
  .cutbox { fill: var(--st-surface-2); stroke: #f0b84a; stroke-width: 1; }
  .cutt { font-size: 9.5px; font-weight: 700; fill: #f0b84a; text-anchor: middle; font-family: var(--st-mono); }
  .envaxis { stroke: var(--st-text-3); stroke-width: 0.7; }
  .mu { stroke: none; }
  .mu.pos { fill: rgba(78, 205, 196, 0.22); }
  .mu.neg { fill: rgba(232, 93, 74, 0.22); }
  .phim { fill: none; stroke: var(--st-text); stroke-width: 1.3; stroke-dasharray: 5 3; }
  .vu { fill: rgba(224, 160, 60, 0.25); stroke: none; }
  .phiv { fill: none; stroke: var(--st-text); stroke-width: 1.3; stroke-dasharray: 5 3; }
  .phim.off, .phiv.off { opacity: 0.35; stroke-dasharray: 1 4; }
</style>
