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
  bracing: defaultProfileSpec('L 50x50x5'),
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
  it('latticed columns on pinned bases stand with the wall, roof and vertical truss bracing', () => {
    const shed = generateShed({
      ...DEFAULT_SHED_PARAMS, frames: 3, roof: true, purlins: true,
      fixedBase: false, column: { ...DEFAULT_SHED_PARAMS.column, fixedBase: false },
    });
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

/*
 * A pointed truss (end depth 0) has its chords meeting at the bearing. The generator used to
 * leave two coincident nodes there, one per chord, and only the bottom one was supported: the
 * top chord and its web hung from nothing but the bottom chord, and the truss deflected several
 * times what it should. The reference below is the same truss wired by hand, with one node at
 * each bearing.
 */
describe('a pointed truss', () => {
  it('shares the bearing node between the chords and deflects like the truss wired by hand', () => {
    const topo = generateTruss({ kind: 'trapezoidal', spanM: 12, riseM: 1.2, endDepthM: 0, plateauM: 0, panelsPerHalf: 2, webPattern: 'pratt', halfTruss: false });
    const key = (n: { x: number; z: number }) => `${n.x.toFixed(6)},${n.z.toFixed(6)}`;
    expect(new Set(topo.nodes.map(key)).size).toBe(topo.nodes.length);

    const zTop = (x: number) => Math.max(...topo.nodes.filter((n) => Math.abs(n.x - x) < 1e-9).map((n) => n.z));
    const xs = [0, 3, 6, 9, 12];
    // b0..b4 on the bottom chord, then t1..t3 above the inner stations.
    const nodes = [...xs.map((x, i) => ({ i, x, y: 0, z: 0 })), ...[3, 6, 9].map((x, k) => ({ i: 5 + k, x, y: 0, z: zTop(x) }))];
    const chord = (a: number, b: number) => ({ a, b, role: 'chord' as const, type: 'frame' as const });
    const webM = (a: number, b: number, role: 'post' | 'diagonal') => ({ a, b, role, type: 'truss' as const });
    const members = [
      chord(0, 1), chord(1, 2), chord(2, 3), chord(3, 4),
      chord(0, 5), chord(5, 6), chord(6, 7), chord(7, 4),
      webM(1, 5, 'post'), webM(2, 6, 'post'), webM(3, 7, 'post'),
      // Pratt: descending toward midspan on both halves.
      webM(5, 2, 'diagonal'), webM(2, 7, 'diagonal'),
    ];
    // Both bearings hold the twist about the span: a lone planar truss on plain pins is free
    // to turn about the line through its supports, which is not what is being compared here.
    const supports = [{ node: 0, type: 'forkPinned' as const }, { node: 4, type: 'forkRollerX' as const }];
    const byHand = { ...topo, nodes, members, supports, counts: { ...topo.counts, chord: 8, post: 3, diagonal: 2 } };
    expect(topo.members.length).toBe(members.length);
    expect(topo.supports.filter((x) => x.type !== 'outOfPlane').map((x) => x.node)).toEqual([0, 4]);

    const midUz = (t: typeof topo) => {
      const g = emitModel(t, { name: 'p', profiles: PROFILES });
      const json = g.json as { nodes: Array<{ id: number; x: number; z: number }> };
      const mid = json.nodes.find((n) => Math.abs(n.x - 6) < 1e-9 && Math.abs(n.z) < 1e-9)!.id;
      const { res } = solveGenerated(json as never, mid, -20);
      expect(typeof res, String(res)).not.toBe('string');
      return (res as { displacements: Array<{ nodeId: number; uz: number }> }).displacements.find((d) => d.nodeId === mid)!.uz;
    };
    const generated = midUz({ ...topo, supports }), reference = midUz(byHand);
    expect(reference).toBeLessThan(0);
    expect(generated).toBeCloseTo(reference, 9);
  });

  it('leaves out the end diagonals that would lie on a chord, for every web', () => {
    for (const webPattern of WEB_PATTERNS) {
      const t = generateTruss({ kind: 'trapezoidal', spanM: 12, riseM: 1.2, endDepthM: 0, panelsPerHalf: 3, webPattern, subdivideDiagonals: true });
      const pair = (m: { a: number; b: number }) => [Math.min(m.a, m.b), Math.max(m.a, m.b)].join('-');
      expect(new Set(t.members.map(pair)).size, webPattern).toBe(t.members.length);
      for (const m of t.members) expect(m.a, webPattern).not.toBe(m.b);
    }
  });
});
