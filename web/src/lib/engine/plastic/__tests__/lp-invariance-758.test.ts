import { describe, it, expect } from 'vitest';
import { solveLimit } from '../solve-limit';
import { plasticCollapse2D } from '../../plastic-collapse';
import type { SolverInput, SolverLoad } from '../../types';
import { model, fixedBeam, proppedUdl, portal, twoSpanUdl, MP, P, pOn, q } from './helpers';

const twoStorey = () => model(
  [[1, 0, 0], [2, 0, 3], [3, 0, 6], [4, 5, 0], [5, 5, 3], [6, 5, 6]],
  [[1, 1, 2], [2, 2, 3], [3, 4, 5], [4, 5, 6], [5, 2, 5], [6, 3, 6]],
  [[1, 'fixed'], [4, 'fixed']],
  [P(2, 2, 0), P(3, 1, 0), pOn(5, 2.5, -6), q(6, -2)],
);
const gable = () => model(
  [[1, 0, 0], [2, 0, 4], [3, 4, 6], [4, 8, 4], [5, 8, 0]],
  [[1, 1, 2], [2, 2, 3], [3, 3, 4], [4, 4, 5]],
  [[1, 'fixed'], [5, 'pinned']],
  [P(2, 3, 0), pOn(2, 2, -5), pOn(3, 1.5, -4)],
);
const CASES: Array<[string, () => SolverInput]> = [
  ['fixed beam', () => fixedBeam()], ['propped UDL', () => proppedUdl()], ['portal', () => portal(1, 1)],
  ['portal sway', () => portal(3, 1)], ['two-span UDL', () => twoSpanUdl()], ['two storey', twoStorey], ['gable', gable],
];

function relabel(m: SolverInput): SolverInput {
  const nIds = [...m.nodes.keys()];
  const eIds = [...m.elements.keys()];
  const nMap = new Map(nIds.map((id, k) => [id, 100 + 7 * (nIds.length - k)]));
  const eMap = new Map(eIds.map((id, k) => [id, 50 + 3 * (eIds.length - k)]));
  const nodes = new Map([...m.nodes.values()].reverse().map((n) => [nMap.get(n.id)!, { ...n, id: nMap.get(n.id)! }]));
  const elements = new Map([...m.elements.values()].reverse().map((e) => [eMap.get(e.id)!, { ...e, id: eMap.get(e.id)!, nodeI: nMap.get(e.nodeI)!, nodeJ: nMap.get(e.nodeJ)! }]));
  const supports = new Map([...m.supports.values()].map((s) => [s.id, { ...s, nodeId: nMap.get(s.nodeId)! }]));
  const loads = m.loads.map((l: any) => ({ type: l.type, data: { ...l.data, ...('nodeId' in l.data ? { nodeId: nMap.get(l.data.nodeId) } : {}), ...('elementId' in l.data ? { elementId: eMap.get(l.data.elementId) } : {}) } })) as SolverLoad[];
  return { ...m, nodes, elements, supports, loads } as SolverInput;
}
const len = (m: SolverInput, id: number) => { const e = m.elements.get(id)!; const a = m.nodes.get(e.nodeI)!, b = m.nodes.get(e.nodeJ)!; return Math.hypot(b.x - a.x, (b as any).z - (a as any).z); };
function reverse(m: SolverInput): SolverInput {
  const elements = new Map([...m.elements.values()].map((e) => [e.id, { ...e, nodeI: e.nodeJ, nodeJ: e.nodeI }]));
  const loads = m.loads.map((l: any) => l.type === 'distributed' ? { type: l.type, data: { ...l.data, qI: -l.data.qJ, qJ: -l.data.qI } }
    : l.type === 'pointOnElement' ? { type: l.type, data: { ...l.data, a: len(m, l.data.elementId) - l.data.a, p: -l.data.p } } : l) as SolverLoad[];
  return { ...m, elements, loads } as SolverInput;
}
const L = 1000, F = 1000;
function units(m: SolverInput): SolverInput {
  const nodes = new Map([...m.nodes.values()].map((n: any) => [n.id, { ...n, x: n.x * L, z: n.z * L }]));
  const materials = new Map([...m.materials.values()].map((x: any) => [x.id, { ...x, e: x.e * F / (L * L) }]));
  const sections = new Map([...m.sections.values()].map((s: any) => [s.id, { ...s, a: s.a * L * L, iz: s.iz * L ** 4 }]));
  const loads = m.loads.map((l: any) => ({ type: l.type, data: l.type === 'nodal' ? { ...l.data, fx: l.data.fx * F, fz: l.data.fz * F, my: l.data.my * F * L }
    : l.type === 'distributed' ? { ...l.data, qI: l.data.qI * F / L, qJ: l.data.qJ * F / L } : { ...l.data, a: l.data.a * L, p: l.data.p * F } })) as SolverLoad[];
  return { ...m, nodes, materials, sections, loads } as SolverInput;
}
const T: Array<[string, (m: SolverInput) => SolverInput, number]> = [['relabel', relabel, MP], ['reverse', reverse, MP], ['units', units, MP * F * L], ['all', (m) => units(reverse(relabel(m))), MP * F * L]];

const lp = (m: SolverInput, mp: number) => solveLimit(m, () => mp)?.best.lambda ?? NaN;
const inc = (m: SolverInput, mp: number) => { try { const r = plasticCollapse2D(m, { mp: () => mp, np: () => Infinity }); return r.isMechanism && !r.unresolved ? r.collapseFactor : NaN; } catch { return NaN; } };

const LP_VARIES = new Set(['two-span UDL reverse', 'two-span UDL units', 'two-span UDL all', 'two storey units', 'two storey all']);

describe('#758 transforms on the 2D plastic paths', () => {
  for (const [name, make] of CASES) for (const [tn, tf, mp] of T) {
    it(`${name}, ${tn}: the step-by-step λ does not change${LP_VARIES.has(`${name} ${tn}`) ? '; the limit analysis finds no solution' : ', nor does the limit analysis'}`, () => {
      const c = inc(make(), MP), d = inc(tf(make()), mp);
      expect(Number.isFinite(c)).toBe(true);
      expect(Math.abs(d - c) / c).toBeLessThan(1e-9);
      const a = lp(make(), MP), b = lp(tf(make()), mp);
      expect(Math.abs(a - c) / c).toBeLessThan(1e-4);
      if (LP_VARIES.has(`${name} ${tn}`)) expect(b).toBeNaN();
      else expect(Math.abs(b - a) / a).toBeLessThan(1e-9);
    });
  }
});
