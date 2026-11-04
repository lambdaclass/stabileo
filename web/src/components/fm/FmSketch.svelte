<script lang="ts">
  /**
   * The structure, drawn small — with the redundants marked on it and, when
   * a state is given, one of its diagrams laid over the bars.
   *
   * The force method is a method of pictures: the primary structure, then the
   * same structure under the loads, then under each Xᵢ = 1. A table of end
   * moments says the same thing and teaches nothing, so every step that has a
   * state shows it drawn.
   *
   * A plane structure is drawn as it is; a space one in isometric projection.
   * Diagrams are offset toward the bar's local axis of their plane — local y
   * for M (Mz in space), local z for My — so a positive moment lands on the
   * face it stretches: the tension side, as it is taught here.
   */
  import type { Geometry, StateResult, Redundant } from '../../lib/engine/force-method/solve';

  type Component = 'm' | 'my' | 't' | 'n';
  interface Props {
    geometry: Geometry;
    redundants?: Redundant[];
    /** Highlight this redundant (1-based); 0 fades them all. */
    focus?: number | null;
    state?: StateResult | null;
    component?: Component;
    stateLabel?: string;
    testId?: string;
  }
  let {
    geometry, redundants = [], focus = null, state = null, component = 'm',
    stateLabel = 'M', testId = 'fm-sketch',
  }: Props = $props();

  type V3 = [number, number, number];
  const is3D = $derived(!!geometry.is3D);
  const pos3 = (n: { x: number; y?: number; z: number }): V3 => [n.x, n.y ?? 0, n.z];
  /** Isometric for space structures; the x–z plane itself for plane ones. */
  const proj = (p: V3): [number, number] =>
    is3D ? [(p[0] - p[1]) * 0.866, p[2] + (p[0] + p[1]) * 0.5] : [p[0], p[2]];

  const W = 300;
  const H_MAX = 210;
  const PAD = 26;

  const box = $derived.by(() => {
    const pts = geometry.nodes.map((n) => proj(pos3(n)));
    const us = pts.map((p) => p[0]);
    const vs = pts.map((p) => p[1]);
    const minU = Math.min(...us), maxU = Math.max(...us);
    const minV = Math.min(...vs), maxV = Math.max(...vs);
    const w = Math.max(maxU - minU, 1e-6);
    const h = maxV - minV;
    const size = Math.max(w, h, 1e-6);
    const room = state ? 0.2 * size : 0.08 * size;
    const s = Math.min((W - 2 * PAD) / w, (H_MAX - 2 * PAD) / (h + 2 * room));
    const H = Math.min(H_MAX, (h + 2 * room) * s + 2 * PAD);
    return { minU, maxU, minV, maxV, s, size, H };
  });
  const H = $derived(box.H);
  const U = (u: number) => (W - (box.maxU - box.minU) * box.s) / 2 + (u - box.minU) * box.s;
  const Vy = (v: number) => (box.H + (box.maxV - box.minV) * box.s) / 2 - (v - box.minV) * box.s;
  const P = (p: V3) => { const [u, v] = proj(p); return { x: U(u), y: Vy(v) }; };
  const node = (id: number) => geometry.nodes.find((n) => n.id === id)!;
  const along = (a: V3, d: V3, t: number): V3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];

  const bars = $derived(geometry.elements.map((e) => {
    const a = pos3(node(e.nodeI));
    const b = pos3(node(e.nodeJ));
    const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    const ex: V3 = [d[0] / L, d[1] / L, d[2] / L];
    /* Plane bars: local y is the x–z normal (−sin, cos). */
    const ey: V3 = e.ey ?? [-ex[2], 0, ex[0]];
    const ez: V3 = e.ez ?? [0, 1, 0];
    return { ...e, a, b, L, ex, ey, ez };
  }));

  const removed = $derived(new Set(redundants.filter((r) => r.kind === 'barForce').map((r) => r.elementId)));

  const value = (p: { m: number; my?: number; t?: number; n: number }) =>
    component === 'my' ? (p.my ?? 0) : component === 't' ? (p.t ?? 0) : component === 'n' ? p.n : p.m;

  /** The chosen diagram as one closed polygon per bar. */
  const diagram = $derived.by(() => {
    if (!state) return [];
    const peak = Math.max(1e-9, ...state.bars.flatMap((b) => b.samples.map((p) => Math.abs(value(p)))));
    const k = (0.16 * box.size) / peak;
    return state.bars.map((sb) => {
      const bar = bars.find((b) => b.id === sb.elementId);
      if (!bar || sb.samples.every((p) => Math.abs(value(p)) < peak * 1e-6)) return null;
      const off = component === 'my' ? bar.ez : bar.ey;
      const at = (x: number, v: number): V3 => along(along(bar.a, bar.ex, x), off, v * k);
      const pts = sb.samples.map((p) => { const q = P(at(p.x, value(p))); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; });
      const pa = P(bar.a), pb = P(bar.b);
      const top = sb.samples.reduce((m, p) => (Math.abs(value(p)) > Math.abs(value(m)) ? p : m), sb.samples[0]);
      const tl = P(at(top.x, value(top)));
      return {
        id: sb.elementId,
        poly: `${pts.join(' ')} ${pb.x.toFixed(1)},${pb.y.toFixed(1)} ${pa.x.toFixed(1)},${pa.y.toFixed(1)}`,
        label: { x: tl.x, y: tl.y, v: value(top) },
      };
    }).filter(Boolean) as Array<{ id: number; poly: string; label: { x: number; y: number; v: number } }>;
  });

  type Mark = {
    r: Redundant; on: boolean; tag: string; kind: 'force' | 'moment' | 'bar' | 'cut';
    x: number; y: number; dx?: number; dy?: number; axis?: string;
  };
  const AXES: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const marks = $derived(redundants.map((r): Mark | null => {
    const on = focus === null || focus === r.index;
    const tag = `X${sub(r.index)}`;
    if (r.kind === 'reaction') {
      const p3 = pos3(node(r.nodeId));
      const p = P(p3);
      const c = r.component ?? 1;
      const nForce = is3D ? 3 : 2;
      if (c >= nForce) return { r, on, tag, kind: 'moment', x: p.x, y: p.y, axis: is3D ? ['x', 'y', 'z'][c - 3] : '' };
      /* Plane: 0 is x, 1 is z. Space: 0, 1, 2 are x, y, z. */
      const dir = is3D ? AXES[c] : (c === 0 ? AXES[0] : AXES[2]);
      const q = P(along(p3, dir, -1));
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { r, on, tag, kind: 'force', x: p.x, y: p.y, dx: (q.x - p.x) / len, dy: (q.y - p.y) / len };
    }
    const bar = bars.find((b) => b.id === r.elementId);
    if (!bar) return null;
    if (r.kind === 'barForce') {
      const m = P(along(bar.a, bar.ex, bar.L / 2));
      return { r, on, tag, kind: 'bar', x: m.x, y: m.y };
    }
    const c = P(along(bar.a, bar.ex, bar.L * (r.end === 'J' ? 0.86 : 0.14)));
    const pa = P(bar.a), pb = P(bar.b);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    return { r, on, tag, kind: 'cut', x: c.x, y: c.y, dx: (pb.x - pa.x) / len, dy: (pb.y - pa.y) / len };
  }).filter((m): m is Mark => m !== null));

  /* One label per cut, not several stacked on the same spot. */
  const cutLabels = $derived.by(() => {
    const byElem = new Map<number, { x: number; y: number; tags: string[]; on: boolean }>();
    for (const m of marks) {
      if (m.kind !== 'cut') continue;
      const k = m.r.elementId!;
      const cur = byElem.get(k) ?? { x: m.x, y: m.y, tags: [], on: false };
      cur.tags.push(m.tag);
      cur.on = cur.on || m.on;
      byElem.set(k, cur);
    }
    return [...byElem.values()];
  });

  function sub(n: number): string {
    return String(n).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('');
  }
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  const ARROW = 26;
</script>

