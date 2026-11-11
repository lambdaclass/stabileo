<script lang="ts">
  import { principalPlane, rotatePlane } from '../../lib/mohr/plane';
  import { equalFrame, ticks } from '../../lib/mohr/plot';
  import type { Unit } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';

  let { sx, sy, txy, theta, tauDown, unit }: { sx: number; sy: number; txy: number; theta: number; tauDown: boolean; unit: Unit } = $props();

  const W = 400, H = 380;
  const box = { left: 52, top: 34, width: W - 52 - 18, height: H - 34 - 56 };
  const fmt = $derived(formatter(2));
  const tickFmt = $derived(formatter(0));

  const p = $derived(principalPlane({ sx, sy, txy }));
  const rot = $derived(rotatePlane({ sx, sy, txy }, theta));
  const scaleRef = $derived(Math.max(Math.abs(sx), Math.abs(sy), Math.abs(txy), 1e-12));
  const point = $derived(p.radius <= 1e-9 * scaleRef);

  const frame = $derived.by(() => {
    const c = p.center, r = p.radius;
    let xr: [number, number], yr: [number, number];
    if (point) {
      const m = Math.max(Math.abs(c) * 0.5, 1);
      xr = [Math.min(c - m, 0), Math.max(c + m, 0)];
      yr = [-m, m];
    } else {
      xr = Math.abs(c) < 2.5 * r ? [Math.min(c - r, 0), Math.max(c + r, 0)] : [c - r, c + r];
      yr = [-r, r];
    }
    const pad = 0.2 * Math.max(xr[1] - xr[0], yr[1] - yr[0]);
    return equalFrame(box, [xr[0] - pad, xr[1] + pad], [yr[0] - pad, yr[1] + pad], tauDown);
  });
  const xTicks = $derived(ticks(frame.xMin, frame.xMax, 5));
  const yTicks = $derived(ticks(frame.yMin, frame.yMax, 5));
  const tickDigits = $derived.by(() => { const step = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1; return step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step))); });
  const tickLabel = $derived(tickDigits === 0 ? tickFmt : formatter(tickDigits));

  const cx = $derived(frame.x(p.center)), cy = $derived(frame.y(0));
  const rPx = $derived(p.radius * frame.scale);
  const X = $derived({ x: frame.x(sx), y: frame.y(txy) });
  const Y = $derived({ x: frame.x(sy), y: frame.y(-txy) });
  const Xr = $derived({ x: frame.x(rot.sx), y: frame.y(rot.txy) });
  const Yr = $derived({ x: frame.x(rot.sy), y: frame.y(-rot.txy) });
  const rotated = $derived(Math.abs(theta) > 1e-9);

  function outward(pt: { x: number; y: number }, d = 15) {
    const dx = pt.x - cx, dy = pt.y - cy, len = Math.hypot(dx, dy);
    return len < 1e-6 ? { x: pt.x + d * 0.7, y: pt.y - d * 0.7 } : { x: pt.x + (dx / len) * d, y: pt.y + (dy / len) * d + 4 };
  }

  const arc = $derived.by(() => {
    if (point || !rotated) return null;
    const a0 = Math.atan2(X.y - cy, X.x - cx);
    const delta = ((tauDown ? -2 : 2) * theta * Math.PI) / 180;
    const ra = Math.min(Math.max(rPx * 0.35, 18), rPx * 0.8);
    const a1 = a0 + delta;
    const large = Math.abs(delta) > Math.PI ? 1 : 0;
    const sweep = delta > 0 ? 1 : 0;
    const mid = a0 + delta / 2;
    return {
      d: `M${cx + ra * Math.cos(a0)} ${cy + ra * Math.sin(a0)} A${ra} ${ra} 0 ${large} ${sweep} ${cx + ra * Math.cos(a1)} ${cy + ra * Math.sin(a1)}`,
      lx: cx + (ra + 12) * Math.cos(mid), ly: cy + (ra + 12) * Math.sin(mid) + 4,
    };
  });

  const topTau = $derived(tauDown ? -p.radius : p.radius);
  const s1Label = $derived(`σ₁ = ${fmt(p.sigma1)}`);
  const s2Label = $derived(`σ₂ = ${fmt(p.sigma2)}`);
  const clampX = (x: number, text: string, anchor: 'start' | 'end') => {
    const w = text.length * 6.4;
    return anchor === 'start' ? Math.min(x, W - 4 - w) : Math.max(x, 4 + w);
  };
</script>

