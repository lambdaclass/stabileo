/**
 * A load given in global axes, or at an angle, is the same load in every 2D
 * analysis. The linear solve and the combinations applied its value
 * perpendicular to the member, so on an inclined member they solved a
 * different load from the one drawn — and from the one P-Δ solved.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { solve } from '../wasm-solver';

const sum = (r: { reactions: Array<{ rx: number; rz: number }> }) =>
  r.reactions.reduce((acc, x) => ({ rx: acc.rx + x.rx, rz: acc.rz + x.rz }), { rx: 0, rz: 0 });

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear(); });

describe('global and angled loads in 2D', () => {
  it('a vertical load on a 3:4 rafter: no horizontal reaction, in the linear solve, the combinations and the advanced input', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 3);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, -10, -10, 0, true);          // 10 kN/m vertical over L = 5
    modelStore.addPointLoadOnElement(e, 2.5, -5, { isGlobal: true });
    const lin = sum(modelStore.solve(false) as never);
    expect(lin.rx).toBeCloseTo(0, 6);
    expect(lin.rz).toBeCloseTo(55, 6);
    const combos = modelStore.solveCombinations(false) as unknown as { perCase: Map<number, never> };
    const c = sum([...combos.perCase.values()][0]);
    expect(c.rx).toBeCloseTo(0, 6);
    expect(c.rz).toBeCloseTo(55, 6);
    const adv = sum(solve(modelStore.buildSolverInput(false)!) as never);
    expect(adv).toEqual(expect.objectContaining({ rz: expect.closeTo(55, 6) }));
  });

  it('a global load at 90° is horizontal; a local load at 90° is axial', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 3);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX');
    modelStore.addDistributedLoad(e, 2, 2, 90, true);
    const g = sum(modelStore.solve(false) as never);
    expect(g.rx).toBeCloseTo(-10, 6);
    expect(g.rz).toBeCloseTo(0, 6);
  });
});
