/**
 * The longitudinal load path, found by measurement and then built.
 *
 * ── What this file is about ────────────────────────────────────────
 *
 * PR21 solved the generated shed under a VERTICAL load and left it there. Under a load ALONG
 * the building the same shed returns 2.4·10^11 m — the signature that file's siblings were
 * written to catch: a mechanism wearing a number, not a singular matrix. So the shed had no
 * longitudinal load path at all, and nothing said so.
 *
 * The instrument is the one `shed-default-solves.test.ts` established: add one class of
 * restraint at a time and see which one removes the freedom. It answers immediately —
 * restraining translation along the building at every node ABOVE the eaves reduces the response
 * to exactly zero, while restraining the eave line itself changes nothing. The free body is the
 * roof, and the reason is structural rather than incidental: a planar truss with a pin-jointed
 * web has no out-of-plane stiffness, so the whole top chord, tied frame to frame by the purlins,
 * translates sideways as one piece.
 *
 * ── Why bracing the roof plane is not the fix ──────────────────────
 *
 * Diagonals between top-chord nodes triangulate the plane and leave the plane free to slide.
 * The path needs three elements, and the measurements below show each one's contribution by
 * removing it:
 *
 *   roof plane → vertical bracing between trusses → eave line → eave beams → braced wall → ground
 *
 * with the full system at 4.4 mm against the unbraced 2.4·10^11 m — eleven orders of magnitude,
 * which is what distinguishes a load path from a stiffer mechanism.
 *
 * ── The rule this file inherits ───────────────────────────────────
 *
 * `isFinite` is not an assertion of solvency. Every case here asserts a displacement BOUND, and
 * the negative cases assert a value large enough that no reader could mistake it for a
 * deflection. That is the lesson `pr21-lattice-cap-idealisation.md` §7 records, and the reason
 * the unbraced shed's 10^11 was invisible for a release.
 */

import { describe, it, expect } from 'vitest';
import { generateShed, DEFAULT_SHED_PARAMS, BRACING_BAYS } from '../shed';
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

const emit = (params: Parameters<typeof generateShed>[0], name: string) =>
  emitModel(generateShed(params), { name, profiles: PROFILES }).json as any;

/** One nodal load at the highest node, along the building unless told otherwise. */
function solve(json: any, kn: number, direction: 'y' | 'z' = 'y') {
  assertRealSolver();
  const node = json.nodes.reduce((b: any, n: any) => (n.z > b.z ? n : b), json.nodes[0]).id;
  return validateAndSolve3D(modelFromFixture({
    ...json,
    loadCases: [{ id: 1, type: 'dead', name: 'D' }],
    loads: [{
      type: 'nodal3d',
      data: {
        id: 1, nodeId: node, fx: 0,
        fy: direction === 'y' ? kn : 0,
        fz: direction === 'z' ? kn : 0,
        mx: 0, my: 0, mz: 0, caseId: 1,
      },
    }],
  }).model, false, false);
}

function maxDisplacement(res: unknown): number {
  const r = res as { displacements: Array<{ ux: number; uy: number; uz: number }> };
  return Math.max(...r.displacements.map((d) => Math.hypot(d.ux, d.uy, d.uz)));
}

/** Displacement, or `null` when the solver refused the model as a mechanism. */
function displacementOf(json: any, kn: number, direction: 'y' | 'z' = 'y'): number | null {
  const res = solve(json, kn, direction);
  return typeof res === 'string' ? null : maxDisplacement(res);
}

/** The three elements of the path, all on. */
const FULL = {
  ...DEFAULT_SHED_PARAMS,
  longitudinalBeams: true,
  wallBracing: true,
  roofBracing: true,
  trussBracing: true,
};