<svg class="fm-sk" viewBox="0 0 {W} {H}" role="img" data-testid={testId}>
  <defs>
    <marker id="fm-ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" class="fm-ah" />
    </marker>
  </defs>

  {#each diagram as d (d.id)}
    <polygon points={d.poly} class="fm-dia" />
    <text x={d.label.x} y={d.label.y - 3} class="fm-dia-lbl">{fmt(d.label.v)}</text>
  {/each}

  {#each bars as b (b.id)}
    {@const pa = P(b.a)}
    {@const pb = P(b.b)}
    {@const hs = P(along(b.a, b.ex, 0.05 * b.L))}
    {@const he = P(along(b.b, b.ex, -0.05 * b.L))}
    <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
      class="fm-bar" class:fm-truss={b.type === 'truss'} class:fm-removed={removed.has(b.id)} />
    {#if b.hingeStart}<circle cx={hs.x} cy={hs.y} r="2.6" class="fm-hinge" />{/if}
    {#if b.hingeEnd}<circle cx={he.x} cy={he.y} r="2.6" class="fm-hinge" />{/if}
  {/each}

  {#each geometry.supports as sp (sp.nodeId)}
    {@const p = P(pos3(node(sp.nodeId)))}
    {@const nT = is3D ? 3 : 2}
    {@const trans = sp.restrained.slice(0, nT).filter(Boolean).length}
    {@const rot = sp.restrained.slice(nT).some(Boolean)}
    {#if sp.spring}
      <path d="M{p.x},{p.y} l0,4 l-4,3 l8,3 l-8,3 l4,3 l0,3" class="fm-sup" />
    {/if}
    {#if trans >= nT}
      <path d="M{p.x},{p.y} l-6,9 l12,0 Z" class="fm-sup" />
    {:else if trans > 0}
      <path d="M{p.x},{p.y} l-6,8 l12,0 Z" class="fm-sup" /><line x1={p.x - 7} y1={p.y + 11} x2={p.x + 7} y2={p.y + 11} class="fm-sup" />
    {/if}
    {#if rot}
      <rect x={p.x - 7} y={p.y - 7} width="14" height="14" class="fm-clamp" />
    {/if}
  {/each}

  {#each geometry.nodes as n (n.id)}
    {@const p = P(pos3(n))}
    <circle cx={p.x} cy={p.y} r="1.8" class="fm-node" />
  {/each}

  {#each marks as m, k (k)}
    {#if m.kind === 'force'}
      <g class:fm-x-off={!m.on}>
        <line x1={m.x + m.dx! * (ARROW + 12)} y1={m.y + m.dy! * (ARROW + 12)} x2={m.x + m.dx! * 12} y2={m.y + m.dy! * 12}
          class="fm-xline" marker-end="url(#fm-ah)" />
        <text x={m.x + m.dx! * (ARROW + 14) + 2} y={m.y + m.dy! * (ARROW + 14) + 3} class="fm-xlbl">{m.tag}</text>
      </g>
    {:else if m.kind === 'moment'}
      <g class:fm-x-off={!m.on}>
        <path d="M{m.x + 11},{m.y} A11,11 0 1 1 {m.x},{m.y - 11}" class="fm-xline" marker-end="url(#fm-ah)" />
        <text x={m.x + 13} y={m.y - 9} class="fm-xlbl">{m.tag}{m.axis ? ` (M${m.axis})` : ''}</text>
      </g>
    {:else if m.kind === 'bar'}
      <text x={m.x + 3} y={m.y - 3} class="fm-xlbl" class:fm-x-off={!m.on}>{m.tag}</text>
    {:else}
      <line x1={m.x + m.dy! * 6 - m.dx! * 2} y1={m.y - m.dx! * 6 - m.dy! * 2} x2={m.x - m.dy! * 6 - m.dx! * 2} y2={m.y + m.dx! * 6 - m.dy! * 2} class="fm-cut" />
      <line x1={m.x + m.dy! * 6 + m.dx! * 2} y1={m.y - m.dx! * 6 + m.dy! * 2} x2={m.x - m.dy! * 6 + m.dx! * 2} y2={m.y + m.dx! * 6 + m.dy! * 2} class="fm-cut" />
    {/if}
  {/each}
  {#each cutLabels as c, k (k)}
    <text x={c.x + 7} y={c.y - 7} class="fm-xlbl" class:fm-x-off={!c.on}>{c.tags.join(', ')}</text>
  {/each}

  {#if state}
    <text x="4" y={H - 4} class="fm-legend">{stateLabel} [{component === 'n' ? 'kN' : 'kN·m'}]</text>
  {/if}
</svg>

<style>
  .fm-sk { width: 100%; height: auto; display: block; margin: 4px 0; }
  .fm-bar { stroke: var(--st-text-2); stroke-width: 2; stroke-linecap: round; }
  .fm-truss { stroke-width: 1.2; }
  .fm-removed { stroke: var(--st-danger); stroke-dasharray: 4 3; stroke-width: 1.2; }
  .fm-hinge { fill: var(--st-surface); stroke: var(--st-text-2); stroke-width: 1; }
  .fm-node { fill: var(--st-text-2); }
  .fm-sup { fill: none; stroke: var(--st-text-3); stroke-width: 1; }
  .fm-clamp { fill: none; stroke: var(--st-text-3); stroke-width: 1; stroke-dasharray: 2 1.5; }
  .fm-dia { fill: color-mix(in srgb, var(--st-accent) 22%, transparent); stroke: var(--st-accent); stroke-width: 0.9; }
  .fm-dia-lbl { fill: var(--st-accent); font-size: 7px; text-anchor: middle; font-variant-numeric: tabular-nums; }
  .fm-xline { fill: none; stroke: #e5484d; stroke-width: 1.4; }
  .fm-ah { fill: #e5484d; }
  .fm-xlbl { fill: #e5484d; font-size: 8.5px; font-weight: 700; }
  .fm-x-off { opacity: 0.3; }
  .fm-cut { stroke: #e5484d; stroke-width: 1.4; }
  .fm-legend { fill: var(--st-text-3); font-size: 7px; }
</style>
