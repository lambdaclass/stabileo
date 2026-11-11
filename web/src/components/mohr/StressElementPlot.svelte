<script lang="ts">
  import { principalPlane, rotatePlane } from '../../lib/mohr/plane';
  import { tm, formatter } from './i18n';

  let { sx, sy, txy, theta }: { sx: number; sy: number; txy: number; theta: number } = $props();

  const W = 400, H = 380, CX = 210, CY = 180, HALF = 52;
  const fmt = $derived(formatter(2));
  const p = $derived(principalPlane({ sx, sy, txy }));
  const r = $derived(rotatePlane({ sx, sy, txy }, theta));
  const big = $derived(Math.max(Math.abs(p.sigma1), Math.abs(p.sigma2), p.tauMax, 1e-12));
  const tiny = (v: number) => Math.abs(v) <= 1e-9 * big;

  type P = { x: number; y: number };
  function at(angleDeg: number) {
    const a = (angleDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return (lx: number, ly: number): P => ({ x: CX + lx * c - ly * s, y: CY - (lx * s + ly * c) });
  }
  const local = $derived(at(theta));

  type Arrow = { from: P; to: P; head: string };
  function arrow(from: P, to: P): Arrow {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, s = 7;
    return { from, to, head: `${to.x},${to.y} ${to.x - ux * s * 1.4 - uy * s * 0.6},${to.y - uy * s * 1.4 + ux * s * 0.6} ${to.x - ux * s * 1.4 + uy * s * 0.6},${to.y - uy * s * 1.4 - ux * s * 0.6}` };
  }
  const normalLen = (v: number) => 18 + 52 * Math.abs(v) / big;

  const square = $derived([local(-HALF, -HALF), local(HALF, -HALF), local(HALF, HALF), local(-HALF, HALF)].map((q) => `${q.x},${q.y}`).join(' '));

  const normals = $derived.by(() => {
    const out: Arrow[] = [];
    for (const [value, dirX, dirY] of [[r.sx, 1, 0], [r.sx, -1, 0], [r.sy, 0, 1], [r.sy, 0, -1]] as const) {
      if (tiny(value)) continue;
      const L = normalLen(value), base = HALF + 4;
      const near = local(dirX * base, dirY * base), far = local(dirX * (base + L), dirY * (base + L));
      out.push(value > 0 ? arrow(near, far) : arrow(far, near));
    }
    return out;
  });

  const shears = $derived.by(() => {
    if (tiny(r.txy)) return [] as Arrow[];
    const L = Math.max(18, (1.5 * HALF * Math.abs(r.txy)) / big) / 2, g = HALF + 9, s = Math.sign(r.txy);
    return [
      arrow(local(g, -s * L), local(g, s * L)),
      arrow(local(-g, s * L), local(-g, -s * L)),
      arrow(local(-s * L, g), local(s * L, g)),
      arrow(local(s * L, -g), local(-s * L, -g)),
    ];
  });

  const sxLabel = $derived.by(() => { const d = HALF + 4 + (tiny(r.sx) ? 0 : normalLen(r.sx)) + 28; return local(d, 0); });
  const syLabel = $derived.by(() => { const d = HALF + 4 + (tiny(r.sy) ? 0 : normalLen(r.sy)) + 14; return local(0, d); });
  const tauLabel = $derived(local(HALF + 22, HALF + 22));

  const directions = $derived([
    { label: 'I', a: at(p.theta1)(150, 0), b: at(p.theta1)(-150, 0), tag: at(p.theta1)(162, 0) },
    { label: 'II', a: at(p.theta2)(150, 0), b: at(p.theta2)(-150, 0), tag: at(p.theta2)(162, 0) },
  ]);
  const showDirections = $derived(!tiny(p.tauMax));

  const GX = 34, GY = H - 34, GL = 40;
  const glyph = $derived.by(() => {
    const a = (theta * Math.PI) / 180, rr = 17;
    const tip = { x: GX + GL * 0.9 * Math.cos(a), y: GY - GL * 0.9 * Math.sin(a) };
    const large = Math.abs(theta) > 180 ? 1 : 0, sweep = theta > 0 ? 0 : 1;
    return {
      axis: arrow({ x: GX, y: GY }, tip),
      arc: `M${GX + rr} ${GY} A${rr} ${rr} 0 ${large} ${sweep} ${GX + rr * Math.cos(a)} ${GY - rr * Math.sin(a)}`,
      xLabel: { x: tip.x + 8 * Math.cos(a) + 2, y: tip.y - 8 * Math.sin(a) + 4 },
      thetaLabel: { x: GX + (rr + 9) * Math.cos(a / 2), y: GY - (rr + 9) * Math.sin(a / 2) + 4 },
    };
  });
  const xAxis = arrow({ x: GX, y: GY }, { x: GX + GL, y: GY });
  const yAxis = arrow({ x: GX, y: GY }, { x: GX, y: GY - GL });
</script>

<svg class="mh-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tm('mohr.elementLabel')} data-testid="mohr2d-element">
  <title>{tm('mohr.elementLabel')}</title>
  {#if showDirections}
    {#each directions as d (d.label)}
      <line class="mh-direction" x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} />
      <text class="mh-direction-label" x={d.tag.x} y={d.tag.y + 4} text-anchor="middle">{d.label}</text>
    {/each}
  {/if}
  <polygon class="mh-square" points={square} />
  {#each normals as a, i (i)}
    <line class="mh-normal" x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />
    <polygon class="mh-normal-head" points={a.head} />
  {/each}
  {#each shears as a, i (i)}
    <line class="mh-shear" x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />
    <polygon class="mh-shear-head" points={a.head} />
  {/each}
  <text class="mh-normal-label" x={sxLabel.x} y={sxLabel.y + 4} text-anchor="middle">{fmt(r.sx)}</text>
  <text class="mh-normal-label" x={syLabel.x} y={syLabel.y + 4} text-anchor="middle">{fmt(r.sy)}</text>
  {#if !tiny(r.txy)}<text class="mh-shear-label" x={tauLabel.x} y={tauLabel.y + 4} text-anchor="middle">{fmt(r.txy)}</text>{/if}

  <line class="mh-glyph" x1={xAxis.from.x} y1={xAxis.from.y} x2={xAxis.to.x} y2={xAxis.to.y} />
  <polygon class="mh-glyph-head" points={xAxis.head} />
  <line class="mh-glyph" x1={yAxis.from.x} y1={yAxis.from.y} x2={yAxis.to.x} y2={yAxis.to.y} />
  <polygon class="mh-glyph-head" points={yAxis.head} />
  <text class="mh-glyph-label" x={GX + GL + 6} y={GY + 4}>x</text>
  <text class="mh-glyph-label" x={GX - 4} y={GY - GL - 6}>y</text>
  {#if Math.abs(theta) > 1e-9}
    <line class="mh-rot" x1={glyph.axis.from.x} y1={glyph.axis.from.y} x2={glyph.axis.to.x} y2={glyph.axis.to.y} />
    <polygon class="mh-rot-head" points={glyph.axis.head} />
    <path class="mh-arc" d={glyph.arc} />
    <text class="mh-rot-text" x={glyph.xLabel.x} y={glyph.xLabel.y}>x′</text>
    <text class="mh-rot-text" x={glyph.thetaLabel.x} y={glyph.thetaLabel.y}>θ</text>
  {/if}
  <g class="mh-legend" transform={`translate(${W - 150}, ${H - 40})`}>
    <line class="mh-normal" x1="0" y1="0" x2="18" y2="0" /><text class="mh-legend-text" x="24" y="4">{tm('mohr.normal')}</text>
    <line class="mh-shear" x1="0" y1="16" x2="18" y2="16" /><text class="mh-legend-text" x="24" y="20">{tm('mohr.shear')}</text>
  </g>
</svg>
