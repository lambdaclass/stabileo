/**
 * The statics check, against cases whose answer is known before the code runs.
 *
 * Every model here is small enough to solve on paper, so a failure points at this
 * function and not at a fixture. The last two are the ones that matter: a residual has
 * to appear when the two sides genuinely disagree, and the self-weight case has to
 * balance, because a check that cries wolf on a correct model gets switched off.
 */
import { describe, it, expect } from 'vitest';
import { staticsCheck, type StaticsCheckInput } from '../statics-check';

type M = StaticsCheckInput['model'];

/** 10 m simply supported beam along X, one material and one section. */
function beam(loads: unknown[], opts: { rho?: number; a?: number } = {}): M {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 10, y: 0, z: 0 }],
    ]),
    elements: new Map([
      [1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
    ]),
    materials: new Map([[1, { id: 1, rho: opts.rho ?? 0 }]]),
    sections: new Map([[1, { id: 1, a: opts.a ?? 0 }]]),
    loads,
  } as unknown as M;
}

const run = (model: M, reactions: unknown[], selfWeight = false) =>
  staticsCheck({
    model,
    reactionsByCase: new Map([[null, reactions as never]]),
    includeSelfWeight: selfWeight,
  })[0]!;

describe('statics check', () => {
  it('a point load at midspan is balanced by two equal reactions', () => {
    const row = run(
      beam([{ type: 'pointOnElement3d', data: { id: 1, elementId: 1, a: 5, py: 0, pz: -10 } }]),
      [
        { nodeId: 1, fx: 0, fy: 0, fz: 5, mx: 0, my: 0, mz: 0 },
        { nodeId: 2, fx: 0, fy: 0, fz: 5, mx: 0, my: 0, mz: 0 },
      ],
    );
    expect(row.applied.fz).toBeCloseTo(-10, 9);
    expect(row.difference.fz).toBeCloseTo(0, 9);
    expect(row.worstRelative).toBeLessThan(1e-9);
    expect(row.uncovered).toEqual([]);
  });

  it('takes moments about the origin, so an off-centre load needs unequal reactions', () => {
    // 10 kN down at x = 2.5 → reactions 7.5 and 2.5. Equal reactions would balance the
    // forces and fail the moments, which is exactly what this asserts.
    const row = run(
      beam([{ type: 'pointOnElement3d', data: { id: 1, elementId: 1, a: 2.5, py: 0, pz: -10 } }]),
      [
        { nodeId: 1, fx: 0, fy: 0, fz: 7.5, mx: 0, my: 0, mz: 0 },
        { nodeId: 2, fx: 0, fy: 0, fz: 2.5, mx: 0, my: 0, mz: 0 },
      ],
    );
    // M = r × F with r = (2.5, 0, 0) and F = (0, 0, −10) gives My = +25, not −25.
    // Writing the minus was this test's first draft; the assertion caught it.
    expect(row.applied.my).toBeCloseTo(25, 9);
    expect(row.difference.fz).toBeCloseTo(0, 9);
    expect(row.difference.my).toBeCloseTo(0, 9);

    const wrong = run(
      beam([{ type: 'pointOnElement3d', data: { id: 1, elementId: 1, a: 2.5, py: 0, pz: -10 } }]),
      [
        { nodeId: 1, fx: 0, fy: 0, fz: 5, mx: 0, my: 0, mz: 0 },
        { nodeId: 2, fx: 0, fy: 0, fz: 5, mx: 0, my: 0, mz: 0 },
      ],
    );
    expect(wrong.difference.fz).toBeCloseTo(0, 9);
    expect(Math.abs(wrong.difference.my)).toBeGreaterThan(1);
    expect(wrong.worstRelative).toBeGreaterThan(0.1);
  });

  it('a uniform load carries q·L, and a triangular one two thirds along', () => {
    const uniform = run(
      beam([{ type: 'distributed3d', data: { id: 1, elementId: 1, qYI: 0, qYJ: 0, qZI: -4, qZJ: -4 } }]),
      [
        { nodeId: 1, fx: 0, fy: 0, fz: 20, mx: 0, my: 0, mz: 0 },
        { nodeId: 2, fx: 0, fy: 0, fz: 20, mx: 0, my: 0, mz: 0 },
      ],
    );
    expect(uniform.applied.fz).toBeCloseTo(-40, 9);
    expect(uniform.applied.my).toBeCloseTo(200, 9); // −40 kN at x = 5 → My = +200
    expect(uniform.worstRelative).toBeLessThan(1e-9);

    // 0 at I to −6 at J: total −30, acting at x = 20/3.
    const tri = run(
      beam([{ type: 'distributed3d', data: { id: 1, elementId: 1, qYI: 0, qYJ: 0, qZI: 0, qZJ: -6 } }]),
      [{ nodeId: 1, fx: 0, fy: 0, fz: 30, mx: 0, my: 0, mz: 0 }],
    );
    expect(tri.applied.fz).toBeCloseTo(-30, 9);
    expect(tri.applied.my).toBeCloseTo(200, 6); // −30 kN at x = 20/3
  });

  it('a partial load is placed over its own span, not the whole member', () => {
    // −5 kN/m over x ∈ [2, 6]: 20 kN at x = 4.
    const row = run(
      beam([{ type: 'distributed3d', data: { id: 1, elementId: 1, qYI: 0, qYJ: 0, qZI: -5, qZJ: -5, a: 2, b: 6 } }]),
      [{ nodeId: 1, fx: 0, fy: 0, fz: 20, mx: 0, my: 0, mz: 0 }],
    );
    expect(row.applied.fz).toBeCloseTo(-20, 9);
    expect(row.applied.my).toBeCloseTo(80, 9); // −20 kN at x = 4
  });

  it('self-weight is added the way the solve adds it, so a correct model still balances', () => {
    // ρ = 25 kN/m³, A = 0.1 m², L = 10 → 25 kN total, half at each end.
    const row = run(beam([], { rho: 25, a: 0.1 }), [
      { nodeId: 1, fx: 0, fy: 0, fz: 12.5, mx: 0, my: 0, mz: 0 },
      { nodeId: 2, fx: 0, fy: 0, fz: 12.5, mx: 0, my: 0, mz: 0 },
    ], true);
    expect(row.applied.fz).toBeCloseTo(-25, 9);
    expect(row.difference.fz).toBeCloseTo(0, 9);
    expect(row.selfWeightIncluded).toBe(true);
    expect(row.worstRelative).toBeLessThan(1e-9);
  });

  it('the weight of a removed member leaves with it, and the table says so in one line', () => {
    // The case that motivated this: solved with self-weight, then a member is gone. The
    // reactions still carry the old weight, so the residual is the member's own — and it
    // is visible as a number instead of costing an afternoon.
    const before = run(beam([], { rho: 25, a: 0.1 }), [
      { nodeId: 1, fx: 0, fy: 0, fz: 12.5, mx: 0, my: 0, mz: 0 },
      { nodeId: 2, fx: 0, fy: 0, fz: 12.5, mx: 0, my: 0, mz: 0 },
    ], true);
    expect(before.difference.fz).toBeCloseTo(0, 9);

    const stripped = beam([], { rho: 25, a: 0.1 });
    (stripped.elements as Map<number, unknown>).clear();
    const after = staticsCheck({
      model: stripped,
      reactionsByCase: new Map([[null, [
        { nodeId: 1, fx: 0, fy: 0, fz: 12.5, mx: 0, my: 0, mz: 0 },
        { nodeId: 2, fx: 0, fy: 0, fz: 12.5, mx: 0, my: 0, mz: 0 },
      ] as never]]),
      includeSelfWeight: true,
    })[0]!;
    expect(after.applied.fz).toBeCloseTo(0, 9);
    expect(after.difference.fz).toBeCloseTo(25, 9); // the member's whole weight
  });

  it('names what it did not sum instead of reporting a clean balance it did not check', () => {
    const row = run(
      beam([{ type: 'surface3d', data: { id: 1, quadId: 1, pressure: -3 } }]),
      [{ nodeId: 1, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }],
    );
    expect(row.uncovered).toContain('surface3d');
  });

  it('thermal actions are excluded by definition, not left uncovered', () => {
    const row = run(
      beam([{ type: 'thermal', data: { id: 1, elementId: 1, deltaT: 30 } }]),
      [{ nodeId: 1, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }],
    );
    expect(row.uncovered).toEqual([]);
    expect(row.worstRelative).toBeLessThan(1e-9);
  });

  it('separates the load cases, and a load with no case belongs to all of them', () => {
    const model = beam([
      { type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0, caseId: 1 } },
      { type: 'nodal3d', data: { id: 2, nodeId: 2, fx: 0, fy: 0, fz: -4, mx: 0, my: 0, mz: 0, caseId: 2 } },
    ]);
    const rows = staticsCheck({
      model,
      reactionsByCase: new Map([
        [1, [{ nodeId: 1, fx: 0, fy: 0, fz: 10, mx: 0, my: 0, mz: 0 }] as never],
        [2, [{ nodeId: 1, fx: 0, fy: 0, fz: 4, mx: 0, my: 0, mz: 0 }] as never],
      ]),
      includeSelfWeight: false,
      caseNames: new Map([[1, 'Dead'], [2, 'Live']]),
    });
    expect(rows.map((r) => r.caseName)).toEqual(['Dead', 'Live']);
    expect(rows[0]!.applied.fz).toBeCloseTo(-10, 9);
    expect(rows[1]!.applied.fz).toBeCloseTo(-4, 9);
    expect(rows.every((r) => Math.abs(r.difference.fz) < 1e-9)).toBe(true);
  });
});

