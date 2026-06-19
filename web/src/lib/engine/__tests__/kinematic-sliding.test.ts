/**
 * Kinematic Analysis must account for sliding joints.
 *
 * A sliding joint releases exactly ONE relative-translation continuity equation,
 * so it adds 1 to the internal-condition count c (degree drops by 1), regardless
 * of direction (global X/Z or member-local x/z). These tests pin that the
 * determinacy degree changes by the expected amount, that hinges and sliders
 * combine additively, that direction is count-irrelevant, and that the report
 * surfaces a per-slider explanation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver } from '../wasm-solver';
import { generateKinematicReport, type SlidingJointInput } from '../kinematic-report';
import type { SolverInput } from '../types';

/** 3-node, 2-frame beam: n1 fixed — n2 — n3 fixed. Baseline degree = 3·2+6−3·3 = 3. */
function frame3(hingeAtN2 = false): SolverInput {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, z: 0 }],
      [2, { id: 2, x: 2, z: 0 }],
      [3, { id: 3, x: 4, z: 0 }],
    ]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: hingeAtN2 }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
      [2, { id: 2, nodeId: 3, type: 'fixed' }],
    ]),
    loads: [],
  };
}
const slide = (elemId: number, end: 'I' | 'J', kind: 'x' | 'z', axis: 'global' | 'local' = 'global'): SlidingJointInput =>
  ({ elemId, end, kind, axis });

beforeAll(async () => { await initSolver(); });

describe('Kinematic Analysis — sliding joints', () => {
  it('baseline frame (no slider, no hinge) is unchanged: degree 3, c 0', () => {
    const r = generateKinematicReport(frame3())!;
    expect(r.degree).toBe(3);
    expect(r.totalC).toBe(0);
    expect(r.slideDetails).toHaveLength(0);
  });

  it('one sliding joint drops the degree by 1 and adds 1 to c', () => {
    const r = generateKinematicReport(frame3(), [slide(2, 'I', 'x')])!;
    expect(r.degree).toBe(2);          // 3 → 2
    expect(r.totalC).toBe(1);
    expect(r.slideDetails).toHaveLength(1);
    expect(r.slideDetails[0].ci).toBe(1);
  });

  it('Sliding X and Sliding Z are both counted (degree drops by 2)', () => {
    const r = generateKinematicReport(frame3(), [slide(1, 'J', 'x'), slide(2, 'I', 'z')])!;
    expect(r.degree).toBe(1);          // 3 → 1
    expect(r.totalC).toBe(2);
    expect(r.slideDetails.map(s => s.kind).sort()).toEqual(['x', 'z']);
  });

  it('hinge + sliding joint combine additively in c', () => {
    // hinge at node 2 (element 1 end J): node has 2 frames, not rot-restrained → c_hinge = 1
    const r = generateKinematicReport(frame3(true), [slide(2, 'I', 'x')])!;
    expect(r.hingeDetails.length).toBeGreaterThan(0);
    expect(r.slideDetails).toHaveLength(1);
    expect(r.totalC).toBe(2);          // 1 hinge + 1 slider
    expect(r.degree).toBe(1);          // 3 − 1 − 1
  });

  it('local-axis sliding counts the same as global (only the number of releases matters)', () => {
    const g = generateKinematicReport(frame3(), [slide(2, 'I', 'x', 'global')])!;
    const l = generateKinematicReport(frame3(), [slide(2, 'I', 'x', 'local')])!;
    expect(l.degree).toBe(g.degree);   // direction-independent count
    expect(l.totalC).toBe(g.totalC);
    expect(l.slideDetails[0].axis).toBe('local');
  });

  it('the report surfaces a per-slider explanation mentioning its contribution', () => {
    const r = generateKinematicReport(frame3(), [slide(2, 'I', 'z', 'local')])!;
    const ex = r.slideDetails[0].explanation;
    expect(ex).toMatch(/2/);           // member id
    expect(ex).toMatch(/c \+= 1|c \+=1/); // the +1 contribution
  });
});
