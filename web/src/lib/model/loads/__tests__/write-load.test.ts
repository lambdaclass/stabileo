/**
 * The write card's loads (`write-load.ts`): a physical member's frame, stretches that do not fit,
 * unreadable fields, and a force pointing at a node that is not there or is the node itself.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore, type Load } from '../../../store/model.svelte';
import '../../../store/index';
import { buildWrittenLoads, blankWriteForm, type WriteForm, type WriteContext, type WriteOutcome, type WriteRefusal } from '../write-load';
import { chainFrame } from '../member-load-tools';
import { addLoads } from '../../../store/load-ops';
import { appliedResultant } from '../../../engine/statics-check';
import { memberRef3D } from '../../../engine/solver-service';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); });

const ctx = (ids: number[], chain = false): WriteContext => ({
  caseId: 1, ids, chain,
  node: (id) => modelStore.nodes.get(id),
  element: (id) => modelStore.elements.get(id),
  axes: (id) => memberRef3D(modelStore.model as never, id)?.axes ?? null,
  length: (id) => memberRef3D(modelStore.model as never, id)?.axes.L ?? modelStore.getElementLength(id),
});
const form = (kind: WriteForm['kind'], patch: (f: WriteForm) => void): WriteForm => { const f = blankWriteForm(kind); patch(f); return f; };
const loadsOf = (r: WriteOutcome | WriteRefusal): Load[] => {
  if ('error' in r) throw new Error(`refused: ${r.error}`);
  return r.loads;
};
const errorOf = (r: WriteOutcome | WriteRefusal): string | null => ('error' in r ? r.error : null);
/** The case's totals with only these loads in the model. */
const totals = (loads: Load[]) => {
  modelStore.replaceLoads([]);
  addLoads(loads);
  return appliedResultant(modelStore.model as never, 1, { includeSelfWeight: false }).applied;
};

/** Nodes at x = 0, 3, 7 (or along `dir`), e1 a→b, e2 b→c. */
function chainOfTwo(dir: [number, number, number] = [1, 0, 0]) {
  const at = (s: number) => modelStore.addNode(dir[0] * s, dir[1] * s, dir[2] * s);
  const a = at(0), b = at(3), c = at(7);
  const e1 = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(b, c, 'frame');
  return { a, b, c, e1, e2 };
}

describe('a load on a physical member keeps its local z whichever member is picked first', () => {
  const qz = form('distributed', (f) => { f.q.zI = '-10'; });
  const pz = form('point', (f) => { f.p.pz = '-5'; });

  it('picked [e1, e2] or [e2, e1]: the same downward 70 kN, and a point load stays downward', () => {
    const { e1, e2 } = chainOfTwo();
    expect(totals(loadsOf(buildWrittenLoads(qz, ctx([e1, e2], true)))).fz).toBeCloseTo(-70, 9);
    expect(totals(loadsOf(buildWrittenLoads(qz, ctx([e2, e1], true)))).fz).toBeCloseTo(-70, 9);
    expect(totals(loadsOf(buildWrittenLoads(pz, ctx([e1, e2], true)))).fz).toBeCloseTo(-5, 9);
    expect(totals(loadsOf(buildWrittenLoads(pz, ctx([e2, e1], true)))).fz).toBeCloseTo(-5, 9);
  });

  it('the chain frame walked J→I is the frame of a member drawn along the chain: (−ex, −ey, ez)', () => {
    const { a, b, e1 } = chainOfTwo([3 / 5, 0, 4 / 5]);
    const along = modelStore.addElement(b, a, 'frame');
    const ax = (id: number) => memberRef3D(modelStore.model as never, id)!.axes;
    const f = chainFrame(ax(e1), true);
    for (const k of ['ex', 'ey', 'ez'] as const) f[k].forEach((v, i) => expect(v).toBeCloseTo(ax(along)[k][i]!, 12));
    expect(chainFrame(ax(e1), false)).toEqual(ax(e1));
  });

  it('an inclined chain, either pick order, loads as each member under its own local qz', () => {
    const { e1, e2 } = chainOfTwo([3 / 5, 0, 4 / 5]);
    const own = totals([e1, e2].map((id) => ({ type: 'distributed3d', data: { id: 0, elementId: id, qYI: 0, qYJ: 0, qZI: -10, qZJ: -10, caseId: 1 } }) as Load));
    for (const order of [[e1, e2], [e2, e1]]) {
      const r = totals(loadsOf(buildWrittenLoads(qz, ctx(order, true))));
      for (const k of ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const) expect(r[k]).toBeCloseTo(own[k], 9);
    }
  });
});

