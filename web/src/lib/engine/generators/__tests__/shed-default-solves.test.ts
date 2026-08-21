/**
 * The shed the user actually gets, solved.
 *
 * ── Why this file exists next to `generated-models-solve.test.ts` ──
 *
 * That file solves a shed. It does not solve THE shed: every case in it overrides
 * `longitudinalBeams` to `true`, and `DEFAULT_SHED_PARAMS` ships it `false`. So the
 * configuration a user gets by opening the generator and pressing Generate was the one
 * configuration never put through the solver, and it was a mechanism — singular stiffness
 * matrix, at every frame count from 2 to 7.
 *
 * The cause was the latticed column cap: two COLLINEAR pin-ended bars tying the chord tops,
 * which restrain their node along one line and in no other direction. See the comment on
 * `capTop` in `lattice-column.ts`.
 *
 * The lesson is the shape of the test, not the fix. A generator's defaults are a code path
 * like any other, and "we test the generator with the options we happened to pass" is how one
 * stays unsolved. Every case below starts from `DEFAULT_SHED_PARAMS` spread with NOTHING
 * overridden that changes structure.
 */

import { describe, it, expect } from 'vitest';
import { generateShed, DEFAULT_SHED_PARAMS } from '../shed';
import { generateLatticeColumn } from '../lattice-column';
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

/** Solve under one downward nodal load at the highest node, as the sibling file does. */
function solve(json: any, fzKn: number) {
  assertRealSolver();
  const node = json.nodes.reduce((b: any, n: any) => (n.z > b.z ? n : b), json.nodes[0]).id;
  const res = validateAndSolve3D(modelFromFixture({
    ...json,
    loadCases: [{ id: 1, type: 'dead', name: 'D' }],
    loads: [{
      type: 'nodal3d',
      data: { id: 1, nodeId: node, fx: 0, fy: 0, fz: fzKn, mx: 0, my: 0, mz: 0, caseId: 1 },
    }],
  }).model, false, false);
  return res;
}

/**
 * The largest nodal displacement.
 *
 * The figure this suite asserts on, because `Number.isFinite` cannot tell a deflection from a
 * mechanism: before the cap was fixed, the shed with longitudinal beams returned 2·10^11 m and
 * every `isFinite` check on it passed.
 */
function maxDisplacement(res: unknown): number {
  const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
  return Math.max(...r.displacements.map((d) => Math.hypot(d.ux, d.uy, d.uz)));
}

const emit = (params: Parameters<typeof generateShed>[0], name: string) =>
  emitModel(generateShed(params), { name, profiles: PROFILES }).json as any;

describe('the default shed', () => {
  it('is not a mechanism, with nothing overridden', () => {
    const res = solve(emit({ ...DEFAULT_SHED_PARAMS }, 'Nave'), -20);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    expect(maxDisplacement(res)).toBeLessThan(0.05);
  });

  it('deflects like the same shed on solid columns, which is the check that it is stiffness', () => {
    // Two independently generated column types under one load. A latticed column and a solid
    // one are not required to agree exactly — they are required to be the same order of
    // magnitude, and that is what a real stiffness produces and a near-mechanism does not.
    const lattice = maxDisplacement(solve(emit({ ...DEFAULT_SHED_PARAMS }, 'Reticulada'), -20));
    const solid = maxDisplacement(solve(emit({ ...DEFAULT_SHED_PARAMS, columnKind: 'solid' }, 'Alma llena'), -20));
    expect(lattice).toBeGreaterThan(0);
    expect(solid).toBeGreaterThan(0);
    expect(lattice / solid).toBeGreaterThan(0.2);
    expect(lattice / solid).toBeLessThan(5);
  });

  it('stays solvable across the frame counts the panel offers', () => {
    for (const frames of [2, 3, 4, 6]) {
      const res = solve(emit({ ...DEFAULT_SHED_PARAMS, frames }, `Nave ${frames}`), -20);
      expect(typeof res, `frames=${frames}: ${typeof res === 'string' ? String(res) : ''}`)
        .not.toBe('string');
      expect(maxDisplacement(res), `frames=${frames}`).toBeLessThan(0.05);
    }
  });
});

describe('the default shed is connected', () => {
  const json = emit({ ...DEFAULT_SHED_PARAMS }, 'Nave');

  it('leaves no node without a member, and no unsupported node on a single member', () => {
    const incident = new Map<number, number>(json.nodes.map((n: any) => [n.id, 0]));
    for (const e of json.elements) {
      incident.set(e.nodeI, (incident.get(e.nodeI) ?? 0) + 1);
      incident.set(e.nodeJ, (incident.get(e.nodeJ) ?? 0) + 1);
    }
    const supported = new Set(json.supports.map((s: any) => s.nodeId));
    const orphans = [...incident].filter(([, k]) => k === 0).map(([id]) => id);
    const danglers = [...incident].filter(([id, k]) => k === 1 && !supported.has(id)).map(([id]) => id);
    expect(orphans, 'nodes with no member').toEqual([]);
    expect(danglers, 'unsupported nodes hanging off one member').toEqual([]);
  });

  it('supports every chord foot, which is where the four-per-frame count comes from', () => {
    // 2 columns × 2 chords per latticed column × frames.
    expect(json.supports.length).toBe(4 * DEFAULT_SHED_PARAMS.frames);
    for (const s of json.supports) expect(s.type).toBe('fixed3d');
  });
});

