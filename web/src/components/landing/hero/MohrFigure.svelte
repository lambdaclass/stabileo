<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, i18n } from '../../../lib/i18n/store.svelte';

  type V3 = [number, number, number];
  type Props = { prefersReducedMotion?: boolean; paused?: boolean };
  let { prefersReducedMotion = false, paused = false }: Props = $props();

  const SIGMA: [V3, V3, V3] = [[80, 30, 0], [30, 20, 0], [0, 0, -30]];
  const MID = 50, RAD = Math.hypot(30, 30);
  const P1 = MID + RAD, P2 = MID - RAD, P3 = -30;
  const PERIOD = 16;
  const STILL_AT = 0.62;
  const TILT = 0.95;
  const LIFT_FROM = 0.34, LIFT_SPAN = 0.6;

  let u = $state(prefersReducedMotion ? STILL_AT : 0);
  let hovered = $state(false);
  let focused = $state(false);
  const running = $derived(!prefersReducedMotion && !paused && !hovered && !focused);

  onMount(() => {
    if (prefersReducedMotion) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (running) u = (u + dt / PERIOD) % 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function lift(w: number): number {
    const x = (((w % 1) + 1) % 1 - LIFT_FROM) / LIFT_SPAN;
    return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2;
  }

  function normal(w: number): V3 {
    const phi = 2 * Math.PI * w;
    const psi = TILT * lift(w);
    return [Math.cos(phi) * Math.cos(psi), Math.sin(phi) * Math.cos(psi), Math.sin(psi)];
  }

  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const traction = (n: V3): V3 => [dot(SIGMA[0], n), dot(SIGMA[1], n), dot(SIGMA[2], n)];

  function onPlane(n: V3) {
    const tr = traction(n);
    const sn = dot(tr, n);
    const shear: V3 = [tr[0] - sn * n[0], tr[1] - sn * n[1], tr[2] - sn * n[2]];
    return { sn, tau: Math.hypot(...shear), shear };
  }

  const CUBE = { x: 112, y: 94, s: 45 };
  const VIEW = (() => {
    const a = (35 * Math.PI) / 180, b = (20 * Math.PI) / 180;
    return {
      r: [-Math.sin(a), Math.cos(a), 0] as V3,
      up: [-Math.sin(b) * Math.cos(a), -Math.sin(b) * Math.sin(a), Math.cos(b)] as V3,
    };
  })();
  const proj = (p: V3) => ({ x: CUBE.x + CUBE.s * dot(p, VIEW.r), y: CUBE.y - CUBE.s * dot(p, VIEW.up) });

  const CORNERS: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push([x, y, z]);
  const EDGES: [V3, V3][] = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const d = CORNERS[i].reduce((acc, c, k) => acc + (c !== CORNERS[j][k] ? 1 : 0), 0);
    if (d === 1) EDGES.push([CORNERS[i], CORNERS[j]]);
  }
  const AXES: { v: V3; label: string }[] = [
    { v: [1.75, 0, 0], label: 'x' }, { v: [0, 1.75, 0], label: 'y' }, { v: [0, 0, 1.6], label: 'z' },
  ];

  function section(n: V3): string {
    const pts: V3[] = [];
    for (const [a, b] of EDGES) {
      const da = dot(n, a), db = dot(n, b);
      if (da * db < 0) {
        const k = da / (da - db);
        pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
      }
    }
    const helper: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = cross(n, helper), e2 = cross(n, e1);
    pts.sort((p, q) => Math.atan2(dot(p, e2), dot(p, e1)) - Math.atan2(dot(q, e2), dot(q, e1)));
    return pts.map((p) => { const s = proj(p); return `${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(' ');
  }
  function cross(a: V3, b: V3): V3 {
    const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const m = Math.hypot(...c) || 1;
    return [c[0] / m, c[1] / m, c[2] / m];
  }

  function arrow(from: V3, to: V3, head = 4.5) {
    const a = proj(from), b = proj(to);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1) return { line: '', head: '' };
    const ux = dx / len, uy = dy / len, h = Math.min(head, len * 0.5);
    return {
      line: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${(b.x - ux * h).toFixed(1)} ${(b.y - uy * h).toFixed(1)}`,
      head: `${b.x.toFixed(1)},${b.y.toFixed(1)} ${(b.x - ux * h * 1.8 - uy * h).toFixed(1)},${(b.y - uy * h * 1.8 + ux * h).toFixed(1)} ${(b.x - ux * h * 1.8 + uy * h).toFixed(1)},${(b.y - uy * h * 1.8 - ux * h).toFixed(1)}`,
    };
  }

  const K = 2.4, X0 = 318, Y0 = 164;
  const sx = (s: number) => X0 + s * K;
  const ty = (tau: number) => Y0 - tau * K;
  const semi = (a: number, b: number) => {
    const r = ((b - a) / 2) * K;
    return `M${sx(a).toFixed(1)} ${Y0}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${sx(b).toFixed(1)} ${Y0}`;
  };
  const REGION = `${semi(P3, P1)}Z${semi(P3, P2)}Z${semi(P2, P1)}Z`;
  const SCALE = 1.5 / P1;

  const n = $derived(normal(u));
  const plane = $derived(onPlane(n));
  const planar = $derived(1 - lift(u));
  const point = $derived({ x: sx(plane.sn), y: ty(plane.tau) });
  const trail = $derived.by(() => {
    const pts: string[] = [];
    for (let i = 28; i >= 0; i--) {
      const s = onPlane(normal(u - i * 0.0045));
      pts.push(`${sx(s.sn).toFixed(1)},${ty(s.tau).toFixed(1)}`);
    }
    return pts.join(' ');
  });
  const tone = $derived(plane.sn >= 0 ? 'var(--mf-tension)' : 'var(--mf-compression)');
  const normalArrow = $derived(arrow([0, 0, 0], [n[0] * 1.55, n[1] * 1.55, n[2] * 1.55]));
  const normalPart = $derived(arrow([0, 0, 0], [n[0] * plane.sn * SCALE, n[1] * plane.sn * SCALE, n[2] * plane.sn * SCALE]));
  const shearPart = $derived(arrow([0, 0, 0], [plane.shear[0] * SCALE, plane.shear[1] * SCALE, plane.shear[2] * SCALE]));
  const cut = $derived(section(n));
  const fmt = $derived(new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
</script>

<figure class="mohr-fig">
  <svg
    viewBox="0 -45 560 270"
    role="img"
    aria-labelledby="mf-title mf-desc"
    onmouseenter={() => (hovered = true)}
    onmouseleave={() => (hovered = false)}
    onfocusin={() => (focused = true)}
    onfocusout={() => (focused = false)}
  >
    <title id="mf-title">{t('landing.mohrFigTitle')}</title>
    <desc id="mf-desc">{t('landing.mohrFigDesc')}</desc>

    <g aria-hidden="true">
      {#each AXES as ax}
        {@const o = proj([0, 0, 0])}
        {@const e = proj(ax.v)}
        <line class="mf-axis" x1={o.x} y1={o.y} x2={e.x} y2={e.y} />
        <text class="mf-label" x={e.x + (e.x >= o.x ? 3 : -8)} y={e.y + (ax.label === 'z' ? -3 : 4)}>{ax.label}</text>
      {/each}
      {#each EDGES as [a, b]}
        {@const p = proj(a)}
        {@const q = proj(b)}
        <line class="mf-edge" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
      {/each}
      <polygon class="mf-cut" points={cut} />
      <path class="mf-normal" d={normalArrow.line} />
      <polygon class="mf-normal-head" points={normalArrow.head} />
      <path d={shearPart.line} stroke="var(--mf-shear)" class="mf-part" />
      <polygon points={shearPart.head} fill="var(--mf-shear)" />
      <path d={normalPart.line} stroke={tone} class="mf-part" />
      <polygon points={normalPart.head} fill={tone} />
    </g>

    <g aria-hidden="true">
      <path class="mf-region" d={REGION} />
      <line class="mf-axis" x1="232" y1={Y0} x2="552" y2={Y0} />
      <line class="mf-axis" x1={X0} y1={Y0 + 4} x2={X0} y2="8" />
      <text class="mf-label" x="546" y={Y0 - 6}>σ</text>
      <text class="mf-label" x={X0 + 5} y="14">τ</text>
      <path class="mf-circle" d={semi(P3, P1)} />
      <path class="mf-circle" d={semi(P3, P2)} />
      <path class="mf-circle mf-circle-plane" d={semi(P2, P1)} style="opacity: {0.45 + 0.55 * planar}" />
      {#each [[P3, 'σ₃'], [P2, 'σ₂'], [P1, 'σ₁']] as [s, label]}
        <circle class="mf-principal" cx={sx(s as number)} cy={Y0} r="2.2" />
        <text class="mf-label mf-principal-label" x={sx(s as number)} y={Y0 + 13}>{label}</text>
      {/each}
      <polyline class="mf-trail" points={trail} stroke={tone} />
      <line class="mf-guide" x1={point.x} y1={point.y} x2={point.x} y2={Y0} />
      <circle class="mf-halo" cx={point.x} cy={point.y} r="7" fill={tone} />
      <circle cx={point.x} cy={point.y} r="3.4" fill={tone} />

    </g>
  </svg>
  <figcaption class="hf-row">
    <span class="hf-tag">{t('landing.mohrTag')}</span>
    <span class="hf-item"><i class="hf-sw" style="background: {tone}"></i>σn <b>{fmt.format(plane.sn)} MPa</b></span>
    <span class="hf-item"><i class="hf-sw" style="background: var(--mf-shear)"></i>τ <b>{fmt.format(plane.tau)} MPa</b></span>
  </figcaption>
</figure>

<style>
  .mohr-fig {
    --mf-tension: var(--lp-accent);
    --mf-compression: #4f8fd6;
    --mf-shear: #e0a526;
    margin: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .mf-axis {
    stroke: var(--fg-2);
    stroke-width: 0.8;
    opacity: 0.5;
  }
  .mf-edge {
    stroke: var(--fg-2);
    stroke-width: 1;
    opacity: 0.55;
  }
  .mf-cut {
    fill: var(--lp-accent);
    fill-opacity: 0.16;
    stroke: var(--lp-accent);
    stroke-width: 1;
    stroke-opacity: 0.75;
  }
  .mf-normal {
    stroke: var(--fg);
    stroke-width: 1;
    stroke-dasharray: 3 2;
    fill: none;
    opacity: 0.8;
  }
  .mf-normal-head {
    fill: var(--fg);
    opacity: 0.8;
  }
  .mf-part {
    stroke-width: 2.6;
    fill: none;
  }
  .mf-region {
    fill: var(--lp-accent);
    fill-opacity: 0.08;
    fill-rule: evenodd;
  }
  .mf-circle {
    fill: none;
    stroke: var(--fg-2);
    stroke-width: 1.1;
    opacity: 0.7;
  }
  .mf-circle-plane {
    stroke: var(--fg);
    stroke-width: 1.4;
  }
  .mf-principal {
    fill: var(--fg);
  }
  .mf-label {
    font-family: var(--lp-mono);
    font-size: 11px;
    fill: var(--fg-2);
  }
  .mf-principal-label {
    text-anchor: middle;
  }
  .mf-trail {
    fill: none;
    stroke-width: 1.6;
    stroke-linecap: round;
    opacity: 0.45;
  }
  .mf-guide {
    stroke: var(--fg-2);
    stroke-width: 0.8;
    stroke-dasharray: 2 2;
    opacity: 0.6;
  }
  .mf-halo {
    opacity: 0.22;
  }
</style>
