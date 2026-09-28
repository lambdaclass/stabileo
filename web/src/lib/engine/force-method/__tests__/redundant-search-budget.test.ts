/**
 * The fallback search for redundants runs in the click handler of the
 * force-method wizard, one dense solve per complete set it checks. With a
 * fixed ceiling of 4000 sets, a model near the step-by-step limits (GH = 30,
 * 354 DOFs) that the greedy pass could not close froze the page for about ten
 * seconds before answering `noRedundants`. The ceiling is now a budget in
 * work, scaled by the size of the solve.
 */
import { describe, it, expect } from 'vitest';
import type { SolverInput, SolverLoad } from '../../types';
import { solveForceMethod, FM_MAX_GH, chooseRedundants, restraintCarries, fallbackBudget } from '../solve';
import { candidates } from '../primary';
import { solveDetailed } from '../../solver-detailed';

/** A bays × storeys plane frame, fixed feet, every member split into `div` elements. */
function frame(bays: number, storeys: number, div: number, span = 5, h = 3, feet?: string[]): SolverInput {
  const nodes = new Map<number, { id: number; x: number; z: number }>();
  const elements = new Map<number, unknown>();
  const grid = (i: number, j: number) => j * (bays + 1) + i + 1;
  for (let j = 0; j <= storeys; j++) for (let i = 0; i <= bays; i++) {
    const id = grid(i, j);
    nodes.set(id, { id, x: i * span, z: j * h });
  }
  let nextNode = (bays + 1) * (storeys + 1) + 1;
  let nextElem = 1;
  const beams: number[] = [];
  const member = (a: number, b: number, isBeam: boolean) => {
    const A = nodes.get(a)!, B = nodes.get(b)!;
    let prev = a;
    for (let k = 1; k <= div; k++) {
      let cur = b;
      if (k < div) {
        cur = nextNode++;
        nodes.set(cur, { id: cur, x: A.x + ((B.x - A.x) * k) / div, z: A.z + ((B.z - A.z) * k) / div });
      }
      const id = nextElem++;
      elements.set(id, { id, type: 'frame', nodeI: prev, nodeJ: cur, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
      if (isBeam) beams.push(id);
      prev = cur;
    }
  };
  for (let j = 0; j < storeys; j++) for (let i = 0; i <= bays; i++) member(grid(i, j), grid(i, j + 1), false);
  for (let j = 1; j <= storeys; j++) for (let i = 0; i < bays; i++) member(grid(i, j), grid(i + 1, j), true);
  const supports = new Map<number, unknown>();
  for (let i = 0; i <= bays; i++) supports.set(i + 1, { id: i + 1, nodeId: grid(i, 0), type: feet?.[i] ?? 'fixed' });
  const loads: SolverLoad[] = [
    ...beams.map((elementId) => ({ type: 'distributed', data: { elementId, qI: -10, qJ: -10 } }) as SolverLoad),
    ...Array.from({ length: storeys }, (_, j) => ({ type: 'nodal', data: { nodeId: grid(0, j + 1), fx: 5, fz: 0, my: 0 } }) as SolverLoad),
  ];
  return {
    nodes,
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements, supports, loads,
  } as unknown as SolverInput;
}

describe('the redundant search is bounded by work, not by a fixed count', () => {
  it('small models keep the full search; the largest get a few hundred sets', () => {
    expect(fallbackBudget(36)).toBe(4000);
    expect(fallbackBudget(354)).toBe(200);
    expect(fallbackBudget(60)).toBeGreaterThan(200);
    expect(fallbackBudget(60)).toBeLessThan(4000);
  });

  it('a search nothing closes stops at the greedy pass plus the budget', () => {
    const input = frame(2, 5, 5);
    const d = solveDetailed(input);
    const cands = candidates(input, restraintCarries(d));
    let checks = 0;
    const got = chooseRedundants(cands, FM_MAX_GH, () => { checks++; return false; }, fallbackBudget(d.dofNumbering.nFree));
    expect(got).toBeNull();
    expect(checks).toBeLessThanOrEqual(cands.length + fallbackBudget(d.dofNumbering.nFree));
  });

  it('the models near the limits still solve, and agree with the stiffness method', () => {
    for (const input of [frame(2, 3, 1), frame(2, 5, 5), frame(1, 9, 4, 5, 3, ['fixed', 'rollerX'])]) {
      const r = solveForceMethod(input);
      expect(r.verification.ok).toBe(true);
    }
  });
});