<svg class="mh-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tm('mohr.circleLabel')} data-testid="mohr2d-circle">
  <title>{tm('mohr.circleLabel')}</title>
  <rect class="mh-frame" x={box.left} y={box.top} width={box.width} height={box.height} />
  {#each xTicks as v (v)}
    <line class="mh-grid" x1={frame.x(v)} x2={frame.x(v)} y1={box.top} y2={box.top + box.height} />
    <text class="mh-tick" x={frame.x(v)} y={box.top + box.height + 15} text-anchor="middle">{tickLabel(v)}</text>
  {/each}
  {#each yTicks as v (v)}
    <line class="mh-grid" y1={frame.y(v)} y2={frame.y(v)} x1={box.left} x2={box.left + box.width} />
    <text class="mh-tick" x={box.left - 6} y={frame.y(v) + 4} text-anchor="end">{tickLabel(v)}</text>
  {/each}
  <line class="mh-axis" x1={box.left} x2={box.left + box.width} y1={cy} y2={cy} />
  {#if frame.xMin < 0 && frame.xMax > 0}<line class="mh-axis" x1={frame.x(0)} x2={frame.x(0)} y1={box.top} y2={box.top + box.height} />{/if}
  <text class="mh-axis-title" x={box.left + box.width / 2} y={H - 10} text-anchor="middle">σ [{unit}]</text>
  <text class="mh-axis-title" x={box.left} y={box.top - 12}>τ [{unit}]{tauDown ? ' (+↓)' : ' (+↑)'}</text>

  {#if !point}
    <circle class="mh-circle" cx={cx} cy={cy} r={rPx} />
    <circle class="mh-center" cx={cx} cy={cy} r="2.5" />
    {#if rotated}<line class="mh-diam-ref" x1={X.x} y1={X.y} x2={Y.x} y2={Y.y} />{/if}
    <line class="mh-diam" x1={Xr.x} y1={Xr.y} x2={Yr.x} y2={Yr.y} />
    {#if arc}
      <path class="mh-arc" d={arc.d} />
      <text class="mh-arc-label" x={arc.lx} y={arc.ly} text-anchor="middle">2θ</text>
    {/if}
    <circle class="mh-tau-pt" cx={cx} cy={frame.y(p.radius)} r="4" />
    <circle class="mh-tau-pt" cx={cx} cy={frame.y(-p.radius)} r="4" />
    <text class="mh-tau-label" x={cx} y={frame.y(topTau) - 9} text-anchor="middle">τ<tspan class="mh-sub" dy="3">max</tspan><tspan dy="-3"> = {fmt(p.radius)}</tspan></text>
    <circle class="mh-principal-pt" cx={frame.x(p.sigma1)} cy={cy} r="4.5" />
    <circle class="mh-principal-pt" cx={frame.x(p.sigma2)} cy={cy} r="4.5" />
    <text class="mh-principal-label" x={clampX(frame.x(p.sigma1) + 6, s1Label, 'start')} y={cy + 17} text-anchor="start" data-testid="mohr2d-s1-label">{s1Label}</text>
    <text class="mh-principal-label" x={clampX(frame.x(p.sigma2) - 6, s2Label, 'end')} y={cy + 17} text-anchor="end">{s2Label}</text>
    {#if rotated}
      <circle class="mh-ref-pt" cx={X.x} cy={X.y} r="3.5" />
      <circle class="mh-ref-pt" cx={Y.x} cy={Y.y} r="3.5" />
      <text class="mh-ref-label" x={outward(X).x} y={outward(X).y} text-anchor="middle">X</text>
      <text class="mh-ref-label" x={outward(Y).x} y={outward(Y).y} text-anchor="middle">Y</text>
    {/if}
    <circle class="mh-rot-pt" cx={Xr.x} cy={Xr.y} r="6" />
    <circle class="mh-rot-pt mh-hollow" cx={Yr.x} cy={Yr.y} r="5" />
    <text class="mh-rot-label" x={outward(Xr, 17).x} y={outward(Xr, 17).y} text-anchor="middle">{rotated ? 'X′' : 'X'}</text>
    <text class="mh-rot-label" x={outward(Yr, 17).x} y={outward(Yr, 17).y} text-anchor="middle">{rotated ? 'Y′' : 'Y'}</text>
  {:else}
    <circle class="mh-principal-pt" cx={cx} cy={cy} r="5" />
    <text class="mh-principal-label" x={cx} y={cy + 20} text-anchor="middle" data-testid="mohr2d-s1-label">σ₁ = σ₂ = {fmt(p.sigma1)}</text>
  {/if}
</svg>
