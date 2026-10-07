/**
 * The write card's loads (`ProWriteLoadCard.svelte`): what the form describes, on its targets, as
 * the loads to add, or the reason it describes none.
 *
 * The values come in SI, `null` for a blank field: the card types every magnitude in the display
 * units (`QuantityInput`, which never holds text that does not read). A blank field is the default
 * it names (0; a J end blank is the I value; an a or b blank the member's own end), never a zero or
 * an I value the user did not type.
 *
 * Where a load sits is checked, not clamped (`load-stretch.ts`): a stretch that does not go forward
 * or does not fit on a member, a point off it, or anything beyond a physical member is refused, and
 * the members it does not fit are named. A clamp made a = 3, b = 2 into a load of no length that was
 * reported as added.
 *
 * Values are in SI, as the rest of the model is kept: kN, kN/m, kN·m, m, rad, °C; a strain by unit
 * in ‰.
 *
 * Pure: the caller passes the targets and the geometry, and writes the result in one undo step.
 */
import type { Load } from '../../store/model.svelte';
import type { MemberAxes, MemberFrame } from '../../engine/member-loads';
import { orderedChain, loadsOnChain, chainFrame, triangularPeak, hydrostaticLoads, inclinedForce, type GlobalAxis } from './member-load-tools';
import { checkStretch, checkPosition, stretchForward } from './load-stretch';

export type WriteKind = 'nodal' | 'displacement' | 'distributed' | 'point' | 'thermal' | 'strain' | 'prestress' | 'surface' | 'thermalQuad';

/** A value in SI, or null for a blank field. */
type N = number | null;

/** The form's fields, in SI. */
export interface WriteForm {
  kind: WriteKind;
  f: { fx: N; fy: N; fz: N; mx: N; my: N; mz: N };
  inclined: boolean;
  incF: N;
  /** Where an inclined force comes from: a node (its number as typed) or a point. It points at each loaded node. */
  incFromKind: 'node' | 'point';
  incFromNode: string;
  incFrom: { x: N; y: N; z: N };
  u: { dx: N; dy: N; dz: N; drx: N; dry: N; drz: N };
  frame: MemberFrame;
  shape: 'trapezoid' | 'triangle' | 'hydrostatic';
  q: { xI: N; xJ: N; yI: N; yJ: N; zI: N; zJ: N };
  qa: N;
  qb: N;
  peak: N;
  peakAt: N;
  peakComp: 'x' | 'y' | 'z';
  w1: N;
  w2: N;
  hydroAxis: GlobalAxis;
  hydroComp: 'x' | 'y' | 'z';
  pFrame: 'local' | 'global';
  p: { px: N; py: N; pz: N; mx: N; my: N; mz: N };
  pa: N;
  th: { dt: N; gz: N; gy: N };
  strainBy: 'unit' | 'length';
  /** ‰ by unit, or the change of length (m). */
  strainVal: N;
  ps: { force: N; eI: N; eM: N; eJ: N };
  sq: N;
  tq: { dt: N; g: N };
}

type P3 = { x: number; y: number; z?: number };

/** What the form's loads go on, and the model they are read in. */
export interface WriteContext {
  caseId: number;
  /** The targets resolved, or the selected members when `chain`. */
  ids: number[];
  /** The members taken as one physical member. */
  chain: boolean;
  node(id: number): P3 | undefined;
  element(id: number): { nodeI: number; nodeJ: number; type?: string } | undefined;
  /** The member's local frame and the length its loads are measured on. */
  axes(id: number): MemberAxes | null;
  length(id: number): number;
}

/** The reason nothing is added: an i18n key and its values. */
export interface WriteRefusal { error: string; params?: Record<string, string | number> }
/** The loads to add; `skipped`, the targets left out (an i18n key taking `{list}`). */
export interface WriteOutcome { loads: Load[]; skipped?: { key: string; ids: number[] } }

const ZERO: WriteRefusal = { error: 'writeLoad.zero' };

