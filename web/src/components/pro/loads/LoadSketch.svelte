<script lang="ts" module>
  /** What the Add load card is editing, for the sketch: SI values, `null` while a field is empty. */
  export type N = number | null;
  export interface SketchInput {
    kind: string;
    frame?: 'local' | 'global' | 'projected';
    shape?: 'trapezoid' | 'triangle' | 'hydrostatic';
    f?: Record<'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz', N>;
    inclined?: boolean;
    incF?: N;
    incFromKind?: 'loaded' | 'node' | 'point';
    incToKind?: 'node' | 'point';
    u?: Record<'dx' | 'dy' | 'dz' | 'drx' | 'dry' | 'drz', N>;
    q?: Record<'xI' | 'xJ' | 'yI' | 'yJ' | 'zI' | 'zJ', N>;
    qa?: N; qb?: N;
    peak?: N; peakAt?: N; peakComp?: 'x' | 'y' | 'z';
    w1?: N; w2?: N; hydroAxis?: 'X' | 'Y' | 'Z'; hydroComp?: 'x' | 'y' | 'z';
    pFrame?: 'local' | 'global';
    p?: Record<'px' | 'py' | 'pz' | 'mx' | 'my' | 'mz', N>;
    pa?: N;
    th?: Record<'dt' | 'gz' | 'gy', N>;
    strainBy?: 'unit' | 'length';
    strain?: N;
    ps?: Record<'force' | 'eI' | 'eM' | 'eJ', N>;
    tq?: Record<'dt' | 'g', N>;
    swDir?: 'X' | 'Y' | 'Z';
    swFactor?: N;
    shell?: {
      dirMode: 'down' | 'local' | 'global' | 'projected'; dirAxis: 'X' | 'Y' | 'Z';
      field: 'uniform' | 'corners' | 'axis'; q: N; corners: number[];
      va: { axis: 'X' | 'Y' | 'Z'; c1: N; q1: N; c2: N; q2: N }; partial: boolean;
      gamma: N; level: N; at: Record<'x' | 'y' | 'z', N>; pf: Record<'fx' | 'fy' | 'fz', N>;
    };
  }
  let seq = 0;
</script>