describe('the shed has no longitudinal load path until it is given one', () => {
  it('returns a mechanism wearing a number under a load along the building', () => {
    // 2.4·10^11 m for 20 kN. Not singular, so every `isFinite` check on it passes — which is
    // exactly why this went unmeasured.
    const d = displacementOf(emit({ ...DEFAULT_SHED_PARAMS }, 'Nave'), -20);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(1e6);
  });

  it('still deflects 4 mm under the vertical load PR21 measured', () => {
    // The point of the previous assertion is that it coexists with this one: the same model is
    // sound in one direction and free in another, and one load case cannot tell you that.
    const d = displacementOf(emit({ ...DEFAULT_SHED_PARAMS }, 'Nave'), -20, 'z');
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(0.05);
  });

  it('is fixed by the three elements together, and by nothing less', () => {
    const braced = displacementOf(emit(FULL, 'Nave arriostrada'), -20);
    expect(braced).not.toBeNull();
    // Eleven orders of magnitude below the unbraced case. A stiffer mechanism cannot do this.
    expect(braced!).toBeLessThan(0.05);

    // And the vertical case is untouched — the bracing adds a path, it does not change the
    // frame that was already working.
    const vertical = displacementOf(emit(FULL, 'Nave arriostrada'), -20, 'z');
    expect(vertical!).toBeLessThan(0.05);
  });

  it('bracing every bay is stiffer than bracing the ends, as it must be', () => {
    const ends = displacementOf(emit(FULL, 'Extremos'), -20)!;
    const all = displacementOf(emit({ ...FULL, bracingBays: 'all' }, 'Todos'), -20)!;
    expect(all).toBeLessThan(ends);
    expect(all).toBeGreaterThan(0);
  });
});

describe('each element earns its place, measured by removing it', () => {
  it('the roof plane cannot be anchored by bracing the roof plane', () => {
    // Diagonals between top-chord nodes triangulate the plate and leave the plate sliding. This
    // is the obvious wrong fix, and it is worth a test for the same reason "add the longitudinal
    // beams" is in the sibling file.
    const d = displacementOf(emit({
      ...DEFAULT_SHED_PARAMS, longitudinalBeams: true, wallBracing: true, roofBracing: true,
    }, 'Sin arriostramiento vertical'), -20);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(1e6);
  });

  it('the vertical bracing needs a wall that reaches the ground', () => {
    // It ties the roof to the eave line; without the wall bracing that line is itself held only
    // by the columns' weak-axis bending. 1.9 m for 20 kN: no longer a mechanism, nowhere near a
    // structure.
    const d = displacementOf(emit({
      ...DEFAULT_SHED_PARAMS, longitudinalBeams: true, trussBracing: true,
    }, 'Sin arriostramiento de fachada'), -20);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0.5);
    expect(d!).toBeLessThan(1e6);
  });

  it('the eave beams are what carry the reaction to the braced bay', () => {
    // Removing them leaves the path intact only in the braced bays themselves, so the response
    // degrades by an order of magnitude rather than collapsing.
    const withBeams = displacementOf(emit(FULL, 'Con vigas de alero'), -20)!;
    const without = displacementOf(emit({ ...FULL, longitudinalBeams: false }, 'Sin vigas'), -20)!;
    expect(without).toBeGreaterThan(withBeams * 5);
    expect(without).toBeLessThan(1);
  });
});

describe('a roof with no purlins, and what bracing can and cannot replace', () => {
  const NO_PURLINS = {
    ...DEFAULT_SHED_PARAMS, purlins: false, longitudinalBeams: true,
  };

  it('stays a mechanism when only the end bays are braced', () => {
    // The interior frames are not in a braced bay, so nothing holds them sideways. This is the
    // half of the answer that stops roof bracing being sold as a substitute for purlins.
    expect(displacementOf(emit({ ...NO_PURLINS, roofBracing: true }, 'Extremos'), -20, 'z'))
      .toBeNull();
  });

  it('solves under vertical load when EVERY bay is braced, because that reaches every frame', () => {
    // A diagonal in every bay supplies the restraint the purlins supplied, one bay at a time.
    // It is not a recommendation to omit purlins — a roof still needs something to carry the
    // sheeting — it is a statement about which restraint was missing.
    const d = displacementOf(
      emit({ ...NO_PURLINS, roofBracing: true, bracingBays: 'all' }, 'Todos'), -20, 'z',
    );
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(0.05);
  });

  it('is still free along the building until the vertical bracing is added', () => {
    // Vertical soundness and longitudinal soundness are separate questions, and bracing every
    // bay of the roof plane answers only the first.
    const roofOnly = displacementOf(
      emit({ ...NO_PURLINS, roofBracing: true, bracingBays: 'all' }, 'Solo cubierta'), -20,
    );
    expect(roofOnly!).toBeGreaterThan(1e6);

    const full = displacementOf(
      emit({ ...NO_PURLINS, roofBracing: true, wallBracing: true, trussBracing: true, bracingBays: 'all' }, 'Completo'),
      -20,
    );
    expect(full!).toBeLessThan(0.05);
  });

  it('keeps saying so on the model, whatever the bracing', () => {
    // The disclosure is about the purlins, not about the stiffness, so adding bracing must not
    // remove it: a roof with no purlins is still a roof with no purlins.
    for (const bays of BRACING_BAYS) {
      const shed = generateShed({ ...NO_PURLINS, roofBracing: true, bracingBays: bays });
      expect(shed.assumptions, bays).toContain('generator.assume.roofWithoutPurlins');
    }
  });
});