describe('a stretch or a position that does not fit is refused, not clamped', () => {
  const beam = (L: number) => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(L, 0, 0);
    return modelStore.addElement(a, b, 'frame');
  };
  const dist = (a: string, b: string) => form('distributed', (f) => { f.q.zI = '-10'; f.qa = a; f.qb = b; });

  it('a ≥ b, a past the member, b at or before its start', () => {
    const e = beam(5);
    expect(errorOf(buildWrittenLoads(dist('3', '2'), ctx([e])))).toBe('writeLoad.stretchBad');
    expect(errorOf(buildWrittenLoads(dist('6', ''), ctx([e])))).toBe('writeLoad.stretchDoesNotFit');
    expect(errorOf(buildWrittenLoads(dist('', '0'), ctx([e])))).toBe('writeLoad.stretchBad');
    expect(errorOf(buildWrittenLoads(dist('-1', ''), ctx([e])))).toBe('writeLoad.stretchBad');
    // What fits is kept as typed, a full-length end stored as absent.
    expect(loadsOf(buildWrittenLoads(dist('1', '5'), ctx([e])))[0]!.data).toMatchObject({ a: 1 });
    expect((loadsOf(buildWrittenLoads(dist('1', '5'), ctx([e])))[0]!.data as { b?: number }).b).toBeUndefined();
  });

  it('members of different lengths: the ones the stretch does not fit are named, nothing is added', () => {
    const short = beam(3);
    const a = modelStore.addNode(0, 2, 0), b = modelStore.addNode(6, 2, 0);
    const long = modelStore.addElement(a, b, 'frame');
    const r = buildWrittenLoads(dist('5', ''), ctx([short, long]));
    expect(errorOf(r)).toBe('writeLoad.stretchDoesNotFit');
    expect(String((r as WriteRefusal).params?.list)).toBe(String(short));
  });

  it('a point load past the member, a triangle\'s peak past it', () => {
    const e = beam(5);
    expect(errorOf(buildWrittenLoads(form('point', (f) => { f.p.pz = '-5'; f.pa = '9'; }), ctx([e])))).toBe('writeLoad.pointOutside');
    expect(errorOf(buildWrittenLoads(form('distributed', (f) => { f.shape = 'triangle'; f.peak = '-5'; f.peakAt = '9'; }), ctx([e])))).toBe('writeLoad.pointOutside');
    expect(loadsOf(buildWrittenLoads(form('point', (f) => { f.p.pz = '-5'; f.pa = '5'; }), ctx([e])))[0]!.data).toMatchObject({ a: 5 });
  });

  it('on a physical member: a point beyond it, a stretch starting before it or ending past it', () => {
    const { e1, e2 } = chainOfTwo();
    expect(errorOf(buildWrittenLoads(form('point', (f) => { f.p.pz = '-5'; f.pa = '10'; }), ctx([e1, e2], true)))).toBe('writeLoad.chainOutside');
    expect(errorOf(buildWrittenLoads(dist('-1', ''), ctx([e1, e2], true)))).toBe('writeLoad.chainOutside');
    expect(errorOf(buildWrittenLoads(dist('', '8'), ctx([e1, e2], true)))).toBe('writeLoad.chainOutside');
    expect(errorOf(buildWrittenLoads(dist('4', '2'), ctx([e1, e2], true)))).toBe('writeLoad.chainOutside');
  });
});

