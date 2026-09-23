<script lang="ts">
  /**
   * The interaction diagram, drawn the way the verification sheets draw it.
   *
   * Mu across, Pu up, the curve mirrored about the axial axis because a
   * symmetric section reaches the same capacity whichever face is compressed —
   * which is also why the sheet prints its characteristic points twice.
   *
   * Two markers, and they are the point of the figure: the RED one is the
   * demand and the MAGENTA one the resistance at that demand's own
   * eccentricity. Their positions say what a ratio cannot — whether the
   * section is short of capacity near the nose, where a little more axial load
   * helps, or out on the tension branch where it does not.
   *
   * An SVG rather than a chart library: it is a hundred points and two
   * diamonds, and the CSP on this app forbids reaching for a CDN anyway.
   */
  export interface DiagramPoint { m: number; n: number }

  interface Props {
    /** The capacity curve as (|φMn|, φPn); drawn mirrored. */
    curve: DiagramPoint[];
    /** Where the demand sits, if there is one. */
    demand?: DiagramPoint | null;
    /** The capacity at the demand's eccentricity. */
    resistance?: DiagramPoint | null;
    labelM?: string;
    labelN?: string;
  }
  let { curve, demand = null, resistance = null,
        labelM = 'Mu [kN·m]', labelN = 'Pu [kN]' }: Props = $props();

  const W = 300;
  const H = 260;
  const PAD = { l: 44, r: 10, t: 12, b: 28 };

  /** Both halves: the sheet plots the full symmetric figure. */
  const mirrored = $derived([
    ...curve.map((p) => ({ m: -Math.abs(p.m), n: p.n })).reverse(),
    ...curve.map((p) => ({ m: Math.abs(p.m), n: p.n })),
  ]);

  const bounds = $derived.by(() => {
    const ms = mirrored.map((p) => p.m);
    const ns = mirrored.map((p) => p.n);
    if (demand) { ms.push(demand.m, -demand.m); ns.push(demand.n); }
    if (resistance) { ms.push(resistance.m, -resistance.m); ns.push(resistance.n); }
    const mMax = Math.max(1, ...ms.map(Math.abs));
    return { mMin: -mMax, mMax, nMin: Math.min(...ns, 0), nMax: Math.max(...ns, 0) };
  });

  const x = $derived((m: number) => {
    const { mMin, mMax } = bounds;
    const span = mMax - mMin || 1;
    return PAD.l + ((m - mMin) / span) * (W - PAD.l - PAD.r);
  });
  const y = $derived((n: number) => {
    const { nMin, nMax } = bounds;
    const span = nMax - nMin || 1;
    return H - PAD.b - ((n - nMin) / span) * (H - PAD.t - PAD.b);
  });

  const path = $derived(
    mirrored.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.m).toFixed(1)},${y(p.n).toFixed(1)}`).join(' '),
  );

  /** A diamond, because that is the marker the sheet uses for both. */
  const diamond = (p: DiagramPoint, r = 4) =>
    `${x(p.m)},${y(p.n) - r} ${x(p.m) + r},${y(p.n)} ${x(p.m)},${y(p.n) + r} ${x(p.m) - r},${y(p.n)}`;

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
  aria-label="{labelM} / {labelN}" data-testid="flex-diagram">
  <!-- grid and axes -->
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

  <path d={path} class="id-curve" />

  {#if resistance}
    <polygon points={diamond(resistance, 5)} class="id-res" data-testid="flex-diagram-res" />
  {/if}
  {#if demand}
    <polygon points={diamond(demand, 5)} class="id-dem" data-testid="flex-diagram-dem" />
  {/if}

  <text x={(W + PAD.l) / 2} y={H - 2} class="id-axis-label">{labelM}</text>
  <text x={10} y={PAD.t + 4} class="id-axis-label id-axis-label-y">{labelN}</text>
</svg>

<style>
  .id-svg { width: 100%; height: auto; display: block; margin: 4px 0 2px; }
  .id-grid { stroke: var(--st-hair); stroke-width: 0.5; }
  .id-axis { stroke: var(--st-text-3); stroke-width: 0.8; }
  .id-curve { fill: none; stroke: var(--st-accent); stroke-width: 1.4; }
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
