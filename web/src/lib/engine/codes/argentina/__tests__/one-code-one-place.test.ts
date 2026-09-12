/**
 * One clause, one implementation.
 *
 * ── What went wrong, and why a test rather than a comment ──────────
 *
 * `beta1` — §10.2.7.3, a threshold and a slope — was written five times:
 * `cirsoc201.ts`, `interaction-diagram.ts`, `losas.ts`, and the flanged and
 * circular modules added later. All five agreed, which is exactly why nobody
 * noticed. A duplicated rule is invisible until the day one copy is corrected,
 * and then the application holds two opinions about the same section, and
 * which one you get depends on whether you asked as a beam, a slab or a
 * column.
 *
 * The same census turned up a real instance of the failure it predicts: the
 * φ ramp in `cirsoc201.ts` started from a hardcoded 0.0021 — the yield strain
 * of a 420 MPa bar — whatever fy it was handed. Identical at 420, which is
 * every model in the corpus, and wrong for anything else, which the panel's
 * free `fy` field makes reachable.
 *
 * A comment saying "do not duplicate this" gets read by the person who already
 * knew. This fails the build.
 *
 * ── How it decides ─────────────────────────────────────────────────
 *
 * It reads the sibling source files and counts DEFINITIONS, not mentions.
 * Importing a rule is the behaviour being encouraged, so imports are invisible
 * to it; only a `function` or `const` of that name counts.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beta1, phiFromStrain, yieldStrain, PHI_TENSION } from '../cirsoc201-basis';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASIS = 'cirsoc201-basis.ts';

/**
 * Every source file of the module, minus the basis, with comments stripped.
 *
 * Stripped because the first run of this file failed on its own prose: a
 * comment in `cirsoc201.ts` explaining that 0.0021 used to be hardcoded was
 * read as an instance of hardcoding it. A guard that cannot be described
 * without tripping is a guard people delete.
 */
function siblings(): Array<{ name: string; src: string }> {
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.ts') && f !== BASIS)
    .map((name) => ({ name, src: stripComments(readFileSync(join(DIR, name), 'utf8')) }));
}

describe('the shared clauses have exactly one home', () => {
  it('nobody re-declares β₁', () => {
    const offenders = siblings()
      .filter(({ src }) => /(?:function|const)\s+beta1\b/.test(src))
      .map((f) => f.name);
    expect(
      offenders,
      `these define their own β₁ instead of importing it from ${BASIS}: ${offenders.join(', ')}. ` +
        'It is §10.2.7.3, it is the same clause everywhere, and five copies is how a ' +
        'correction reaches one of them.',
    ).toEqual([]);
  });

  it('nobody hardcodes the yield strain of a 420 bar', () => {
    /*
     * The literal that caused it. §10.3.3 wants fy/Es, and 0.0021 is that
     * number for one particular bar — correct until somebody types 500 into a
     * field that accepts it.
     */
    const offenders = siblings()
      .filter(({ src }) => /\b0\.0021\b/.test(src))
      .map((f) => f.name);
    expect(
      offenders,
      `these carry a yield strain fixed at fy = 420: ${offenders.join(', ')}. Use yieldStrain(fy).`,
    ).toEqual([]);
  });
});

describe('the clauses themselves', () => {
  it('β₁ holds at 0.85 to 28 MPa, then falls, and never below 0.65', () => {
    expect(beta1(20)).toBe(0.85);
    expect(beta1(28)).toBe(0.85);
    expect(beta1(35)).toBeCloseTo(0.80, 10);
    expect(beta1(42)).toBeCloseTo(0.75, 10);
    expect(beta1(90)).toBe(0.65);
  });

  it('the yield strain follows fy, which is the whole point', () => {
    expect(yieldStrain(420)).toBeCloseTo(0.0021, 10);
    expect(yieldStrain(500)).toBeCloseTo(0.0025, 10);
  });

  it('φ ramps between the two controls rather than stepping', () => {
    const fy = 420;
    const ey = yieldStrain(fy);
    expect(phiFromStrain(ey, fy)).toBeCloseTo(0.65, 10);
    expect(phiFromStrain(0.005, fy)).toBe(PHI_TENSION);
    expect(phiFromStrain(0.01, fy)).toBe(PHI_TENSION);
    /* Halfway across the transition is halfway up the ramp. */
    const mid = (ey + 0.005) / 2;
    expect(phiFromStrain(mid, fy)).toBeCloseTo((0.65 + 0.90) / 2, 10);
  });

  it('a spiral starts its ramp higher than ties, and ends in the same place', () => {
    /*
     * 0.70, not the 0.75 this once asserted. That is ACI 318-08's value and
     * CIRSOC 201-05 keeps 0.70; the workbook comparison in
     * `cirsoc-flex-worked-examples.test.ts` is what caught it, and the
     * consequence was a spiral column sized 15 % light.
     */
    const fy = 420;
    const ey = yieldStrain(fy);
    expect(phiFromStrain(ey, fy, 'spiral')).toBeCloseTo(0.70, 10);
    expect(phiFromStrain(ey, fy, 'ties')).toBeCloseTo(0.65, 10);
    expect(phiFromStrain(0.005, fy, 'spiral')).toBe(PHI_TENSION);
  });

  it('a 500 MPa bar reaches compression control later than a 420', () => {
    /*
     * The defect this file was written after. At 2.2 ‰ a 420 bar has yielded
     * and is on the ramp; a 500 bar has not, and the clause gives it the
     * compression-controlled φ.
     */
    expect(phiFromStrain(0.0022, 420)).toBeGreaterThan(0.65);
    expect(phiFromStrain(0.0022, 500)).toBe(0.65);
  });
});
