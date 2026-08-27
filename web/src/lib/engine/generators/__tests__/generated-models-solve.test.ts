/**
 * A generated structure is a SOLVABLE structure.
 *
 * ── The risk this covers ───────────────────────────────────────────
 *
 * The failure mode of a geometry generator is not a wrong number, it is a mechanism: a web
 * that leaves a node free to rotate, a lacing pattern that does not brace its own plane, a
 * truss whose end post was dropped and whose bearing is now a hinge on a pin. None of the
 * topology tests can see that — they check symmetry, counts and coordinates, all of which a
 * mechanism satisfies perfectly. Only the solver can see it.
 *
 * So each generator is run, given ONE load, and solved with the real WASM solver. A
 * mechanism comes back as a singular system or a displacement large enough to be nonsense;
 * a sound structure comes back with finite displacements and reactions that balance the
 * applied load.
 *
 * ── Why the load has to be added here ──────────────────────────────
 *
 * `emitModel` emits `loads: []` and `loadCases: []` on purpose — a generator states geometry
 * and asserts nothing about actions. And `solveCombinations3D` returns `svc.noLoadsApplied`
 * with no load cases, which is why pressing Solve on a freshly generated model reports no
 * results. That is the app behaving correctly on both counts, and it is the reason this test
 * supplies the load rather than expecting the generator to.
 */

import { describe, it, expect } from 'vitest';
import { WEB_PATTERNS, generateTruss, type TrussParams } from '../truss-topology';
import { generateLatticeColumn } from '../lattice-column';
import { generateShed, DEFAULT_SHED_PARAMS } from '../shed';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../emit';
import { modelFromFixture, assertRealSolver } from '../../design/__tests__/helpers';
import { validateAndSolve3D } from '../../solver-service';

const PROFILES: EmitOptions['profiles'] = {
  chord: defaultProfileSpec('IPE 100'),
  post: defaultProfileSpec('L 50x50x5'),
  diagonal: defaultProfileSpec('L 50x50x5'),
  rafter: defaultProfileSpec('IPE 200'),
  column: defaultProfileSpec('HEB 160'),
  beam: defaultProfileSpec('IPE 200'),
  purlin: defaultProfileSpec('UPN 100'),
};

/**
 * Solve a generated model under self-weight plus one downward nodal load.
 *
 * Self-weight alone would do, but an explicit load makes the equilibrium check meaningful:
 * a known force in, a known reaction total out.
 */
function solveGenerated(json: Record<string, unknown>, loadedNodeId: number, fzKn: number) {
  assertRealSolver();
  const withLoad = {
    ...json,
    loadCases: [{ id: 1, type: 'dead', name: 'D' }],
    loads: [{
      type: 'nodal3d',
      data: { id: 1, nodeId: loadedNodeId, fx: 0, fy: 0, fz: fzKn, mx: 0, my: 0, mz: 0, caseId: 1 },
    }],
  };
  const fm = modelFromFixture(withLoad);
  const res = validateAndSolve3D(fm.model, false, false);
  return { res, model: fm.model };
}

/** The node highest above the ground — where a roof load would actually arrive. */
function highestNode(json: any): number {
  return json.nodes.reduce((best: any, n: any) => (n.z > best.z ? n : best), json.nodes[0]).id;
}

