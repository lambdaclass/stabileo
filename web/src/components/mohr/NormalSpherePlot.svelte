<script lang="ts" module>
  export interface SphereSettings { density: number; length: number; opacity: number; range: number; showPrincipal: boolean }
</script>

<script lang="ts">
  import { onPlane, sphereSamples, traction, type Tensor3, type Vec3, type Principal3 } from '../../lib/mohr/space';
  import { divergingColor } from '../../lib/mohr/plot';
  import type { Unit } from '../../lib/mohr/state';
  import { tm, formatter } from './i18n';

  let { s, n, principal, settings, unit, onpick }: { s: Tensor3; n: Vec3; principal: Principal3; settings: SphereSettings; unit: Unit; onpick: (n: Vec3) => void } = $props();
  const uid = $props.id();

  const W = 460, H = 520, CX = 230, CY = 245, S = 140;
  const VIEW = { alpha: 35, beta: 20 };
  let alpha = $state(VIEW.alpha), beta = $state(VIEW.beta);
  const fmt = $derived(formatter(1));

  const basis = $derived.by(() => {
    const a = (alpha * Math.PI) / 180, b = (beta * Math.PI) / 180;
    const c: Vec3 = [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
    const r: Vec3 = [-Math.sin(a), Math.cos(a), 0];
    const u: Vec3 = [-Math.sin(b) * Math.cos(a), -Math.sin(b) * Math.sin(a), Math.cos(b)];
    return { c, r, u };
  });
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const proj = (p: Vec3) => ({ x: CX + S * dot(p, basis.r), y: CY - S * dot(p, basis.u), z: dot(p, basis.c) });

  const peak = $derived(Math.max(Math.abs(principal.values[0]), Math.abs(principal.values[2]), 1e-12));
  const colourRange = $derived(peak * settings.range);
  const samples = $derived(sphereSamples(settings.density));

  type Arrow = { d: string; head: string; colour: string; z: number };
  function arrowPath(base: Vec3, tip: Vec3, head = 5): { d: string; head: string } {
    const a = proj(base), b = proj(tip);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 0.5) return { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, head: '' };
    const ux = dx / len, uy = dy / len, h = Math.min(head, len * 0.6);
    return {
      d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      head: `${b.x.toFixed(1)},${b.y.toFixed(1)} ${(b.x - ux * h * 1.6 - uy * h * 0.7).toFixed(1)},${(b.y - uy * h * 1.6 + ux * h * 0.7).toFixed(1)} ${(b.x - ux * h * 1.6 + uy * h * 0.7).toFixed(1)},${(b.y - uy * h * 1.6 - ux * h * 0.7).toFixed(1)}`,
    };
  }
  const k = $derived((0.45 * settings.length) / peak);
  const arrows = $derived.by(() => {
    const out: Arrow[] = [];
    for (const m of samples) {
      const t = traction(s, m);
      const sn = dot(t, m);
      const tip: Vec3 = [m[0] + k * t[0], m[1] + k * t[1], m[2] + k * t[2]];
      out.push({ ...arrowPath(m, tip, 3.2), colour: divergingColor(sn, colourRange), z: dot(m, basis.c) });
    }
    return out.sort((a, b) => a.z - b.z);
  });
  const back = $derived(arrows.filter((a) => a.z < 0));
  const front = $derived(arrows.filter((a) => a.z >= 0));

  function ring(e1: Vec3, e2: Vec3, steps = 96) {
    let fr = '', bk = '';
    let prevFront: boolean | null = null;
    for (let i = 0; i <= steps; i++) {
      const a = (2 * Math.PI * i) / steps;
      const q: Vec3 = [Math.cos(a) * e1[0] + Math.sin(a) * e2[0], Math.cos(a) * e1[1] + Math.sin(a) * e2[1], Math.cos(a) * e1[2] + Math.sin(a) * e2[2]];
      const p = proj(q), isFront = p.z >= 0;
      const cmd = prevFront === isFront ? 'L' : 'M';
      if (isFront) fr += `${cmd}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; else bk += `${cmd}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      prevFront = isFront;
    }
    return { front: fr, back: bk };
  }
  const wire = $derived([ring([1, 0, 0], [0, 1, 0]), ring([1, 0, 0], [0, 0, 1]), ring([0, 1, 0], [0, 0, 1])]);

  const planeRing = $derived.by(() => {
    const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1raw: Vec3 = [helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]];
    const l = Math.hypot(...e1raw) || 1;
    const e1: Vec3 = [e1raw[0] / l, e1raw[1] / l, e1raw[2] / l];
    const e2: Vec3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const capAngle = 0.32, cc = Math.cos(capAngle), cs = Math.sin(capAngle);
    const cap = Array.from({ length: 48 }, (_, i) => {
      const a = (2 * Math.PI * i) / 48;
      const q: Vec3 = [0, 1, 2].map((j) => cc * n[j] + cs * (Math.cos(a) * e1[j] + Math.sin(a) * e2[j])) as Vec3;
      const p = proj(q);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');
    return { ...ring(e1, e2), cap, capFront: dot(n, basis.c) >= 0 };
  });
  const selected = $derived.by(() => {
    const { t, sigmaN } = onPlane(s, n);
    const normal = arrowPath([0, 0, 0], [1.3 * n[0], 1.3 * n[1], 1.3 * n[2]], 6);
    const tip: Vec3 = [n[0] + k * t[0], n[1] + k * t[1], n[2] + k * t[2]];
    const label = proj([1.42 * n[0], 1.42 * n[1], 1.42 * n[2]]);
    return { normal, traction: arrowPath(n, tip, 6), colour: divergingColor(sigmaN, colourRange), label, base: proj(n) };
  });

  const axes = $derived((['x', 'y', 'z'] as const).map((name, i) => {
    const e: Vec3 = [0, 0, 0]; e[i] = 1.5;
    const tip = proj(e), label = proj([e[0] * 1.1, e[1] * 1.1, e[2] * 1.1]);
    return { name, tip, label };
  }));
  const principalAxes = $derived(principal.directions.map((d, i) => {
    const a = proj([1.35 * d[0], 1.35 * d[1], 1.35 * d[2]]), b = proj([-1.35 * d[0], -1.35 * d[1], -1.35 * d[2]]);
    const label = proj([1.48 * d[0], 1.48 * d[1], 1.48 * d[2]]);
    return { a, b, label, name: ['σ₁', 'σ₂', 'σ₃'][i] };
  }));

  let svg = $state<SVGSVGElement>();
  let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  function toSvg(e: PointerEvent) {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  }
  function down(e: PointerEvent) {
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    alpha -= dx * 0.5;
    beta = Math.max(-89, Math.min(89, beta + dy * 0.5));
    drag.x = e.clientX; drag.y = e.clientY;
  }
  function up(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const click = !drag.moved;
    drag = null;
    if (!click) return;
    const p = toSvg(e);
    if (!p) return;
    const vx = (p.x - CX) / S, vy = -(p.y - CY) / S, rr = vx * vx + vy * vy;
    if (rr > 1) return;
    const vz = Math.sqrt(1 - rr), { r, u, c } = basis;
    onpick([vx * r[0] + vy * u[0] + vz * c[0], vx * r[1] + vy * u[1] + vz * c[1], vx * r[2] + vy * u[2] + vz * c[2]]);
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowLeft') alpha += step;
    else if (e.key === 'ArrowRight') alpha -= step;
    else if (e.key === 'ArrowUp') beta = Math.min(89, beta + step);
    else if (e.key === 'ArrowDown') beta = Math.max(-89, beta - step);
    else return;
    e.preventDefault();
  }
  export function resetView() { alpha = VIEW.alpha; beta = VIEW.beta; }

  const BAR = { x: 40, y: H - 46, w: W - 80, h: 10 };
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<svg bind:this={svg} class="mh-plot mh-sphere" viewBox={`0 0 ${W} ${H}`} role="application" aria-label={tm('mohr.sphereLabel')} tabindex="0" data-testid="mohr3d-sphere"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (drag = null)} onkeydown={key}>
  <title>{tm('mohr.sphereLabel')}</title>
  <defs>
    <linearGradient id={`${uid}-bar`} x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color={divergingColor(-1, 1)} />
      <stop offset="0.5" stop-color={divergingColor(0, 1)} />
      <stop offset="1" stop-color={divergingColor(1, 1)} />
    </linearGradient>
    <radialGradient id={`${uid}-ball`} cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" class="mh-ball-light" />
      <stop offset="1" class="mh-ball-dark" />
    </radialGradient>
  </defs>
  {#each wire as w, i (i)}<path class="mh-wire mh-wire-back" d={w.back} />{/each}
  <path class="mh-plane-back" d={planeRing.back} />
  {#if !planeRing.capFront}<polygon class="mh-cap" points={planeRing.cap} />{/if}
  {#each back as a, i (i)}<path class="mh-vec" d={a.d} stroke={a.colour} /><polygon points={a.head} fill={a.colour} />{/each}
  <circle cx={CX} cy={CY} r={S} fill={`url(#${uid}-ball)`} fill-opacity={settings.opacity} class="mh-ball" />
  {#each wire as w, i (i)}<path class="mh-wire" d={w.front} />{/each}
  {#each axes as a (a.name)}
    <line class="mh-axis3" x1={CX} y1={CY} x2={a.tip.x} y2={a.tip.y} />
    <text class="mh-axis3-label" x={a.label.x} y={a.label.y + 5} text-anchor="middle">{a.name}</text>
  {/each}
  {#if settings.showPrincipal}
    {#each principalAxes as a (a.name)}
      <line class="mh-principal-axis" x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} />
      <text class="mh-principal-axis-label" x={a.label.x} y={a.label.y + 5} text-anchor="middle">{a.name}</text>
    {/each}
  {/if}
  <path class="mh-plane-front" d={planeRing.front} />
  {#if planeRing.capFront}<polygon class="mh-cap" points={planeRing.cap} />{/if}
  {#each front as a, i (i)}<path class="mh-vec" d={a.d} stroke={a.colour} /><polygon points={a.head} fill={a.colour} />{/each}
  <path class="mh-normal-vec" d={selected.normal.d} /><polygon class="mh-normal-vec-head" points={selected.normal.head} />
  <path class="mh-selected-t" d={selected.traction.d} stroke={selected.colour} /><polygon points={selected.traction.head} fill={selected.colour} />
  <circle class="mh-selected-base" cx={selected.base.x} cy={selected.base.y} r="4" />
  <text class="mh-n-label" x={selected.label.x} y={selected.label.y + 5} text-anchor="middle">n</text>

  <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx="3" fill={`url(#${uid}-bar)`} />
  <text class="mh-tick" x={BAR.x} y={BAR.y + 26} text-anchor="start">{fmt(-colourRange)}</text>
  <text class="mh-tick" x={BAR.x + BAR.w} y={BAR.y + 26} text-anchor="end">{fmt(colourRange)}</text>
  <text class="mh-tick" x={BAR.x + BAR.w / 2} y={BAR.y + 26} text-anchor="middle">{tm('mohr.colorbar')} [{unit}]</text>
</svg>
