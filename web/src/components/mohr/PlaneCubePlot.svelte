<script lang="ts">
  import { planeThroughCube, splitTraction, type Tensor3, type Vec3 } from '../../lib/mohr/space';
  import { tm } from './i18n';

  let { s, n, peak, alpha = $bindable(), beta = $bindable(), fit = false }: { s: Tensor3; n: Vec3; peak: number; alpha: number; beta: number; fit?: boolean } = $props();

  let cw = $state(0), ch = $state(0);
  const W = $derived(Math.max(200, Math.round(cw) || 320));
  const H = $derived(fit && ch > 120 ? Math.round(ch) : Math.round(Math.min(340, Math.max(220, W * 0.78))));
  const CX = $derived(W / 2), CY = $derived(H / 2 + 4);
  const h = $derived(Math.min(W * 0.24, H * 0.29));

  const basis = $derived.by(() => {
    const a = (alpha * Math.PI) / 180, b = (beta * Math.PI) / 180;
    return {
      c: [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)] as Vec3,
      r: [-Math.sin(a), Math.cos(a), 0] as Vec3,
      u: [-Math.sin(b) * Math.cos(a), -Math.sin(b) * Math.sin(a), Math.cos(b)] as Vec3,
    };
  });
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const proj = (p: Vec3) => ({ x: CX + h * dot(p, basis.r), y: CY - h * dot(p, basis.u) });
  const pts = (list: Vec3[]) => list.map((p) => { const q = proj(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');

  const edges = $derived.by(() => {
    const front: string[] = [], back: string[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, k = (i + 2) % 3;
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const p: Vec3 = [0, 0, 0], q: Vec3 = [0, 0, 0];
        p[i] = -1; q[i] = 1; p[j] = q[j] = a; p[k] = q[k] = b;
        const P = proj(p), Q = proj(q), d = `M${P.x.toFixed(1)} ${P.y.toFixed(1)}L${Q.x.toFixed(1)} ${Q.y.toFixed(1)}`;
        (a * basis.c[j] > 0 || b * basis.c[k] > 0 ? front : back).push(d);
      }
    }
    return { front: front.join(''), back: back.join('') };
  });
  const faces = $derived.by(() => {
    const out: string[] = [];
    for (let i = 0; i < 3; i++) {
      const sgn = basis.c[i] > 0 ? 1 : -1, j = (i + 1) % 3, k = (i + 2) % 3;
      const corner = (a: number, b: number): Vec3 => { const p: Vec3 = [0, 0, 0]; p[i] = sgn; p[j] = a; p[k] = b; return p; };
      out.push(pts([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]));
    }
    return out;
  });
  const cut = $derived(pts(planeThroughCube(n, 1)));

  type Arrow = { d: string; head: string; tip: { x: number; y: number }; len: number };
  function arrow(from: Vec3, to: Vec3, size = 6): Arrow {
    const a = proj(from), b = proj(to);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 3) return { d: '', head: '', tip: b, len };
    const ux = dx / len, uy = dy / len, s2 = Math.min(size, len * 0.5);
    return {
      d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      head: `${b.x.toFixed(1)},${b.y.toFixed(1)} ${(b.x - ux * s2 * 1.6 - uy * s2 * 0.65).toFixed(1)},${(b.y - uy * s2 * 1.6 + ux * s2 * 0.65).toFixed(1)} ${(b.x - ux * s2 * 1.6 + uy * s2 * 0.65).toFixed(1)},${(b.y - uy * s2 * 1.6 - ux * s2 * 0.65).toFixed(1)}`,
      tip: b, len,
    };
  }
  const O: Vec3 = [0, 0, 0];
  const scaled = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];
  const parts = $derived.by(() => {
    const split = splitTraction(s, n);
    const k = 1.45 / Math.max(peak, 1e-12);
    const t = scaled(split.t, k), nn = scaled(split.normal, k), sh = scaled(split.shear, k);
    const polygon = planeThroughCube(n, 1);
    const far = polygon.reduce((best, p) => (dot(p, basis.u) > dot(best, basis.u) ? p : best), polygon[0] ?? O);
    const anchor: Vec3 = [far[0] * 0.6, far[1] * 0.6, far[2] * 0.6];
    const label = (v: Vec3, d = 14) => { const tip = proj(v), o = proj(O), dx = tip.x - o.x, dy = tip.y - o.y, l = Math.hypot(dx, dy) || 1; return { x: tip.x + (dx / l) * d, y: tip.y + (dy / l) * d + 4.5 }; };
    return {
      normalAxis: arrow(anchor, [anchor[0] + 0.75 * n[0], anchor[1] + 0.75 * n[1], anchor[2] + 0.75 * n[2]], 5),
      nLabel: proj([anchor[0] + 0.95 * n[0], anchor[1] + 0.95 * n[1], anchor[2] + 0.95 * n[2]]),
      t: arrow(O, t, 7), tLabel: label(t),
      sigma: arrow(O, nn, 6), sigmaLabel: label(nn, 16), tension: split.sigmaN >= 0,
      tau: arrow(O, sh, 6), tauLabel: label(sh, 16),
      close1: `M${proj(nn).x} ${proj(nn).y}L${proj(t).x} ${proj(t).y}`,
      close2: `M${proj(sh).x} ${proj(sh).y}L${proj(t).x} ${proj(t).y}`,
    };
  });
  const triad = $derived((['x', 'y', 'z'] as const).map((name, i) => {
    const e: Vec3 = [0, 0, 0]; e[i] = 1;
    const o = { x: 26, y: H - 26 }, len = 20;
    const dx = dot(e, basis.r) * len, dy = -dot(e, basis.u) * len;
    return { name, x2: o.x + dx, y2: o.y + dy, lx: o.x + dx * 1.45, ly: o.y + dy * 1.45 + 4, x1: o.x, y1: o.y };
  }));

  let drag: { x: number; y: number; id: number } | null = null;
  function down(e: PointerEvent) { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); }
  function move(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    alpha -= (e.clientX - drag.x) * 0.5;
    beta = Math.max(-89, Math.min(89, beta + (e.clientY - drag.y) * 0.5));
    drag.x = e.clientX; drag.y = e.clientY;
  }