describe('a generated truss solves', () => {
  it('returns finite displacements rather than a mechanism', () => {
    const g = emitModel(generateTruss({ panelsPerHalf: 5 }), { name: 'Cercha', profiles: PROFILES });
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -20);

    // A string is how this path reports a refusal (`svc.noLoadsApplied`, singular system…).
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
    expect(r.displacements.length).toBeGreaterThan(0);
    for (const d of r.displacements) {
      expect(Number.isFinite(d.ux) && Number.isFinite(d.uy) && Number.isFinite(d.uz)).toBe(true);
      // A metre of movement on a 10 m truss under 20 kN is a mechanism, not a deflection.
      expect(Math.hypot(d.ux, d.uy, d.uz)).toBeLessThan(0.5);
    }
  });

  it('carries the applied load down to its supports', () => {
    const g = emitModel(generateTruss({ panelsPerHalf: 5 }), { name: 'Cercha', profiles: PROFILES });
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -20);
    const r = res as { reactions: Array<{ fz?: number }> };
    const totalFz = r.reactions.reduce((s, x) => s + (x.fz ?? 0), 0);
    // Upward reactions must at least carry the 20 kN applied; self-weight is off here, so
    // the sum is the applied load to within solver tolerance.
    expect(totalFz).toBeGreaterThan(19.5);
    expect(totalFz).toBeLessThan(20.5);
  });

  it.each(['trapezoidal', 'parallelChord', 'pratt', 'arch'] as Array<TrussParams['kind']>)(
    'holds up as a %s',
    (kind) => {
      const g = emitModel(
        generateTruss({ kind, riseM: 2, panelsPerHalf: 4 }),
        { name: kind, profiles: PROFILES },
      );
      const { res } = solveGenerated(g.json as never, highestNode(g.json), -10);
      expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
      const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
      for (const d of r.displacements) {
        expect(Math.hypot(d.ux, d.uy, d.uz)).toBeLessThan(0.5);
      }
    },
  );

  /*
   * Every web pattern, and the subdivided variant, on the solver.
   *
   * The geometry tests next door check that the diagonals lean the right way and that the
   * subdivision splits rather than crosses. Neither of those catches a mechanism, and a
   * mechanism is exactly what a new web pattern risks: Warren drops the interior posts, and
   * the subdivision introduces two nodes per panel whose only restraint is the members
   * deliberately added around them. A singular stiffness matrix comes back as a string here,
   * and an under-braced one shows up as a displacement no 24 m truss has under 10 kN.
   */
  it.each(WEB_PATTERNS)('holds up with a %s web', (webPattern) => {
    const g = emitModel(
      generateTruss({ kind: 'pratt', spanM: 24, depthM: 2, panelsPerHalf: 4, webPattern }),
      { name: webPattern, profiles: PROFILES },
    );
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -10);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
    for (const d of r.displacements) expect(Math.hypot(d.ux, d.uy, d.uz)).toBeLessThan(0.5);
  });

  it.each(WEB_PATTERNS)('holds up with a subdivided %s web', (webPattern) => {
    const g = emitModel(
      generateTruss({ kind: 'pratt', spanM: 24, depthM: 2, panelsPerHalf: 4, webPattern, subdivideDiagonals: true }),
      { name: `${webPattern}-sub`, profiles: PROFILES },
    );
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -10);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
    for (const d of r.displacements) expect(Math.hypot(d.ux, d.uy, d.uz)).toBeLessThan(0.5);
  });

  it('holds up as a monopitch', () => {
    const g = emitModel(
      generateTruss({ halfTruss: true, panelsPerHalf: 5 }),
      { name: 'Media cercha', profiles: PROFILES },
    );
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -10);
    expect(typeof res).not.toBe('string');
  });
});

describe('a generated lattice column solves', () => {
  it('stands up under a load on its head', () => {
    const g = emitModel(generateLatticeColumn({ divisions: 6 }), { name: 'Columna', profiles: PROFILES });
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -50);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
    for (const d of r.displacements) {
      expect(Number.isFinite(d.uz)).toBe(true);
      expect(Math.hypot(d.ux, d.uy, d.uz)).toBeLessThan(0.5);
    }
  });
});

