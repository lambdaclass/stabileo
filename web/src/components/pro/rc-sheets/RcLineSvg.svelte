<script lang="ts">
  import { i18n, t } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { stirrupsLabel } from '../../../lib/rc-sheets/bars';
  import type { LineBar, LineLayout } from '../../../lib/rc-sheets/beam-line';

  let { line, marks = false, envelope = false, cuts = [] }: { line: LineLayout; marks?: boolean; envelope?: boolean; cuts?: Array<{ x: number; label: string }> } = $props();
  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const W = 1200, M = 56, TOP = 40, STUB = 22, BELOW = 12, ROW = 30;
  const x0 = $derived(Math.min(0, line.ends.from)), x1 = $derived(Math.max(line.length, line.ends.to));
  const sx = $derived((W - 2 * M) / Math.max(x1 - x0, 1e-6));
  const hMax = $derived(Math.max(...line.spans.map((s) => s.h), 0.1));
  const sy = $derived(84 / hMax);
  const X = (x: number) => M + (x - x0) * sx;
  const supports = $derived([0, ...line.spans.map((s) => s.x1)]);
  const bottomOf = (h: number) => TOP + h * sy;
  const yBeamBottom = $derived(bottomOf(hMax));
  const coverPx = $derived(Math.max(9, (line.cover + 0.012) * sy));
  const spanAt = (x: number) => line.spans.find((s) => x >= s.x0 - 1e-9 && x <= s.x1 + 1e-9) ?? line.spans[0]!;

  /** A bar's trace inside the beam, span by span (the depth may change between spans); the end spans reach into the end supports. */
  function trace(bar: LineBar): Array<{ x1: number; x2: number; y: number }> {
    if (bar.kind === 'bent') {
      const r = bar.runs.find((x) => x.face === 'bottom') ?? bar.runs[0]!;
      return [{ x1: X(r.from), x2: X(r.to), y: TOP + (hMax - (bar.shape.pts.find((p) => p[0] >= r.from - 1e-9)?.[1] ?? 0)) * sy }];
    }
    const inner = bar.kind === 'continuous' ? 0 : 6;
    const last = line.spans.length - 1;
    return line.spans.flatMap((s, k) => {
      const lo = k === 0 ? -Infinity : s.x0, hi = k === last ? Infinity : s.x1;
      const a = Math.max(lo, bar.from), b = Math.min(hi, bar.to);
      return b - a > 1e-6 ? [{ x1: X(a), x2: X(b), y: bar.face === 'top' ? TOP + coverPx + inner : bottomOf(s.h) - coverPx - inner }] : [];
    });
  }
  /** A 90° hook's leg as its shape bends it, at the drawing's vertical scale, kept inside the beam. */
  const hookLeg = (bar: LineBar) => {
    const p = bar.shape.pts, [a, b] = bar.hooks[0] ? [p[0]!, p[1]!] : [p[p.length - 1]!, p[p.length - 2]!];
    return Math.abs(a[1] - b[1]);
  };
  const hookTo = (bar: LineBar, y: number) => {
    const leg = Math.max(8, Math.min(hMax * sy - 2 * coverPx, hookLeg(bar) * sy));
    return bar.face === 'top' ? y + leg : y - leg;
  };

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
  const ENV_M = 96, ENV_V = 64, ENV_GAP = 18;
  const yEnv = $derived(yBeamBottom + BELOW + 30);
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  const muTop = $derived(Math.max(1e-6, ...line.envelope.flatMap((e) => [e.pos, e.neg])));
  const vuTop = $derived(Math.max(1e-6, ...line.shear.map((e) => e.v)));
  const mMax = $derived(1.5 * muTop), vMax = $derived(1.5 * vuTop);
  const phiMTop = $derived(Math.max(0, ...line.envelope.flatMap((e) => [finite(e.phiPos), finite(e.phiNeg)])));
  const phiVTop = $derived(Math.max(0, ...line.shear.map((e) => finite(e.phiVn))));
  const yM = $derived(yEnv + ENV_M / 2);
  const yV = $derived(yEnv + ENV_M + ENV_GAP + ENV_V);
  const mY = (m: number) => yM + (m / mMax) * (ENV_M / 2 - 4);
  const vY = (v: number) => yV - (v / vMax) * (ENV_V - 4);
  const path = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  /** Mu below the axis where it sags and above where it hogs, as it is drawn on the tension side. */
  const muPos = $derived(path([[X(line.envelope[0]?.x ?? 0), yM], ...line.envelope.map((e) => [X(e.x), mY(e.pos)] as [number, number]), [X(line.envelope[line.envelope.length - 1]?.x ?? 0), yM]]) + ' Z');
  const muNeg = $derived(path([[X(line.envelope[0]?.x ?? 0), yM], ...line.envelope.map((e) => [X(e.x), mY(-e.neg)] as [number, number]), [X(line.envelope[line.envelope.length - 1]?.x ?? 0), yM]]) + ' Z');
  const phiPos = $derived(path(line.envelope.map((e) => [X(e.x), mY(Math.min(finite(e.phiPos), mMax))])));
  const phiNeg = $derived(path(line.envelope.map((e) => [X(e.x), mY(-Math.min(finite(e.phiNeg), mMax))])));
  const vu = $derived(path([[X(line.shear[0]?.x ?? 0), yV], ...line.shear.map((e) => [X(e.x), vY(e.v)] as [number, number]), [X(line.shear[line.shear.length - 1]?.x ?? 0), yV]]) + ' Z');
  const phiV = $derived(path(line.shear.map((e) => [X(e.x), vY(Math.min(finite(e.phiVn), vMax))])));
  const yDim = $derived(envelope && line.envelope.length ? yV + 30 : yBeamBottom + BELOW + 36);
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
    <polyline points={bar.shape.pts.map((p) => `${X(p[0]).toFixed(1)},${(TOP + (hMax - p[1]) * sy).toFixed(1)}`).join(' ')} class="bar bent" data-testid="rc-bent-bar" />
  {/each}
  {#each line.bars.filter((b) => b.kind !== 'bent') as bar (bar.mark)}
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
      <path d={phiPos} class="phim" data-testid="rc-env-phimn-pos" />
      <path d={phiNeg} class="phim" />
      <text x={M - 6} y={yM - ENV_M / 2 + 10} class="small end">Mu⁻</text>
      <text x={M - 6} y={yM + ENV_M / 2 - 2} class="small end">Mu⁺</text>
      <text x={W - M + 4} y={yM - ENV_M / 2 + 10} class="small start">φMn</text>
      <line x1={X(0)} y1={yV} x2={X(line.length)} y2={yV} class="envaxis" />
      <path d={vu} class="vu" />
      <path d={phiV} class="phiv" data-testid="rc-env-phivn" />
      <text x={M - 6} y={yV - ENV_V + 10} class="small end">|Vu|</text>
      <text x={W - M + 4} y={yV - ENV_V + 10} class="small start">φVn</text>
      <text x={W - M + 4} y={yM + 4} class="small start">{fmt(muTop, 0)}</text>
      <text x={W - M + 4} y={yV - 2} class="small start">{fmt(vuTop, 0)}</text>
      {#if phiMTop > mMax}<text x={W - M + 4} y={yM + ENV_M / 2 - 2} class="small start" data-testid="rc-env-phimn-off">↧ {fmt(phiMTop, 0)}</text>{/if}
      {#if phiVTop > vMax}<text x={W - M + 4} y={yV - ENV_V + 22} class="small start">↥ {fmt(phiVTop, 0)}</text>{/if}
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
    <circle cx={M - 26} cy={y} r="9" class="mark {bar.kind}" />
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
</style>
