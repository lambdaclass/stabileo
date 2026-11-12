<script lang="ts">
  import { principalPlane, rotatePlane } from '../../lib/mohr/plane';
  import { equalFrame, gutter, ticks, thetaOnCircle, snapAngle, roundTo } from '../../lib/mohr/plot';
  import { wrapAngle, unitScales, type Unit } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import type { Focus2D } from './focus';

  let { sx, sy, txy, theta = $bindable(), tauDown, unit, focus = $bindable(null), fit = false, digits = 2 }: {
    sx: number; sy: number; txy: number; theta: number; tauDown: boolean; unit: Unit; focus?: Focus2D; fit?: boolean; digits?: number;
  } = $props();

  let cw = $state(0), ch = $state(0);
  const W = $derived(Math.max(260, Math.round(cw) || 560));
  const H = $derived(fit && ch > 160 ? Math.round(ch) : Math.round(Math.min(470, Math.max(260, W * 0.62))));
  const fmt = $derived(formatter(digits));
  const fmt1 = $derived(formatter(1));

  const p = $derived(principalPlane({ sx, sy, txy }));
  const rot = $derived(rotatePlane({ sx, sy, txy }, theta));
  const left = $derived(gutter(Math.max(p.radius, Math.abs(p.center) * 0.5, 1) * 1.4, true, unitScales(unit)));
  const box = $derived({ left, top: 30, width: W - left - 14, height: H - 30 - 46 });
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
    const pad = 0.16 * Math.max(xr[1] - xr[0], yr[1] - yr[0]);
    return equalFrame(box, [xr[0] - pad, xr[1] + pad], [yr[0] - pad, yr[1] + pad], tauDown);
  });
  const xTicks = $derived(ticks(frame.xMin, frame.xMax, Math.max(3, Math.round(box.width / 90))));
  const yTicks = $derived(ticks(frame.yMin, frame.yMax, Math.max(3, Math.round(box.height / 70))));
  const tickLabel = $derived.by(() => { const step = xTicks.length > 1 ? xTicks[1] - xTicks[0] : 1; return formatter(step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))); });

  const cx = $derived(frame.x(p.center)), cy = $derived(frame.y(0));
  const rPx = $derived(p.radius * frame.scale);
  const X = $derived({ x: frame.x(sx), y: frame.y(txy) });
  const Y = $derived({ x: frame.x(sy), y: frame.y(-txy) });
  const Xr = $derived({ x: frame.x(rot.sx), y: frame.y(rot.txy) });
  const Yr = $derived({ x: frame.x(rot.sy), y: frame.y(-rot.txy) });
  const rotated = $derived(Math.abs(theta) > 1e-9);
  const angleX = $derived(Math.atan2(X.y - cy, X.x - cx));

  type Pt = { x: number; y: number };
  const outward = (pt: Pt, d: number) => {
    const dx = pt.x - cx, dy = pt.y - cy, len = Math.hypot(dx, dy);
    return len < 1e-6 ? { x: pt.x + d * 0.7, y: pt.y - d * 0.7 } : { x: pt.x + (dx / len) * d, y: pt.y + (dy / len) * d + 4.5 };
  };

  const arc = $derived.by(() => {
    if (point || !rotated) return null;
    const delta = ((tauDown ? -2 : 2) * theta * Math.PI) / 180;
    const ra = Math.min(Math.max(rPx * 0.32, 22), rPx * 0.7);
    const a1 = angleX + delta, mid = angleX + delta / 2;
    const at = (a: number, rr = ra) => ({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
    const s = at(angleX), e = at(a1);
    const tick = (a: number) => { const i = at(a, ra - 5), o = at(a, ra + 5); return `M${i.x} ${i.y}L${o.x} ${o.y}`; };
    const label = at(mid, ra + 16);
    return {
      d: `M${s.x} ${s.y} A${ra} ${ra} 0 ${Math.abs(delta) > Math.PI ? 1 : 0} ${delta > 0 ? 1 : 0} ${e.x} ${e.y}`,
      ticks: tick(angleX) + tick(a1),
      lx: label.x, ly: label.y + 4,
      anchor: Math.abs(Math.cos(mid)) < 0.35 ? 'middle' : Math.cos(mid) > 0 ? 'start' : 'end',
    };
  });

  const top = $derived({ x: cx, y: frame.y(tauDown ? -p.radius : p.radius) });
  const bottom = $derived({ x: cx, y: frame.y(tauDown ? p.radius : -p.radius) });
  const P1 = $derived({ x: frame.x(p.sigma1), y: cy });
  const P2 = $derived({ x: frame.x(p.sigma2), y: cy });
  const near = (a: Pt, b: Pt, d = 26) => Math.hypot(a.x - b.x, a.y - b.y) < d;
  const s1Label = $derived(`σ₁ ${fmt(p.sigma1)}`);
  const s2Label = $derived(`σ₂ ${fmt(p.sigma2)}`);
  const labelY = (pt: Pt) => {
    const crowd = [Xr, Yr].find((q) => near(pt, q, 46));
    return crowd && crowd.y > cy + 2 ? cy - 9 : cy + 18;
  };
  const clampX = (x: number, text: string, anchor: 'start' | 'end') => {
    const w = text.length * 7.4;
    return anchor === 'start' ? Math.min(x, W - 4 - w) : Math.max(x, 4 + w);
  };
  const thetaS = $derived(wrapAngle(p.theta1 - 45));
  const targets = $derived([p.theta1, p.theta2, thetaS, thetaS + 90, 0, 90].flatMap((t) => [wrapAngle(t), wrapAngle(t + 180)]));

  let svg = $state<SVGSVGElement>();
  let dragging = $state<'x' | 'y' | null>(null);
  function svgPoint(e: PointerEvent) {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  }
  function follow(e: PointerEvent) {
    const q = svgPoint(e);
    if (!q || !dragging) return;
    const a = Math.atan2(q.y - cy, q.x - cx) + (dragging === 'y' ? Math.PI : 0);
    const next = thetaOnCircle(a, angleX, tauDown, theta);
    const snapped = snapAngle(next, targets, (6 / Math.max(rPx, 1)) * (180 / Math.PI) / 2);
    theta = snapped === next ? roundTo(next, 0.5) : Number(snapped.toFixed(4));
  }
  function grab(which: 'x' | 'y') {
    return (e: PointerEvent) => {
      if (point) return;
      e.preventDefault();
      dragging = which;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      follow(e);
    };
  }
  function release() { dragging = null; }
  function keys(e: KeyboardEvent) {
    const step = e.shiftKey ? 5 : 0.5;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (e.key === 'Home') theta = 0;
    else if (dir) theta = Math.max(-180, Math.min(180, roundTo(theta + dir * step, 0.5)));
    else return;
    e.preventDefault();
  }
  const go = (t: number) => () => { theta = Number(wrapAngle(t).toFixed(4)); };
  const goKey = (t: number) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(t)(); } };
  const hover = (f: Focus2D) => ({ onpointerenter: () => (focus = f), onpointerleave: () => (focus = null), onfocus: () => (focus = f), onblur: () => (focus = null) });
