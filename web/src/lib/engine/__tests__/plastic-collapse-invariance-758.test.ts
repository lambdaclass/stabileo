/**
 * Issue #758: the collapse factor of a plane frame is a property of the structure, so it cannot
 * depend on how its nodes and members are numbered, which way each member is drawn, or the units.
 * The models are the metamorphic reproductions of the issue (fuzz_rich_2d seeds 20843 and 20832)
 * and the portal of the Basic course, whose λc is checked against the mechanism method by hand.
 */
import { describe, it, expect } from 'vitest';
import { plasticCollapse2D } from '../plastic-collapse';
import type { SolverInput, SolverLoad } from '../types';
import f20843c from './fixtures/plastic-758/fuzz-rich-2d-20843-1.json';
import f20843 from './fixtures/plastic-758/fuzz-rich-2d-20843-0.json';
import f20832 from './fixtures/plastic-758/fuzz-rich-2d-20832-0.json';

type Fixture = { solver: Record<string, any>; sections: Record<string, { b: number; h: number }> };
type Model = { input: SolverInput; mp: Map<number, number> };

const FY = 250;
const REL = 1e-9;

function fromFixture(f: Fixture): Model {
  const toMap = (o: Record<string, any>) => new Map(Object.values(o ?? {}).map((v: any) => {
    const copy = { ...v };
    for (const k of Object.keys(copy)) if (copy[k] === null) delete copy[k];
    return [v.id, copy];
  }));
  const s = f.solver;
  const input = {
    nodes: toMap(s.nodes), materials: toMap(s.materials), sections: toMap(s.sections),
    elements: toMap(s.elements), supports: toMap(s.supports), loads: structuredClone(s.loads),
    constraints: structuredClone(s.constraints ?? []), connectors: new Map(),
  } as unknown as SolverInput;
  const mp = new Map([...input.elements.values()].map((e) => {
    const sec = f.sections[String(e.sectionId)];
    return [e.id, FY * 1000 * sec.b * sec.h * sec.h / 4];
  }));
  return { input, mp };
}

/** The Basic course's portal-frame example: fixed bases, columns 0.3×0.3, beam 0.2×0.5, q = 15 kN/m, H = 10 kN. */
function coursePortal(): Model {
  const input = {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 4 }], [3, { id: 3, x: 6, z: 4 }], [4, { id: 4, x: 6, z: 0 }]]),
    materials: new Map([[2, { id: 2, e: 30000, nu: 0.2 }]]),
    sections: new Map([[2, { id: 2, a: 0.09, iz: 0.000675 }], [3, { id: 3, a: 0.1, iz: 0.002083 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 2, sectionId: 2, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 2, sectionId: 3, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 2, sectionId: 2, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 4, type: 'fixed' }]]),
    loads: [
      { type: 'distributed', data: { elementId: 2, qI: -15, qJ: -15 } },
      { type: 'nodal', data: { nodeId: 2, fx: 10, fz: 0, my: 0 } },
    ],
  } as unknown as SolverInput;
  const mpc = FY * 1000 * 0.3 * 0.3 ** 2 / 4;
  const mpb = FY * 1000 * 0.2 * 0.5 ** 2 / 4;
  return { input, mp: new Map([[1, mpc], [2, mpb], [3, mpc]]) };
}