describe('a field that does not read refuses the add; blank is the default it names', () => {
  it('a J end, a force with its unit typed, an a with its unit typed', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    expect(errorOf(buildWrittenLoads(form('distributed', (f) => { f.q.zI = '-1,5'; f.q.zJ = '-2,5.0'; }), ctx([e])))).toBe('pro.loadUnreadable');
    expect(errorOf(buildWrittenLoads(form('nodal', (f) => { f.f.fx = '5'; f.f.fz = '-10 kN'; }), ctx([a])))).toBe('pro.loadUnreadable');
    expect(errorOf(buildWrittenLoads(form('distributed', (f) => { f.q.zI = '-1'; f.qa = '0.5m'; }), ctx([e])))).toBe('pro.loadUnreadable');
    expect(errorOf(buildWrittenLoads(form('point', (f) => { f.p.pz = '-1'; f.pa = '1 m'; }), ctx([e])))).toBe('pro.loadUnreadable');
    expect(errorOf(buildWrittenLoads(form('prestress', (f) => { f.ps.force = '500'; f.ps.eM = '2O0'; }), ctx([e])))).toBe('pro.loadUnreadable');
    expect(errorOf(buildWrittenLoads(form('displacement', (f) => { f.u.dz = '-10mm'; }), ctx([a])))).toBe('pro.loadUnreadable');
    // Blank J is the I value, a zero typed in J is a zero.
    expect(loadsOf(buildWrittenLoads(form('distributed', (f) => { f.q.zI = '-1,5'; }), ctx([e])))[0]!.data).toMatchObject({ qZI: -1.5, qZJ: -1.5 });
    expect(loadsOf(buildWrittenLoads(form('distributed', (f) => { f.q.zI = '-1,5'; f.q.zJ = '0'; }), ctx([e])))[0]!.data).toMatchObject({ qZI: -1.5, qZJ: 0 });
  });
});

describe('a force toward a node', () => {
  const toward = (node: string, F = '10') => form('nodal', (f) => { f.inclined = true; f.incF = F; f.incByNode = true; f.incToNode = node; });

  it('names a node that is there, or nothing is added', () => {
    const a = modelStore.addNode(0, 0, 0);
    expect(errorOf(buildWrittenLoads(toward(''), ctx([a])))).toBe('writeLoad.towardNodeMissing');
    expect(errorOf(buildWrittenLoads(toward('999'), ctx([a])))).toBe('writeLoad.towardNodeMissing');
    expect(errorOf(buildWrittenLoads(toward('x'), ctx([a])))).toBe('writeLoad.towardNodeMissing');
  });

  it('the node it points at is left out, and said', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 4);
    const r = buildWrittenLoads(toward(String(b)), ctx([a, b]));
    expect(loadsOf(r)).toHaveLength(1);
    expect(loadsOf(r)[0]!.data).toMatchObject({ nodeId: a, fx: 6, fz: 8 });
    expect((r as WriteOutcome).skipped).toEqual({ key: 'writeLoad.towardSelf', ids: [b] });
    // Only that node: nothing to add, and the reason.
    expect(errorOf(buildWrittenLoads(toward(String(b)), ctx([b])))).toBe('writeLoad.towardSelf');
  });
});

describe('every refusal is said in each language', () => {
  it('the keys the write card and the tables show exist in en, es and pt', async () => {
    const keys = ['writeLoad.stretchBad', 'writeLoad.stretchDoesNotFit', 'writeLoad.pointOutside', 'writeLoad.chainOutside',
      'writeLoad.towardNodeMissing', 'writeLoad.towardSelf', 'pro.loadUnreadable', 'loadTables.placeRefused',
      'pro.removeCaseSelfWeight', 'pro.removeCaseMass'];
    for (const lang of ['en', 'es', 'pt']) {
      const dict = (await import(`../../../i18n/locales/${lang}.ts`)).default as Record<string, string>;
      for (const k of keys) expect(dict[k], `${lang}: ${k}`).toBeTruthy();
    }
  });
});
