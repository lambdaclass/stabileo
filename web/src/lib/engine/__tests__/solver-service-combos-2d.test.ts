/**
 * Contract tests for solveCombinations2D after its reroute through the
 * engine's batch multi-case API (solve_multi_case_2d). Pins:
 *  - result shape + superposition math of the batch path,
 *  - parity with the per-case path (validateAndSolve2D per case),
 *  - the guards that keep constraint / duplicate-name models on the
 *    id-keyed per-case path,
 *  - error conditions still surfacing as string returns.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver } from '../wasm-solver';
import { solveCombinations2D, validateAndSolve2D, type ModelData } from '../solver-service';

/** Cantilever: fixed at node 1, tip loads at node 2 split across two cases. */
function beamModel(): ModelData {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 } as any],
      [2, { id: 2, x: 5, y: 0 } as any],
    ]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } as any],
    ]),
    materials: new Map([[1, { id: 1, e: 200_000_000, nu: 0.3 } as any]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 } as any]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' } as any]]),
    loads: [
      { type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -10, my: 0, caseId: 1 } } as any,
      { type: 'nodal', data: { id: 2, nodeId: 2, fx: 4, fz: 0, my: 0, caseId: 2 } } as any,
    ],
  };
}

const cases = [
  { id: 1, type: 'D', name: 'Dead' },
  { id: 2, type: 'L', name: 'Live' },
] as any;

const combos = [
  { id: 10, name: 'COMB1', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
] as any;

describe('solveCombinations2D (multi-case batch path)', () => {
  beforeAll(async () => { await initSolver(); });

  it('returns perCase/perCombo/envelope with linear-superposition results', () => {
    const r = solveCombinations2D(beamModel(), cases, combos);
    expect(typeof r).not.toBe('string');
    if (typeof r === 'string' || !r) return;
    expect(r.perCase.size).toBe(2);
    expect(r.perCombo.size).toBe(1);
    // Case D (fz=-10 @ tip) → rz=+10 at the fixed end; case L (fx=+4) → rx=-4.
    const combo = r.perCombo.get(10)!;
    const reaction = combo.reactions.find(x => x.nodeId === 1)!;
    expect(reaction.rz).toBeCloseTo(1.2 * 10, 8);
    expect(reaction.rx).toBeCloseTo(1.6 * -4, 8);
    expect(r.envelope).toBeTruthy();
    expect(r.envelope.maxAbsResults).toBeTruthy();
    expect(r.envelope.moment).toBeTruthy();
  });

  it('per-case results match the per-case solve path', () => {
    const r = solveCombinations2D(beamModel(), cases, combos);
    if (typeof r === 'string' || !r) throw new Error('expected result bundle');
    for (const lc of cases as Array<{ id: number }>) {
      const model = beamModel();
      const direct = validateAndSolve2D({ ...model, loads: model.loads.filter(l => (l.data as any).caseId === lc.id) });
      if (typeof direct === 'string' || !direct) throw new Error('direct solve failed');
      const batched = r.perCase.get(lc.id)!;
      expect(batched.reactions.length).toBe(direct.reactions.length);
      for (let i = 0; i < direct.reactions.length; i++) {
        expect(batched.reactions[i].nodeId).toBe(direct.reactions[i].nodeId);
        expect(batched.reactions[i].rx).toBeCloseTo(direct.reactions[i].rx, 10);
        expect(batched.reactions[i].rz).toBeCloseTo(direct.reactions[i].rz, 10);
        expect(batched.reactions[i].my).toBeCloseTo(direct.reactions[i].my, 10);
      }
      expect(batched.displacements.length).toBe(direct.displacements.length);
      expect(batched.elementForces.length).toBe(direct.elementForces.length);
    }
  });

  it('constraint models still solve (guarded onto the per-case path)', () => {
    const model = beamModel();
    model.constraints = [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] } as any];
    const oneCase = [{ id: 1, type: 'D', name: 'Dead' }] as any;
    const oneCombo = [{ id: 10, name: 'C1', factors: [{ caseId: 1, factor: 1.4 }] }] as any;
    const r = solveCombinations2D(model, oneCase, oneCombo);
    expect(typeof r).not.toBe('string');
    if (typeof r === 'string' || !r) return;
    expect(r.perCase.size).toBe(1);
    expect(r.perCombo.size).toBe(1);
    const reaction = r.perCombo.get(10)!.reactions.find(x => x.nodeId === 1)!;
    expect(reaction.rz).toBeCloseTo(1.4 * 10, 8);
  });

  it('duplicate case names stay correct (id-keyed per-case path)', () => {
    const dupCases = [
      { id: 1, type: 'D', name: 'Same' },
      { id: 2, type: 'L', name: 'Same' },
    ] as any;
    const r = solveCombinations2D(beamModel(), dupCases, combos);
    expect(typeof r).not.toBe('string');
    if (typeof r === 'string' || !r) return;
    expect(r.perCase.size).toBe(2);
    const reaction = r.perCombo.get(10)!.reactions.find(x => x.nodeId === 1)!;
    expect(reaction.rz).toBeCloseTo(1.2 * 10, 8);
    expect(reaction.rx).toBeCloseTo(1.6 * -4, 8);
  });

  it('returns a string when there are no combinations', () => {
    expect(typeof solveCombinations2D(beamModel(), cases, [])).toBe('string');
  });

  it('returns a string for an unstable model (fallback reproduces the validation error)', () => {
    const model = beamModel();
    model.supports = new Map([[1, { id: 1, nodeId: 1, type: 'rollerX' } as any]]);
    expect(typeof solveCombinations2D(model, cases, combos)).toBe('string');
  });

  it('returns a string for an empty model', () => {
    const model = beamModel();
    model.nodes = new Map();
    model.elements = new Map();
    expect(typeof solveCombinations2D(model, cases, combos)).toBe('string');
  });
});
