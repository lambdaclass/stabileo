<script lang="ts" module>
  /** What the Add load card is editing, for the sketch: SI values, `null` while a field is empty. */
  export type N = number | null;
  export type P3 = Record<'x' | 'y' | 'z', N>;
  export interface SketchInput {
    kind: string;
    frame?: 'local' | 'global' | 'projected';
    shape?: 'trapezoid' | 'triangle' | 'hydrostatic';
    f?: Record<'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz', N>;
    inclined?: boolean;
    incF?: N;
    incFromKind?: 'node' | 'point';
    incFromNode?: string; incFrom?: P3;
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
      va: { axis: 'X' | 'Y' | 'Z'; c1: N; q1: N; c2: N; q2: N };
      partial: boolean; rect?: { plane: 'XY' | 'XZ' | 'YZ'; u1: N; v1: N; u2: N; v2: N };
      gamma: N; level: N; inside?: P3; at: P3; pf: Record<'fx' | 'fy' | 'fz', N>;
    };
  }
  let seq = 0;
</script>

<script lang="ts">
  /**
   * A drawing beside the Add load card's fields: what each value being typed stands for, every one
   * of them named or dimensioned. It is drawn from the values as they change (a sign turns an arrow,
   * a larger value draws a longer one, an empty field shows its symbol). Members are drawn sloping so
   * local, global and projected axes read apart; slabs are drawn side on (direction, true or projected
   * area) and in plan (how the value spreads). Schematic, not to the model's scale.
   *
   * The button on its corner shows it large over the model, beside the panel; Escape or × closes it.
   */
  import { t } from '../../../lib/i18n';
  import { fmtQ, unitQ } from '../../../lib/store/display-units.svelte';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { viewportCanvas } from '../../../lib/utils/viewport-canvas';
  import { portal } from '../../../lib/utils/portal';
  import type { Quantity } from '../../../lib/utils/units';

  let { v }: { v: SketchInput } = $props();
  const id = `ls${++seq}`;

  // ── Values said ──
  const val = (x: N | undefined, q: Quantity) => `${fmtQ(x as number, q)} ${unitQ(q)}`;
  /** "sym = value unit", or the symbol alone while the field is empty. */
  const lbl = (sym: string, x: N | undefined, q: Quantity) => (x === null || x === undefined ? sym : `${sym} = ${val(x, q)}`);
  const sgn = (x: N | undefined) => (x === null || x === undefined || x === 0 ? 0 : Math.sign(x));
  const mag = (x: N | undefined) => Math.abs(x ?? 0);
  const pt3 = (p: P3 | undefined) => `(${(['x', 'y', 'z'] as const).map((k) => (p?.[k] == null ? '·' : fmtQ(p[k] as number, 'length'))).join('; ')}) ${unitQ('length')}`;

  // ── Plane geometry of the drawing ──
  type V = [number, number];
  const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];
  const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
  const unit = (a: V): V => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  /** The global axes on paper: X to the right, Z up, Y into the page drawn oblique. */
  const AX: Record<'X' | 'Y' | 'Z', V> = { X: [1, 0], Y: unit([0.62, -0.45]), Z: [0, -1] };
  // A member, sloping, I to J; its local x along it, local z up from it, local y into the page.
  const MI: V = [34, 98], MJ: V = [186, 58];
  const MU = unit(sub(MJ, MI)), MN: V = [MU[1], -MU[0]];
  const onM = (s: number): V => add(MI, sub(MJ, MI), s);
  const memberDir = (frame: string | undefined, c: string): V => (frame === 'local' || frame === undefined
    ? (c === 'x' ? MU : c === 'z' ? MN : AX.Y)
    : AX[c.toUpperCase() as 'X']);
  const axisName = (frame: string | undefined, c: string) => (frame === 'local' || frame === undefined ? c : c.toUpperCase());

  /** A load spread along the member between stations s0 and s1, values qI → qJ acting along d. */
  function spread(d: V, qI: number, qJ: number, s0 = 0, s1 = 1) {
    const m = Math.max(Math.abs(qI), Math.abs(qJ)) || 1;
    const len = (q: number) => (q === 0 ? 0 : Math.max(6, 28 * Math.abs(q) / m));
    const tail = (s: number, q: number) => add(onM(s), d, -Math.sign(q) * len(q));
    const at = (k: number) => s0 + (s1 - s0) * k;
    const qk = (k: number) => qI + (qJ - qI) * k;
    const arrows = [0, 0.25, 0.5, 0.75, 1].filter((k) => len(qk(k)) > 5).map((k) => ({ t: tail(at(k), qk(k)), h: add(onM(at(k)), d, -Math.sign(qk(k)) * 2.5) }));
    const tI = tail(s0, qI), tJ = tail(s1, qJ);
    return { poly: [onM(s0), tI, tJ, onM(s1)].map((p) => p.join(',')).join(' '), arrows, tI, tJ };
  }

  // ── Distributed: the first component that has a value, z then y then x ──
  const dist = $derived.by(() => {
    const q = v.q ?? { xI: null, xJ: null, yI: null, yJ: null, zI: null, zJ: null };
    const comps = (['z', 'y', 'x'] as const).map((c) => ({ c, I: q[`${c}I` as const], J: q[`${c}J` as const] }));
    const pick = comps.find((c) => sgn(c.I) !== 0 || sgn(c.J) !== 0) ?? null;
    const others = comps.filter((c) => c !== pick && (sgn(c.I) !== 0 || sgn(c.J) !== 0)).map((c) => c.c);
    const c = pick?.c ?? 'z';
    const qI = pick ? (pick.I ?? 0) : -1, qJ = pick ? (pick.J ?? pick.I ?? 0) : -1;
    const s0 = v.qa != null && v.qa > 0 ? 0.2 : 0, s1 = v.qb != null ? 0.82 : 1;
    return { c, pick, others, s0, s1, sp: spread(memberDir(v.frame, c), qI, qJ, s0, s1) };
  });
  const tri = $derived.by(() => {
    const c = v.peakComp ?? 'z', pk = v.peak ?? -1, sp = v.peakAt != null ? 0.38 : 0.5;
    const d = memberDir(v.frame, c);
    return { c, sp, L: spread(d, 0, pk, 0, sp), R: spread(d, pk, 0, sp, 1) };
  });

  // ── Thermal: the temperature across the section, as the inputs build it ──
  /*
   * A member: ΔTgz is the −z face minus the +z face, ΔTgy the −y face minus the +y face. A slab
   * (the engine's convention for shells): ΔTg is the +z face minus the −z face. Each face is ΔT
   * plus or minus half its difference; the mean, ΔT, is what lengthens the piece.
   */
  const thermal = $derived.by(() => {
    const quad = v.kind === 'thermalQuad';
    const dt = (quad ? v.tq?.dt : v.th?.dt) ?? null, gz = (quad ? v.tq?.g : v.th?.gz) ?? null, gy = quad ? null : (v.th?.gy ?? null);
    const T = dt ?? 0, z = gz ?? 0, y = gy ?? 0;
    const top = quad ? T + z / 2 : T - z / 2, bot = quad ? T - z / 2 : T + z / 2;
    const left = T + y / 2, right = T - y / 2;
    const m = Math.max(Math.abs(top), Math.abs(bot), Math.abs(left), Math.abs(right), 1e-9);
    return { quad, dt, gz, gy, T, top, bot, left, right, m, any: dt !== null || gz !== null || gy !== null };
  });
  /** Where a temperature sits on a profile drawn from `x0`, `w` px for the largest one. */
  const tx = (x0: number, w: number, T: number) => x0 + (w * T) / thermal.m;

  // ── Prestress: the tendon's depth at I, middle and J, positive toward −z (below the axis) ──
  const tendon = $derived.by(() => {
    const e = v.ps ?? { force: null, eI: null, eM: null, eJ: null };
    const eI = e.eI ?? 0, eJ = e.eJ ?? 0, eM = e.eM ?? (eI + eJ) / 2;
    const m = Math.max(Math.abs(eI), Math.abs(eM), Math.abs(eJ)) || 1;
    const y = (x: number) => 72 + 16 * x / m;
    const yc = 2 * y(eM) - (y(eI) + y(eJ)) / 2;
    return { d: `M30,${y(eI)} Q110,${yc} 190,${y(eJ)}`, yI: y(eI), yM: y(eM), yJ: y(eJ), eMDefault: e.eM == null };
  });

  // ── Slabs ──
  // Side on: a sloping slab, so true and projected areas differ. In plan: a rectangle, X right, Y up.
  const S1: V = [14, 108], S2: V = [98, 68];
  const SU = unit(sub(S2, S1)), SN: V = [SU[1], -SU[0]];
  const onS = (s: number): V => add(S1, sub(S2, S1), s);
  const slabDir = $derived.by((): V => {
    const s = v.shell;
    if (!s || s.dirMode === 'down') return [0, 1];
    if (s.dirMode === 'local') return SN;
    return AX[s.dirAxis];
  });
  const slabSide = $derived.by(() => {
    const s = v.shell;
    const q = s?.field === 'uniform' ? (s.q ?? 1) : 1;
    const sg = Math.sign(q) || 1;
    return [0.1, 0.3, 0.5, 0.7, 0.9].map((k) => ({ t: add(onS(k), slabDir, -sg * 20), h: add(onS(k), slabDir, -sg * 2.5) }));
  });
  const PL = { x0: 124, x1: 206, y0: 34, y1: 100 };

  // ── Nodal forces and moments: along the axes through the node ──
  const NODE: V = [104, 66];
  const nodal = $derived.by(() => {
    const f = v.f ?? { fx: null, fy: null, fz: null, mx: null, my: null, mz: null };
    const fm = Math.max(...(['x', 'y', 'z'] as const).map((c) => mag(f[`f${c}`])), 1e-9);
    const mm = Math.max(...(['x', 'y', 'z'] as const).map((c) => mag(f[`m${c}`])), 1e-9);
    const forces = (['x', 'y', 'z'] as const).filter((c) => sgn(f[`f${c}`]) !== 0).map((c) => {
      const d = AX[c.toUpperCase() as 'X'], s = sgn(f[`f${c}`]), len = 16 + 22 * mag(f[`f${c}`]) / fm;
      return { c, t: add(NODE, d, -s * len), h: add(NODE, d, -s * 4), val: f[`f${c}`] };
    });
    // A moment as its vector, a double-headed arrow along the axis, on the other side of the node.
    const moments = (['x', 'y', 'z'] as const).filter((c) => sgn(f[`m${c}`]) !== 0).map((c) => {
      const d = AX[c.toUpperCase() as 'X'], s = sgn(f[`m${c}`]), len = 14 + 16 * mag(f[`m${c}`]) / mm;
      return { c, t: add(NODE, d, s * 6), h: add(NODE, d, s * (6 + len)), val: f[`m${c}`] };
    });
    return { forces, moments };
  });

  // ── Large, over the model ──
  let big = $state(false);
  let box = $state<{ left: number; top: number; width: number; height: number } | null>(null);
  function open() {
    const c = uiStore.isMobile ? null : viewportCanvas()?.getBoundingClientRect();
    box = c && c.width > 200 && c.height > 160 ? { left: c.left, top: c.top, width: c.width, height: c.height } : null;
    big = true;
  }
  $effect(() => {
    if (!big) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') big = false; };
    const resize = () => { if (big) open(); };
    window.addEventListener('keydown', key);
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('resize', resize); };
  });