function lengthOf(input: SolverInput, id: number): number {
  const e = input.elements.get(id)!;
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function reversed({ input, mp }: Model, pick: (id: number) => boolean): Model {
  const out = structuredClone(input);
  for (const e of out.elements.values()) {
    if (!pick(e.id)) continue;
    [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
    [e.hingeStart, e.hingeEnd] = [e.hingeEnd, e.hingeStart];
  }
  out.loads = input.loads.map((l): SolverLoad => {
    if (!('elementId' in l.data) || !pick(l.data.elementId)) return structuredClone(l);
    const d = { ...l.data } as any, len = lengthOf(input, d.elementId);
    if (l.type === 'distributed' || l.type === 'axialDistributed') {
      const a = d.a ?? 0, b = d.b ?? len;
      [d.qI, d.qJ] = [-d.qJ, -d.qI];
      d.a = len - b;
      d.b = len - a;
    } else if (l.type === 'pointOnElement') {
      d.a = len - d.a;
      d.p = -d.p;
      if (d.px !== undefined) d.px = -d.px;
    } else if (l.type === 'thermal') {
      d.dtGradient = -d.dtGradient;
    }
    return { type: l.type, data: d } as SolverLoad;
  });
  return { input: out, mp: new Map(mp) };
}

function relabelled({ input, mp }: Model, seed: number): Model {
  const shuffle = (ids: number[]) => {
    const out = [...ids];
    let x = seed * 2654435761 + 1;
    for (let i = out.length - 1; i > 0; i--) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const j = x % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return new Map(ids.map((id, k) => [id, 100 + out.indexOf(ids[k]) * 3 + seed]));
  };
  const nodeId = shuffle([...input.nodes.keys()]);
  const elemId = shuffle([...input.elements.keys()]);
  const n = (id: number) => nodeId.get(id)!;
  const reorder = <T>(m: Map<number, T>, key: (v: T) => number) => new Map([...m.values()].reverse().map((v) => [key(v), v]));
  const nodes = reorder(new Map([...input.nodes].map(([k, v]) => [k, { ...v, id: n(v.id) }])), (v) => v.id);
  const elements = reorder(new Map([...input.elements].map(([k, e]) => [k, { ...e, id: elemId.get(e.id)!, nodeI: n(e.nodeI), nodeJ: n(e.nodeJ) }])), (v) => v.id);
  const supports = new Map([...input.supports.values()].reverse().map((s, k) => [k + 1, { ...s, id: k + 1, nodeId: n(s.nodeId) }]));
  const loads = input.loads.map((l): SolverLoad => {
    const d = { ...l.data } as any;
    if ('elementId' in d) d.elementId = elemId.get(d.elementId);
    if ('nodeId' in d) d.nodeId = n(d.nodeId);
    return { type: l.type, data: d } as SolverLoad;
  }).reverse();
  const constraints = (input.constraints ?? []).map((c: any) => ({ ...c, masterNode: n(c.masterNode), slaveNode: n(c.slaveNode) }));
  return {
    input: { ...input, nodes, elements, supports, loads, constraints } as SolverInput,
    mp: new Map([...mp].map(([id, v]) => [elemId.get(id)!, v])),
  };
}

/** Lengths × s and forces × f: E, A, I, loads, springs and Mp take their units. */
function rescaled({ input, mp }: Model, s: number, f: number): Model {
  const out = structuredClone(input);
  for (const nd of out.nodes.values()) { nd.x *= s; nd.z *= s; }
  for (const m of out.materials.values()) m.e *= f / (s * s);
  for (const sec of out.sections.values()) { sec.a *= s * s; sec.iz *= s ** 4; }
  for (const sp of out.supports.values()) {
    if (sp.kx !== undefined) sp.kx *= f / s;
    if (sp.ky !== undefined) sp.ky *= f / s;
    if (sp.kz !== undefined) sp.kz *= f * s;
    if (sp.dx !== undefined) sp.dx *= s;
    if (sp.dz !== undefined) sp.dz *= s;
  }
  out.loads = out.loads.map((l): SolverLoad => {
    const d = { ...l.data } as any;
    if (l.type === 'nodal') { d.fx *= f; d.fz *= f; d.my *= f * s; }
    if (l.type === 'distributed' || l.type === 'axialDistributed') {
      d.qI *= f / s; d.qJ *= f / s;
      if (d.a !== undefined) d.a *= s;
      if (d.b !== undefined) d.b *= s;
    }
    if (l.type === 'pointOnElement') {
      d.a *= s; d.p *= f;
      if (d.px !== undefined) d.px *= f;
      if (d.my !== undefined) d.my *= f * s;
    }
    if (l.type === 'thermal' && d.depth !== undefined) d.depth *= s;
    return { type: l.type, data: d } as SolverLoad;
  });
  return { input: out, mp: new Map([...mp].map(([k, v]) => [k, v * f * s])) };
}

const run = ({ input, mp }: Model) => plasticCollapse2D(input, { mp: (id) => mp.get(id) ?? Infinity, np: () => Infinity });

const close = (a: number, b: number, what: string) =>
  expect(Math.abs(a - b) <= REL * Math.abs(b), `${what}: ${a} vs ${b}`).toBe(true);

describe('#758: plastic collapse factor invariant under renumbering, member direction and units', () => {
  const models: Array<[string, () => Model]> = [
    ['fuzz_rich_2d/20843 (equalDOF constraint)', () => fromFixture(f20843c as Fixture)],
    ['fuzz_rich_2d/20843', () => fromFixture(f20843 as Fixture)],
    ['fuzz_rich_2d/20832 (springs, settlements, temperatures)', () => fromFixture(f20832 as Fixture)],
    ['course portal', coursePortal],
  ];
  for (const [name, make] of models) {
    it(name, () => {
      const base = make();
      const ref = run(base).collapseFactor;
      expect(ref).toBeGreaterThan(0);
      for (let seed = 0; seed < 3; seed++) {
        close(run(reversed(base, (id) => (id + seed) % 3 !== 0)).collapseFactor, ref, `${name} reversal/${seed}`);
        close(run(relabelled(base, seed)).collapseFactor, ref, `${name} relabel/${seed}`);
      }
      if (name === 'course portal') {
        for (const [s, f] of [[1000, 1000], [0.3048, 4.448], [1e-3, 1e3]]) close(run(rescaled(base, s, f)).collapseFactor, ref, `${name} units ${s}/${f}`);
      }
    });
  }

  it('the equalDOF reproduction collapses at the limit analysis value, not at half of it', () => {
    const r = run(fromFixture(f20843c as Fixture));
    close(r.collapseFactor, 80.12437234515549, 'fuzz_rich_2d/20843 constrained');
  });

  it('the course portal collapses by its beam mechanism: λc = 8(Mp,col + Mp,beam)/(qL²) = 1925/27', () => {
    const r = run(coursePortal());
    const mpc = FY * 1000 * 0.3 * 0.3 ** 2 / 4, mpb = FY * 1000 * 0.2 * 0.5 ** 2 / 4;
    const beam = (8 * (mpc + mpb)) / (15 * 36);
    const sway = (4 * mpc) / (10 * 4);
    const combined = Math.min(...Array.from({ length: 6001 }, (_, k) => {
      const x = (6 * k) / 6001;
      return (2 * mpc + ((mpb + mpc) * 6) / (6 - x)) / (10 * 4 + (15 * 6 * x) / 2);
    }));
    expect(beam).toBeCloseTo(1925 / 27, 12);
    expect(sway).toBeGreaterThan(beam);
    expect(combined).toBeGreaterThan(beam);
    close(r.collapseFactor, 1925 / 27, 'course portal');
    expect(r.isMechanism && !r.unresolved && !r.limit).toBe(true);
    expect(r.collapseFactor.toFixed(3)).toBe('71.296');
  });
});