describe('a generated shed solves', () => {
  it('is not a mechanism at 3 frames with a roof and purlins', () => {
    const shed = generateShed({
      ...DEFAULT_SHED_PARAMS, frames: 3, roof: true, purlins: true, longitudinalBeams: true,
    });
    const g = emitModel(shed, { name: 'Nave', profiles: PROFILES });
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -15);

    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
    expect(r.displacements.length).toBeGreaterThan(100);
    for (const d of r.displacements) {
      expect(Number.isFinite(d.ux) && Number.isFinite(d.uy) && Number.isFinite(d.uz)).toBe(true);
    }
  });

  it('stands with solid columns and no roof, on the head beam alone', () => {
    // The case the head beam exists for: without it the two columns are cantilevers, and
    // with pinned bases that would be a mechanism in the frame plane.
    const shed = generateShed({
      ...DEFAULT_SHED_PARAMS, frames: 2, columnKind: 'solid',
      roof: false, purlins: false, longitudinalBeams: true, fixedBase: true,
    });
    const g = emitModel(shed, { name: 'Portico', profiles: PROFILES });
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -10);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
  });
});

describe('the configuration that is NOT stable, recorded rather than hidden', () => {
  /**
   * This used to assert the opposite, and the reason it changed is worth more than the test.
   *
   * The claim was: latticed columns on pinned bases are a mechanism, because the lacing braces
   * the column in its own plane and a pin under each chord leaves the pair free to fold
   * sideways. The singular matrix that backed it was real. Its CAUSE was not the pins.
   *
   * The cap tying the two chord tops was built from two `truss` members, and those two members
   * are COLLINEAR. A pair of pin-ended collinear bars restrains their node along one line and
   * in no other direction, so the cap node had no transverse and no rotational stiffness — on
   * fixed bases just as much as on pinned ones. The default shed was a mechanism at every frame
   * count from 2 to 7, and nothing here caught it because the only test that solved a shed
   * passed `longitudinalBeams: true`, which the default does not.
   *
   * With the cap modelled as the rigid plate its own doc comment always said it was, this
   * configuration solves. So the recorded property is inverted, and the pins are exonerated.
   *
   * What is NOT claimed: that pinned bases are as good as fixed. This solves one vertical load
   * case. Base fixity earns its default from lateral behaviour, which nothing here measures —
   * see the handoff's note on longitudinal bracing.
   */
  it('latticed columns on pinned bases stand once the cap is a plate and not two pins', () => {
    const shed = generateShed({
      ...DEFAULT_SHED_PARAMS, frames: 3, roof: true, purlins: true,
      fixedBase: false, column: { ...DEFAULT_SHED_PARAMS.column, fixedBase: false },
    });
    // The caution still travels with the model: this configuration has no longitudinal
    // bracing, which is a real gap even though it is not a mechanism.
    expect(shed.assumptions).toContain('generator.assume.latticeBasesPinnedNoOutOfPlane');

    const g = emitModel(shed, { name: 'Nave articulada', profiles: PROFILES });
    const { res } = solveGenerated(g.json as never, highestNode(g.json), -10);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
    // A displacement bound, not just `isFinite`. The near-singular state this replaces
    // returned 2·10^11 m and satisfied `isFinite` perfectly — which is how it survived.
    const max = Math.max(...r.displacements.map((d) => Math.hypot(d.ux, d.uy, d.uz)));
    expect(max).toBeLessThan(0.05);
  });

  it('and the default does not, which is the whole reason for the default', () => {
    const shed = generateShed({ ...DEFAULT_SHED_PARAMS, frames: 3, roof: true, purlins: true });
    expect(shed.assumptions).not.toContain('generator.assume.latticeBasesPinnedNoOutOfPlane');
  });
});

describe('what a freshly generated model does NOT have', () => {
  it('has no load case, so the app is right to report no results until one is added', () => {
    const g = emitModel(generateTruss(), { name: 'x', profiles: PROFILES });
    expect(g.json.loadCases).toEqual([]);
    expect(g.json.loads).toEqual([]);
    // Which is exactly why `solveGenerated` above supplies one: `solveCombinations3D`
    // returns `svc.noLoadsApplied` with none, and that is correct behaviour, not a defect
    // in the generator.
  });
});