</script>

{#snippet drawing(sfx: string, testid: string)}
  {@const A = `${id}${sfx}`}
  <svg class="ls" viewBox="0 0 220 132" role="img" aria-label={t('writeLoad.sketch')} data-testid={testid} data-kind={v.kind}>
    <defs>
      <marker id="{A}-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="ls-head" /></marker>
      <marker id="{A}-d" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,1 L8,4 L0,7 z" class="ls-dimhead" /></marker>
      <marker id="{A}-m" viewBox="0 0 12 8" refX="11" refY="4" markerWidth="7" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L6,4 L0,8 z M5,0 L11,4 L5,8 z" class="ls-head" /></marker>
    </defs>

    {#snippet arrow(a: V, b: V, cls = 'ls-load')}<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class={cls} marker-end="url(#{A}-a)" />{/snippet}
    {#snippet dim(a: V, b: V, text: string, off: V = [0, 0])}
      <!-- A dimension: a thin line between two points, an arrow at each end, its value at the middle. -->
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} class="ls-dim" marker-start="url(#{A}-d)" marker-end="url(#{A}-d)" />
      {#if text}<text x={(a[0] + b[0]) / 2 + off[0]} y={(a[1] + b[1]) / 2 + off[1]} class="ls-t" text-anchor="middle">{text}</text>{/if}
    {/snippet}
    {#snippet axes(x: number, y: number)}
      {#each ['X', 'Y', 'Z'] as const as a (a)}
        <line x1={x} y1={y} x2={x + AX[a][0] * 13} y2={y + AX[a][1] * 13} class="ls-axis" marker-end="url(#{A}-a)" />
        <text x={x + AX[a][0] * 17 - 2} y={y + AX[a][1] * 17 + 3} class="ls-ax">{a}</text>
      {/each}
    {/snippet}
    {#snippet member(frame: string | undefined)}
      <line x1={MI[0]} y1={MI[1]} x2={MJ[0]} y2={MJ[1]} class="ls-member" />
      <circle cx={MI[0]} cy={MI[1]} r="2.6" class="ls-node" /><circle cx={MJ[0]} cy={MJ[1]} r="2.6" class="ls-node" />
      <text x={MI[0] - 6} y={MI[1] + 4} class="ls-t" text-anchor="end">I</text><text x={MJ[0] + 6} y={MJ[1] + 4} class="ls-t">J</text>
      {#if frame === 'local' || frame === undefined}
        <!-- The member's own axes, in the corner: x along it, z up from it, y into the page. -->
        {@const G = [176, 118] as V}
        {@render arrow(G, add(G, MU, 15), 'ls-axis')}<text x={G[0] + MU[0] * 18 + 1} y={G[1] + MU[1] * 18 + 3} class="ls-ax">x</text>
        {@render arrow(G, add(G, MN, 13), 'ls-axis')}<text x={G[0] + MN[0] * 16 - 6} y={G[1] + MN[1] * 16} class="ls-ax">z</text>
        {@render arrow(G, add(G, AX.Y, 9), 'ls-axis')}<text x={G[0] + AX.Y[0] * 12 + 1} y={G[1] + AX.Y[1] * 12 + 6} class="ls-ax">y</text>
      {:else}
        {@render axes(10, 124)}
      {/if}
    {/snippet}
    {#snippet station(s: number, text: string, row: number)}
      <!-- A position along the member, measured from I. -->
      {@const o = add([0, 0], MN, -(12 + row * 11))}
      {@render dim(add(MI, o), add(onM(s), o), text, [0, 9])}
    {/snippet}
    {#snippet profile(x0: number, y0: number, y1: number, topLabel: string, botLabel: string, diffLabel: string, lx: number)}
      <!-- Temperature across the depth: zero on the vertical line, each face's value to its side. -->
      <line x1={x0} y1={y0 - 6} x2={x0} y2={y1 + 6} class="ls-axis" />
      <polygon points="{x0},{y0} {tx(x0, 38, thermal.top)},{y0} {tx(x0, 38, thermal.bot)},{y1} {x0},{y1}" class="ls-diag" />
      <line x1={tx(x0, 38, thermal.top)} y1={y0} x2={tx(x0, 38, thermal.bot)} y2={y1} class="ls-load" />
      <line x1={tx(x0, 38, thermal.T)} y1={y0} x2={tx(x0, 38, thermal.T)} y2={y1} class="ls-guide" />
      <text x={tx(x0, 38, thermal.T) + 2} y={(y0 + y1) / 2} class="ls-t">ΔT{thermal.dt === null ? '' : ` = ${val(thermal.dt, 'temperatureDiff')}`}</text>
      <!-- Each face's temperature over and under the section, clear of the profile. -->
      <text x={lx} y={y0 - 5} class="ls-v">{topLabel}</text>
      <text x={lx} y={y1 + 12} class="ls-v">{botLabel}</text>
      {#if thermal.gz !== null && thermal.top !== thermal.bot}{@render dim([tx(x0, 38, thermal.top), y1 + 10], [tx(x0, 38, thermal.bot), y1 + 10], diffLabel, [0, 9])}{/if}
    {/snippet}

    {#if v.kind === 'nodal' && v.inclined}
      {@const Pa = [34, 104] as V}
      {@const Nn = [150, 44] as V}
      {@const d = unit(sub(Nn, Pa))}
      {@const s = sgn(v.incF) || 1}
      {@const fromText = v.incFromKind === 'point' ? pt3(v.incFrom) : `${t('writeLoad.node')} ${v.incFromNode || '?'}`}
      <!-- The direction: from the origin toward the loaded node; the force acts at the loaded node, along it. -->
      <line x1={Pa[0]} y1={Pa[1]} x2={Nn[0] - d[0] * 6} y2={Nn[1] - d[1] * 6} class="ls-guide" />
      <circle cx={Pa[0]} cy={Pa[1]} r="3" class={v.incFromKind === 'point' ? 'ls-point' : 'ls-node'} />
      <text x={Pa[0] - 4} y={Pa[1] + 14} class="ls-t">{t('writeLoad.from')}: {fromText}</text>
      <circle cx={Nn[0]} cy={Nn[1]} r="3.4" class="ls-node" />
      {#if s > 0}{@render arrow(add(Nn, d, -40), add(Nn, d, -4))}{:else}{@render arrow(add(Nn, d, 4), add(Nn, d, 40))}{/if}
      <text x={Nn[0] - d[0] * 22 - 6} y={Nn[1] - d[1] * 22 - 6} class="ls-v" text-anchor="end">{lbl('F', v.incF, 'force')}</text>
      <text x={Nn[0] + 6} y={Nn[1] - 8} class="ls-t">{t('writeLoad.sketch.loaded')}</text>
      <text x={Nn[0] + 6} y={Nn[1] + 2} class="ls-t">({t('loadTarget.applyTo')})</text>
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.inclined')}</text>
    {:else if v.kind === 'nodal'}
      {#each ['X', 'Y', 'Z'] as const as a (a)}
        <line x1={NODE[0] - AX[a][0] * 52} y1={NODE[1] - AX[a][1] * 52} x2={NODE[0] + AX[a][0] * 52} y2={NODE[1] + AX[a][1] * 52} class="ls-guide" />
        <text x={NODE[0] + AX[a][0] * 58 - 3} y={NODE[1] + AX[a][1] * 58 + 3} class="ls-ax">{a}</text>
      {/each}
      <circle cx={NODE[0]} cy={NODE[1]} r="3.4" class="ls-node" />
      {#each nodal.forces as f (f.c)}
        {@render arrow(f.t, f.h)}
        <text x={f.t[0] + (f.c === 'x' ? (f.t[0] < NODE[0] ? -3 : 3) : 4)} y={f.t[1] + (f.c === 'x' ? 3 : f.c === 'z' && f.t[1] > NODE[1] ? 8 : 0)} class="ls-v" text-anchor={f.c === 'x' && f.t[0] < NODE[0] ? 'end' : 'start'}>{lbl(`F${f.c}`, f.val, 'force')}</text>
      {/each}
      {#each nodal.moments as m (m.c)}
        <line x1={m.t[0]} y1={m.t[1]} x2={m.h[0]} y2={m.h[1]} class="ls-moment" marker-end="url(#{A}-m)" />
        <text x={m.h[0] + (m.c === 'x' && m.h[0] < NODE[0] ? -3 : 3)} y={m.h[1] + (m.c === 'x' ? 11 : m.c === 'z' && m.h[1] > NODE[1] ? 9 : 0)} class="ls-v" text-anchor={m.c === 'x' && m.h[0] < NODE[0] ? 'end' : 'start'}>{lbl(`M${m.c}`, m.val, 'moment')}</text>
      {/each}
      <text x="4" y="12" class="ls-t">{nodal.forces.length + nodal.moments.length === 0 ? t('writeLoad.sketch.nodalEmpty') : t('writeLoad.sketch.momentVector')}</text>
    {:else if v.kind === 'displacement'}
      {@const u = v.u ?? { dx: null, dy: null, dz: null, drx: null, dry: null, drz: null }}
      {@const D = add(add(add([0, 0], AX.X, 26 * sgn(u.dx)), AX.Y, 26 * sgn(u.dy)), AX.Z, 26 * sgn(u.dz))}
      {@const P0 = [92, 84] as V}
      <polygon points="92,90 80,106 104,106" class="ls-support" />
      {#each ['X', 'Y', 'Z'] as const as a (a)}<line x1={P0[0]} y1={P0[1]} x2={P0[0] + AX[a][0] * 46} y2={P0[1] + AX[a][1] * 46} class="ls-guide" /><text x={P0[0] + AX[a][0] * 50} y={P0[1] + AX[a][1] * 50 + 3} class="ls-ax">{a}</text>{/each}
      <circle cx={P0[0]} cy={P0[1]} r="3.2" class="ls-node" />
      {#if D[0] || D[1]}
        <circle cx={P0[0] + D[0]} cy={P0[1] + D[1]} r="3.2" class="ls-ghostnode" />
        {@render arrow(P0, add(P0, D, 0.88))}
      {/if}
      <text x="122" y="38" class="ls-v">{lbl('dx', u.dx, 'displacement')}</text>
      <text x="122" y="49" class="ls-v">{lbl('dy', u.dy, 'displacement')}</text>
      <text x="122" y="60" class="ls-v">{lbl('dz', u.dz, 'displacement')}</text>
      {#if sgn(u.drx) || sgn(u.dry) || sgn(u.drz)}
        <text x="122" y="74" class="ls-v">{(['drx', 'dry', 'drz'] as const).filter((k) => sgn(u[k])).map((k) => `θ${k[2]} = ${fmtQ(u[k] as number, 'rotation')}`).join(' · ')} rad</text>
      {/if}
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.imposed')}</text>
    {:else if v.kind === 'distributed' && v.shape === 'hydrostatic'}
      {@const w1 = v.w1 ?? 1}
      {@const w2 = v.w2 ?? 0}
      {@const m = Math.max(Math.abs(w1), Math.abs(w2)) || 1}
      {@const ax = v.hydroAxis ?? 'Z'}
      {@const lo = [118, 116] as V}
      {@const hi = add(lo, AX[ax], 88)}
      {@const d = memberDir(v.frame, v.hydroComp ?? 'x')}
      {@const ta = add(lo, d, -(Math.sign(w1) || 1) * 50 * Math.abs(w1) / m)}
      {@const tb = add(hi, d, -(Math.sign(w2) || 1) * 50 * Math.abs(w2) / m)}
      <!-- Along the axis, w₁ at the lowest coordinate the members reach and w₂ at the highest. -->
      <line x1={lo[0]} y1={lo[1]} x2={hi[0]} y2={hi[1]} class="ls-member" />
      <polygon points="{lo.join(',')} {ta.join(',')} {tb.join(',')} {hi.join(',')}" class="ls-diag" />
      {#each [0, 0.33, 0.66] as k (k)}
        {@const p = add(lo, sub(hi, lo), k)}
        {@const w = w1 + (w2 - w1) * k}
        {#if Math.abs(w) / m > 0.1}{@render arrow(add(p, d, -Math.sign(w) * 50 * Math.abs(w) / m), add(p, d, -Math.sign(w) * 3), 'ls-load ls-thin')}{/if}
      {/each}
      <text x={lo[0] + 6} y={lo[1] + 2} class="ls-v">{lbl('w₁', v.w1, 'distributedLoad')}</text>
      <text x={hi[0] + 6} y={hi[1] + 4} class="ls-v">{lbl('w₂', v.w2, 'distributedLoad')}</text>
      {@render arrow(add(add(lo, [16, 0]), AX[ax], -6), add(add(hi, [16, 0]), AX[ax], 8), 'ls-axis')}
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.hydroAxis').replace('{a}', ax).replace('{c}', axisName(v.frame, v.hydroComp ?? 'x'))}</text>
    {:else if v.kind === 'distributed' && v.shape === 'triangle'}
      <polygon points={tri.L.poly} class="ls-diag" /><polygon points={tri.R.poly} class="ls-diag" />
      {#each [...tri.L.arrows, ...tri.R.arrows] as a, i (i)}{@render arrow(a.t, a.h, 'ls-load ls-thin')}{/each}
      <line x1={tri.L.tJ[0]} y1={tri.L.tJ[1]} x2={tri.L.tJ[0]} y2="30" class="ls-leader" />
      <text x={tri.L.tJ[0] - 4} y="27" class="ls-v">{lbl(`q${axisName(v.frame, tri.c)} ${t('writeLoad.sketch.peak')}`, v.peak, 'distributedLoad')}</text>
      {@render member(v.frame)}
      {@render station(tri.sp, v.peakAt != null ? lbl('x', v.peakAt, 'length') : 'x = L/2', 0)}
      <text x="4" y="12" class="ls-t">{t(`loads.frame.${v.frame ?? 'local'}`)}</text>
    {:else if v.kind === 'distributed'}
      <polygon points={dist.sp.poly} class="ls-diag" />
      {#each dist.sp.arrows as a, i (i)}{@render arrow(a.t, a.h, 'ls-load ls-thin')}{/each}
      <!-- The two values in rows of their own, each with a leader to its end of the diagram. -->
      <line x1={dist.sp.tI[0]} y1={dist.sp.tI[1]} x2={dist.sp.tI[0]} y2="30" class="ls-leader" />
      <line x1={dist.sp.tJ[0]} y1={dist.sp.tJ[1]} x2={dist.sp.tJ[0]} y2="40" class="ls-leader" />
      <text x={Math.max(4, dist.sp.tI[0] - 4)} y="27" class="ls-v">{dist.pick ? lbl(`q${axisName(v.frame, dist.c)} I`, dist.pick.I, 'distributedLoad') : 'q I'}</text>
      <text x={Math.min(186, dist.sp.tJ[0] + 4)} y="37" class="ls-v" text-anchor="end">{dist.pick ? lbl(`q${axisName(v.frame, dist.c)} J`, dist.pick.J ?? dist.pick.I, 'distributedLoad') : 'q J'}</text>
      {@render member(v.frame)}
      {#if dist.s0 > 0}{@render station(dist.s0, lbl('a', v.qa, 'length'), 0)}{/if}
      {#if dist.s1 < 1}{@render station(dist.s1, lbl('b', v.qb, 'length'), dist.s0 > 0 ? 1 : 0)}{/if}
      {#if v.frame === 'projected'}
        <!-- Per metre of the member's horizontal projection: the length the load is spread over. -->
        <line x1={MI[0]} y1={MI[1]} x2={MI[0]} y2="126" class="ls-guide" /><line x1={MJ[0]} y1={MJ[1]} x2={MJ[0]} y2="126" class="ls-guide" />
        {@render dim([MI[0], 126], [MJ[0], 126], '', [0, 0])}
        <text x="110" y="131" class="ls-t" text-anchor="middle">{t('writeLoad.sketch.projectedLength')}</text>
      {/if}
      <text x="4" y="12" class="ls-t">{t(`loads.frame.${v.frame ?? 'local'}`)}{dist.others.length ? ` · + q${dist.others.map((c) => axisName(v.frame, c)).join(', q')}` : ''}</text>
    {:else if v.kind === 'point'}
      {@const p = v.p ?? { px: null, py: null, pz: null, mx: null, my: null, mz: null }}
      {@const s = v.pa != null ? 0.42 : 0.5}
      {@const P0 = onM(s)}
      {@const fs = (['x', 'y', 'z'] as const).filter((c) => sgn(p[`p${c}`]) !== 0)}
      {@const ms = (['x', 'y', 'z'] as const).filter((c) => sgn(p[`m${c}`]) !== 0)}
      {@render member(v.pFrame)}
      {#each fs as c (c)}
        {@const d = memberDir(v.pFrame, c)}
        {@const sg = sgn(p[`p${c}`])}
        {@render arrow(add(P0, d, -sg * 34), add(P0, d, -sg * 3))}
        <text x={P0[0] - d[0] * sg * 38 + 3} y={P0[1] - d[1] * sg * 38 - 2} class="ls-v">{lbl(`P${axisName(v.pFrame, c)}`, p[`p${c}`], 'force')}</text>
      {/each}
      {#each ms as c, i (c)}
        {@const d = memberDir(v.pFrame, c)}
        {@const sg = sgn(p[`m${c}`])}
        <line x1={P0[0] + d[0] * sg * 5} y1={P0[1] + d[1] * sg * 5} x2={P0[0] + d[0] * sg * 28} y2={P0[1] + d[1] * sg * 28} class="ls-moment" marker-end="url(#{A}-m)" />
        <text x={P0[0] + d[0] * sg * 30 + 3} y={P0[1] + d[1] * sg * 30 + 9 + i * 9} class="ls-v">{lbl(`M${axisName(v.pFrame, c)}`, p[`m${c}`], 'moment')}</text>
      {/each}
      {#if fs.length === 0 && ms.length === 0}<text x={P0[0] + 6} y={P0[1] - 26} class="ls-t">P, M</text>{/if}
      {@render station(s, v.pa != null ? lbl('a', v.pa, 'length') : 'a = L/2', 0)}
      <text x="4" y="12" class="ls-t">{t(`loads.frame.${v.pFrame ?? 'local'}`)}{ms.length ? ` · ${t('writeLoad.sketch.momentVector')}` : ''}</text>
    {:else if v.kind === 'thermal'}
      <!-- The member's section, z up and y to the right, and how the temperature varies across it. -->
      <rect x="26" y="34" width="28" height="50" class="ls-beam" />
      {@render arrow([40, 59], [40, 43], 'ls-axis')}<text x="43" y="45" class="ls-ax">z</text>
      {@render arrow([40, 59], [50, 59], 'ls-axis')}<text x="49" y="67" class="ls-ax">y</text>
      <line x1="54" y1="34" x2="92" y2="34" class="ls-guide" /><line x1="54" y1="84" x2="92" y2="84" class="ls-guide" />
      {@render profile(92, 34, 84, `+z: T${thermal.any ? ` = ${val(thermal.top, 'temperatureDiff')}` : ''}`, `−z: T${thermal.any ? ` = ${val(thermal.bot, 'temperatureDiff')}` : ''}`, lbl('ΔTgz', thermal.gz, 'temperatureDiff'), 10)}
      {#if thermal.gy !== null && thermal.gy !== 0}
        <!-- Across the width: −y face to the left, +y to the right. -->
        <line x1="22" y1="128" x2="58" y2="128" class="ls-axis" />
        <polygon points="26,128 26,{128 - 12 * thermal.left / thermal.m} 54,{128 - 12 * thermal.right / thermal.m} 54,128" class="ls-diag" />
        <text x="62" y="127" class="ls-t">{lbl('ΔTgy', thermal.gy, 'temperatureDiff')}: T(−y) {fmtQ(thermal.left, 'temperatureDiff')} · T(+y) {fmtQ(thermal.right, 'temperatureDiff')}</text>
      {/if}
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.section')} · ΔTgz = T(−z) − T(+z)</text>
    {:else if v.kind === 'thermalQuad'}
      <!-- The slab's thickness, its +z face (local) on top, and the temperature across it. -->
      <rect x="14" y="44" width="70" height="40" class="ls-slabcut" />
      {@render arrow([24, 64], [24, 50], 'ls-axis')}<text x="27" y="53" class="ls-ax">z</text>
      {@render dim([90, 44], [90, 84], 't', [5, 3])}
      <line x1="84" y1="44" x2="122" y2="44" class="ls-guide" /><line x1="84" y1="84" x2="122" y2="84" class="ls-guide" />
      {@render profile(122, 44, 84, `+z: T${thermal.any ? ` = ${val(thermal.top, 'temperatureDiff')}` : ''}`, `−z: T${thermal.any ? ` = ${val(thermal.bot, 'temperatureDiff')}` : ''}`, lbl('ΔTg', thermal.gz, 'temperatureDiff'), 14)}
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.slabSection')} · ΔTg = T(+z) − T(−z)</text>
    {:else if v.kind === 'strain'}
      {@const sg = sgn(v.strain) || 1}
      <rect x="30" y="58" width="130" height="18" class="ls-beam" />
      <rect x="30" y="58" width={130 + sg * 16} height="18" class="ls-ghostbody" />
      {@render dim([30, 94], [160, 94], 'L', [0, 9])}
      {@render dim([160, 48], [160 + sg * 16, 48], v.strainBy === 'length' ? lbl('ΔL', v.strain, 'displacement') : 'ΔL', [sg * 18, -3])}
      <text x="30" y="122" class="ls-v">ε₀ = ΔL / L{v.strainBy !== 'length' && v.strain != null ? ` = ${v.strain} ‰` : ''}</text>
      <text x="4" y="12" class="ls-t">{sg > 0 ? t('writeLoad.sketch.lengthens') : t('writeLoad.sketch.shortens')}</text>
    {:else if v.kind === 'prestress'}
      <rect x="30" y="52" width="160" height="40" class="ls-beam" />
      <line x1="24" y1="72" x2="196" y2="72" class="ls-guide" />
      <path d={tendon.d} class="ls-tendon" />
      {@render arrow([8, tendon.yI], [27, tendon.yI])}{@render arrow([212, tendon.yJ], [193, tendon.yJ])}
      <text x="110" y="46" class="ls-v" text-anchor="middle">{lbl('P', v.ps?.force, 'force')}</text>
      {#if Math.abs(tendon.yI - 72) > 2}{@render dim([40, 72], [40, tendon.yI], '')}{/if}
      {#if Math.abs(tendon.yM - 72) > 2}{@render dim([110, 72], [110, tendon.yM], '')}{/if}
      {#if Math.abs(tendon.yJ - 72) > 2}{@render dim([180, 72], [180, tendon.yJ], '')}{/if}
      <text x="30" y="106" class="ls-t">{lbl('eI', v.ps?.eI, 'length')}</text>
      <text x="110" y="118" class="ls-t" text-anchor="middle">{tendon.eMDefault ? t('writeLoad.sketch.eMean') : lbl('eM', v.ps?.eM, 'length')}</text>
      <text x="190" y="106" class="ls-t" text-anchor="end">{lbl('eJ', v.ps?.eJ, 'length')}</text>
      {@render arrow([16, 88], [16, 70], 'ls-axis')}<text x="19" y="72" class="ls-ax">z</text>
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.eBelow')}</text>
    {:else if v.kind === 'selfWeight'}
      {@const dir = v.swDir ?? 'Z'}
      {@const sg = Math.sign(v.swFactor ?? -1) || -1}
      {@render member('global')}
      {#each [0.12, 0.34, 0.56, 0.78, 0.96] as k (k)}{@render arrow(add(onM(k), AX[dir], -sg * 22), add(onM(k), AX[dir], -sg * 3), 'ls-load ls-thin')}{/each}
      <text x="110" y="28" class="ls-v" text-anchor="middle">w = ρ·A × {v.swFactor ?? '−1'} · {t('writeLoad.sketch.along')} {dir}</text>
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.selfWeight')}</text>
    {:else if v.kind === 'surface' && v.shell}
      {@const s = v.shell}
      {@const projected = s.dirMode === 'projected'}
      <!-- Side on: the slab sloping, the load's direction, and the area it is spread over. -->
      <line x1={S1[0]} y1={S1[1]} x2={S2[0]} y2={S2[1]} class="ls-slabline" />
      {#each slabSide as a, i (i)}{@render arrow(a.t, a.h, 'ls-load ls-thin')}{/each}
      {#if projected && s.dirAxis === 'Z'}
        <line x1={S1[0]} y1={S1[1]} x2={S1[0]} y2="122" class="ls-guide" /><line x1={S2[0]} y1={S2[1]} x2={S2[0]} y2="122" class="ls-guide" />
        <line x1={S1[0]} y1="122" x2={S2[0]} y2="122" class="ls-proj" />
      {:else if projected && s.dirAxis === 'X'}
        <line x1={S1[0]} y1={S1[1]} x2="108" y2={S1[1]} class="ls-guide" /><line x1={S2[0]} y1={S2[1]} x2="108" y2={S2[1]} class="ls-guide" />
        <line x1="108" y1={S1[1]} x2="108" y2={S2[1]} class="ls-proj" />
      {/if}
      <text x="4" y="12" class="ls-t">{s.dirMode === 'down' ? '−Z' : s.dirMode === 'local' ? t('writeLoad.sketch.normal') : `+${s.dirAxis}`} · {projected ? t('writeLoad.sketch.projectedArea') : t('writeLoad.sketch.trueArea')}</text>
      <text x="4" y="22" class="ls-t">{t('writeLoad.sketch.qPositive')}</text>
      {#if !(projected && s.dirAxis === 'Z')}{@render axes(70, 124)}{/if}
      <!-- In plan: how the value spreads over the slab, and the rectangle it is limited to. -->
      <rect x={PL.x0} y={PL.y0} width={PL.x1 - PL.x0} height={PL.y1 - PL.y0} class="ls-slab" />
      {#if s.field === 'uniform'}
        <rect x={PL.x0} y={PL.y0} width={PL.x1 - PL.x0} height={PL.y1 - PL.y0} class="ls-fill" />
        <text x={(PL.x0 + PL.x1) / 2} y={(PL.y0 + PL.y1) / 2 + 3} class="ls-v" text-anchor="middle">{lbl('q', s.q, 'areaLoad')}</text>
      {:else if s.field === 'corners'}
        {#each [[PL.x0, PL.y1, 'start', 10], [PL.x1, PL.y1, 'end', 10], [PL.x1, PL.y0, 'end', -3], [PL.x0, PL.y0, 'start', -3]] as const as [x, y, anchor, dy], i (i)}
          <circle cx={x} cy={y} r="2" class="ls-node" />
          <text x={x} y={y + dy} class="ls-t" text-anchor={anchor}>q{['₁', '₂', '₃', '₄'][i]}{s.corners[i] !== undefined ? ` = ${fmtQ(s.corners[i]!, 'areaLoad')}` : ''}</text>
        {/each}
      {:else if s.va.axis === 'Z'}
        <text x={(PL.x0 + PL.x1) / 2} y={(PL.y0 + PL.y1) / 2} class="ls-t" text-anchor="middle">{t('writeLoad.sketch.variesZ')}</text>
        <text x={(PL.x0 + PL.x1) / 2} y={(PL.y0 + PL.y1) / 2 + 10} class="ls-t" text-anchor="middle">{lbl('q₁', s.va.q1, 'areaLoad')} → {lbl('q₂', s.va.q2, 'areaLoad')}</text>
      {:else if s.va.axis === 'X'}
        {@const qm = Math.max(mag(s.va.q1), mag(s.va.q2), 1e-9)}
        <line x1={PL.x0 + 14} y1={PL.y0} x2={PL.x0 + 14} y2={PL.y1} class="ls-guide" /><line x1={PL.x1 - 14} y1={PL.y0} x2={PL.x1 - 14} y2={PL.y1} class="ls-guide" />
        <polygon points="{PL.x0 + 14},{PL.y1} {PL.x0 + 14},{PL.y1 - 6 - 30 * mag(s.va.q1) / qm} {PL.x1 - 14},{PL.y1 - 6 - 30 * mag(s.va.q2) / qm} {PL.x1 - 14},{PL.y1}" class="ls-diag" />
        <text x={PL.x0 + 14} y={PL.y1 + 10} class="ls-t" text-anchor="middle">{lbl('X₁', s.va.c1, 'length')}</text>
        <text x={PL.x1 - 14} y={PL.y1 + 20} class="ls-t" text-anchor="middle">{lbl('X₂', s.va.c2, 'length')}</text>
        <text x={PL.x0 + 16} y={PL.y0 + 9} class="ls-t">{lbl('q₁', s.va.q1, 'areaLoad')}</text>
        <text x={PL.x1 - 16} y={PL.y0 + 18} class="ls-t" text-anchor="end">{lbl('q₂', s.va.q2, 'areaLoad')}</text>
      {:else}
        <line x1={PL.x0} y1={PL.y1 - 12} x2={PL.x1} y2={PL.y1 - 12} class="ls-guide" /><line x1={PL.x0} y1={PL.y0 + 12} x2={PL.x1} y2={PL.y0 + 12} class="ls-guide" />
        <text x={PL.x0 + 2} y={PL.y1 - 15} class="ls-t">{lbl('Y₁', s.va.c1, 'length')} · {lbl('q₁', s.va.q1, 'areaLoad')}</text>
        <text x={PL.x0 + 2} y={PL.y0 + 21} class="ls-t">{lbl('Y₂', s.va.c2, 'length')} · {lbl('q₂', s.va.q2, 'areaLoad')}</text>
      {/if}
      {#if s.partial}
        <rect x={PL.x0 + 38} y={PL.y0 + 30} width="34" height="24" class="ls-region" />
        <circle cx={PL.x0 + 38} cy={PL.y0 + 54} r="1.6" class="ls-pt" /><circle cx={PL.x0 + 72} cy={PL.y0 + 30} r="1.6" class="ls-pt" />
        <text x={PL.x0 + 36} y={PL.y0 + 62} class="ls-t" text-anchor="end">({s.rect?.plane[0]}₁; {s.rect?.plane[1]}₁)</text>
        <text x={PL.x1 - 2} y={PL.y0 + 27} class="ls-t" text-anchor="end">({s.rect?.plane[0]}₂; {s.rect?.plane[1]}₂)</text>
      {/if}
      <line x1={PL.x0} y1="126" x2={PL.x0 + 12} y2="126" class="ls-axis" marker-end="url(#{A}-a)" /><text x={PL.x0 + 14} y="129" class="ls-ax">X</text>
      <line x1={PL.x0} y1="126" x2={PL.x0} y2="114" class="ls-axis" marker-end="url(#{A}-a)" /><text x={PL.x0 + 3} y="114" class="ls-ax">Y</text>
      <text x={PL.x1} y="128" class="ls-t" text-anchor="end">{t('writeLoad.sketch.plan')}</text>
    {:else if v.kind === 'hydro' && v.shell}
      {@const s = v.shell}
      <!-- A wall below the fluid's level: pressure γ·depth, pushing the wall out of the fluid. -->
      <rect x="128" y="22" width="8" height="98" class="ls-slab" />
      <line x1="40" y1="44" x2="136" y2="44" class="ls-level" />
      <text x="40" y="40" class="ls-t">{lbl(t('writeLoad.shell.level'), s.level, 'length')}</text>
      <polygon points="128,44 128,120 76,120" class="ls-diag" />
      {#each [0.3, 0.55, 0.8] as k (k)}{@render arrow([128 - 52 * k, 44 + 76 * k], [126, 44 + 76 * k], 'ls-load ls-thin')}{/each}
      {@render dim([150, 44], [150, 120], 'h', [6, 3])}
      <text x="160" y="84" class="ls-v">p = γ · h</text>
      <text x="4" y="128" class="ls-v">{lbl('γ', s.gamma, 'density')}</text>
      {#if s.inside && (s.inside.x != null || s.inside.y != null || s.inside.z != null)}
        <circle cx="62" cy="96" r="2.4" class="ls-pt" /><text x="58" y="110" class="ls-t" text-anchor="middle">{pt3(s.inside)}</text>
      {/if}
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.fluid')}</text>
    {:else if v.kind === 'shellPoint' && v.shell}
      {@const s = v.shell}
      {@const P0 = [78, 70] as V}
      <!-- In plan: the point on the slab and its forces; the force is shared among the slab's corners. -->
      <rect x="30" y="30" width="96" height="80" class="ls-slab" />
      {#each [[30, 110], [126, 110], [126, 30], [30, 30]] as const as [x, y], i (i)}
        <circle cx={x} cy={y} r="2.2" class="ls-node" /><line x1={P0[0]} y1={P0[1]} x2={x} y2={y} class="ls-share" />
      {/each}
      <circle cx={P0[0]} cy={P0[1]} r="2.6" class="ls-pt" />
      {#if sgn(s.pf.fx)}{@render arrow([P0[0] - sgn(s.pf.fx) * 30, P0[1]], [P0[0] - sgn(s.pf.fx) * 4, P0[1]])}{/if}
      {#if sgn(s.pf.fy)}{@render arrow([P0[0], P0[1] + sgn(s.pf.fy) * 30], [P0[0], P0[1] + sgn(s.pf.fy) * 4])}{/if}
      <!-- Z toward the reader: a dot for +Z, a cross for −Z. -->
      <circle cx={P0[0] + 14} cy={P0[1] - 14} r="5" class="ls-zsym" />
      {#if sgn(s.pf.fz) >= 0}<circle cx={P0[0] + 14} cy={P0[1] - 14} r="1.4" class="ls-pt" />{:else}<path d="M{P0[0] + 10.5},{P0[1] - 17.5} l7,7 m0,-7 l-7,7" class="ls-load ls-thin" />{/if}
      <text x="132" y="44" class="ls-v">{lbl('Fx', s.pf.fx, 'force')}</text>
      <text x="132" y="56" class="ls-v">{lbl('Fy', s.pf.fy, 'force')}</text>
      <text x="132" y="68" class="ls-v">{lbl('Fz', s.pf.fz, 'force')}</text>
      <text x="30" y="124" class="ls-t">{t('writeLoad.point')} {pt3(s.at)}</text>
      <text x="4" y="12" class="ls-t">{t('writeLoad.sketch.shared')}</text>
      <line x1="10" y1="118" x2="22" y2="118" class="ls-axis" marker-end="url(#{A}-a)" /><text x="24" y="121" class="ls-ax">X</text>
      <line x1="10" y1="118" x2="10" y2="106" class="ls-axis" marker-end="url(#{A}-a)" /><text x="12" y="105" class="ls-ax">Y</text>
    {/if}
  </svg>
{/snippet}

<div class="lsw" class:lsw-mobile={uiStore.isMobile}>
  <button type="button" class="ls-max" onclick={open} title={t('writeLoad.sketch.enlarge')} aria-label={t('writeLoad.sketch.enlarge')} data-testid="load-sketch-max">⤢</button>
  {@render drawing('s', 'load-sketch')}
</div>
{#if big}
  <!-- Over the model, beside the panel; the whole screen on a phone. -->
  <!-- Moved to the document's body: inside the panel (a phone's sheet), a fixed box stays under the header. -->
  <div use:portal class="ls-big" role="dialog" aria-label={t('writeLoad.sketch')} data-testid="load-sketch-big"
    style={box ? `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px` : 'inset:0'}>
    <button type="button" class="ls-close" onclick={() => (big = false)} aria-label={t('pro.writeClose')} data-testid="load-sketch-close">×</button>
    {@render drawing('b', 'load-sketch-big-svg')}
  </div>
{/if}

<style>
  .lsw { position: relative; flex: 0 1 196px; min-width: 120px; }
  .lsw-mobile { flex: 1 1 100%; max-width: 380px; }
  .ls-max { position: absolute; top: 3px; right: 3px; z-index: 1; width: 20px; height: 20px; padding: 0; line-height: 1;
    font-size: 0.8rem; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface-2); color: var(--st-text-2); cursor: pointer; }
  .ls-max:hover { color: var(--st-text); border-color: var(--st-accent); }
  .ls-big { position: fixed; z-index: 1000; display: flex; padding: 30px 16px 16px; box-sizing: border-box;
    background: color-mix(in srgb, var(--st-surface) 95%, transparent); border: 1px solid var(--st-hair-strong); }
  .ls-big .ls { width: 100%; height: 100%; }
  .ls-close { position: absolute; top: 4px; right: 8px; font-size: 1.2rem; background: none; border: none; color: var(--st-text-2); cursor: pointer; }
  .ls { display: block; width: 100%; height: auto; background: var(--st-surface-3); border-radius: var(--st-radius); }
  .ls-member { stroke: var(--st-text-2); stroke-width: 2.4; }
  .ls-beam { fill: var(--st-surface-2); stroke: var(--st-text-2); stroke-width: 1.1; }
  .ls-slabcut { fill: color-mix(in srgb, var(--st-text-3) 25%, transparent); stroke: var(--st-text-2); stroke-width: 1.1; }
  .ls-slab { fill: color-mix(in srgb, var(--st-text-3) 16%, transparent); stroke: var(--st-text-2); stroke-width: 1; }
  .ls-slabline { stroke: var(--st-text-2); stroke-width: 4; stroke-linecap: round; }
  .ls-fill { fill: color-mix(in srgb, var(--st-accent) 16%, transparent); }
  .ls-region { fill: color-mix(in srgb, var(--st-accent) 18%, transparent); stroke: var(--st-accent); stroke-dasharray: 3 2; stroke-width: 0.9; }
  .ls-node { fill: var(--st-text); }
  .ls-ghostnode { fill: none; stroke: var(--st-text-2); stroke-dasharray: 2 2; }
  .ls-ghostbody { fill: none; stroke: var(--st-accent); stroke-dasharray: 3 2; }
  .ls-point { fill: none; stroke: var(--st-text); }
  .ls-pt { fill: var(--st-accent); }
  .ls-zsym { fill: none; stroke: var(--st-accent); stroke-width: 1.2; }
  .ls-share { stroke: var(--st-text-3); stroke-width: 0.6; stroke-dasharray: 2 2; }
  .ls-support { fill: none; stroke: var(--st-text-2); stroke-width: 1.2; }
  .ls-load { stroke: var(--st-accent); stroke-width: 1.8; fill: none; }
  .ls-moment { stroke: var(--st-accent); stroke-width: 1.6; }
  .ls-thin { stroke-width: 1.2; }
  .ls-head { fill: var(--st-accent); }
  .ls-dimhead { fill: var(--st-text-3); }
  .ls-diag { fill: color-mix(in srgb, var(--st-accent) 20%, transparent); stroke: var(--st-accent); stroke-width: 0.7; }
  .ls-guide { stroke: var(--st-text-3); stroke-dasharray: 3 3; stroke-width: 0.8; }
  .ls-proj { stroke: var(--st-interactive, var(--st-accent)); stroke-width: 2.4; }
  .ls-dim { stroke: var(--st-text-3); stroke-width: 0.7; }
  .ls-leader { stroke: var(--st-text-3); stroke-width: 0.5; stroke-dasharray: 1 2; }
  .ls-level { stroke: var(--st-interactive, var(--st-accent)); stroke-width: 1; stroke-dasharray: 5 2; }
  .ls-tendon { stroke: var(--st-accent); stroke-width: 1.8; fill: none; }
  .ls-axis { stroke: var(--st-text-3); stroke-width: 0.9; }
  .ls-ax { fill: var(--st-text-3); font-size: 7px; }
  .ls-t { fill: var(--st-text-3); font-size: 7.5px; }
  .ls-v { fill: var(--st-text); font-size: 7.8px; font-family: var(--st-mono); }
</style>