describe('the bracing is placed on steel that is already there', () => {
  it('adds no node — every brace lands on an existing one', () => {
    // The failure this guards: a diagonal drawn to a computed position creates a node held by
    // two bars and nothing else, which is a free node introduced by the member meant to remove
    // one. `findNode` cannot create, and this is the assertion that it never had to.
    const base = generateShed({ ...DEFAULT_SHED_PARAMS });
    for (const bays of BRACING_BAYS) {
      const braced = generateShed({ ...FULL, bracingBays: bays });
      expect(braced.nodes.length, bays).toBe(base.nodes.length);
    }
  });

  it('draws exactly the members the geometry implies, so a silent skip fails here', () => {
    const base = generateShed({ ...DEFAULT_SHED_PARAMS });
    const frames = DEFAULT_SHED_PARAMS.frames;

    // Wall: two crossing diagonals, per wall, per braced bay. End bays on six frames is two.
    const wall = generateShed({ ...DEFAULT_SHED_PARAMS, wallBracing: true });
    expect(wall.counts.bracing).toBe(2 * 2 * 2);

    // Roof: one diagonal per top-chord panel, per braced bay. The panel count is read off the
    // truss rather than restated, so a truss kind with a different web does not break this.
    const roofAll = generateShed({ ...DEFAULT_SHED_PARAMS, roofBracing: true, bracingBays: 'all' });
    const perBay = roofAll.counts.bracing / (frames - 1);
    expect(Number.isInteger(perBay)).toBe(true);
    const roofEnds = generateShed({ ...DEFAULT_SHED_PARAMS, roofBracing: true });
    expect(roofEnds.counts.bracing).toBe(perBay * 2);

    // Truss: three vertical planes, two diagonals each, per braced bay.
    const trussBr = generateShed({ ...DEFAULT_SHED_PARAMS, trussBracing: true });
    expect(trussBr.counts.bracing).toBe(3 * 2 * 2);

    // And nothing else moved: bracing is additive.
    expect(wall.members.length - base.members.length).toBe(wall.counts.bracing);
    expect(trussBr.members.length - base.members.length).toBe(trussBr.counts.bracing);
  });

  it('braces the one bay of a two-frame shed once, not twice', () => {
    // `end` means the first and last bay, and on two frames those are the same bay. Drawing it
    // twice would double every diagonal, which the merge would then silently swallow.
    const two = generateShed({ ...DEFAULT_SHED_PARAMS, frames: 2, wallBracing: true });
    expect(two.counts.bracing).toBe(2 * 2);
  });

  it('says on the model which bracing it placed', () => {
    const shed = generateShed({ ...FULL });
    expect(shed.assumptions).toContain('generator.assume.wallBracingPinnedOuterChordPlane');
    expect(shed.assumptions).toContain('generator.assume.roofBracingPinnedInRoofPlane');
    expect(shed.assumptions).toContain('generator.assume.trussBracingTiesRoofToBearing');
    // And says nothing about bracing it did not place.
    const bare = generateShed({ ...DEFAULT_SHED_PARAMS });
    expect(bare.assumptions.some((a) => a.includes('Bracing'))).toBe(false);
  });

  it('works on solid columns too, in the column line rather than a chord plane', () => {
    const solid = generateShed({ ...DEFAULT_SHED_PARAMS, columnKind: 'solid', wallBracing: true });
    expect(solid.counts.bracing).toBe(2 * 2 * 2);
    const base = generateShed({ ...DEFAULT_SHED_PARAMS, columnKind: 'solid' });
    expect(solid.nodes.length).toBe(base.nodes.length);
  });

  it('leaves the default shed exactly as PR21 pinned it', () => {
    // The regression guard for the whole change: bracing is off by default, so the model a user
    // gets by pressing Generate is byte-for-byte the one that was measured.
    const shed = generateShed({ ...DEFAULT_SHED_PARAMS });
    expect(shed.counts.bracing).toBe(0);
    expect(DEFAULT_SHED_PARAMS.wallBracing).toBe(false);
    expect(DEFAULT_SHED_PARAMS.roofBracing).toBe(false);
    expect(DEFAULT_SHED_PARAMS.trussBracing).toBe(false);
  });
});