<script lang="ts">
  /**
   * A small drawing beside the Add load card's fields: what the values being typed stand for. It is
   * drawn from those values as they change: a sign turns an arrow, a larger value draws a longer one,
   * an empty field shows its symbol. The member is drawn from I to J, the frame and the axes named;
   * the picture is schematic, not to scale with the model.
   */
  import { t } from '../../../lib/i18n';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import type { Quantity } from '../../../lib/utils/units';

  let { v }: { v: SketchInput } = $props();
  const id = `ls${++seq}`;

  /** "sym value unit", or the symbol alone while the field is empty. */
  const lbl = (sym: string, x: N | undefined, q: Quantity) => (x === null || x === undefined ? sym : `${sym} ${fmtQ(x, q)} ${unitQ(q)}`);
  const sgn = (x: N | undefined) => (x === null || x === undefined || x === 0 ? 0 : Math.sign(x));
  const mag = (x: N | undefined) => Math.abs(x ?? 0);

  // The member, I to J.
  const X0 = 34, X1 = 166, YM = 78;
  const frameText = (fr: string | undefined) => (fr === 'global' ? t('loads.frame.global') : fr === 'projected' ? t('loads.frame.projected') : t('loads.frame.local'));

  /** A load diagram over the member between relative stations, values qI → qJ (negative drawn above, pointing down). */
  function diagram(qI: number, qJ: number, s0 = 0, s1 = 1) {
    const xa = X0 + (X1 - X0) * s0, xb = X0 + (X1 - X0) * s1;
    const m = Math.max(Math.abs(qI), Math.abs(qJ)) || 1;
    // Negative values draw above the member (y smaller) with arrows pointing down to it.
    const off = (q: number) => (q < 0 ? -Math.max(5, 30 * Math.abs(q) / m) : q > 0 ? Math.max(5, 30 * Math.abs(q) / m) : 0);
    const arrows = [0, 0.25, 0.5, 0.75, 1].map((k) => {
      const q = qI + (qJ - qI) * k, x = xa + (xb - xa) * k, o = off(q);
      return { x, from: YM + o, to: YM + Math.sign(o) * 2, show: Math.abs(o) > 4 };
    });
    return { poly: `${xa},${YM} ${xa},${YM + off(qI)} ${xb},${YM + off(qJ)} ${xb},${YM}`, arrows, yI: YM + off(qI), yJ: YM + off(qJ), xa, xb };
  }

  // ── Distributed: the first component that has a value, z then y then x ──
  const dist = $derived.by(() => {
    const q = v.q ?? { xI: null, xJ: null, yI: null, yJ: null, zI: null, zJ: null };
    const comps = (['z', 'y', 'x'] as const).map((c) => {
      const I = q[`${c}I` as const], J = q[`${c}J` as const] ?? q[`${c}I` as const];
      return { c, I, J };
    });
    const pick = comps.find((c) => sgn(c.I) !== 0 || sgn(c.J) !== 0) ?? null;
    return { pick, others: comps.filter((c) => c !== pick && (sgn(c.I) !== 0 || sgn(c.J) !== 0)).map((c) => c.c) };
  });
  const span = $derived({ s0: v.qa != null && v.qa > 0 ? 0.18 : 0, s1: v.qb != null ? 0.82 : 1 });

  // ── Prestress: the tendon's depth at I, middle and J (positive below the axis) ──
  const tendon = $derived.by(() => {
    const e = v.ps ?? { force: null, eI: null, eM: null, eJ: null };
    const eI = e.eI ?? 0, eJ = e.eJ ?? 0, eM = e.eM ?? (eI + eJ) / 2;
    const m = Math.max(Math.abs(eI), Math.abs(eM), Math.abs(eJ)) || 1;
    const y = (x: number) => YM + 15 * x / m;
    // The parabola through the three, as a quadratic Bézier: its control point puts the curve at eM in the middle.
    const yc = 2 * y(eM) - (y(eI) + y(eJ)) / 2;
    return { d: `M${X0},${y(eI)} Q${(X0 + X1) / 2},${yc} ${X1},${y(eJ)}`, yI: y(eI), yM: y(eM), yJ: y(eJ) };
  });

  // ── Thermal: each face's temperature, from the uniform part and the differences ──
  /*
   * A member: ΔTgz is the −z face minus the +z face, ΔTgy the −y face minus the +y face. A slab
   * (the engine's convention for shells): ΔTg is the +z face minus the −z face. Each face is ΔT
   * plus or minus half its difference; the hotter side lengthens, so a free piece bends toward it.
   */
  const thermal = $derived.by(() => {
    const quad = v.kind === 'thermalQuad';
    const dt = (quad ? v.tq?.dt : v.th?.dt) ?? null, gz = (quad ? v.tq?.g : v.th?.gz) ?? null, gy = quad ? null : (v.th?.gy ?? null);
    const T = dt ?? 0, z = gz ?? 0, y = gy ?? 0;
    const top = quad ? T + z / 2 : T - z / 2, bot = quad ? T - z / 2 : T + z / 2;
    const right = T - y / 2, left = T + y / 2;
    const all = [top, bot, ...(gy ? [left, right] : [])];
    const lo = Math.min(...all), hi = Math.max(...all);
    /** A face's colour: warm at the hottest, cool at the coldest; one temperature, by its sign. */
    const tone = (x: number) => (hi - lo > 1e-9 ? (x - lo) / (hi - lo) : T > 0 ? 1 : T < 0 ? 0 : 0.5);
    const col = (x: number) => `color-mix(in srgb, var(--ls-hot) ${Math.round(100 * tone(x))}%, var(--ls-cold))`;
    /** Which way a free piece bows: toward the hotter of its two faces (+1 up, −1 down, 0 none). */
    const bow = Math.sign(top - bot);
    return { dt, gz, gy, top, bot, left, right, col, bow, grows: Math.sign(T), any: dt !== null || gz !== null || gy !== null };
  });
  const tval = (x: number) => `${fmtQ(x, 'temperatureDiff')} ${unitQ('temperatureDiff')}`;

  // ── Slabs ──
  const SLAB = '40,92 140,92 172,62 72,62';
  const slabPts: Array<[number, number]> = [[40, 92], [140, 92], [172, 62], [72, 62]];
  const shellArrows = $derived.by(() => {
    const s = v.shell;
    if (!s) return [];
    const grid: Array<[number, number]> = [[62, 84], [100, 84], [138, 84], [80, 70], [118, 70], [154, 70]];
    const along = (gx: number) => (gx - 40) / 132;
    return grid.map(([x, y]) => {
      let q: number;
      if (s.field === 'uniform') q = s.q ?? 1;
      else if (s.field === 'axis') { const a = along(x); q = (s.va.q1 ?? 1) + ((s.va.q2 ?? 1) - (s.va.q1 ?? 1)) * a; }
      else { const c = s.corners; const a = along(x), b = (92 - y) / 30; q = c.length >= 4 ? (c[0]! * (1 - a) * (1 - b) + c[1]! * a * (1 - b) + c[2]! * a * b + c[3]! * (1 - a) * b) : 1; }
      return { x, y, q };
    });
  });
  const shellMax = $derived(Math.max(1e-9, ...shellArrows.map((a) => Math.abs(a.q))));
  /** Which way a slab's load points on the sketch: down for gravity, up for the normal or +Z. */
  const shellDown = $derived(v.shell?.dirMode === 'down');

  // ── Nodal forces: an arrow per component with a value, ending at the node ──
  const NODE = { x: 104, y: 64 };
  const DIRS: Record<'x' | 'y' | 'z', [number, number]> = { x: [1, 0], y: [0.7, -0.7], z: [0, -1] };
  function forceArrow(c: 'x' | 'y' | 'z', val: number, len: number, at = NODE) {
    const [dx, dy] = DIRS[c];
    const s = Math.sign(val);
    // The arrow points along +c for a positive value; its head is at the point loaded.
    return { x1: at.x - s * dx * len, y1: at.y - s * dy * len, x2: at.x - s * dx * 4, y2: at.y - s * dy * 4 };
  }
  const nodalArrows = $derived.by(() => {
    const f = v.f ?? { fx: null, fy: null, fz: null, mx: null, my: null, mz: null };
    const comps = (['x', 'y', 'z'] as const).filter((c) => sgn(f[`f${c}`]) !== 0);
    const m = Math.max(...comps.map((c) => mag(f[`f${c}`])), 1e-9);
    return comps.map((c) => ({ c, val: f[`f${c}`]!, ...forceArrow(c, f[`f${c}`]!, 18 + 26 * mag(f[`f${c}`]) / m) }));
  });
  const nodalMoments = $derived((['x', 'y', 'z'] as const).filter((c) => sgn(v.f?.[`m${c}`]) !== 0));

  const pointArrow = $derived.by(() => {
    const p = v.p ?? { px: null, py: null, pz: null, mx: null, my: null, mz: null };
    const at = { x: X0 + (X1 - X0) * (v.pa != null ? 0.38 : 0.5), y: YM };
    const c = (['z', 'y'] as const).find((k) => sgn(p[`p${k}`]) !== 0);
    const axial = sgn(p.px) !== 0;
    return { at, c, val: c ? p[`p${c}`]! : null, axial, moment: (['x', 'y', 'z'] as const).find((k) => sgn(p[`m${k}`]) !== 0) ?? null };
  });
