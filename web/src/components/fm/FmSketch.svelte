<script lang="ts">
  /**
   * The structure, drawn small — with the redundants marked on it and, when
   * a state is given, that state's bending-moment diagram laid over the bars.
   *
   * The force method is a method of pictures: the primary structure, then the
   * same structure under the loads, then under each Xᵢ = 1. A table of end
   * moments says the same thing and teaches nothing, so every step that has a
   * state shows it drawn.
   *
   * Moments are drawn on the TENSION side, as they are taught here: the
   * analysis convention's positive moment stretches a bar's local +y face,
   * and the diagram is offset toward it.
   */
  import type { Geometry, StateResult, Redundant } from '../../lib/engine/force-method/solve';

  interface Props {
    geometry: Geometry;
    redundants?: Redundant[];
    /** Highlight this redundant (1-based). */
    focus?: number | null;
    state?: StateResult | null;
    /** Label for the state's peak value, e.g. "M₀". */
    stateLabel?: string;
    testId?: string;
  }
  let { geometry, redundants = [], focus = null, state = null, stateLabel = 'M', testId = 'fm-sketch' }: Props = $props();

  const W = 300;
  const H_MAX = 210;
  const PAD = 26;

  /*
   * The box follows the structure: a beam gets a short strip, a tall frame
   * the full height. A fixed box left a continuous beam as a line across the
   * middle of 190 px of nothing. Room is added above and below for the
   * diagram, which is drawn at 16 % of the structure's size.
   */
  const box = $derived.by(() => {
    const xs = geometry.nodes.map((n) => n.x);
    const zs = geometry.nodes.map((n) => n.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const w = Math.max(maxX - minX, 1e-6);
    const h = maxZ - minZ;
    const size = Math.max(w, h, 1e-6);
    const room = state ? 0.2 * size : 0.08 * size;
    const s = Math.min((W - 2 * PAD) / w, (H_MAX - 2 * PAD) / (h + 2 * room));
    const H = Math.min(H_MAX, (h + 2 * room) * s + 2 * PAD);
    return { minX, maxX, minZ, maxZ, s, size, H };
  });
  const H = $derived(box.H);
  const X = (x: number) => (W - (box.maxX - box.minX) * box.s) / 2 + (x - box.minX) * box.s;
  const Y = (z: number) => (box.H + (box.maxZ - box.minZ) * box.s) / 2 - (z - box.minZ) * box.s;
  const node = (id: number) => geometry.nodes.find((n) => n.id === id)!;

  /** Bars, and for each the unit vectors the diagram needs. */
  const bars = $derived(geometry.elements.map((e) => {
    const a = node(e.nodeI);
    const b = node(e.nodeJ);
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const c = (b.x - a.x) / L, s = (b.z - a.z) / L;
    return { ...e, a, b, L, c, s };
  }));

  const removed = $derived(new Set(redundants.filter((r) => r.kind === 'barForce').map((r) => r.elementId)));

  /** The moment diagram as one closed polygon per bar. */
  const diagram = $derived.by(() => {
    if (!state) return [];
    const peak = Math.max(1e-9, ...state.bars.flatMap((b) => b.samples.map((p) => Math.abs(p.m))));
    const k = (0.16 * box.size) / peak;
    return state.bars.map((sb) => {
      const bar = bars.find((b) => b.id === sb.elementId);
      if (!bar || sb.samples.every((p) => Math.abs(p.m) < peak * 1e-6)) return null;
      const pts = sb.samples.map((p) => {
        const x = bar.a.x + bar.c * p.x - bar.s * p.m * k;
        const z = bar.a.z + bar.s * p.x + bar.c * p.m * k;
        return `${X(x).toFixed(1)},${Y(z).toFixed(1)}`;
      });
      const base = `${X(bar.b.x).toFixed(1)},${Y(bar.b.z).toFixed(1)} ${X(bar.a.x).toFixed(1)},${Y(bar.a.z).toFixed(1)}`;
      /* The largest ordinate on this bar, labelled where it occurs. */
      const top = sb.samples.reduce((m, p) => (Math.abs(p.m) > Math.abs(m.m) ? p : m), sb.samples[0]);
      const tx = bar.a.x + bar.c * top.x - bar.s * top.m * k;
      const tz = bar.a.z + bar.s * top.x + bar.c * top.m * k;
      return { id: sb.elementId, poly: `${pts.join(' ')} ${base}`, label: { x: X(tx), y: Y(tz), v: top.m } };
    }).filter(Boolean) as Array<{ id: number; poly: string; label: { x: number; y: number; v: number } }>;
  });

  const arrow = 16;
  type Mark = {
    r: Redundant; on: boolean; tag: string; kind: 'reaction' | 'bar' | 'cut';
    x: number; y: number; component?: number; c?: number; s?: number;
  };
  /** Where each redundant is drawn, and how. */
  const marks = $derived(redundants.map((r): Mark | null => {
    const on = focus === null || focus === r.index;
    const tag = `X${sub(r.index)}`;
    if (r.kind === 'reaction') {
      const n = node(r.nodeId);
      return { r, on, tag, kind: 'reaction', x: X(n.x), y: Y(n.z), component: r.component ?? 1 };
    }
    const bar = bars.find((b) => b.id === r.elementId);
    if (!bar) return null;
    if (r.kind === 'barForce') {
      return { r, on, tag, kind: 'bar', x: X((bar.a.x + bar.b.x) / 2), y: Y((bar.a.z + bar.b.z) / 2) };
    }
    /* A cut: a gap mark a little inside the member from the cut end. */
    const t = r.end === 'J' ? 0.88 : 0.12;
    const cx = bar.a.x + (bar.b.x - bar.a.x) * t;
    const cz = bar.a.z + (bar.b.z - bar.a.z) * t;
    return { r, on, tag, kind: 'cut', x: X(cx), y: Y(cz), c: bar.c, s: bar.s };
  }).filter((m): m is Mark => m !== null));

  /* One label per cut, not three stacked on the same spot. */
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
  const fmtM = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
</script>

<svg class="fm-sk" viewBox="0 0 {W} {H}" role="img" data-testid={testId}>
  <defs>
    <marker id="fm-ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7 Z" class="fm-ah" />
    </marker>
  </defs>

  {#each diagram as d (d.id)}
    <polygon points={d.poly} class="fm-dia" />
    <text x={d.label.x} y={d.label.y - 3} class="fm-dia-lbl">{fmtM(d.label.v)}</text>
  {/each}

  {#each bars as b (b.id)}
    <line x1={X(b.a.x)} y1={Y(b.a.z)} x2={X(b.b.x)} y2={Y(b.b.z)}
      class="fm-bar" class:fm-truss={b.type === 'truss'} class:fm-removed={removed.has(b.id)} />
    {#if b.hingeStart}<circle cx={X(b.a.x + b.c * 0.04 * b.L)} cy={Y(b.a.z + b.s * 0.04 * b.L)} r="2.6" class="fm-hinge" />{/if}
    {#if b.hingeEnd}<circle cx={X(b.b.x - b.c * 0.04 * b.L)} cy={Y(b.b.z - b.s * 0.04 * b.L)} r="2.6" class="fm-hinge" />{/if}
  {/each}

  {#each geometry.supports as sp (sp.nodeId)}
    {@const n = node(sp.nodeId)}
    {@const x = X(n.x)}
    {@const y = Y(n.z)}
    {#if sp.spring}
      <path d="M{x},{y} l0,4 l-4,3 l8,3 l-8,3 l4,3 l0,3" class="fm-sup" />
    {:else}
      {#if sp.restrained[0] && sp.restrained[1]}
        <path d="M{x},{y} l-6,9 l12,0 Z" class="fm-sup" />
      {:else if sp.restrained[1]}
        <path d="M{x},{y} l-6,8 l12,0 Z" class="fm-sup" /><line x1={x - 7} y1={y + 11} x2={x + 7} y2={y + 11} class="fm-sup" />
      {:else if sp.restrained[0]}
        <path d="M{x},{y} l-8,-6 l0,12 Z" class="fm-sup" /><line x1={x - 11} y1={y - 7} x2={x - 11} y2={y + 7} class="fm-sup" />
      {/if}
      {#if sp.restrained[2]}
        <rect x={x - 7} y={y - 7} width="14" height="14" class="fm-clamp" />
      {/if}
    {/if}
  {/each}

  {#each geometry.nodes as n (n.id)}
    <circle cx={X(n.x)} cy={Y(n.z)} r="1.8" class="fm-node" />
  {/each}

  {#each marks as m, k (k)}
    {#if m.kind === 'reaction'}
      <g class="fm-x" class:fm-x-off={!m.on}>
        {#if m.component === 2}
          <path d="M{m.x + 11},{m.y} A11,11 0 1 1 {m.x},{m.y - 11}" class="fm-xline" marker-end="url(#fm-ah)" />
          <text x={m.x + 13} y={m.y - 9} class="fm-xlbl">{m.tag}</text>
        {:else if m.component === 1}
          <line x1={m.x} y1={m.y + 14 + arrow} x2={m.x} y2={m.y + 13} class="fm-xline" marker-end="url(#fm-ah)" />
          <text x={m.x + 4} y={m.y + 14 + arrow} class="fm-xlbl">{m.tag}</text>
        {:else}
          <line x1={m.x - 14 - arrow} y1={m.y + 3} x2={m.x - 13} y2={m.y + 3} class="fm-xline" marker-end="url(#fm-ah)" />
          <text x={m.x - 14 - arrow} y={m.y - 2} class="fm-xlbl">{m.tag}</text>
        {/if}
      </g>
    {:else if m.kind === 'bar'}
      <text x={m.x + 3} y={m.y - 3} class="fm-xlbl" class:fm-x-off={!m.on}>{m.tag}</text>
    {:else}
      <line x1={m.x - m.s! * 6 - m.c! * 2} y1={m.y - m.c! * 6 + m.s! * 2} x2={m.x + m.s! * 6 - m.c! * 2} y2={m.y + m.c! * 6 + m.s! * 2} class="fm-cut" />
      <line x1={m.x - m.s! * 6 + m.c! * 2} y1={m.y - m.c! * 6 - m.s! * 2} x2={m.x + m.s! * 6 + m.c! * 2} y2={m.y + m.c! * 6 - m.s! * 2} class="fm-cut" />
    {/if}
  {/each}
  {#each cutLabels as c, k (k)}
    <text x={c.x + 7} y={c.y - 7} class="fm-xlbl" class:fm-x-off={!c.on}>{c.tags.join(', ')}</text>
  {/each}

  {#if state}
    <text x="4" y={H - 4} class="fm-legend">{stateLabel} [kN·m]</text>
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