describe('pinned lattice bases, and why bracing does not yet justify them', () => {
  /**
   * `pr21-integration.md` §7 records the pinned default as blocked on longitudinal bracing:
   * generating it "would allow going back to pinned bases, which is the more honest model". With
   * the bracing generated, that argument turns out not to hold, and it is worth pinning why.
   *
   * Two separate facts, and PR21's own documents contain the first one: the cap idealisation
   * already made pinned bases solvable under vertical load (§4.1 of the cap handoff, 2.0 mm
   * against 1.99 mm). So a vertical solve proves nothing about the bracing. And under
   * longitudinal load the wall bracing alone does not help, because the member that was missing
   * is the vertical bracing between trusses, not the one in the wall.
   */
  const PINNED = {
    ...DEFAULT_SHED_PARAMS,
    fixedBase: false,
    column: { ...DEFAULT_SHED_PARAMS.column, fixedBase: false },
  };

  it('already solved vertically before any bracing, which is the cap and not the wall', () => {
    const bare = displacementOf(emit(PINNED, 'Articuladas'), -20, 'z');
    expect(bare).not.toBeNull();
    expect(bare!).toBeLessThan(0.05);

    // Adding the wall bracing barely moves it, which is the evidence that the vertical solve was
    // never the thing the bracing was needed for.
    const walled = displacementOf(emit({ ...PINNED, wallBracing: true }, 'Con fachada'), -20, 'z')!;
    expect(Math.abs(walled - bare!) / bare!).toBeLessThan(0.05);
  });

  /*
   * One `it` per configuration, and the split is about the budget rather than the style.
   *
   * These were one test looping over both, so one case did two shed generations and two full
   * solves — the heaviest pair in the file — inside a single 5 s default timeout. 1,65 s on the
   * machine this was written on, and over 5 s on a CI runner inside the 8100-test pool, where it
   * timed out. Split, each does one solve and gets its own budget: same two assertions, no timeout
   * declared, no coverage dropped.
   *
   * It also names which configuration failed. The loop reported the timeout against the `it`,
   * which is the same message whichever of the two was slow — or wrong.
   */
  it('stays free along the building with wall bracing alone', () => {
    const d = displacementOf(emit({ ...PINNED, wallBracing: true }, 'Longitudinal'), -20);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(1e6);
  });

  it('stays free along the building even with the roof plane braced in every bay', () => {
    const d = displacementOf(emit(
      { ...PINNED, wallBracing: true, roofBracing: true, bracingBays: 'all' as const },
      'Longitudinal',
    ), -20);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(1e6);
  });

  it('needs the vertical bracing, exactly as a fixed-base shed does', () => {
    const d = displacementOf(emit({
      ...PINNED, longitudinalBeams: true, wallBracing: true, roofBracing: true, trussBracing: true,
    }, 'Sistema completo'), -20);
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(0.05);
  });

  it('keeps declaring what a pinned base costs', () => {
    // The disclosure is about out-of-plane restraint, and the bracing does not remove the reason
    // it exists: a pinned pair of chords is still a pinned pair of chords.
    const shed = generateShed({ ...PINNED, wallBracing: true });
    expect(shed.assumptions).toContain('generator.assume.latticeBasesPinnedNoOutOfPlane');
  });
});