</script>

<div class="mh-plot-box" bind:clientWidth={cw} bind:clientHeight={ch}>
<svg class="mh-plot mh-sphere" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={tm('mohr.cubeLabel')} data-testid="mohr3d-cube"
  onpointerdown={down} onpointermove={move} onpointerup={() => (drag = null)} onpointercancel={() => (drag = null)}>
  <path class="mh-cube-edge-back" d={edges.back} />
  {#each faces as f, i (i)}<polygon class="mh-cube-face" points={f} />{/each}
  <polygon class="mh-cut" points={cut} data-testid="mohr3d-cut" />
  <path class="mh-cube-edge" d={edges.front} />
  {#if parts.normalAxis.d}
    <path class="mh-normal-vec" d={parts.normalAxis.d} /><polygon class="mh-normal-vec-head" points={parts.normalAxis.head} />
    <text class="mh-n-label" x={parts.nLabel.x} y={parts.nLabel.y + 5} text-anchor="middle">n</text>
  {/if}
  {#if parts.sigma.d && parts.tau.d}
    <path class="mh-comp-line" d={parts.close1} /><path class="mh-comp-line" d={parts.close2} />
  {/if}
  {#if parts.sigma.d}
    <path class="mh-part {parts.tension ? 'mh-ten' : 'mh-comp'}" d={parts.sigma.d} /><polygon class="mh-part-head {parts.tension ? 'mh-ten' : 'mh-comp'}" points={parts.sigma.head} />
    <text class="mh-part-label {parts.tension ? 'mh-ten' : 'mh-comp'}" x={parts.sigmaLabel.x} y={parts.sigmaLabel.y} text-anchor="middle">σ<tspan class="mh-sub" dy="3">n</tspan></text>
  {/if}
  {#if parts.tau.d}
    <path class="mh-part mh-shear-text" d={parts.tau.d} /><polygon class="mh-part-head mh-shear-text" points={parts.tau.head} />
    <text class="mh-part-label mh-shear-text" x={parts.tauLabel.x} y={parts.tauLabel.y} text-anchor="middle">τ<tspan class="mh-sub" dy="3">n</tspan></text>
  {/if}
  {#if parts.t.d && parts.sigma.len >= 10 && parts.tau.len >= 10}
    <path class="mh-t-vec" d={parts.t.d} /><polygon class="mh-t-head" points={parts.t.head} />
    <text class="mh-t-label" x={parts.tLabel.x} y={parts.tLabel.y} text-anchor="middle">t</text>
  {/if}
  {#each triad as a (a.name)}
    <line class="mh-axis3" x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />
    <text class="mh-axis3-label mh-axis3-small" x={a.lx} y={a.ly} text-anchor="middle">{a.name}</text>
  {/each}
</svg>
</div>
