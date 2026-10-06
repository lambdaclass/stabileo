/**
 * The write card's loads (`ProWriteLoadCard.svelte`): what the form describes, on its targets, as
 * the loads to add, or the reason it describes none.
 *
 * Every number is read by the app's one rule (`utils/numeric-input.ts`, as `loadComponents` and
 * `lineLoadEnds` read it): a comma or a point, a blank field the default it names (0; a J end blank
 * is the I value; an a or b blank the member's own end), and a field that does not read («5 kN»,
 * «0.5m», «1.2.3») refuses the add. It never becomes a zero, or an I value, the user did not type.
 *
 * Where a load sits is checked, not clamped (`load-stretch.ts`): a stretch that does not go forward
 * or does not fit on a member, a point off it, or anything beyond a physical member is refused, and
 * the members it does not fit are named. A clamp made a = 3, b = 2 into a load of no length that was
 * reported as added.
 *
 * Values are in SI, as the rest of the model is typed: kN, kN/m, kN·m, m, °C; the displacements and
 * eccentricities in mm, as they are measured, kept in m.
 *
 * Pure: the caller passes the targets and the geometry, and writes the result in one undo step.
 */
import type { Load } from '../../store/model.svelte';
import type { MemberAxes, MemberFrame } from '../../engine/member-loads';
import { parseDecimal, lineLoadEnds } from '../../utils/numeric-input';
import { orderedChain, loadsOnChain, chainFrame, triangularPeak, hydrostaticLoads, inclinedForce, type GlobalAxis } from './member-load-tools';
import { checkStretch, checkPosition, stretchForward } from './load-stretch';

export type WriteKind = 'nodal' | 'displacement' | 'distributed' | 'point' | 'thermal' | 'strain' | 'prestress' | 'surface' | 'thermalQuad';

