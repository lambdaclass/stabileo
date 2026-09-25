<script lang="ts">
  /**
   * The interaction diagram, drawn the way the column sheets draw it.
   *
   * Mu across, Pu up, and the series every sheet's chart carries:
   *
   *   · "Con limitación de Φ Pn (máx)" — the design diagram, solid
   *   · "Sin limitación de Φ Pn (máx)" — the same section uncapped, dashed
   *   · the demand, a red diamond
   *   · on the verification sheets, the resistance at the demand's own
   *     eccentricity, a magenta diamond, and the ray from the origin through
   *     both ("Excentricidad")
   *   · on the characteristic-points chart, the six named states
   *
   * Both edges are CURVES the caller computed, not one edge mirrored: a section
   * with more steel at the bottom than the top has a lopsided diagram, and
   * reflecting one half would draw a section that is not the one checked.
   * Moments are signed as the sheet signs them — positive compresses the top.
   *
   * An SVG rather than a chart library: a few hundred points and some markers,
   * and the CSP on this app forbids reaching for a CDN anyway.
   */
  import type { DiagramPoint } from '../../lib/engine/codes/argentina/cirsoc-flex-diagram';

  interface Props {
    /** The capped diagram, a closed loop, (φMn signed, φPn). */
    curve: DiagramPoint[];
    /** The uncapped one, drawn dashed. */
    uncapped?: DiagramPoint[] | null;
    demand?: DiagramPoint | null;
    resistance?: DiagramPoint | null;
    /** Draw the ray of constant eccentricity through demand and resistance. */
    showEccentricity?: boolean;
    /** Characteristic points, marked on the curve. */
    points?: DiagramPoint[] | null;
    labelM?: string;
    labelN?: string;
    testId?: string;
  }
  let {
    curve, uncapped = null, demand = null, resistance = null,
    showEccentricity = false, points = null,
    labelM = 'Mu [kN·m]', labelN = 'Pu [kN]', testId = 'flex-diagram',
  }: Props = $props();

  const W = 300;
  const H = 260;
  const PAD = { l: 44, r: 10, t: 12, b: 28 };

  const bounds = $derived.by(() => {
    const all = [...curve, ...(uncapped ?? [])];
    const ms = all.map((p) => p.m);
    const ns = all.map((p) => p.n);
    for (const p of [demand, resistance]) if (p) { ms.push(p.m); ns.push(p.n); }
    /* Symmetric about the axial axis, so the origin sits in the middle and the
       two edges can be compared by eye. */
    const mMax = Math.max(1, ...ms.map(Math.abs)) * 1.04;
    const nMin = Math.min(...ns, 0);
    const nMax = Math.max(...ns, 0);
    const pad = (nMax - nMin) * 0.03;
    return { mMin: -mMax, mMax, nMin: nMin - pad, nMax: nMax + pad };
  });

  const x = $derived((m: number) => {
    const { mMin, mMax } = bounds;
    return PAD.l + ((m - mMin) / (mMax - mMin || 1)) * (W - PAD.l - PAD.r);
  });
  const y = $derived((n: number) => {
    const { nMin, nMax } = bounds;
    return H - PAD.b - ((n - nMin) / (nMax - nMin || 1)) * (H - PAD.t - PAD.b);
  });

  const pathOf = (pts: DiagramPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.m).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ') + ' Z';

  /** A diamond, because that is the marker the sheet uses for both. */
  const diamond = (p: DiagramPoint, r = 4) =>
    `${x(p.m)},${y(p.n) - r} ${x(p.m) + r},${y(p.n)} ${x(p.m)},${y(p.n) + r} ${x(p.m) - r},${y(p.n)}`;

  /** The eccentricity ray, from the origin to whichever marker is further out. */
  const ray = $derived.by(() => {
    if (!showEccentricity || !demand) return null;
    const far = resistance && Math.hypot(resistance.m, resistance.n) > Math.hypot(demand.m, demand.n)
      ? resistance : demand;
    return { x1: x(0), y1: y(0), x2: x(far.m), y2: y(far.n) };
  });

  /** Round tick values across a span, so the axes read in numbers people use. */
  function ticks(lo: number, hi: number, wanted = 4): number[] {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / wanted;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= wanted * 1.4) ?? mag * 10;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  }
</script>

<svg class="id-svg" viewBox="0 0 {W} {H}" role="img"
  aria-label="{labelM} / {labelN}" data-testid={testId}>
  {#each ticks(bounds.nMin, bounds.nMax) as v (v)}
    <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} class="id-grid" />
    <text x={PAD.l - 4} y={y(v) + 3} class="id-tick id-tick-y">{v.toFixed(0)}</text>
  {/each}
  {#each ticks(bounds.mMin, bounds.mMax) as v (v)}
    <line y1={PAD.t} y2={H - PAD.b} x1={x(v)} x2={x(v)} class="id-grid" />
    <text x={x(v)} y={H - PAD.b + 12} class="id-tick id-tick-x">{v.toFixed(0)}</text>
  {/each}
  <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} class="id-axis" />
  <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} class="id-axis" />

  {#if uncapped && uncapped.length > 2}
    <path d={pathOf(uncapped)} class="id-uncapped" data-testid="{testId}-uncapped" />
  {/if}
  <path d={pathOf(curve)} class="id-curve" data-testid="{testId}-capped" />

  {#if ray}
    <line {...ray} class="id-ray" data-testid="{testId}-ray" />
  {/if}

  {#if points}
    {#each points as p, k (k)}
      <circle cx={x(p.m)} cy={y(p.n)} r="2.6" class="id-pt" />
    {/each}
  {/if}

  {#if resistance}
    <polygon points={diamond(resistance, 5)} class="id-res" data-testid="{testId}-res" />
  {/if}
  {#if demand}
    <polygon points={diamond(demand, 5)} class="id-dem" data-testid="{testId}-dem" />
  {/if}

  <text x={(W + PAD.l) / 2} y={H - 2} class="id-axis-label">{labelM}</text>
  <text x={10} y={PAD.t + 4} class="id-axis-label id-axis-label-y">{labelN}</text>
</svg>

<style>
  .id-svg { width: 100%; height: auto; display: block; margin: 4px 0 2px; }
  .id-grid { stroke: var(--st-hair); stroke-width: 0.5; }
  .id-axis { stroke: var(--st-text-3); stroke-width: 0.8; }
  .id-curve { fill: none; stroke: var(--st-accent); stroke-width: 1.4; stroke-linejoin: round; }
  .id-uncapped {
    fill: none; stroke: var(--st-text-3); stroke-width: 1;
    stroke-dasharray: 4 3; stroke-linejoin: round;
  }
  .id-ray { stroke: var(--st-text-2); stroke-width: 0.8; stroke-dasharray: 2 2; }
  .id-pt { fill: var(--st-surface); stroke: var(--st-text); stroke-width: 1; }
  .id-tick { fill: var(--st-text-3); font-size: 7px; font-variant-numeric: tabular-nums; }
  .id-tick-y { text-anchor: end; }
  .id-tick-x { text-anchor: middle; }
  .id-axis-label { fill: var(--st-text-3); font-size: 8px; text-anchor: middle; }
  .id-axis-label-y { text-anchor: start; }
  /* The sheet's own two colours: red for what is asked, magenta for what the
     section gives at that same eccentricity. */
  .id-dem { fill: #e5484d; stroke: #fff; stroke-width: 0.6; }
  .id-res { fill: #d6409f; stroke: #fff; stroke-width: 0.6; }
</style>
