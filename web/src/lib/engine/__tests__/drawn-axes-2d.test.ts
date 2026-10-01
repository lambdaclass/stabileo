/**
 * Plane members read and take loads in their drawn local axes: z up for any
 * member that is not vertical, +X for a vertical one — whichever end was
 * drawn first. See transverse-sign-2d.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../../store';
import { transverseSign } from '../transverse-sign-2d';
import { computeDiagramValueAt } from '../diagrams';

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear(); });

type Dir = 'LtoR' | 'RtoL' | 'colUp' | 'colDown';
function member(dir: Dir) {
  const col = dir.startsWith('col');
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(col ? 0 : 6, col ? 6 : 0);
  const [i, j] = dir === 'RtoL' || dir === 'colDown' ? [b, a] : [a, b];
  return { a, b, e: modelStore.addElement(i, j) };
}
const reaction = (r: { reactions: Array<{ nodeId: number; rx: number; rz: number }> }, n: number) => r.reactions.find((x) => x.nodeId === n)!;

describe('transverseSign', () => {
  it('agrees with the solver where the drawn z is x turned counter-clockwise', () => {
    expect(transverseSign(1, 0)).toBe(1);
    expect(transverseSign(-1, 0)).toBe(-1);
    expect(transverseSign(1, 1)).toBe(1);
    expect(transverseSign(-1, 1)).toBe(-1);
    expect(transverseSign(0, 1)).toBe(-1);   // column drawn upward: drawn z = +X, solver's = −X
    expect(transverseSign(0, -1)).toBe(1);   // drawn downward: both +X
  });
});

describe('local loads act along the drawn z', () => {
  it.each(['LtoR', 'RtoL'] as Dir[])('a beam drawn %s: q = −10 pushes down', (dir) => {
    const { a, b, e } = member(dir);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, -10);
    const r = modelStore.solve(false) as never;
    expect(reaction(r, a).rz).toBeCloseTo(30, 6);
  });

  it.each(['colUp', 'colDown'] as Dir[])('a column drawn %s: q = −10 pushes toward −X', (dir) => {
    const { a, b, e } = member(dir);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerZ');
    modelStore.addDistributedLoad(e, -10);
    const r = modelStore.solve(false) as never;
    expect(reaction(r, a).rx + reaction(r, b).rx).toBeCloseTo(60, 6);
  });

  it('the same in the space solve of the plane model', () => {
    const { a, b, e } = member('RtoL');
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, -10);
    uiStore.analysisMode = '3d';
    const r = modelStore.solve3D(false, false, false) as unknown as { reactions: Array<{ nodeId: number; fz: number }> };
    expect(r.reactions.find((x) => x.nodeId === a)!.fz).toBeCloseTo(30, 6);
  });
});

describe('published forces read the same whichever end was drawn first', () => {
  it('a sagging beam: same M and V at midspan and at the quarter, left to right or right to left', () => {
    const read = (dir: Dir) => {
      historyStore.clear(); modelStore.clear();
      const { a, b, e } = member(dir);
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
      modelStore.addDistributedLoad(e, -10, -10, 0, true);
      resultsStore.setResults(modelStore.solve(false) as never);
      const ef = resultsStore.results!.elementForces[0];
      const t = dir === 'LtoR' ? 0.25 : 0.75; // the same physical section
      return { m: computeDiagramValueAt('moment', 0.5, ef), v: computeDiagramValueAt('shear', t, ef) };
    };
    const l = read('LtoR'), r = read('RtoL');
    expect(r.m).toBeCloseTo(l.m, 6);
    expect(Math.abs(l.m)).toBeCloseTo(45, 6);
    // V is along x, which is reversed: the same section, the opposite sense.
    expect(r.v).toBeCloseTo(-l.v, 6);
  });
});

describe('temperature gradient: ΔTg = ΔT(bottom) − ΔT(top), top the drawn z', () => {
  it.each(['LtoR', 'RtoL'] as Dir[])('a positive gradient sags a simply supported beam drawn %s, in 2D and in 3D', (dir) => {
    const a = modelStore.addNode(0, 0), m = modelStore.addNode(3, 0), b = modelStore.addNode(6, 0);
    const els = dir === 'LtoR' ? [modelStore.addElement(a, m), modelStore.addElement(m, b)] : [modelStore.addElement(m, a), modelStore.addElement(b, m)];
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    for (const e of els) modelStore.addThermalLoad(e, 0, 20);
    const r2 = modelStore.solve(false) as unknown as { displacements: Array<{ nodeId: number; uz: number }> };
    const w2 = r2.displacements.find((d) => d.nodeId === m)!.uz;
    uiStore.analysisMode = '3d';
    const r3 = modelStore.solve3D(false, false, false) as unknown as { displacements: Array<{ nodeId: number; uz: number }> };
    const w3 = r3.displacements.find((d) => d.nodeId === m)!.uz;
    expect(w2).toBeLessThan(0);
    expect(w3).toBeCloseTo(w2, 9);
  });
});
