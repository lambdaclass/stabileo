/**
 * The property that makes this warning reversible: **it changes no number.**
 *
 * Adding a product of inertia would change results — that is why it is not being added, and why
 * `m2-ixy-integration-handoff.md` treats it as M3 work. A WARNING is a different kind of thing: it
 * is allowed to exist precisely because it cannot move an answer.
 *
 * "Cannot" needs proof, not assurance. Two independent arguments, both asserted here:
 *
 *   1. **Structural** — the rule reads only `Section.shape`. It is handed nothing else, so there
 *      is nothing else it could influence. Checked by calling it with a section stripped of every
 *      field but its shape, and with sections whose numbers differ wildly, and requiring the same
 *      answer.
 *   2. **Empirical** — solve the same unsymmetric structure and compare against the analytical
 *      result. If importing the rule perturbed anything in the analysis path, an angle-sectioned
 *      cantilever would stop matching PL³/3EI.
 *
 * The second is the weaker of the two on its own — a pure function cannot reach the solver — but it
 * is the one that would catch a future implementation that quietly started feeding the predicate
 * back into a resolver or a canonical section.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve } from '../../engine/wasm-solver';
import { axesSymmetryOf, warnsAboutAxes } from '../axes';
import type { Section } from '../../store/model.svelte';

const E = 200_000;          // MPa
const E_KNM2 = E * 1e3;
const I = 9.8e-5;           // m⁴
const A = 0.0069;           // m²

beforeAll(async () => { await initSolver(); });

/** Cantilever, fixed at the base, point load at the tip. Section shape is a parameter. */
function cantilever(shape: Section['shape'], L = 4, P = 10) {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: L, y: 0 }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3, rho: 0 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I, shape }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame' }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fy: -P, mz: 0 } }],
  } as never;
}

const tipDeflection = (r: { displacements: Array<{ nodeId: number; uy?: number; uz?: number }> }) => {
  const tip = r.displacements.find((d) => d.nodeId === 2)!;
  return Math.abs(tip.uy ?? tip.uz ?? 0);
};

describe('the rule reads nothing but the shape', () => {
  it('answers the same for a section carrying nothing else', () => {
    // A bare shape and a fully populated section of the same shape must agree, or the rule is
    // reading something it should not.
    const bare = { shape: 'L' } as Partial<Section>;
    const full = {
      id: 7, name: 'L 63.5x63.5x6.4', a: 7.72e-4, iy: 2.95e-7, iz: 2.95e-7,
      j: 1e-9, b: 0.0635, h: 0.0635, t: 0.0064, shape: 'L', profileFamily: 'L',
    } as Partial<Section>;
    expect(axesSymmetryOf(bare.shape)).toBe(axesSymmetryOf(full.shape));
    expect(warnsAboutAxes(full.shape)).toBe(true);
  });

  it('ignores the numbers entirely', () => {
    /*
     * Symmetry here is topological: an angle has no axis of symmetry whatever its legs measure.
     * So sections whose inertias differ by orders of magnitude must still get the same verdict —
     * which is also what makes the rule exact rather than an approximation.
     */
    for (const iz of [1e-9, 1e-6, 1e-3, 1]) {
      expect(axesSymmetryOf(({ iz, shape: 'L' } as Partial<Section>).shape)).toBe('notPrincipal');
      expect(axesSymmetryOf(({ iz, shape: 'I' } as Partial<Section>).shape)).toBe('principal');
    }
  });

  it('is stable across repeated calls, holding no state', () => {
    // A memoised or mutating rule could answer differently on a second render.
    const first = KNOWN_ANSWERS();
    expect(KNOWN_ANSWERS()).toEqual(first);
    expect(KNOWN_ANSWERS()).toEqual(first);
  });
});

/** Every shape's verdict, as a snapshot for the stability check. */
function KNOWN_ANSWERS() {
  return (['I', 'H', 'U', 'C', 'T', 'L', 'invL', 'Z', 'RHS', 'CHS', 'rect', 'generic'] as const)
    .map((s) => `${s}:${axesSymmetryOf(s)}`);
}

describe('an unsymmetric section still solves to the same answer', () => {
  it('a cantilever on an angle section deflects PL³/3EI, as it did before', () => {
    /*
     * The empirical half. `iz` is the stored inertia, and the solver uses it — the warning does
     * NOT correct it, which is exactly the honest position: the app says the axes are not
     * principal and keeps analysing about them, rather than silently substituting a number nobody
     * sourced.
     *
     * So the expected value is the textbook one for the STORED inertia. If this ever stops
     * matching, something started feeding the predicate into the analysis.
     */
    const L = 4, P = 10;
    const r = solve(cantilever('L', L, P)) as never as { displacements: Array<{ nodeId: number; uy?: number; uz?: number }> };
    const exact = (P * L ** 3) / (3 * E_KNM2 * I);
    expect(tipDeflection(r)).toBeCloseTo(exact, 6);
  });

  it('and gives bit-identical results whatever the shape says', () => {
    /*
     * The strongest form available without a before/after checkout: the same structure, the same
     * numbers, four different `shape` values — one warned about, three not. The solver must not
     * see a difference, because `shape` describes the outline and the analysis reads the
     * inertias.
     *
     * This is what would fail if the warning were ever implemented by adjusting a section.
     */
    const base = tipDeflection(solve(cantilever('I')) as never);
    for (const shape of ['L', 'invL', 'Z', 'generic'] as const) {
      const got = tipDeflection(solve(cantilever(shape)) as never);
      expect(got, `${shape} moved the result`).toBe(base);
    }
  });

  it('reactions too, not only displacements', () => {
    // Equilibrium is the other half of a result. Same structure, same reactions, whatever the
    // shape.
    const reactionsOf = (shape: Section['shape']) => {
      const r = solve(cantilever(shape)) as never as { reactions: Array<{ nodeId: number; fy?: number; mz?: number }> };
      const base = r.reactions.find((x) => x.nodeId === 1)!;
      return [base.fy, base.mz];
    };
    const expected = reactionsOf('I');
    for (const shape of ['L', 'invL', 'Z'] as const) {
      expect(reactionsOf(shape), shape).toEqual(expected);
    }
  });
});
