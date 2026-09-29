<script lang="ts">
  /**
   * A step-by-step document's figure (engine/steps/sketch): the structure, or
   * a piece of it, with what the step is about drawn on it. One renderer for
   * every method, so a load, a reaction or an unknown looks the same in all.
   *
   * Model coordinates (m, z up) are fitted into the figure; symbols and
   * arrows keep a fixed size in pixels, so a 2 m span and a 20 m span read
   * the same way.
   */
  import type { Sketch, SketchColor } from '../../lib/engine/steps/sketch';

  let { sketch }: { sketch: Sketch } = $props();

  /*
   * Drawn at the width it is shown at, so symbols, arrows and text keep their
   * pixel sizes in a narrow side panel as well as on a wide page.
   */
  let cw = $state(0);
  const W = $derived(Math.max(280, Math.min(720, cw || 480)));
  const PAD = $derived(W < 420 ? 38 : 46);

  const nodeById = $derived(new Map(sketch.nodes.map((n) => [n.id, n])));

  // Fit: the structure's box, with room for dimensions under and left.
  const fit = $derived.by(() => {
    const xs = sketch.nodes.map((n) => n.x), zs = sketch.nodes.map((n) => n.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const w = Math.max(x1 - x0, 1e-6), h = Math.max(z1 - z0, 0);
    const dimsRoom = sketch.dims ? 34 : 0;
    const innerW = W - 2 * PAD - (sketch.dims && h > 1e-6 ? dimsRoom : 0);
    const flat = h < 1e-6 * Math.max(1, w);
    const H = sketch.height ?? (flat ? 150 + dimsRoom : Math.min(360, Math.max(190, (innerW * h) / w + 2 * PAD + dimsRoom)));
    const innerH = H - 2 * PAD - dimsRoom;
    const k = flat ? innerW / w : Math.min(innerW / w, innerH / Math.max(h, 1e-6));
    const ox = PAD + (sketch.dims && !flat ? dimsRoom : 0) + (innerW - w * k) / 2;
    const oy = PAD + (flat ? innerH / 2 : (innerH - h * k) / 2) + h * k;
    return { x0, z0, k, ox, oy, H, flat };
  });
  const sx = (x: number) => fit.ox + (x - fit.x0) * fit.k;
  const sz = (z: number) => fit.oy - (z - fit.z0) * fit.k;
  const P = (x: number, z: number) => ({ x: sx(x), y: sz(z) });

  function memberGeom(i: number, j: number) {
    const a = nodeById.get(i)!, b = nodeById.get(j)!;
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const c = (b.x - a.x) / L, s = (b.z - a.z) / L;
    return { a, b, L, c, s };
  }

  // A screen-space unit vector for a model direction (z up → y down).
  const sdir = (dx: number, dz: number) => { const l = Math.hypot(dx, dz) || 1; return { x: dx / l, y: -dz / l }; };

  function arrowPath(tip: { x: number; y: number }, d: { x: number; y: number }, len = 34) {
    const tail = { x: tip.x - d.x * len, y: tip.y - d.y * len };
    const h = 7, w = 4;
    const bx = tip.x - d.x * h, by = tip.y - d.y * h;
    const nx = -d.y, ny = d.x;
    return {
      line: `M${tail.x},${tail.y} L${bx},${by}`,
      head: `M${tip.x},${tip.y} L${bx + nx * w},${by + ny * w} L${bx - nx * w},${by - ny * w} Z`,
      tail,
    };
  }

  function coupleArc(p: { x: number; y: number }, ccw: boolean, r = 15) {
    // A three-quarter arc, the head at its end in the sense of the couple.
    const a0 = ccw ? Math.PI * 0.75 : Math.PI * 0.25, a1 = ccw ? Math.PI * 2.25 : -Math.PI * 1.25;
    const pt = (a: number) => ({ x: p.x + r * Math.cos(a), y: p.y - r * Math.sin(a) });
    const s = pt(a0), e = pt(a1);
    const large = 1, sweep = ccw ? 0 : 1;
    const tangent = ccw ? { x: -Math.sin(a1), y: -Math.cos(a1) } : { x: Math.sin(a1), y: Math.cos(a1) };
    const h = 6, w = 3.5, bx = e.x - tangent.x * h, by = e.y - tangent.y * h;
    return {
      arc: `M${s.x},${s.y} A${r},${r} 0 ${large} ${sweep} ${e.x},${e.y}`,
      head: `M${e.x},${e.y} L${bx - tangent.y * w},${by + tangent.x * w} L${bx + tangent.y * w},${by - tangent.x * w} Z`,
      labelAt: { x: p.x, y: p.y - r - 6 },
    };
  }

  const fmt = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1000 || (a > 0 && a < 0.01)) return v.toExponential(2).replace('e', '·10^').replace('+', '');
    return (Math.round(v * 100) / 100).toString().replace('-', '−');
  };

  // Span loads: the outline off the member on the side the load comes from, arrows to the member.
  const spanLoadDraw = $derived.by(() => {
    const out: Array<{ outline: string; arrows: Array<ReturnType<typeof arrowPath>>; label?: { x: number; y: number; text: string } }> = [];
    const all = sketch.spanLoads ?? [];
    const wmax = Math.max(1e-9, ...all.map((l) => Math.max(Math.abs(l.wa), Math.abs(l.wb))));
    for (const l of all) {
      const m = sketch.members.find((mm) => mm.id === l.member);
      if (!m) continue;
      const g = memberGeom(m.i, m.j);
      // Local +y in model terms is (−s, c); a positive w pushes towards −y, so it comes from +y.
      const ny = sdir(-g.s, g.c);
      const at = (t: number) => P(g.a.x + g.c * t, g.a.z + g.s * t);
      const hpx = (w: number) => 8 + 22 * (Math.abs(w) / wmax);
      const side = (w: number) => (w >= 0 ? 1 : -1);
      const pA = at(l.a), pB = at(l.b);
      const oA = { x: pA.x + ny.x * hpx(l.wa) * side(l.wa), y: pA.y + ny.y * hpx(l.wa) * side(l.wa) };
      const oB = { x: pB.x + ny.x * hpx(l.wb) * side(l.wb), y: pB.y + ny.y * hpx(l.wb) * side(l.wb) };
      const n = Math.max(2, Math.round(Math.hypot(pB.x - pA.x, pB.y - pA.y) / 22));
      const arrows = [];
      for (let k = 0; k <= n; k++) {
        const t = l.a + ((l.b - l.a) * k) / n;
        const w = l.wa + ((l.wb - l.wa) * k) / n;
        if (Math.abs(w) < 1e-9) continue;
        const tip = at(t);
        const d = { x: -ny.x * side(w), y: -ny.y * side(w) };
        arrows.push(arrowPath(tip, d, hpx(w)));
      }
      const mid = { x: (oA.x + oB.x) / 2 + ny.x * 9, y: (oA.y + oB.y) / 2 + ny.y * 9 };
      const text = l.label ?? (Math.abs(l.wa - l.wb) < 1e-9 ? fmt(l.wa) : `${fmt(l.wa)} → ${fmt(l.wb)}`);
      out.push({ outline: `M${oA.x},${oA.y} L${oB.x},${oB.y}`, arrows, label: { ...mid, text } });
    }
    return out;
  });

  // Diagrams: off the member on its −y side for positive values.
  const diagramDraw = $derived.by(() => {
    const d = sketch.diagram;
    if (!d) return [];
    const vmax = Math.max(1e-12, ...d.members.flatMap((m) => m.values.map((v) => Math.abs(v[1]))));
    const px = d.px ?? 34;
    const out: Array<{ fill: string; line: string; marks: Array<{ x: number; y: number; text: string }> }> = [];
    for (const dm of d.members) {
      const m = sketch.members.find((mm) => mm.id === dm.member);
      if (!m || dm.values.length === 0) continue;
      const g = memberGeom(m.i, m.j);
      const neg = sdir(g.s, -g.c); // local −y on screen
      const base = (t: number) => P(g.a.x + g.c * g.L * t, g.a.z + g.s * g.L * t);
      const pts = dm.values.map(([t, v]) => { const b = base(t); const o = (v / vmax) * px; return { x: b.x + neg.x * o, y: b.y + neg.y * o, v, t }; });
      const b0 = base(dm.values[0][0]), b1 = base(dm.values[dm.values.length - 1][0]);
      const fill = `M${b0.x},${b0.y} ` + pts.map((p) => `L${p.x},${p.y}`).join(' ') + ` L${b1.x},${b1.y} Z`;
      const line = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
      const marks: Array<{ x: number; y: number; text: string }> = [];
      if (d.marks !== false) {
        const pick = new Set<number>([0, pts.length - 1]);
        let kmax = 0;
        pts.forEach((p, k) => { if (Math.abs(p.v) > Math.abs(pts[kmax].v)) kmax = k; });
        pick.add(kmax);
        for (const k of pick) {
          const p = pts[k];
          if (Math.abs(p.v) < vmax * 1e-6) continue;
          const o = Math.sign(p.v) || 1;
          marks.push({ x: p.x + neg.x * 10 * o, y: p.y + neg.y * 10 * o + 3, text: fmt(p.v) });
        }
      }
      out.push({ fill, line, marks });
    }
    return out;
  });

  // Automatic dimensions: spans along X under the structure, heights on its left.
  const dimsDraw = $derived.by(() => {
    if (!sketch.dims) return [] as Array<{ a: { x: number; y: number }; b: { x: number; y: number }; text: string; vertical: boolean }>;
    if (sketch.dims !== 'auto') {
      return sketch.dims.map((d) => ({ a: P(d.a.x, d.a.z), b: P(d.b.x, d.b.z), text: d.text, vertical: Math.abs(d.a.x - d.b.x) < 1e-9 }));
    }
    const xs = [...new Set(sketch.nodes.map((n) => Math.round(n.x * 1e6) / 1e6))].sort((a, b) => a - b);
    const zs = [...new Set(sketch.nodes.map((n) => Math.round(n.z * 1e6) / 1e6))].sort((a, b) => a - b);
    const out = [];
    const yDim = sz(Math.min(...zs)) + 30;
    for (let k = 0; k + 1 < xs.length; k++) out.push({ a: { x: sx(xs[k]), y: yDim }, b: { x: sx(xs[k + 1]), y: yDim }, text: fmt(xs[k + 1] - xs[k]), vertical: false });
    if (xs.length > 2) out.push({ a: { x: sx(xs[0]), y: yDim + 20 }, b: { x: sx(xs[xs.length - 1]), y: yDim + 20 }, text: fmt(xs[xs.length - 1] - xs[0]), vertical: false });
    if (zs.length > 1) {
      const xDim = sx(Math.min(...xs)) - 28;
      for (let k = 0; k + 1 < zs.length; k++) out.push({ a: { x: xDim, y: sz(zs[k]) }, b: { x: xDim, y: sz(zs[k + 1]) }, text: fmt(zs[k + 1] - zs[k]), vertical: true });
    }
    return out;
  });

  const H = $derived(fit.H + (sketch.dims && fit.flat ? 26 : 0));
  const cls = (c?: SketchColor, fallback: SketchColor = 'structure') => `c-${c ?? fallback}`;