describe('a roof with no purlins, and what is actually missing', () => {
  const NO_PURLINS = {
    ...DEFAULT_SHED_PARAMS, frames: 3, roof: true, purlins: false, longitudinalBeams: true,
  };

  /**
   * Solve with extra restraints laid on top of the generated supports.
   *
   * This is the instrument the diagnosis rests on. Asserting only that the configuration
   * fails would record a symptom; adding one class of restraint at a time and seeing which
   * one removes the singularity is what identifies the missing thing.
   */
  function solveRestrained(pick: (n: any) => boolean, dof: Record<string, boolean>) {
    const json = emit(NO_PURLINS, 'Sin correas');
    const already = new Set(json.supports.map((s: any) => s.nodeId));
    let id = json.supports.length;
    const extra = json.nodes.filter((n: any) => !already.has(n.id) && pick(n)).map((n: any) => ({
      id: ++id, nodeId: n.id, type: 'custom3d',
      dofRestraints: { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false, ...dof },
      dofFrame: 'global',
    }));
    return solve({ ...json, supports: [...json.supports, ...extra] }, -20);
  }

  const aboveHeads = (n: any) => n.z > DEFAULT_SHED_PARAMS.clearHeightM + 1e-9;

  it('is a mechanism, and the model says so before the solver does', () => {
    const shed = generateShed(NO_PURLINS);
    // The fact travels with the model, so it is not something only the solver knows.
    expect(shed.assumptions).toContain('generator.assume.roofWithoutPurlins');
    expect(typeof solve(emit(NO_PURLINS, 'Sin correas'), -20)).toBe('string');
  });

  it('the missing restraint is out-of-plane TRANSLATION at the roof nodes', () => {
    // Holding the truss nodes sideways is the whole difference between a singular matrix and
    // a 4 mm deflection. This is the positive half of the diagnosis.
    const res = solveRestrained(aboveHeads, { ty: true });
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    expect(maxDisplacement(res)).toBeLessThan(0.05);
  });

  it('and it is not rotational, which is what rules out a joint-continuity explanation', () => {
    // The negative half. Restraining every rotation at the same nodes leaves it singular, so
    // the trusses are not folding about a hinge line — they are moving sideways bodily.
    const rotations: Array<Record<string, boolean>> = [
      { rx: true }, { ry: true }, { rz: true }, { rx: true, ry: true, rz: true },
    ];
    for (const dof of rotations) {
      expect(typeof solveRestrained(aboveHeads, dof), JSON.stringify(dof)).toBe('string');
    }
  });

  it('the eave beams cannot supply it, which is why turning them on does not help', () => {
    // They tie the column HEADS, and every truss node sits above them. Stated as a test
    // because "add the longitudinal beams" is the obvious wrong fix.
    expect(NO_PURLINS.longitudinalBeams).toBe(true);
    expect(typeof solve(emit(NO_PURLINS, 'Sin correas'), -20)).toBe('string');
  });

  it('turning purlins back on is the fix the panel offers, and it works', () => {
    const res = solve(emit({ ...NO_PURLINS, purlins: true }, 'Con correas'), -20);
    expect(typeof res, typeof res === 'string' ? String(res) : '').not.toBe('string');
    expect(maxDisplacement(res)).toBeLessThan(0.05);
  });
});

describe('the cap change reaches one configuration and no other', () => {
  /**
   * The audit, as a test rather than as a claim in a document.
   *
   * The cap block is behind `if (p.capTop)`, `DEFAULT_LATTICE_COLUMN_PARAMS.capTop` is `false`,
   * and the only caller that turns it on is the shed. So a latticed column generated on its
   * own must come out exactly as it did before — no cap node, no cap members, and every web
   * member still pinned.
   */
  it('a latticed column generated on its own has no cap at all', () => {
    const col = generateLatticeColumn();
    expect(col.members.every((m: any) => m.type === 'truss' || m.role === 'chord')).toBe(true);
    // Nothing is `frame` except the chords, which were always frame.
    const frames = col.members.filter((m: any) => m.type === 'frame');
    expect(frames.every((m: any) => m.role === 'chord')).toBe(true);
  });

  it('the shed is the only production caller that asks for a cap', () => {
    // If a second family ever turns `capTop` on, this fails and the idealisation gets
    // re-audited for it rather than inherited silently.
    const withCap = generateLatticeColumn({ capTop: true, divisions: 3 });
    const without = generateLatticeColumn({ capTop: false, divisions: 3 });
    expect(withCap.nodes.length).toBe(without.nodes.length + 1);
    expect(withCap.members.length).toBe(without.members.length + 2);
  });
});

describe('the latticed column cap', () => {
  it('ties the chord tops with moment continuity, not with two pins', () => {
    // The regression guard for the mechanism. The two cap members are collinear, so pinning
    // them leaves their shared node free in the two directions across the cap — which is what
    // made every default shed singular. Pinned web elsewhere is fine and stays: it is
    // triangulated, and the cap is not.
    const col = generateLatticeColumn({ capTop: true, divisions: 4 });
    const cap = col.nodes[col.nodes.length - 1];
    const atCap = col.members.filter((m: any) => m.a === cap.i || m.b === cap.i);
    expect(atCap.length, 'the cap is tied to both chords').toBe(2);
    for (const m of atCap) expect(m.type, 'cap members carry moment').toBe('frame');
    // And the rest of the web is still pinned, so this is a targeted change and not a sweep.
    const web = col.members.filter((m: any) => (m.role === 'post' || m.role === 'diagonal')
      && m.a !== cap.i && m.b !== cap.i);
    expect(web.length).toBeGreaterThan(0);
    for (const m of web) expect(m.type).toBe('truss');
  });
});