/** The form's fields, as typed. */
export interface WriteForm {
  kind: WriteKind;
  f: { fx: string; fy: string; fz: string; mx: string; my: string; mz: string };
  inclined: boolean;
  incF: string;
  incToNode: string;
  incTo: { x: string; y: string; z: string };
  incByNode: boolean;
  u: { dx: string; dy: string; dz: string; drx: string; dry: string; drz: string };
  frame: MemberFrame;
  shape: 'trapezoid' | 'triangle' | 'hydrostatic';
  q: { xI: string; xJ: string; yI: string; yJ: string; zI: string; zJ: string };
  qa: string;
  qb: string;
  peak: string;
  peakAt: string;
  peakComp: 'x' | 'y' | 'z';
  w1: string;
  w2: string;
  hydroAxis: GlobalAxis;
  hydroComp: 'x' | 'y' | 'z';
  pFrame: 'local' | 'global';
  p: { px: string; py: string; pz: string; mx: string; my: string; mz: string };
  pa: string;
  th: { dt: string; gz: string; gy: string };
  strainBy: 'unit' | 'length';
  strainVal: string;
  ps: { force: string; eI: string; eM: string; eJ: string };
  sq: string;
  tq: { dt: string; g: string };
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

const UNREADABLE: WriteRefusal = { error: 'pro.loadUnreadable' };
const ZERO: WriteRefusal = { error: 'writeLoad.zero' };

/** A field typed that does not read as a number. */
const unreadable = (s: string) => s.trim() !== '' && parseDecimal(s) === null;
/** A field's number, blank is 0. Read once `fieldsRead` all read. */
const num = (s: string): number => (s.trim() === '' ? 0 : parseDecimal(s) ?? 0);
/** A field's number, or undefined when it is blank. */
const opt = (s: string): number | undefined => (s.trim() === '' ? undefined : parseDecimal(s) ?? undefined);
/** A length for a message: to the millimetre. */
const m3 = (v: number) => String(Math.round(v * 1000) / 1000);

/** The number fields the form reads for its kind: any of them unreadable refuses the add. */
function fieldsRead(form: WriteForm): string[] {
  switch (form.kind) {
    case 'nodal': return form.inclined ? [form.incF, ...(form.incByNode ? [] : Object.values(form.incTo))] : Object.values(form.f);
    case 'displacement': return Object.values(form.u);
    case 'distributed':
      return form.shape === 'hydrostatic' ? [form.w1, form.w2]
        : form.shape === 'triangle' ? [form.peak, form.peakAt] : [...Object.values(form.q), form.qa, form.qb];
    case 'point': return [...Object.values(form.p), form.pa];
    case 'thermal': return Object.values(form.th);
    case 'strain': return [form.strainVal];
    case 'prestress': return Object.values(form.ps);
    case 'surface': return [form.sq];
    case 'thermalQuad': return Object.values(form.tq);
  }
}

/** The loads the form describes, on its targets; a reason when it describes none. */
export function buildWrittenLoads(form: WriteForm, ctx: WriteContext): WriteOutcome | WriteRefusal {
  const { kind, f, u, q, p, th, ps, tq, frame, shape } = form;
  const ids = ctx.ids;
  if (ids.length === 0) return { error: 'writeLoad.noTarget' };
  if (fieldsRead(form).some(unreadable)) return UNREADABLE;
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
        let to: P3 | undefined;
        if (form.incByNode) {
          const typed = form.incToNode.trim();
          to = /^\d+$/.test(typed) ? ctx.node(Number(typed)) : undefined;
          if (!to) return { error: 'writeLoad.towardNodeMissing', params: { id: typed } };
        } else {
          to = { x: num(form.incTo.x), y: num(form.incTo.y), z: num(form.incTo.z) };
        }
        // A node where the force points has no direction to take: left out, and said.
        const loads: Load[] = [], skipped: number[] = [];
        for (const id of ids) {
          const at = ctx.node(id);
          const v = at ? inclinedForce(at, to, F) : null;
          if (v) loads.push({ type: 'nodal3d', data: { id: 0, nodeId: id, fx: v[0], fy: v[1], fz: v[2], mx: 0, my: 0, mz: 0, ...c } });
          else skipped.push(id);
        }
        if (loads.length === 0) return { error: 'writeLoad.towardSelf', params: { list: skipped.join(', ') } };
        return { loads, ...(skipped.length ? { skipped: { key: 'writeLoad.towardSelf', ids: skipped } } : {}) };
      }
      const v = { fx: num(f.fx), fy: num(f.fy), fz: num(f.fz), mx: num(f.mx), my: num(f.my), mz: num(f.mz) };
      if (Object.values(v).every((x) => x === 0)) return ZERO;
      return nodeLoads((id) => ({ type: 'nodal3d', data: { id: 0, nodeId: id, ...v, ...c } }));
    }
    case 'displacement': {
      const mm = (s: string) => { const x = opt(s); return x === undefined || x === 0 ? undefined : x / 1000; };
      const r = (s: string) => { const x = opt(s); return x === undefined || x === 0 ? undefined : x; };
      const d = { dx: mm(u.dx), dy: mm(u.dy), dz: mm(u.dz), drx: r(u.drx), dry: r(u.dry), drz: r(u.drz) };
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
      const ends = [lineLoadEnds(q.xI, q.xJ), lineLoadEnds(q.yI, q.yJ), lineLoadEnds(q.zI, q.zJ)];
      if (ends.some((e) => e === null)) return UNREADABLE;
      const [[xI, xJ], [yI, yJ], [zI, zJ]] = ends as Array<[number, number]>;
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
      // ‰ of the member's length, or mm of it.
      return out(ids.map((id) => ({ type: 'thermal', data: { id: 0, elementId: id, dtUniform: 0, dtGradient: 0, strain: form.strainBy === 'unit' ? v / 1000 : v / 1000 / lengthOf(id), ...c } }) as Load));
    }
    case 'prestress': {
      const P = opt(ps.force);
      if (P === undefined || P === 0) return ZERO;
      if (ids.some((id) => !bends(id))) return { error: 'writeLoad.prestressOnTruss' };
      const mm = (s: string) => num(s) / 1000;
      return out(ids.map((id) => ({ type: 'prestress3d', data: { id: 0, elementId: id, force: P, eI: mm(ps.eI), eM: opt(ps.eM) === undefined ? (mm(ps.eI) + mm(ps.eJ)) / 2 : mm(ps.eM), eJ: mm(ps.eJ), ...c } }) as Load));
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
    f: { fx: '', fy: '', fz: '', mx: '', my: '', mz: '' },
    inclined: false, incF: '', incToNode: '', incTo: { x: '', y: '', z: '' }, incByNode: true,
    u: { dx: '', dy: '', dz: '', drx: '', dry: '', drz: '' },
    frame: 'local', shape: 'trapezoid',
    q: { xI: '', xJ: '', yI: '', yJ: '', zI: '', zJ: '' }, qa: '', qb: '',
    peak: '', peakAt: '', peakComp: 'z',
    w1: '', w2: '', hydroAxis: 'Z', hydroComp: 'x',
    pFrame: 'local', p: { px: '', py: '', pz: '', mx: '', my: '', mz: '' }, pa: '',
    th: { dt: '', gz: '', gy: '' }, strainBy: 'unit', strainVal: '',
    ps: { force: '', eI: '', eM: '', eJ: '' },
    sq: '', tq: { dt: '', g: '' },
  };
}