describe('signed line loads and legacy case membership', () => {
  it.each([[0, 10, 4], [2, 8, 4], [2, 8, -4]])('keeps a pure couple over [%s,%s] with end intensity %s', (a, b, q) => {
    // Integral of x*q(x) over the loaded interval is q*(b-a)^2/6.
    const moment = q * (b - a) ** 2 / 6;
    const row = run(beam([{ type: 'distributed3d', data: {
      id: 1, elementId: 1, qYI: -q, qYJ: q, qZI: -q, qZJ: q, a, b,
    } }]), [{ nodeId: 1, fx: 0, fy: 0, fz: 0, mx: 0, my: moment, mz: -moment }]);
    expect(row.applied.fy).toBeCloseTo(0, 10);
    expect(row.applied.fz).toBeCloseTo(0, 10);
    expect(row.applied.my).toBeCloseTo(-moment, 10);
    expect(row.applied.mz).toBeCloseTo(moment, 10);
    expect(row.worstRelative).toBeLessThan(1e-9);
  });

  it('retains the moment when the resultant is nearly zero', () => {
    const row = run(beam([{ type: 'distributed3d', data: {
      id: 1, elementId: 1, qYI: 0, qYJ: 0, qZI: -4, qZJ: 4 + 1e-13,
    } }]), []);
    expect(row.applied.fz).toBeCloseTo(0, 10);
    expect(row.applied.my).toBeCloseTo(-200 / 3, 10);
  });

  it('assigns legacy loads only to case 1 and includes every load in a single solve', () => {
    const model = beam([
      { type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } },
      { type: 'nodal3d', data: { id: 2, caseId: 2, nodeId: 2, fx: 0, fy: 0, fz: -3, mx: 0, my: 0, mz: 0 } },
    ]);
    const rows = staticsCheck({ model, reactionsByCase: new Map([[1, []], [2, []], [null, []]]), includeSelfWeight: false });
    expect(rows.map(r => r.applied.fz)).toEqual([-10, -3, -13]);
  });
});
