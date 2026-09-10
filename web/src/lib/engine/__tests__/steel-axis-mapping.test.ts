/**
 * The app-to-checker AXIS SWAP, pinned.
 *
 * ── What this guards ───────────────────────────────────────────────
 *
 * `runSteelVerification` builds `SteelDesignParams` with a deliberate cross:
 *
 *     Iz: section.iy,   // checker's STRONG  <- app's strong
 *     Iy: section.iz,   // checker's WEAK    <- app's weak
 *
 * because `SteelDesignParams` documents `Iz` as «inercia eje fuerte» and `Iy` as «eje debil»,
 * while this app's `section.iy` is the strong one. The two names cross, and the cross reads
 * exactly like the typo somebody tidies up.
 *
 * It was passed straight through once, and the consequence was not cosmetic. `checkSteelFlexure`
 * takes `ry = sqrt(Iy/A)` as the WEAK-axis radius of gyration and sets `Lp = 1,76 ry sqrt(E/Fy)`
 * from it. Fed the strong inertia, `ry` on an IPE 200 comes out sqrt(1943/142) = 3,7x too large,
 * `Lp` with it, and a beam that needed a lateral-torsional reduction is judged to be inside the
 * plateau. Unconservative — the direction that matters.
 *
 * Nothing tested it. The CIRSOC benchmarks enter `cirsoc301.ts` directly with parameters already
 * in the CHECKER's convention, so they never cross this mapping, and no other test imports the
 * builder. The fix was held in place by a comment.
 *
 * ── Why it asserts on Lp ───────────────────────────────────────────
 *
 * `Lp` IS the quantity the swap corrupts, and `SteelFlexureResult` publishes it. Asserting on it
 * names the defect directly rather than inferring it from a capacity that several other terms
 * also move. A source-text assertion was the alternative and would pass any refactor that kept
 * the words and lost the behaviour.
 */

import { describe, it, expect } from 'vitest';
import { runSteelVerification } from '../verification-service';

/**
 * IPE 200 in the APP's naming: `iy` is the strong axis, `iz` the weak.
 *
 * The ratio is what gives the test its teeth — 1943/142 = 13,7, whose square root is the 3,7x the
 * defect produced. A doubly symmetric section with iy == iz could not detect the swap at all.
 */
const IPE200 = {
  id: 1, name: 'IPE 200',
  a: 28.5e-4,
  iy: 1943e-8,   // strong, in this app's naming
  iz: 142e-8,    // weak
  h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085, j: 6.98e-8,
};

const STEEL = { id: 1, name: 'F-24', fy: 235, fu: 360, e: 200_000 };

const model = {
  elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
  nodes: new Map([
    [1, { id: 1, x: 0, y: 0, z: 0 }],
    [2, { id: 2, x: 4, y: 0, z: 0 }],
  ]),
  sections: new Map([[1, IPE200]]),
  materials: new Map([[1, STEEL]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }]]),
} as any;

/** Strong-axis moment only, so flexure governs and `flexureZ` is populated. */
const results = {
  elementForces: [{
    elementId: 1,
    nStart: 0, nEnd: 0,
    mzStart: 10, mzEnd: 0,
    myStart: 0, myEnd: 0,
    vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
  }],
} as any;

/**
 * Lp = 1,76 ry sqrt(E/Fy), evaluated here from the two candidate inertias.
 *
 * Computed rather than tabulated so a change to the section or the steel moves both the
 * expectation and the wrong value with it, instead of leaving a stale literal behind.
 */
const lpFrom = (i: number) => 1.76 * Math.sqrt(i / IPE200.a) * Math.sqrt(STEEL.e / STEEL.fy);
const LP_WEAK = lpFrom(IPE200.iz);     // ~1,15 m — correct
const LP_STRONG = lpFrom(IPE200.iy);   // ~4,24 m — what the uncrossed mapping produced

describe('the app-to-checker axis mapping', () => {
  it('builds Lp from the WEAK inertia, not the strong one', () => {
    const v = runSteelVerification(results, model);
    expect(v.length, 'no steel verification was produced for the fixture').toBe(1);

    const lp = v[0].flexureZ.Lp;

    // The two candidates are 3,7x apart, so a 5 % window cannot straddle them.
    expect(
      lp,
      `Lp = ${lp.toFixed(3)} m. Expected ${LP_WEAK.toFixed(3)} m, from the WEAK inertia. ` +
        `${LP_STRONG.toFixed(3)} m means the axis swap in verification-service.ts has been ` +
        'uncrossed: ry is being built from the strong inertia, Lp is 3,7x too large, and every ' +
        'beam past its real Lp is being judged inside the plateau it has actually left.',
    ).toBeCloseTo(LP_WEAK, 2);

    // Stated separately so the failure output names the wrong value even if the tolerance moves.
    expect(Math.abs(lp - LP_STRONG), 'Lp matches the STRONG-axis value').toBeGreaterThan(1);
  });
});