</script>

<div class="mh-plot-box" bind:clientWidth={cw} bind:clientHeight={ch}>
<svg bind:this={svg} class="mh-plot" class:mh-dragging={dragging} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={tm('mohr.circleLabel')} data-testid="mohr2d-circle"
  onpointermove={follow} onpointerup={release} onpointercancel={release}>
  {#each xTicks as v (v)}
    <line class="mh-grid" x1={frame.x(v)} x2={frame.x(v)} y1={box.top} y2={box.top + box.height} />
    <text class="mh-tick" x={frame.x(v)} y={box.top + box.height + 16} text-anchor="middle">{tickLabel(v)}</text>
  {/each}
  {#each yTicks as v (v)}
    <line class="mh-grid" y1={frame.y(v)} y2={frame.y(v)} x1={box.left} x2={box.left + box.width} />
    <text class="mh-tick" x={box.left - 6} y={frame.y(v) + 4} text-anchor="end">{tickLabel(v)}</text>
  {/each}
  <line class="mh-axis" x1={box.left} x2={box.left + box.width} y1={cy} y2={cy} />
  {#if frame.xMin < 0 && frame.xMax > 0}<line class="mh-axis" x1={frame.x(0)} x2={frame.x(0)} y1={box.top} y2={box.top + box.height} />{/if}
  <text class="mh-axis-title" x={box.left + box.width} y={box.top + box.height + 34} text-anchor="end">σ [{unit}]</text>
  <text class="mh-axis-title" x={box.left + 4} y={box.top - 10}>τ [{unit}] {tauDown ? '+↓' : '+↑'}</text>

  {#if !point}
    <circle class="mh-circle" cx={cx} cy={cy} r={rPx} />
    <circle class="mh-center" cx={cx} cy={cy} r="2.5" />
    {#if rotated}<line class="mh-diam-ref" x1={X.x} y1={X.y} x2={Y.x} y2={Y.y} />{/if}
    <line class="mh-diam" x1={Xr.x} y1={Xr.y} x2={Yr.x} y2={Yr.y} />
    {#if arc}
      <path class="mh-arc" d={arc.d} /><path class="mh-arc" d={arc.ticks} />
      <text class="mh-arc-label" x={arc.lx} y={arc.ly} text-anchor={arc.anchor}>2θ</text>
    {/if}
    {#each [{ pt: top, t: thetaS, f: 'tmax' as const }, { pt: bottom, t: thetaS + 90, f: 'tmax' as const }] as m, i (i)}
      <g class="mh-hit" class:mh-on={focus === m.f} role="button" tabindex="0" aria-label={`${tm('mohr.goShear')} (θ = ${fmt1(wrapAngle(m.t))}°)`} {...hover(m.f)} onclick={go(m.t)} onkeydown={goKey(m.t)} data-testid={i === 0 ? 'mohr2d-go-tmax' : undefined}>
        <circle class="mh-hit-area" cx={m.pt.x} cy={m.pt.y} r="16" />
        <circle class="mh-shear-pt" cx={m.pt.x} cy={m.pt.y} r="4.5" />
      </g>
    {/each}
    <text class="mh-shear-text" x={top.x} y={top.y + (tauDown ? 20 : -10)} text-anchor="middle">τ<tspan class="mh-sub" dy="3">max</tspan><tspan dy="-3"> {fmt(p.radius)}</tspan></text>
    {#each [{ pt: P1, t: p.theta1, f: 'p1' as const, testid: 'mohr2d-go-p1' }, { pt: P2, t: p.theta2, f: 'p2' as const, testid: 'mohr2d-go-p2' }] as m (m.f)}
      <g class="mh-hit" class:mh-on={focus === m.f} role="button" tabindex="0" aria-label={`${tm('mohr.goPrincipal')} (θ = ${fmt1(wrapAngle(m.t))}°)`} {...hover(m.f)} onclick={go(m.t)} onkeydown={goKey(m.t)} data-testid={m.testid}>
        <circle class="mh-hit-area" cx={m.pt.x} cy={m.pt.y} r="16" />
        <circle class="mh-principal-pt" cx={m.pt.x} cy={m.pt.y} r="5" />
      </g>
    {/each}
    <text class="mh-principal-label" class:mh-on={focus === 'p1'} x={clampX(P1.x + 7, s1Label, 'start')} y={labelY(P1)} text-anchor="start" data-testid="mohr2d-s1-label">{s1Label}</text>
    <text class="mh-principal-label" class:mh-on={focus === 'p2'} x={clampX(P2.x - 7, s2Label, 'end')} y={labelY(P2)} text-anchor="end">{s2Label}</text>
    {#if rotated}
      <circle class="mh-ref-pt" cx={X.x} cy={X.y} r="3" />
      <circle class="mh-ref-pt" cx={Y.x} cy={Y.y} r="3" />
      {#if !near(X, Xr, 22)}<text class="mh-ref-label" x={outward(X, 14).x} y={outward(X, 14).y} text-anchor="middle">X</text>{/if}
      {#if !near(Y, Yr, 22)}<text class="mh-ref-label" x={outward(Y, 14).x} y={outward(Y, 14).y} text-anchor="middle">Y</text>{/if}
    {/if}
    <circle class="mh-rot-pt mh-hollow" cx={Yr.x} cy={Yr.y} r="5" />
    <circle class="mh-rot-halo" cx={Xr.x} cy={Xr.y} r="12" />
    <circle class="mh-rot-pt" cx={Xr.x} cy={Xr.y} r="6.5" />
    <text class="mh-rot-label" x={outward(Xr, 22).x} y={outward(Xr, 22).y} text-anchor="middle">{rotated ? 'X′' : 'X'}</text>
    <text class="mh-rot-label mh-rot-label-y" x={outward(Yr, 18).x} y={outward(Yr, 18).y} text-anchor="middle">{rotated ? 'Y′' : 'Y'}</text>
    <circle class="mh-drag" cx={Yr.x} cy={Yr.y} r="18" onpointerdown={grab('y')} aria-hidden="true" />
    <circle class="mh-drag" cx={Xr.x} cy={Xr.y} r="22" role="slider" tabindex="0" aria-label={tm('mohr.dragPoint')} aria-valuemin={-180} aria-valuemax={180} aria-valuenow={theta} aria-valuetext={`θ = ${fmt1(theta)}°`}
      onpointerdown={grab('x')} onkeydown={keys} data-testid="mohr2d-drag-x" />
  {:else}
    <circle class="mh-principal-pt" cx={cx} cy={cy} r="5" />
    <text class="mh-principal-label" x={cx} y={cy + 22} text-anchor="middle" data-testid="mohr2d-s1-label">σ₁ = σ₂ = {fmt(p.sigma1)}</text>
  {/if}
</svg>
</div>
