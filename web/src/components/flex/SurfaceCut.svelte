<script lang="ts">
  /**
   * "5.- CORTE DE LA SUPERFICIE DE INTERACCION PARA EL AXIAL FIJADO".
   *
   * The biaxial sheets' figure: the failure surface sliced at the demand's own
   * axial load, which leaves a load contour in the (Mxu, Myu) plane. Mxu across,
   * Myu up, one quadrant — the one the demand is in.
   *
   *   design   the contours for ρ = 1 % … 8 %, thin, and the adopted ratio's
   *            contour emphasised: the reader sees which band the answer fell
   *            in and how far the next per cent would take it
   *   verify   the one contour of the steel given, the demand (red), the
   *            resistance on the demand's own ray (magenta) and that ray
   *
   * The sheet also draws a "primera iteración" contour — an artefact of its own
   * two-step interpolation between the per-cent contours. Ours bisects to the
   * answer, so there is no first iteration to show, and inventing one to match
   * the legend would be drawing a calculation that was not made.
   */
  export interface CutCurve {
    /** Shown beside the curve, e.g. "3 %". */
    label: string;
    /** (Mx, My) in the sheet's signs. */
    points: Array<{ mx: number; my: number }>;
    emphasis?: boolean;
  }

  interface Props {
    curves: CutCurve[];
    demand?: { mx: number; my: number } | null;
    resistance?: { mx: number; my: number } | null;
    showRay?: boolean;
    labelX?: string;
    labelY?: string;
  }
  let {
    curves, demand = null, resistance = null, showRay = false,
    labelX = 'Mxu [kN·m]', labelY = 'Myu [kN·m]',
  }: Props = $props();

  const W = 300;
  const H = 280;
  const PAD = { l: 40, r: 26, t: 14, b: 28 };

  /* The quadrant is the demand's; drawn as magnitudes, labelled with signs. */
  const sx = $derived(demand && demand.mx < 0 ? -1 : 1);
  const sy = $derived(demand && demand.my < 0 ? -1 : 1);

  const bounds = $derived.by(() => {
    const xs = [0];
    const ys = [0];
    for (const c of curves) for (const p of c.points) { xs.push(Math.abs(p.mx)); ys.push(Math.abs(p.my)); }
    for (const p of [demand, resistance]) if (p) { xs.push(Math.abs(p.mx)); ys.push(Math.abs(p.my)); }
    /* One scale for both axes: a contour's shape is the information. */
    const top = Math.max(1, ...xs, ...ys) * 1.05;
    return { top };
  });
  const span = $derived(Math.min(W - PAD.l - PAD.r, H - PAD.t - PAD.b));
  const X = $derived((v: number) => PAD.l + (Math.abs(v) / bounds.top) * span);
  const Y = $derived((v: number) => PAD.t + span - (Math.abs(v) / bounds.top) * span);

  const pathOf = (pts: Array<{ mx: number; my: number }>) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.mx).toFixed(1)},${Y(p.my).toFixed(1)}`).join(' ');

  const diamond = (p: { mx: number; my: number }, r = 5) =>
    `${X(p.mx)},${Y(p.my) - r} ${X(p.mx) + r},${Y(p.my)} ${X(p.mx)},${Y(p.my) + r} ${X(p.mx) - r},${Y(p.my)}`;

  const ray = $derived.by(() => {
    if (!showRay || !demand) return null;
    const far = resistance && Math.hypot(resistance.mx, resistance.my) > Math.hypot(demand.mx, demand.my)
      ? resistance : demand;
    return { x1: X(0), y1: Y(0), x2: X(far.mx), y2: Y(far.my) };
  });

  function ticks(hi: number, wanted = 4): number[] {
    const raw = hi / wanted;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => hi / s <= wanted * 1.4) ?? mag * 10;
    const out: number[] = [];
    for (let v = 0; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  }
</script>

<svg class="sc-svg" viewBox="0 0 {W} {H}" role="img" aria-label="{labelX} / {labelY}"
  data-testid="flex-surface-cut">
  {#each ticks(bounds.top) as v (v)}
    <line x1={X(0)} x2={X(bounds.top)} y1={Y(v)} y2={Y(v)} class="sc-grid" />
    <line y1={Y(0)} y2={Y(bounds.top)} x1={X(v)} x2={X(v)} class="sc-grid" />
    <text x={X(0) - 4} y={Y(v) + 3} class="sc-tick sc-tick-y">{(sy * v).toFixed(0)}</text>
    <text x={X(v)} y={Y(0) + 11} class="sc-tick sc-tick-x">{(sx * v).toFixed(0)}</text>
  {/each}
  <line x1={X(0)} x2={X(bounds.top)} y1={Y(0)} y2={Y(0)} class="sc-axis" />
  <line x1={X(0)} x2={X(0)} y1={Y(0)} y2={Y(bounds.top)} class="sc-axis" />

  {#each curves as c, k (k)}
    {#if c.points.length > 1}
      <!-- Labelled where the contours are furthest apart: the grid at the Myu
           end, the adopted one halfway round so it never sits on a neighbour. -->
      {@const end = c.emphasis ? c.points[Math.floor(c.points.length / 2)] : c.points[c.points.length - 1]}
      <path d={pathOf(c.points)} class="sc-curve" class:sc-emph={c.emphasis}
        data-testid={c.emphasis ? 'flex-cut-result' : 'flex-cut-grid'} />
      <text x={X(end.mx) + 3} y={Y(end.my) - 2} class="sc-label" class:sc-label-emph={c.emphasis}>{c.label}</text>
    {/if}
  {/each}

  {#if ray}<line {...ray} class="sc-ray" />{/if}
  {#if resistance}
    <polygon points={diamond(resistance)} class="sc-res" data-testid="flex-cut-res" />
  {/if}
  {#if demand}
    <polygon points={diamond(demand)} class="sc-dem" data-testid="flex-cut-dem" />
  {/if}

  <text x={X(bounds.top / 2)} y={H - 4} class="sc-axis-label">{labelX}</text>
  <text x={4} y={PAD.t - 4} class="sc-axis-label sc-axis-label-y">{labelY}</text>
</svg>

<style>
  .sc-svg { width: 100%; height: auto; display: block; margin: 4px 0 2px; }
  .sc-grid { stroke: var(--st-hair); stroke-width: 0.5; }
  .sc-axis { stroke: var(--st-text-3); stroke-width: 0.8; }
  .sc-curve { fill: none; stroke: var(--st-text-3); stroke-width: 0.8; stroke-linejoin: round; }
  .sc-curve.sc-emph { stroke: var(--st-accent); stroke-width: 1.8; }
  .sc-label { fill: var(--st-text-3); font-size: 6.5px; font-variant-numeric: tabular-nums; }
  .sc-label-emph { fill: var(--st-accent); font-weight: 700; }
  .sc-ray { stroke: var(--st-text-2); stroke-width: 0.8; stroke-dasharray: 2 2; }
  .sc-tick { fill: var(--st-text-3); font-size: 7px; font-variant-numeric: tabular-nums; }
  .sc-tick-y { text-anchor: end; }
  .sc-tick-x { text-anchor: middle; }
  .sc-axis-label { fill: var(--st-text-3); font-size: 8px; text-anchor: middle; }
  .sc-axis-label-y { text-anchor: start; }
  .sc-dem { fill: #e5484d; stroke: #fff; stroke-width: 0.6; }
  .sc-res { fill: #d6409f; stroke: #fff; stroke-width: 0.6; }
</style>