/** A field's value, blank is 0. */
const num = (v: N): number => v ?? 0;
/** A field's value, or undefined when it is blank. */
const opt = (v: N): number | undefined => v ?? undefined;
/** A line load's two ends: a blank J is the I value, a blank I is 0. */
const ends = (i: N, j: N): [number, number] => [i ?? 0, j ?? i ?? 0];
/** A length for a message: to the millimetre. */
const m3 = (v: number) => String(Math.round(v * 1000) / 1000);

/** The loads the form describes, on its targets; a reason when it describes none. */
export function buildWrittenLoads(form: WriteForm, ctx: WriteContext): WriteOutcome | WriteRefusal {
  const { kind, f, u, q, p, th, ps, tq, frame, shape } = form;
  const ids = ctx.ids;
  if (ids.length === 0) return { error: 'writeLoad.noTarget' };
  const c = { caseId: ctx.caseId };
  const bends = (id: number) => ctx.element(id)?.type !== 'truss';
  const lengthOf = ctx.length;
  const out = (loads: Load[]): WriteOutcome => ({ loads });
  const nodeLoads = (data: (id: number) => Load) => out(ids.map(data));
  /** The physical member and its frame along it, or why there is none. */
  const physical = () => {
    const chain = orderedChain(ids, ctx.element, ctx.node);
    if (!chain) return { error: 'loadTarget.chainBad' } as WriteRefusal;
    const first = ctx.axes(chain.links[0]!.id);
    if (!first) return { error: 'writeLoad.noTarget' } as WriteRefusal;
    return { chain, axes: chainFrame(first, chain.links[0]!.reversed) };
  };
  const beyondChain = (total: number): WriteRefusal => ({ error: 'writeLoad.chainOutside', params: { L: m3(total) } });
  /** The members `fits` refuses, as a refusal naming them; null when it fits them all. */
  const misfits = (fits: (id: number) => boolean, error: string, params: Record<string, string | number>): WriteRefusal | null => {
    const bad = ids.filter((id) => !fits(id));
    return bad.length ? { error, params: { ...params, list: bad.join(', ') } } : null;
  };
  switch (kind) {
    case 'nodal': {
      if (form.inclined) {
        const F = opt(form.incF);
        if (F === undefined || F === 0) return ZERO;
        let from: P3 | undefined;
        if (form.incFromKind === 'node') {
          const typed = form.incFromNode.trim();
          from = /^\d+$/.test(typed) ? ctx.node(Number(typed)) : undefined;
          if (!from) return { error: 'writeLoad.fromNodeMissing', params: { id: typed } };
        } else {
          const o = form.incFrom;
          if (o.x === null && o.y === null && o.z === null) return { error: 'writeLoad.inclinedNoDirection' };
          from = { x: num(o.x), y: num(o.y), z: num(o.z) };
        }
        // A loaded node on the origin has no direction to take: left out, and said.
        const loads: Load[] = [], skipped: number[] = [];
        for (const id of ids) {
          const at = ctx.node(id);
          const v = at ? inclinedForce(from, at, F) : null;
          if (v) loads.push({ type: 'nodal3d', data: { id: 0, nodeId: id, fx: v[0], fy: v[1], fz: v[2], mx: 0, my: 0, mz: 0, ...c } });
          else skipped.push(id);
        }
        if (loads.length === 0) return { error: 'writeLoad.fromSelf', params: { list: skipped.join(', ') } };
        return { loads, ...(skipped.length ? { skipped: { key: 'writeLoad.fromSelf', ids: skipped } } : {}) };
      }
      const v = { fx: num(f.fx), fy: num(f.fy), fz: num(f.fz), mx: num(f.mx), my: num(f.my), mz: num(f.mz) };
      if (Object.values(v).every((x) => x === 0)) return ZERO;
      return nodeLoads((id) => ({ type: 'nodal3d', data: { id: 0, nodeId: id, ...v, ...c } }));
    }
    case 'displacement': {
      const r = (v: N) => (v === null || v === 0 ? undefined : v);
      const d = { dx: r(u.dx), dy: r(u.dy), dz: r(u.dz), drx: r(u.drx), dry: r(u.dry), drz: r(u.drz) };
      if (Object.values(d).every((x) => x === undefined)) return ZERO;
      const clean = Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
      return nodeLoads((id) => ({ type: 'displacement3d', data: { id: 0, nodeId: id, ...clean, ...c } }) as Load);
    }
    case 'distributed': {
      if (shape === 'hydrostatic') {
        const members = ids.map((id) => {
          const e = ctx.element(id)!;
          return { id, i: ctx.node(e.nodeI)!, j: ctx.node(e.nodeJ)! };
        });
        const res = hydrostaticLoads(members, form.hydroAxis, num(form.w1), num(form.w2), form.hydroComp, frame);
        return res.length ? out(res.map((d) => ({ type: 'distributed3d', data: { ...d, id: 0, ...c } }) as Load)) : ZERO;
      }
      if (shape === 'triangle') {
        const pk = opt(form.peak);
        if (pk === undefined || pk === 0) return ZERO;
        const at = opt(form.peakAt);
        const off = misfits((id) => checkPosition(at ?? lengthOf(id) / 2, lengthOf(id)) !== null, 'writeLoad.pointOutside', { a: at ?? '' });
        if (off) return off;
        return out(ids.flatMap((id) => {
          const L = lengthOf(id);
          return triangularPeak(id, L, pk, form.peakComp, frame, at ?? L / 2).map((d) => ({ type: 'distributed3d', data: { ...d, id: 0, ...c } }) as Load);
        }));
      }
      // An empty J is the I value: a uniform load needs one row. A zero typed is a zero.
      const [[xI, xJ], [yI, yJ], [zI, zJ]] = [ends(q.xI, q.xJ), ends(q.yI, q.yJ), ends(q.zI, q.zJ)];
      if ([xI, xJ, yI, yJ, zI, zJ].every((x) => x === 0)) return ZERO;
      const a = opt(form.qa), b = opt(form.qb);
      if (ctx.chain) {
        const ph = physical();
        if ('error' in ph) return ph;
        if (!checkStretch(a, b, ph.chain.total).ok) return beyondChain(ph.chain.total);
        return out(loadsOnChain(ph.chain, { kind: 'distributed', a: a ?? 0, b: b ?? ph.chain.total, frame, qI: [xI, yI, zI], qJ: [xJ, yJ, zJ] }, ctx.axes, ph.axes)
          .map((l) => ({ type: l.type, data: { ...l.data, id: 0, ...c } }) as Load));
      }
      // Backwards whatever the member (a ≥ b, a negative end): said as such. Then the members it
      // does not fit, by name: a = 5 fits a 6 m member and not a 3 m one.
      if (!stretchForward(a, b)) return { error: 'writeLoad.stretchBad' };
      const off = misfits((id) => checkStretch(a, b, lengthOf(id)).ok, 'writeLoad.stretchDoesNotFit', { a: a ?? 0, b: b ?? 'L' });
      if (off) return off;
      return out(ids.map((id) => {
        const st = checkStretch(a, b, lengthOf(id)) as { a?: number; b?: number };
        const data: Record<string, unknown> = { id: 0, elementId: id, qYI: yI, qYJ: yJ, qZI: zI, qZJ: zJ, ...c };
        if (xI || xJ) { data.qXI = xI; data.qXJ = xJ; }
        if (frame !== 'local') data.frame = frame;
        if (st.a !== undefined) data.a = st.a;
        if (st.b !== undefined) data.b = st.b;
        return { type: 'distributed3d', data } as unknown as Load;
      }));
    }
    case 'point': {
      const v = { px: num(p.px), py: num(p.py), pz: num(p.pz), mx: num(p.mx), my: num(p.my), mz: num(p.mz) };
      if (Object.values(v).every((x) => x === 0)) return ZERO;
      const moment = v.mx !== 0 || v.my !== 0 || v.mz !== 0;
      if (moment && ids.some((id) => !bends(id))) return { error: 'writeLoad.momentOnTruss' };
      const a = opt(form.pa);
      if (ctx.chain) {
        const ph = physical();
        if ('error' in ph) return ph;
        const s = checkPosition(a ?? ph.chain.total / 2, ph.chain.total);
        if (s === null) return beyondChain(ph.chain.total);
        return out(loadsOnChain(ph.chain, { kind: 'point', a: s, frame: form.pFrame, F: [v.px, v.py, v.pz], M: [v.mx, v.my, v.mz] }, ctx.axes, ph.axes)
          .map((l) => ({ type: l.type, data: { ...l.data, id: 0, ...c } }) as Load));
      }
      const off = misfits((id) => checkPosition(a ?? lengthOf(id) / 2, lengthOf(id)) !== null, 'writeLoad.pointOutside', { a: a ?? '' });
      if (off) return off;
      return out(ids.map((id) => {
        const L = lengthOf(id);
        const data: Record<string, unknown> = { id: 0, elementId: id, a: checkPosition(a ?? L / 2, L)!, py: v.py, pz: v.pz, ...c };
        for (const k of ['px', 'mx', 'my', 'mz'] as const) if (v[k]) data[k] = v[k];
        if (form.pFrame === 'global') data.frame = 'global';
        return { type: 'pointOnElement3d', data } as unknown as Load;
      }));
    }
    case 'thermal': {
      const dt = num(th.dt), gz = num(th.gz), gy = num(th.gy);
      if (dt === 0 && gz === 0 && gy === 0) return ZERO;
      return out(ids.map((id) => ({ type: 'thermal', data: { id: 0, elementId: id, dtUniform: dt, dtGradient: gz, ...(gy ? { dtGradientY: gy } : {}), ...c } }) as Load));
    }
    case 'strain': {
      const v = opt(form.strainVal);
      if (v === undefined || v === 0) return ZERO;
      // ‰ of the member's length, or a change of it.
      return out(ids.map((id) => ({ type: 'thermal', data: { id: 0, elementId: id, dtUniform: 0, dtGradient: 0, strain: form.strainBy === 'unit' ? v / 1000 : v / lengthOf(id), ...c } }) as Load));
    }
    case 'prestress': {
      const P = opt(ps.force);
      if (P === undefined || P === 0) return ZERO;
      if (ids.some((id) => !bends(id))) return { error: 'writeLoad.prestressOnTruss' };
      return out(ids.map((id) => ({ type: 'prestress3d', data: { id: 0, elementId: id, force: P, eI: num(ps.eI), eM: ps.eM === null ? (num(ps.eI) + num(ps.eJ)) / 2 : ps.eM, eJ: num(ps.eJ), ...c } }) as Load));
    }
    case 'surface': {
      const v = opt(form.sq);
      if (v === undefined || v === 0) return ZERO;
      return out(ids.map((id) => ({ type: 'surface3d', data: { id: 0, quadId: id, q: v, ...c } }) as Load));
    }
    case 'thermalQuad': {
      const dt = num(tq.dt), g = num(tq.g);
      if (dt === 0 && g === 0) return ZERO;
      return out(ids.map((id) => ({ type: 'thermalQuad3d', data: { id: 0, quadId: id, dtUniform: dt, dtGradient: g, ...c } }) as Load));
    }
  }
}

/** A form with every field blank, of `kind`. */
export function blankWriteForm(kind: WriteKind = 'nodal'): WriteForm {
  return {
    kind,
    f: { fx: null, fy: null, fz: null, mx: null, my: null, mz: null },
    inclined: false, incF: null, incFromKind: 'node', incFromNode: '', incFrom: { x: null, y: null, z: null },
    u: { dx: null, dy: null, dz: null, drx: null, dry: null, drz: null },
    frame: 'local', shape: 'trapezoid',
    q: { xI: null, xJ: null, yI: null, yJ: null, zI: null, zJ: null }, qa: null, qb: null,
    peak: null, peakAt: null, peakComp: 'z',
    w1: null, w2: null, hydroAxis: 'Z', hydroComp: 'x',
    pFrame: 'local', p: { px: null, py: null, pz: null, mx: null, my: null, mz: null }, pa: null,
    th: { dt: null, gz: null, gy: null }, strainBy: 'unit', strainVal: null,
    ps: { force: null, eI: null, eM: null, eJ: null },
    sq: null, tq: { dt: null, g: null },
  };
}
