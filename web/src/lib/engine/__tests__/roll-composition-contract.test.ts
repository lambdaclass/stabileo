/**
 * `element.rollAngle + section.rotation` is INTENDED, and this pins it as such.
 *
 * ── Why this test exists ───────────────────────────────────────────
 *
 * While writing the shed generator I emitted an explicit profile rotation to BOTH fields
 * and got twice the rotation I asked for. The reflex is to call that a solver defect. It
 * is not: `buildSolverInput3D` composes the two deliberately — the comment beside it says
 * so — and `computeLocalAxes3D` then applies the sum once. A section rotated 30° carrying
 * a member rolled 15° really is at 45°, and any other answer would make the two fields
 * unable to coexist.
 *
 * The defect was in the caller, which set both to mean one thing. The generator now writes
 * orientation to the element and never to the section.
 *
 * So rather than leave that as a paragraph in a commit message, the composition is written
 * down as a contract. If a future change makes the boundary stop composing them, this fails
 * and whoever reads it learns that the sum is the intent — not that they have found a bug.
 *
 * Nothing here touches Rust, WASM or the solver kernel. It exercises the JS boundary that
 * assembles the solver input, which is where the composition lives.
 */

import { describe, it, expect } from 'vitest';
import { buildSolverInput3D } from '../solver-service';

/** The smallest model `buildSolverInput3D` will accept: two nodes, one member, one support. */
function oneMember(rollAngle?: number, rotation?: number) {
  return {
    nodes: new Map<number, any>([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 4, y: 0, z: 0 }],
    ]),
    elements: new Map<number, any>([
      [1, {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
        releaseI: { my: false, mz: false, t: false },
        releaseJ: { my: false, mz: false, t: false },
        ...(rollAngle !== undefined ? { rollAngle } : {}),
      }],
    ]),
    materials: new Map<number, any>([[1, { id: 1, name: 'Acero', e: 200000, nu: 0.3, rho: 78.5 }]]),
    sections: new Map<number, any>([[1, {
      id: 1, name: 'seccion generica', a: 1e-3, iz: 1e-6, iy: 2e-6, j: 1e-8,
      ...(rotation !== undefined ? { rotation } : {}),
    }]]),
    supports: new Map<number, any>([[1, { id: 1, nodeId: 1, type: 'fixed3d' }]]),
    loads: [],
    nodalLoads: new Map(),
    distributedLoads: new Map(),
    plates: new Map(),
    quads: new Map(),
    constraints: [],
    combinations: [],
    loadCases: [],
  } as any;
}

const rollOf = (model: any): number | undefined =>
  (buildSolverInput3D(model)?.elements.get(1) as { rollAngle?: number } | undefined)?.rollAngle;

describe('the solver input composes element roll with section rotation, on purpose', () => {
  it('passes an element roll through when the section is not rotated', () => {
    expect(rollOf(oneMember(30, undefined))).toBeCloseTo(30, 9);
  });

  it('passes a section rotation through when the element is not rolled', () => {
    expect(rollOf(oneMember(undefined, 30))).toBeCloseTo(30, 9);
  });

  it('ADDS them when both are set — this is the contract, not a defect', () => {
    expect(rollOf(oneMember(15, 30))).toBeCloseTo(45, 9);
    expect(rollOf(oneMember(90, 90))).toBeCloseTo(180, 9);
  });

  it('cancels them when they oppose, which is the same rule', () => {
    expect(rollOf(oneMember(45, -45))).toBeUndefined();
  });

  it('omits the field entirely when neither is set', () => {
    expect(rollOf(oneMember(undefined, undefined))).toBeUndefined();
  });

  /**
   * The caller-side rule this contract implies.
   *
   * A producer that means ONE rotation must write ONE field. The generators write the
   * element and leave `Section.rotation` alone — also because sections are shared per role,
   * so a rotation stored there moves every member using it.
   */
  it('is why a generator writes orientation to the element only', () => {
    const asGeneratorDoesIt = rollOf(oneMember(90, undefined));
    const theMistake = rollOf(oneMember(90, 90));
    expect(asGeneratorDoesIt).toBeCloseTo(90, 9);
    expect(theMistake).toBeCloseTo(180, 9);
    expect(theMistake).not.toBeCloseTo(asGeneratorDoesIt!, 6);
  });
});
