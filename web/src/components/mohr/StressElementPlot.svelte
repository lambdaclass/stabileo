<script lang="ts">
  import { principalPlane, rotatePlane } from '../../lib/mohr/plane';
  import { snapAngle, roundTo } from '../../lib/mohr/plot';
  import { wrapAngle } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';
  import type { Focus2D } from './focus';

  let { sx, sy, txy, theta = $bindable(), focus = $bindable(null) }: { sx: number; sy: number; txy: number; theta: number; focus?: Focus2D } = $props();

  let cw = $state(0);
  const W = $derived(Math.max(260, Math.round(cw) || 360));
  const H = $derived(Math.round(Math.min(400, Math.max(270, W * 0.92))));
  const CX = $derived(W / 2), CY = $derived(H / 2);
  const reach = $derived(Math.min(W, H) / 2);
  const HALF = $derived(Math.max(26, Math.min(62, (reach - 40) / 2.2)));
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
  const fixed = $derived(at(0));

  type Arrow = { from: P; to: P; head: string };
  function arrow(from: P, to: P, s = 6.5): Arrow {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    return { from, to, head: `${to.x},${to.y} ${to.x - ux * s * 1.5 - uy * s * 0.6},${to.y - uy * s * 1.5 + ux * s * 0.6} ${to.x - ux * s * 1.5 + uy * s * 0.6},${to.y - uy * s * 1.5 - ux * s * 0.6}` };
  }
  const normalLen = (v: number) => HALF * (0.3 + 0.75 * Math.abs(v) / big);

  const square = $derived([local(-HALF, -HALF), local(HALF, -HALF), local(HALF, HALF), local(-HALF, HALF)].map((q) => `${q.x},${q.y}`).join(' '));

  const normals = $derived.by(() => {
    const out: (Arrow & { tension: boolean })[] = [];
    for (const [value, dirX, dirY] of [[r.sx, 1, 0], [r.sx, -1, 0], [r.sy, 0, 1], [r.sy, 0, -1]] as const) {
      if (tiny(value)) continue;
      const L = normalLen(value), base = HALF + 4;
      const nearPt = local(dirX * base, dirY * base), far = local(dirX * (base + L), dirY * (base + L));
      out.push({ ...(value > 0 ? arrow(nearPt, far) : arrow(far, nearPt)), tension: value > 0 });
    }
    return out;
  });

  const shears = $derived.by(() => {
    if (tiny(r.txy)) return [] as Arrow[];
    const L = Math.max(14, (1.5 * HALF * Math.abs(r.txy)) / big) / 2, g = HALF + 9, s = Math.sign(r.txy);
    return [
      arrow(local(g, -s * L), local(g, s * L)),
      arrow(local(-g, s * L), local(-g, -s * L)),
      arrow(local(-s * L, g), local(s * L, g)),
      arrow(local(s * L, -g), local(-s * L, -g)),
    ];
  });

  const inside = (q: P, text: string) => {
    const w = text.length * 7.6;
    return { x: Math.min(W - 4 - w / 2, Math.max(4 + w / 2, q.x)), y: Math.min(H - 6, Math.max(16, q.y + 4.5)) };
  };
  const sxLabel = $derived(inside(local(HALF + 4 + (tiny(r.sx) ? 0 : normalLen(r.sx)) + 30, 0), fmt(r.sx)));
  const syLabel = $derived(inside(local(0, HALF + 4 + (tiny(r.sy) ? 0 : normalLen(r.sy)) + 15), fmt(r.sy)));
  const tauLabel = $derived(inside(local(HALF + 26, HALF + 26), fmt(r.txy)));

  const lineLen = $derived(reach - 10);
  const directions = $derived([
    { key: 'p1' as const, label: 'σ₁', angle: p.theta1 },
    { key: 'p2' as const, label: 'σ₂', angle: p.theta2 },
  ].map((d) => ({ ...d, a: at(d.angle)(lineLen, 0), b: at(d.angle)(-lineLen, 0), tag: inside(at(d.angle)(-(lineLen - 14), 11), d.label) })));
  const showDirections = $derived(!tiny(p.tauMax));

  const rotated = $derived(Math.abs(theta) > 1e-9);
  const thetaArc = $derived.by(() => {
    const ra = HALF * 0.62, a = (theta * Math.PI) / 180;
    const s = fixed(ra, 0), e = local(ra, 0);
    const mid = at(theta / 2)(ra + 13, 0);
    return { d: `M${s.x} ${s.y} A${ra} ${ra} 0 ${Math.abs(theta) > 180 ? 1 : 0} ${a > 0 ? 0 : 1} ${e.x} ${e.y}`, mid };
  });
  const xAxis = $derived({ a: fixed(-reach + 6, 0), b: fixed(reach - 6, 0) });
  const yAxis = $derived({ a: fixed(0, -reach + 6), b: fixed(0, reach - 6) });
  const ray = $derived(local(HALF, 0));
  const knob = $derived(local(-(HALF + 16), HALF + 16));

  const targets = $derived([p.theta1, p.theta2, p.theta1 - 45, p.theta1 + 45, 0, 90].flatMap((t) => [wrapAngle(t), wrapAngle(t + 180)]));
  let svg = $state<SVGSVGElement>();
  let turn = $state<{ start: number; theta: number; id: number } | null>(null);
  function pointerAngle(e: PointerEvent) {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return (Math.atan2(-(q.y - CY), q.x - CX) * 180) / Math.PI;
  }
  function grab(e: PointerEvent) {
    const a = pointerAngle(e);
    if (a === null) return;
    e.preventDefault();
    turn = { start: a, theta, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function drag(e: PointerEvent) {
    if (!turn || turn.id !== e.pointerId) return;
    const a = pointerAngle(e);
    if (a === null) return;
    const next = wrapAngle(turn.theta + a - turn.start);
    const snapped = snapAngle(next, targets, 2.5);
    theta = snapped === next ? roundTo(next, 0.5) : Number(snapped.toFixed(4));
  }
  function release() { turn = null; }
  function keys(e: KeyboardEvent) {
    const step = e.shiftKey ? 5 : 0.5;
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? -1 : 0;
    if (e.key === 'Home') theta = 0;
    else if (dir) theta = Math.max(-180, Math.min(180, roundTo(theta + dir * step, 0.5)));
    else return;
    e.preventDefault();
  }
</script>

<div class="mh-plot-box" bind:clientWidth={cw}>
<svg bind:this={svg} class="mh-plot" class:mh-dragging={turn} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={tm('mohr.elementLabel')} data-testid="mohr2d-element"
  onpointermove={drag} onpointerup={release} onpointercancel={release}>
  <title>{tm('mohr.elementLabel')}</title>
  <line class="mh-ref-axis" x1={xAxis.a.x} y1={xAxis.a.y} x2={xAxis.b.x} y2={xAxis.b.y} />
  <line class="mh-ref-axis" x1={yAxis.a.x} y1={yAxis.a.y} x2={yAxis.b.x} y2={yAxis.b.y} />
  <g class="mh-triad" aria-hidden="true">
    <line class="mh-axis3" x1="20" y1={H - 20} x2="44" y2={H - 20} /><polygon class="mh-triad-head" points={`48,${H - 20} 41,${H - 23.5} 41,${H - 16.5}`} />
    <line class="mh-axis3" x1="20" y1={H - 20} x2="20" y2={H - 44} /><polygon class="mh-triad-head" points={`20,${H - 48} 16.5,${H - 41} 23.5,${H - 41}`} />
    <text class="mh-ref-axis-label" x="54" y={H - 16}>x</text>
    <text class="mh-ref-axis-label" x="16" y={H - 53}>y</text>
  </g>
  {#if showDirections}
    {#each directions as d (d.key)}
      <g class="mh-dir-line" class:mh-on={focus === d.key} role="presentation" onpointerenter={() => (focus = d.key)} onpointerleave={() => (focus = null)}>
        <line class="mh-hit-line" x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} />
        <line class="mh-direction" x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} />
        <text class="mh-direction-label" x={d.tag.x} y={d.tag.y} text-anchor="middle">{d.label}</text>
      </g>
    {/each}
  {/if}
  <polygon class="mh-square" points={square} onpointerdown={grab} role="presentation" data-testid="mohr2d-element-square" />
  {#if rotated}
    <path class="mh-arc" d={thetaArc.d} />
    <text class="mh-arc-label" x={thetaArc.mid.x} y={thetaArc.mid.y + 4} text-anchor="middle">θ</text>
  {/if}
  <line class="mh-xray" x1={CX} y1={CY} x2={ray.x} y2={ray.y} />
  {#each normals as a, i (i)}
    <g class={a.tension ? 'mh-ten' : 'mh-comp'}>
      <line class="mh-normal" x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />
      <polygon class="mh-normal-head" points={a.head} />
    </g>
  {/each}
  {#each shears as a, i (i)}
    <line class="mh-shear" x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />
    <polygon class="mh-shear-head" points={a.head} />
  {/each}
  <text class="mh-value {r.sx >= 0 ? 'mh-ten' : 'mh-comp'}" x={sxLabel.x} y={sxLabel.y} text-anchor="middle">{fmt(r.sx)}</text>
  <text class="mh-value {r.sy >= 0 ? 'mh-ten' : 'mh-comp'}" x={syLabel.x} y={syLabel.y} text-anchor="middle">{fmt(r.sy)}</text>
  {#if !tiny(r.txy)}<text class="mh-value mh-shear-text" x={tauLabel.x} y={tauLabel.y} text-anchor="middle">{fmt(r.txy)}</text>{/if}
  <g class="mh-knob" role="slider" tabindex="0" aria-label={tm('mohr.turnElement')} aria-valuemin={-180} aria-valuemax={180} aria-valuenow={theta}
    onpointerdown={grab} onkeydown={keys} data-testid="mohr2d-element-knob">
    <title>{tm('mohr.turnElement')}</title>
    <circle class="mh-hit-area" cx={knob.x} cy={knob.y} r="20" />
    <path class="mh-knob-arc" d={`M${knob.x - 7} ${knob.y + 3} A8 8 0 1 1 ${knob.x + 3} ${knob.y + 7}`} />
    <circle class="mh-knob-dot" cx={knob.x} cy={knob.y} r="2.5" />
  </g>
</svg>
</div>