</script>

<div class="sk-wrap" bind:clientWidth={cw}>
<svg class="step-sketch" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-hidden="true">
  <defs>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" class="c-muted" stroke-width="1.2" />
    </pattern>
  </defs>

  <!-- Diagrams under the structure lines. -->
  {#each diagramDraw as d}
    <path d={d.fill} class="dia-fill {cls(sketch.diagram?.color, 'diagram')}" />
    <path d={d.line} class="dia-line {cls(sketch.diagram?.color, 'diagram')}" />
  {/each}

  {#if sketch.deformed}
    {#each sketch.deformed as df}
      <path d={df.points.map((p, k) => `${k ? 'L' : 'M'}${sx(p.x)},${sz(p.z)}`).join(' ')} class="deformed {cls(df.color, 'deformed')}" />
    {/each}
  {/if}

  <!-- Members. -->
  {#each sketch.members as m}
    {@const g = memberGeom(m.i, m.j)}
    <line x1={sx(g.a.x)} y1={sz(g.a.z)} x2={sx(g.b.x)} y2={sz(g.b.z)}
      class="member {m.style ?? 'solid'} {cls(m.color, m.style === 'highlight' ? 'accent' : 'structure')}" />
    {#if m.label}
      {@const n = sdir(-g.s, g.c)}
      <text x={(sx(g.a.x) + sx(g.b.x)) / 2 + n.x * 12} y={(sz(g.a.z) + sz(g.b.z)) / 2 + n.y * 12 + 4} class="mlabel {cls(m.color, 'muted')}">{m.label}</text>
    {/if}
  {/each}

  <!-- Supports. -->
  {#each sketch.supports ?? [] as s}
    {@const n = nodeById.get(s.node)}
    {#if n}
      {@const p = P(n.x, n.z)}
      {#if s.type === 'fixed'}
        <rect x={p.x - 13} y={p.y} width="26" height="8" fill="url(#hatch)" />
        <line x1={p.x - 13} y1={p.y} x2={p.x + 13} y2={p.y} class="support" />
      {:else if s.type === 'pinned'}
        <path d={`M${p.x},${p.y} L${p.x - 9},${p.y + 13} L${p.x + 9},${p.y + 13} Z`} class="support-shape" />
        <line x1={p.x - 13} y1={p.y + 13} x2={p.x + 13} y2={p.y + 13} class="support" />
        <rect x={p.x - 13} y={p.y + 13} width="26" height="5" fill="url(#hatch)" />
      {:else if s.type === 'roller'}
        <path d={`M${p.x},${p.y} L${p.x - 9},${p.y + 11} L${p.x + 9},${p.y + 11} Z`} class="support-shape" />
        <circle cx={p.x - 5} cy={p.y + 14} r="2.6" class="support-shape" />
        <circle cx={p.x + 5} cy={p.y + 14} r="2.6" class="support-shape" />
        <line x1={p.x - 13} y1={p.y + 17} x2={p.x + 13} y2={p.y + 17} class="support" />
      {:else if s.type === 'rollerV'}
        <path d={`M${p.x},${p.y} L${p.x - 11},${p.y - 9} L${p.x - 11},${p.y + 9} Z`} class="support-shape" />
        <circle cx={p.x - 14} cy={p.y - 5} r="2.6" class="support-shape" />
        <circle cx={p.x - 14} cy={p.y + 5} r="2.6" class="support-shape" />
        <line x1={p.x - 17} y1={p.y - 13} x2={p.x - 17} y2={p.y + 13} class="support" />
      {:else}
        <path d={`M${p.x},${p.y} l0,4 l-6,3 l12,4 l-12,4 l12,4 l-6,3 l0,4`} class="support" fill="none" />
        <line x1={p.x - 10} y1={p.y + 26} x2={p.x + 10} y2={p.y + 26} class="support" />
      {/if}
    {/if}
  {/each}

  <!-- Nodes and hinges. -->
  {#each sketch.nodes as n}
    <circle cx={sx(n.x)} cy={sz(n.z)} r="2.8" class="node" />
    {#if n.label}
      <text x={sx(n.x) + 6} y={sz(n.z) - 6} class="nlabel">{n.label}</text>
    {/if}
  {/each}
  {#each sketch.hinges ?? [] as h}
    {@const n = nodeById.get(h.node)}
    {#if n}
      {@const m = h.member !== undefined ? sketch.members.find((mm) => mm.id === h.member) : undefined}
      {@const g = m ? memberGeom(m.i, m.j) : null}
      {@const off = g ? (m!.i === h.node ? 7 : -7) : 0}
      <circle cx={sx(n.x) + (g ? sdir(g.c, g.s).x * off : 0)} cy={sz(n.z) + (g ? sdir(g.c, g.s).y * off : 0)} r="3.6" class="hinge" />
    {/if}
  {/each}

  <!-- Span loads. -->
  {#each spanLoadDraw as l}
    <path d={l.outline} class="load-line c-load" />
    {#each l.arrows as a}
      <path d={a.line} class="arrow-line c-load" />
      <path d={a.head} class="arrow-head c-load" />
    {/each}
    {#if l.label}<text x={l.label.x} y={l.label.y + 4} class="vlabel c-load">{l.label.text}</text>{/if}
  {/each}

  <!-- Point forces (loads, reactions, unknowns). -->
  {#each sketch.forces ?? [] as f}
    {#if Math.hypot(f.fx, f.fz) > 1e-12}
      {@const a = arrowPath(P(f.x, f.z), sdir(f.fx, f.fz))}
      <path d={a.line} class="arrow-line {cls(f.color, 'load')}" class:dashed={f.dashed} />
      <path d={a.head} class="arrow-head {cls(f.color, 'load')}" />
      {#if f.label}<text x={a.tail.x} y={a.tail.y - 5} class="vlabel {cls(f.color, 'load')}">{f.label}</text>{/if}
    {/if}
  {/each}

  <!-- Couples. -->
  {#each sketch.couples ?? [] as c}
    {#if Math.abs(c.m) > 1e-12}
      {@const g = coupleArc(P(c.x, c.z), c.m > 0)}
      <path d={g.arc} class="arrow-line {cls(c.color, 'moment')}" class:dashed={c.dashed} fill="none" />
      <path d={g.head} class="arrow-head {cls(c.color, 'moment')}" />
      {#if c.label}<text x={g.labelAt.x} y={g.labelAt.y} class="vlabel {cls(c.color, 'moment')}">{c.label}</text>{/if}
    {/if}
  {/each}

  <!-- Degrees of freedom. -->
  {#each sketch.dofs ?? [] as d}
    {@const n = nodeById.get(d.node)}
    {#if n}
      {@const p = P(n.x, n.z)}
      {#if d.kind === 'ry'}
        {@const g = coupleArc(p, true, 11)}
        <path d={g.arc} class="arrow-line {cls(d.color, 'dof')}" fill="none" />
        <path d={g.head} class="arrow-head {cls(d.color, 'dof')}" />
        <text x={p.x + 14} y={p.y + 16} class="dlabel {cls(d.color, 'dof')}">{d.label}</text>
      {:else}
        {@const dir = d.kind === 'ux' ? { x: 1, y: 0 } : { x: 0, y: -1 }}
        {@const tip = { x: p.x + dir.x * 30, y: p.y + dir.y * 30 }}
        {@const a = arrowPath(tip, dir, 26)}
        <path d={a.line} class="arrow-line {cls(d.color, 'dof')}" />
        <path d={a.head} class="arrow-head {cls(d.color, 'dof')}" />
        <text x={tip.x + (d.kind === 'ux' ? 4 : 4)} y={tip.y + (d.kind === 'ux' ? -4 : 0)} class="dlabel {cls(d.color, 'dof')}">{d.label}</text>
      {/if}
    {/if}
  {/each}

  {#if sketch.cut}
    {@const a = P(sketch.cut.a.x, sketch.cut.a.z)}
    {@const b = P(sketch.cut.b.x, sketch.cut.b.z)}
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="cut c-accent" />
    {#if sketch.cut.label}<text x={b.x + 4} y={b.y} class="vlabel c-accent">{sketch.cut.label}</text>{/if}
  {/if}

  {#each diagramDraw as d}
    {#each d.marks as mk}<text x={mk.x} y={mk.y} class="vlabel {cls(sketch.diagram?.color, 'diagram')}">{mk.text}</text>{/each}
  {/each}

  {#each sketch.labels ?? [] as l}
    {@const p = P(l.x, l.z)}
    {@const dx = l.anchor?.includes('e') ? 8 : l.anchor?.includes('w') ? -8 : 0}
    {@const dy = l.anchor?.includes('n') ? -8 : l.anchor?.includes('s') ? 14 : 4}
    <text x={p.x + dx} y={p.y + dy} class="vlabel {cls(l.color, 'muted')}" text-anchor={dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle'}>{l.text}</text>
  {/each}

  <!-- Dimension lines. -->
  {#each dimsDraw as d}
    <line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} class="dim" />
    <line x1={d.a.x - (d.vertical ? 4 : 0)} y1={d.a.y - (d.vertical ? 0 : 4)} x2={d.a.x + (d.vertical ? 4 : 0)} y2={d.a.y + (d.vertical ? 0 : 4)} class="dim" />
    <line x1={d.b.x - (d.vertical ? 4 : 0)} y1={d.b.y - (d.vertical ? 0 : 4)} x2={d.b.x + (d.vertical ? 4 : 0)} y2={d.b.y + (d.vertical ? 0 : 4)} class="dim" />
    {#if d.vertical}
      <text x={d.a.x - 5} y={(d.a.y + d.b.y) / 2 + 4} class="dimtext" text-anchor="end">{d.text}</text>
    {:else}
      <text x={(d.a.x + d.b.x) / 2} y={d.a.y - 4} class="dimtext">{d.text}</text>
    {/if}
  {/each}
</svg>
</div>

<style>
  .sk-wrap { width: 100%; overflow-x: auto; }
  .step-sketch {
    max-width: none;
    display: block;
    margin: 0 auto;
    --sk-structure: var(--st-text-2);
    --sk-muted: var(--st-text-3);
    --sk-load: #4f8ef7;
    --sk-reaction: #2fb36b;
    --sk-moment: #e5484d;
    --sk-unknown: #2fb36b;
    --sk-dof: #14b8a6;
    --sk-accent: var(--st-accent);
    --sk-tension: #4f8ef7;
    --sk-compression: #e5484d;
    --sk-deformed: #f59e0b;
    --sk-diagram: #b36bd6;
  }
  .c-structure { --c: var(--sk-structure); }
  .c-muted { --c: var(--sk-muted); stroke: var(--sk-muted); }
  .c-load { --c: var(--sk-load); }
  .c-reaction { --c: var(--sk-reaction); }
  .c-moment { --c: var(--sk-moment); }
  .c-unknown { --c: var(--sk-unknown); }
  .c-dof { --c: var(--sk-dof); }
  .c-accent { --c: var(--sk-accent); }
  .c-tension { --c: var(--sk-tension); }
  .c-compression { --c: var(--sk-compression); }
  .c-deformed { --c: var(--sk-deformed); }
  .c-diagram { --c: var(--sk-diagram); }

  .member { stroke: var(--c); stroke-width: 2.4; stroke-linecap: round; }
  .member.faint { opacity: 0.35; stroke-width: 1.6; }
  .member.dashed { stroke-dasharray: 6 5; stroke-width: 1.6; }
  .member.highlight { stroke-width: 3.2; }
  .node { fill: var(--st-text); }
  .hinge { fill: var(--st-surface); stroke: var(--st-text); stroke-width: 1.4; }
  .support { stroke: var(--sk-structure); stroke-width: 1.5; }
  .support-shape { fill: none; stroke: var(--sk-structure); stroke-width: 1.5; }
  .arrow-line { stroke: var(--c); stroke-width: 1.5; fill: none; }
  .arrow-line.dashed { stroke-dasharray: 4 3; }
  .arrow-head { fill: var(--c); }
  .load-line { stroke: var(--c); stroke-width: 1.3; }
  .dia-fill { fill: var(--c); fill-opacity: 0.16; stroke: none; }
  .dia-line { fill: none; stroke: var(--c); stroke-width: 1.5; }
  .deformed { fill: none; stroke: var(--c); stroke-width: 1.6; stroke-dasharray: 5 4; }
  .cut { stroke: var(--c); stroke-width: 1.6; stroke-dasharray: 7 4; }
  .dim { stroke: var(--sk-muted); stroke-width: 0.9; }
  text { font-family: var(--st-sans, system-ui, sans-serif); }
  .nlabel { font-size: 11px; font-style: italic; fill: var(--st-text); }
  .mlabel { font-size: 10px; fill: var(--c); text-anchor: middle; }
  .vlabel { font-size: 10.5px; fill: var(--c); text-anchor: middle; }
  .dlabel { font-size: 9.5px; fill: var(--c); }
  .dimtext { font-size: 10px; fill: var(--sk-muted); text-anchor: middle; }
</style>