</script>

<svg class="ls" viewBox="0 0 200 128" role="img" aria-label={t('writeLoad.sketch')} data-testid="load-sketch" data-kind={v.kind}>
  <defs>
    <marker id="{id}-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L8,4 L0,8 z" class="ls-head" />
    </marker>
  </defs>

  {#snippet member(labels = true)}
    <line x1={X0} y1={YM} x2={X1} y2={YM} class="ls-member" />
    <circle cx={X0} cy={YM} r="2.6" class="ls-node" /><circle cx={X1} cy={YM} r="2.6" class="ls-node" />
    {#if labels}<text x={X0} y={YM + 14} class="ls-t" text-anchor="middle">I</text><text x={X1} y={YM + 14} class="ls-t" text-anchor="middle">J</text>{/if}
  {/snippet}
  {#snippet axes(x: number, y: number)}
    <!-- The global axes, Z up, X to the right, Y into the page. -->
    <line x1={x} y1={y} x2={x + 14} y2={y} class="ls-axis" marker-end="url(#{id}-a)" /><text x={x + 16} y={y + 3} class="ls-ax">X</text>
    <line x1={x} y1={y} x2={x} y2={y - 14} class="ls-axis" marker-end="url(#{id}-a)" /><text x={x - 3} y={y - 16} class="ls-ax">Z</text>
    <line x1={x} y1={y} x2={x + 9} y2={y - 9} class="ls-axis" marker-end="url(#{id}-a)" /><text x={x + 10} y={y - 10} class="ls-ax">Y</text>
  {/snippet}
  {#snippet arc(cx: number, cy: number, label: string)}
    <path d="M{cx + 9},{cy} A9,9 0 1,1 {cx},{cy - 9}" class="ls-load ls-thin" marker-end="url(#{id}-a)" />
    <text x={cx + 12} y={cy - 10} class="ls-v">{label}</text>
  {/snippet}

  {#if v.kind === 'nodal' && v.inclined}
    {@const loaded = (v.incFromKind ?? 'loaded') === 'loaded'}
    {@const A = loaded ? { x: 48, y: 98 } : { x: 26, y: 96 }}
    {@const B = { x: loaded ? 128 : 96, y: 34 }}
    {@const len = Math.hypot(B.x - A.x, B.y - A.y)}
    {@const ux = (B.x - A.x) / len}
    {@const uy = (B.y - A.y) / len}
    {@const N = loaded ? A : { x: 150, y: 100 }}
    {@const s = sgn(v.incF) || 1}
    <!-- The direction, from its origin to its target; the force acts at the loaded node, along it. -->
    <line x1={A.x} y1={A.y} x2={B.x - ux * 5} y2={B.y - uy * 5} class="ls-guide" marker-end="url(#{id}-a)" />
    <circle cx={A.x} cy={A.y} r="3" class={loaded || v.incFromKind === 'node' ? 'ls-node' : 'ls-point'} />
    <circle cx={B.x} cy={B.y} r="3" class={v.incToKind === 'point' ? 'ls-point' : 'ls-node'} />
    <text x={B.x} y={B.y - 7} class="ls-t" text-anchor="middle">{t('writeLoad.toward')}: {t(`writeLoad.inc.${v.incToKind ?? 'node'}`)}</text>
    {#if !loaded}<text x={A.x} y={A.y + 13} class="ls-t">{t('writeLoad.from')}: {t(`writeLoad.inc.${v.incFromKind}`)}</text>{/if}
    <circle cx={N.x} cy={N.y} r="3.4" class="ls-node" />
    <line x1={N.x} y1={N.y} x2={N.x + s * ux * 40} y2={N.y + s * uy * 40} class="ls-load" marker-end="url(#{id}-a)" />
    <text x={N.x + s * ux * 40 + (loaded ? 6 : -4)} y={N.y + s * uy * 40 - 4} class="ls-v" text-anchor={loaded ? 'start' : 'end'}>{lbl('F', v.incF, 'force')}</text>
    <text x={N.x} y={N.y + 14} class="ls-t" text-anchor={loaded ? 'start' : 'middle'}>{loaded ? `${t('writeLoad.sketch.loaded')} = ${t('writeLoad.from').toLowerCase()}` : t('writeLoad.sketch.loaded')}</text>
  {:else if v.kind === 'nodal'}
    <circle cx={NODE.x} cy={NODE.y} r="3.4" class="ls-node" />
    {#each nodalArrows as a (a.c)}
      <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} class="ls-load" marker-end="url(#{id}-a)" />
      <text x={a.c === 'x' ? Math.min(a.x1, a.x2) : a.x1 + (a.c === 'z' ? 4 : 2)} y={a.c === 'x' ? a.y1 + 13 : a.c === 'z' && a.y1 < NODE.y ? a.y1 + 2 : a.y1 + 9} class="ls-v">{lbl(`F${a.c}`, a.val, 'force')}</text>
    {/each}
    {#each nodalMoments as c, i (c)}{@render arc(NODE.x + 20, NODE.y + 30 + i * 13, lbl(`M${c}`, v.f?.[`m${c}`], 'moment'))}{/each}
    {#if nodalArrows.length === 0 && nodalMoments.length === 0}
      <line x1={NODE.x} y1="20" x2={NODE.x} y2={NODE.y - 5} class="ls-load ls-ghost" marker-end="url(#{id}-a)" />
      <text x={NODE.x + 5} y="26" class="ls-v ls-ghost-t">Fx, Fy, Fz, Mx, My, Mz</text>
    {/if}
    {@render axes(14, 118)}
  {:else if v.kind === 'displacement'}
    {@const dx = sgn(v.u?.dx)}{@const dz = sgn(v.u?.dz)}
    <polygon points="92,92 80,108 104,108" class="ls-support" />
    <circle cx="92" cy="90" r="3.2" class="ls-node" />
    {#if dx || dz}
      <circle cx={92 + dx * 34} cy={90 - dz * 34} r="3.2" class="ls-ghostnode" />
      <line x1="92" y1="90" x2={92 + dx * 32} y2={90 - dz * 32} class="ls-load" marker-end="url(#{id}-a)" />
    {:else}
      <circle cx="126" cy="56" r="3.2" class="ls-ghostnode" />
    {/if}
    <text x="112" y={dz ? 34 : 100} class="ls-v">{lbl('dx', v.u?.dx, 'displacement')}</text>
    <text x="112" y={dz ? 46 : 112} class="ls-v">{lbl('dz', v.u?.dz, 'displacement')}</text>
    {#if sgn(v.u?.dy)}<text x="112" y="22" class="ls-v">{lbl('dy', v.u?.dy, 'displacement')}</text>{/if}
    <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.imposed')}</text>
    {@render axes(14, 118)}
  {:else if v.kind === 'distributed' && v.shape === 'hydrostatic'}
    {@const w1 = v.w1 ?? 1}{@const w2 = v.w2 ?? 0}{@const m = Math.max(Math.abs(w1), Math.abs(w2)) || 1}{@const s = sgn(w1) || sgn(w2) || 1}
    <!-- Along the axis, w₁ at the lowest coordinate and w₂ at the highest. -->
    <line x1="120" y1="112" x2="120" y2="22" class="ls-member" />
    <circle cx="120" cy="112" r="2.6" class="ls-node" /><circle cx="120" cy="22" r="2.6" class="ls-node" />
    <polygon points="120,112 {120 - s * 50 * Math.abs(w1) / m},112 {120 - s * 50 * Math.abs(w2) / m},22 120,22" class="ls-diag" />
    {#each [0, 0.25, 0.5, 0.75] as k (k)}
      {@const w = Math.abs(w1 + (w2 - w1) * k) / m}{@const y = 112 - 90 * k}
      {#if w > 0.08}<line x1={120 - s * 50 * w} y1={y} x2={120 - s * 3} y2={y} class="ls-load ls-thin" marker-end="url(#{id}-a)" />{/if}
    {/each}
    <text x="126" y="114" class="ls-v">{lbl('w₁', v.w1, 'distributedLoad')}</text>
    <text x="126" y="26" class="ls-v">{lbl('w₂', v.w2, 'distributedLoad')}</text>
    <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.alongAxis').replace('{a}', v.hydroAxis ?? 'Z')}</text>
  {:else if v.kind === 'distributed'}
    {@const c = dist.pick}
    {#if v.shape === 'triangle'}
      {@const pk = v.peak ?? -1}{@const sp = v.peakAt != null ? 0.35 : 0.5}{@const off = pk < 0 ? -32 : 32}
      <polygon points="{X0},{YM} {X0 + (X1 - X0) * sp},{YM + off} {X1},{YM}" class="ls-diag" />
      <line x1={X0 + (X1 - X0) * sp} y1={YM + off} x2={X0 + (X1 - X0) * sp} y2={YM + Math.sign(off) * 2} class="ls-load" marker-end="url(#{id}-a)" />
      <text x={X0 + (X1 - X0) * sp + 4} y={YM + off + (off < 0 ? -2 : 10)} class="ls-v">{lbl(`q${v.peakComp ?? 'z'}`, v.peak, 'distributedLoad')}</text>
      {#if v.peakAt != null}<text x={X0 + (X1 - X0) * sp} y={YM + 26} class="ls-t" text-anchor="middle">{lbl('', v.peakAt, 'length').trim()}</text>{/if}
    {:else}
      {@const qI = c ? (c.I ?? 0) : -1}{@const qJ = c ? (c.J ?? c.I ?? 0) : -1}{@const d = c?.c === 'x' ? null : diagram(qI, qJ, span.s0, span.s1)}
      {#if d}
        <polygon points={d.poly} class="ls-diag" />
        {#each d.arrows as a, i (i)}{#if a.show}<line x1={a.x} y1={a.from} x2={a.x} y2={a.to} class="ls-load ls-thin" marker-end="url(#{id}-a)" />{/if}{/each}
        {@const above = Math.min(d.yI, d.yJ) < YM}
        <!-- The two values in rows of their own, clear of the diagram: I's at the left, J's at the right. -->
        <text x={d.xa} y={above ? 24 : 112} class="ls-v">{c ? lbl(`q${c.c} I`, c.I, 'distributedLoad') : 'q I'}</text>
        <text x={d.xb} y={above ? 35 : 123} class="ls-v" text-anchor="end">{c ? lbl('J', v.q?.[`${c.c}J`] ?? null, 'distributedLoad') : 'J'}</text>
        <line x1={d.xa} y1={above ? 27 : 104} x2={d.xa} y2={d.yI} class="ls-guide" />
        <line x1={d.xb} y1={above ? 38 : 115} x2={d.xb} y2={d.yJ} class="ls-guide" />
      {:else}
        <!-- Along the member: arrows on its axis. -->
        {#each [0.2, 0.45, 0.7] as k (k)}<line x1={X0 + (X1 - X0) * k} y1={YM - 6} x2={X0 + (X1 - X0) * (k + (sgn(c?.I) < 0 ? -0.12 : 0.12))} y2={YM - 6} class="ls-load ls-thin" marker-end="url(#{id}-a)" />{/each}
        <text x={X0} y={YM - 12} class="ls-v">{lbl('qx', c?.I ?? null, 'distributedLoad')}</text>
      {/if}
      {#if span.s0 > 0}<line x1={X0 + (X1 - X0) * span.s0} y1={YM + 3} x2={X0 + (X1 - X0) * span.s0} y2={YM + 8} class="ls-dim" /><text x={X0 + (X1 - X0) * span.s0} y={YM + 17} class="ls-t" text-anchor="middle">{lbl('a', v.qa, 'length')}</text>{/if}
      {#if span.s1 < 1}<line x1={X0 + (X1 - X0) * span.s1} y1={YM + 3} x2={X0 + (X1 - X0) * span.s1} y2={YM + 8} class="ls-dim" /><text x={X0 + (X1 - X0) * span.s1} y={YM + 17} class="ls-t" text-anchor="middle">{lbl('b', v.qb, 'length')}</text>{/if}
      {#if dist.others.length}<text x="196" y="124" class="ls-t" text-anchor="end">+ q{dist.others.join(', q')}</text>{/if}
    {/if}
    {@render member()}
    <text x="4" y="12" class="ls-t">{frameText(v.frame)}</text>
  {:else if v.kind === 'point'}
    {@const pa = pointArrow}
    {@render member()}
    {#if pa.c}
      {@const down = (pa.val ?? 0) < 0}
      <line x1={pa.at.x} y1={down ? YM - 40 : YM + 40} x2={pa.at.x} y2={down ? YM - 4 : YM + 4} class="ls-load" marker-end="url(#{id}-a)" />
      <text x={pa.at.x + 4} y={down ? YM - 34 : YM + 40} class="ls-v">{lbl(`P${pa.c}`, pa.val, 'force')}</text>
    {:else if !pa.axial && !pa.moment}
      <line x1={pa.at.x} y1={YM - 40} x2={pa.at.x} y2={YM - 4} class="ls-load ls-ghost" marker-end="url(#{id}-a)" />
      <text x={pa.at.x + 4} y={YM - 34} class="ls-v ls-ghost-t">P, M</text>
    {/if}
    {#if pa.axial}<line x1={pa.at.x - (sgn(v.p?.px) < 0 ? -26 : 26)} y1={YM - 5} x2={pa.at.x} y2={YM - 5} class="ls-load" marker-end="url(#{id}-a)" /><text x={pa.at.x - 30} y={YM - 9} class="ls-v">{lbl('Px', v.p?.px, 'force')}</text>{/if}
    {#if pa.moment}{@render arc(pa.at.x + 22, YM + 2, lbl(`M${pa.moment}`, v.p?.[`m${pa.moment}`], 'moment'))}{/if}
    <line x1={X0} y1={YM + 22} x2={pa.at.x} y2={YM + 22} class="ls-dim" marker-start="url(#{id}-a)" marker-end="url(#{id}-a)" />
    <text x={(X0 + pa.at.x) / 2} y={YM + 32} class="ls-t" text-anchor="middle">{v.pa != null ? lbl('a', v.pa, 'length') : 'a = L/2'}</text>
    <text x="4" y="12" class="ls-t">{frameText(v.pFrame)}</text>
  {:else if v.kind === 'thermal'}
    {@const th = thermal}
    <!-- The member, side on, its +z face above: each face in its temperature's colour, and dashed,
         how it moves if free (longer when warmer, bowed toward the warmer face). -->
    <defs><linearGradient id="{id}-tz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style:stop-color={th.col(th.top)} /><stop offset="1" style:stop-color={th.col(th.bot)} /></linearGradient></defs>
    <rect x="14" y="62" width="94" height="22" fill="url(#{id}-tz)" class="ls-hotbody" />
    <line x1="14" y1="62" x2="108" y2="62" class="ls-face" style:stroke={th.col(th.top)} />
    <line x1="14" y1="84" x2="108" y2="84" class="ls-face" style:stroke={th.col(th.bot)} />
    {#if th.any}<path d="M{14 - 4 * th.grows},73 Q61,{73 - 16 * th.bow} {108 + 4 * th.grows},73" class="ls-free" />{/if}
    <text x="14" y="96" class="ls-t">I</text><text x="108" y="96" class="ls-t" text-anchor="end">J</text>
    <!-- The cross-section: y to the right, z up; each face says its temperature. -->
    <defs><linearGradient id="{id}-ty" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style:stop-color={th.col(th.left)} /><stop offset="1" style:stop-color={th.col(th.right)} /></linearGradient></defs>
    <rect x="146" y="58" width="30" height="30" fill={th.gy ? `url(#${id}-ty)` : `url(#${id}-tz)`} class="ls-hotbody" />
    <line x1="146" y1="58" x2="176" y2="58" class="ls-face" style:stroke={th.col(th.top)} />
    <line x1="146" y1="88" x2="176" y2="88" class="ls-face" style:stroke={th.col(th.bot)} />
    {#if th.gy}<line x1="146" y1="58" x2="146" y2="88" class="ls-face" style:stroke={th.col(th.left)} /><line x1="176" y1="58" x2="176" y2="88" class="ls-face" style:stroke={th.col(th.right)} />{/if}
    <line x1="161" y1="73" x2="161" y2="63" class="ls-axis" marker-end="url(#{id}-a)" /><text x="164" y="66" class="ls-ax">z</text>
    <line x1="161" y1="73" x2="171" y2="73" class="ls-axis" marker-end="url(#{id}-a)" /><text x="168" y="81" class="ls-ax">y</text>
    <text x="161" y="50" class="ls-v" text-anchor="middle">+z {th.any ? tval(th.top) : ''}</text>
    <text x="161" y="100" class="ls-v" text-anchor="middle">−z {th.any ? tval(th.bot) : ''}</text>
    {#if th.gy}<text x="161" y="112" class="ls-t" text-anchor="middle">−y {fmtQ(th.left, 'temperatureDiff')} · +y {fmtQ(th.right, 'temperatureDiff')}</text>{/if}
    <text x="4" y="12" class="ls-t">ΔTgz = T(−z) − T(+z){th.gy ? ' · ΔTgy = T(−y) − T(+y)' : ''}</text>
    <text x="4" y="122" class="ls-t">{th.any ? `- - ${t('writeLoad.sketch.free')}` : t('writeLoad.sketch.thermalEmpty')}</text>
  {:else if v.kind === 'thermalQuad'}
    {@const th = thermal}
    <!-- A slab: its upper face (+z local) and its lower face, each in its temperature's colour. -->
    <defs><linearGradient id="{id}-tq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style:stop-color={th.col(th.top)} /><stop offset="1" style:stop-color={th.col(th.bot)} /></linearGradient></defs>
    <polygon points="34,70 134,70 170,44 70,44" class="ls-hotbody" style:fill={th.col(th.top)} />
    <polygon points="34,70 134,70 134,84 34,84" fill="url(#{id}-tq)" class="ls-hotbody" />
    <polygon points="134,70 170,44 170,58 134,84" fill="url(#{id}-tq)" class="ls-hotbody" />
    <line x1="34" y1="84" x2="134" y2="84" class="ls-face" style:stroke={th.col(th.bot)} />
    {#if th.any}<path d="M{34 - 4 * th.grows},96 Q84,{96 - 14 * th.bow} {134 + 4 * th.grows},96" class="ls-free" />{/if}
    <text x="100" y="36" class="ls-v" text-anchor="middle">+z {th.any ? tval(th.top) : ''}</text>
    <text x="196" y="96" class="ls-v" text-anchor="end">−z {th.any ? tval(th.bot) : ''}</text>
    <text x="4" y="12" class="ls-t">ΔTg = T(+z) − T(−z)</text>
    <text x="4" y="122" class="ls-t">{th.any ? `- - ${t('writeLoad.sketch.free')}` : t('writeLoad.sketch.thermalEmpty')}</text>
  {:else if v.kind === 'strain'}
    {@const s = sgn(v.strain) || 1}
    <rect x="50" y="68" width="100" height="20" class="ls-beam" />
    <line x1={s > 0 ? 48 : 28} y1="78" x2={s > 0 ? 26 : 46} y2="78" class="ls-load" marker-end="url(#{id}-a)" />
    <line x1={s > 0 ? 152 : 172} y1="78" x2={s > 0 ? 174 : 154} y2="78" class="ls-load" marker-end="url(#{id}-a)" />
    <text x="100" y="58" class="ls-v" text-anchor="middle">{v.strainBy === 'length' ? lbl('ΔL', v.strain, 'displacement') : (v.strain == null ? 'ε₀ (‰)' : `ε₀ ${v.strain} ‰`)}</text>
    <text x="100" y="108" class="ls-t" text-anchor="middle">{s > 0 ? t('writeLoad.sketch.lengthens') : t('writeLoad.sketch.shortens')}</text>
  {:else if v.kind === 'prestress'}
    {@const td = tendon}
    <rect x={X0} y="60" width={X1 - X0} height="36" class="ls-beam" />
    <line x1={X0} y1={YM} x2={X1} y2={YM} class="ls-guide" />
    <path d={td.d} class="ls-tendon" />
    <line x1={X0 - 22} y1={td.yI} x2={X0 - 3} y2={td.yI} class="ls-load" marker-end="url(#{id}-a)" />
    <line x1={X1 + 22} y1={td.yJ} x2={X1 + 3} y2={td.yJ} class="ls-load" marker-end="url(#{id}-a)" />
    <text x="100" y="52" class="ls-v" text-anchor="middle">{lbl('P', v.ps?.force, 'force')}</text>
    <text x={X0 + 2} y="110" class="ls-t">{lbl('eI', v.ps?.eI, 'length')}</text>
    <text x="100" y="122" class="ls-t" text-anchor="middle">{v.ps?.eM == null ? t('writeLoad.sketch.eMean') : lbl('eM', v.ps?.eM, 'length')}</text>
    <text x={X1 - 2} y="110" class="ls-t" text-anchor="end">{lbl('eJ', v.ps?.eJ, 'length')}</text>
    <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.eBelow')}</text>
  {:else if v.kind === 'selfWeight'}
    {@const dir = v.swDir ?? 'Z'}{@const f = v.swFactor ?? -1}{@const s = Math.sign(f) || -1}
    {@render member()}
    {#each [0.15, 0.38, 0.62, 0.85] as k (k)}
      {@const x = X0 + (X1 - X0) * k}
      {#if dir === 'Z'}<line x1={x} y1={s < 0 ? YM - 30 : YM + 30} x2={x} y2={s < 0 ? YM - 4 : YM + 4} class="ls-load ls-thin" marker-end="url(#{id}-a)" />
      {:else if dir === 'X'}<line x1={x - s * 12} y1={YM - 12} x2={x + s * 12} y2={YM - 12} class="ls-load ls-thin" marker-end="url(#{id}-a)" />
      {:else}<line x1={x - s * 8} y1={YM - 4 + s * 8} x2={x + s * 8} y2={YM - 4 - s * 8} class="ls-load ls-thin" marker-end="url(#{id}-a)" />{/if}
    {/each}
    <text x="100" y="32" class="ls-v" text-anchor="middle">ρ·A × {v.swFactor ?? '−1'} · {dir}</text>
    {@render axes(14, 118)}
  {:else if v.kind === 'surface' && v.shell}
    {@const s = v.shell}
    <polygon points={SLAB} class="ls-slab" />
    {#if s.partial}<polygon points="70,86 112,86 128,70 86,70" class="ls-region" />{/if}
    {#each shellArrows as a, i (i)}
      {@const len = 6 + 22 * Math.abs(a.q) / shellMax}{@const up = shellDown ? a.q < 0 : a.q > 0}
      {#if Math.abs(a.q) > 1e-9}<line x1={a.x} y1={up ? a.y : a.y - len} x2={a.x} y2={up ? a.y - len : a.y - 2} class="ls-load ls-thin" marker-end="url(#{id}-a)" />{/if}
    {/each}
    {#if s.field === 'corners'}
      {#each slabPts as [x, y], i (i)}<text x={x + (i < 2 ? 0 : 2)} y={y + (i < 2 ? 11 : -4)} class="ls-t" text-anchor="middle">q{['₁', '₂', '₃', '₄'][i]}{s.corners[i] !== undefined ? ` ${s.corners[i]}` : ''}</text>{/each}
    {:else if s.field === 'axis'}
      <text x="40" y="112" class="ls-v">{lbl('q₁', s.va.q1, 'areaLoad')} @ {lbl(`${s.va.axis}₁`, s.va.c1, 'length')}</text>
      <text x="196" y="124" class="ls-v" text-anchor="end">{lbl('q₂', s.va.q2, 'areaLoad')} @ {lbl(`${s.va.axis}₂`, s.va.c2, 'length')}</text>
    {:else}
      <text x="100" y="112" class="ls-v" text-anchor="middle">{lbl('q', s.q, 'areaLoad')}</text>
    {/if}
    <text x="4" y="12" class="ls-t">{s.dirMode === 'down' ? '−Z' : s.dirMode === 'local' ? t('writeLoad.sketch.normal') : `+${s.dirAxis}${s.dirMode === 'projected' ? ` · ${t('loads.frame.projected')}` : ''}`}</text>
  {:else if v.kind === 'hydro' && v.shell}
    <!-- A wall below the fluid's level: pressure γ·depth, pushing the wall out of the fluid. -->
    <rect x="104" y="30" width="8" height="86" class="ls-slab" />
    <line x1="30" y1="50" x2="112" y2="50" class="ls-level" />
    <text x="4" y="20" class="ls-t">{lbl(t('writeLoad.shell.level'), v.shell.level, 'length')}</text>
    <line x1="30" y1="23" x2="30" y2="48" class="ls-guide" />
    <polygon points="104,50 104,116 54,116" class="ls-diag" />
    {#each [0.3, 0.55, 0.8] as k (k)}<line x1={104 - 50 * k} y1={50 + 66 * k} x2="102" y2={50 + 66 * k} class="ls-load ls-thin" marker-end="url(#{id}-a)" />{/each}
    <text x="120" y="96" class="ls-v">{lbl('γ', v.shell.gamma, 'density')}</text>
    <text x="120" y="108" class="ls-t">p = γ · {t('writeLoad.sketch.depth')}</text>
  {:else if v.kind === 'shellPoint' && v.shell}
    {@const pf = v.shell.pf}{@const c = (['fz', 'fx', 'fy'] as const).find((k) => sgn(pf[k]) !== 0) ?? 'fz'}{@const val = pf[c]}
    <polygon points={SLAB} class="ls-slab" />
    <circle cx="108" cy="77" r="2.4" class="ls-pt" />
    {#if c === 'fz'}<line x1="108" y1={(val ?? -1) < 0 ? 30 : 118} x2="108" y2={(val ?? -1) < 0 ? 74 : 80} class="ls-load" marker-end="url(#{id}-a)" />
    {:else}<line x1={108 - (sgn(val) || 1) * 34 * (c === 'fx' ? 1 : 0.7)} y1={77 + (c === 'fy' ? (sgn(val) || 1) * 24 : 0)} x2="105" y2="77" class="ls-load" marker-end="url(#{id}-a)" />{/if}
    <text x="114" y="34" class="ls-v">{lbl(c === 'fz' ? 'Fz' : c === 'fx' ? 'Fx' : 'Fy', val, 'force')}</text>
    <text x="114" y="112" class="ls-t">({[v.shell.at.x, v.shell.at.y, v.shell.at.z].map((x) => (x == null ? '·' : fmtQ(x, 'length'))).join('; ')}) {unitQ('length')}</text>
    {@render axes(14, 118)}
  {/if}
</svg>

<style>
  .ls { --ls-hot: var(--st-accent); --ls-cold: #4d8fd6; width: 200px; max-width: 100%; height: auto; flex: none; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .ls-member { stroke: var(--st-text-2); stroke-width: 2.2; }
  .ls-beam { fill: var(--st-surface-2); stroke: var(--st-text-2); stroke-width: 1.2; }
  .ls-slab { fill: color-mix(in srgb, var(--st-text-3) 22%, transparent); stroke: var(--st-text-2); stroke-width: 1.1; }
  .ls-region { fill: color-mix(in srgb, var(--st-accent) 18%, transparent); stroke: var(--st-accent); stroke-dasharray: 3 2; stroke-width: 0.8; }
  .ls-node { fill: var(--st-text); }
  .ls-ghostnode { fill: none; stroke: var(--st-text-2); stroke-dasharray: 2 2; }
  .ls-point { fill: none; stroke: var(--st-text); }
  .ls-pt { fill: var(--st-accent); }
  .ls-support { fill: none; stroke: var(--st-text-2); stroke-width: 1.2; }
  .ls-load { stroke: var(--st-accent); stroke-width: 1.8; fill: none; }
  .ls-thin { stroke-width: 1.2; }
  .ls-ghost { opacity: 0.45; stroke-dasharray: 3 2; }
  .ls-head { fill: var(--st-accent); }
  .ls-diag { fill: color-mix(in srgb, var(--st-accent) 20%, transparent); stroke: var(--st-accent); stroke-width: 0.8; }
  .ls-guide { stroke: var(--st-text-3); stroke-dasharray: 3 3; stroke-width: 0.9; }
  .ls-dim { stroke: var(--st-text-3); stroke-width: 0.8; }
  .ls-level { stroke: var(--st-interactive, var(--st-accent)); stroke-width: 1; stroke-dasharray: 5 2; }
  .ls-tendon { stroke: var(--st-accent); stroke-width: 1.8; fill: none; }
  .ls-axis { stroke: var(--st-text-3); stroke-width: 1; }
  .ls-hotbody { stroke: var(--st-text-2); stroke-width: 0.8; fill-opacity: 0.55; }
  .ls-face { stroke-width: 3; }
  .ls-free { fill: none; stroke: var(--st-text-2); stroke-width: 1.2; stroke-dasharray: 4 3; }
  .ls-ax { fill: var(--st-text-3); font-size: 7px; }
  .ls-t { fill: var(--st-text-3); font-size: 8px; }
  .ls-v { fill: var(--st-text); font-size: 8.5px; font-family: var(--st-mono); }
  .ls-ghost-t { fill: var(--st-text-3); }
</style>
