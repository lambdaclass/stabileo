/**
 * Table 9.7.6.2.2 — boundary tests.
 *
 * Every threshold is tested immediately below it, exactly at it, and immediately above it,
 * because every defect this module replaced was a boundary defect: a branch that fired at
 * `VsReq <= 0` and invented a limit, and a cap that was 100 mm too tight on one side of
 * d = 800 mm and 100 mm too loose on the other.
 *
 * The measured regression at the bottom of the file is the qa-8 beam, whose numbers were
 * taken from a production trace and not from this implementation.
 */

import { describe, it, expect } from 'vitest';
import {
  transverseSpacingLimits, checkTransverseSpacing, rowThreshold,
  acrossWidthSpan, legsForAcrossWidth, legSpacingAcross, legOffsetsAcross,
  transverseSpacingIsSupported, transverseSpacingSupportedForEdition,
  TRANSVERSE_SPACING_EDITION,
  type TransverseSpacingGap,
} from '../transverse-spacing';
import type { LimitingConstraint } from '../../../engine/design/outcome';
import { assertSameEdition } from '../../regulation';

/** A 300 × 550 beam with 25 mm cover and Ø8 stirrups unless a test overrides it. */
const BASE = { bw: 0.300, d: 0.512, fc: 30, cover: 0.025, stirrupDiaMm: 8 };

function limits(over: Partial<typeof BASE> & { VsRequired: number; prestressed?: boolean }) {
  return transverseSpacingLimits('2025', { ...BASE, ...over });
}

/** `d` that puts the depth term exactly on a cap. Solved from the table, not measured. */
const D_AT_ALONG_CAP = 0.800;   // d/2 = 400 mm (row 1) and d/4 = 200 mm (row 2)
const D_AT_ACROSS_CAP = 0.400;  // d   = 400 mm (row 1) and d/2 = 200 mm (row 2)

// ─── The gap type really is a LimitingConstraint ──────────────────

describe('layering', () => {
  it('declares its capability gap as a value the design engine accepts', () => {
    // `lib/codes` must not import the design engine, so the subset relationship is
    // asserted here rather than expressed as a type import in the module.
    const gap: TransverseSpacingGap = 'unsupportedCheck';
    const asConstraint: LimitingConstraint = gap;
    expect(asConstraint).toBe('unsupportedCheck');
  });

  it('cites exactly one edition, so assertSameEdition cannot throw on it', () => {
    const l = limits({ VsRequired: 0 });
    expect(() => assertSameEdition(l.clauses, 'transverse spacing')).not.toThrow();
    expect(l.clauses.map((c) => c.clause)).toEqual(['9.7.6.2.2', 'Tabla 9.7.6.2.2']);
  });
});

// ─── Row selection ───────────────────────────────────────────────

describe('row selection at the 0,33·√f\'c·bw·d threshold', () => {
  const threshold = rowThreshold(BASE.fc, BASE.bw, BASE.d);

  it('computes the threshold as printed — 0,33, not 1/3', () => {
    // 0,33·√30·300·512 / 1000 = 277,58 kN. With 1/3 it would be 280,39 kN, and the 2,8 kN
    // band between them is demand that belongs in row 2 and used to land in row 1.
    expect(threshold).toBeCloseTo(277.58, 1);
    expect(threshold).toBeLessThan((1 / 3) * Math.sqrt(30) * 300 * 512 / 1000);
  });

  it('puts Vs required = 0 in row 1 — this is the defect that could certify 300 mm', () => {
    const l = limits({ VsRequired: 0 });
    expect(l.row).toBe('row1');
    // The invented branch returned min(0,8·d, 300 mm) = 300 mm here. The table gives 256 mm.
    expect(l.alongMax).toBeCloseTo(0.256, 6);
    expect(l.alongMax).toBeLessThan(0.300);
  });

  it('puts a negative Vs required in row 1 and reports it clamped to zero', () => {
    const l = limits({ VsRequired: -140 });
    expect(l.row).toBe('row1');
    expect(l.VsRequired).toBe(0);
  });

  it('puts a low positive Vs required in row 1', () => {
    const l = limits({ VsRequired: 1 });
    expect(l.row).toBe('row1');
    expect(l.alongMax).toBeCloseTo(0.256, 6);
  });

  it('immediately below the threshold: row 1', () => {
    expect(limits({ VsRequired: threshold - 0.001 }).row).toBe('row1');
  });

  it('exactly at the threshold: row 1, because the table reads "≤"', () => {
    expect(limits({ VsRequired: threshold }).row).toBe('row1');
  });

  it('immediately above the threshold: row 2', () => {
    expect(limits({ VsRequired: threshold + 0.001 }).row).toBe('row2');
  });
});

// ─── Row 1 geometry, and the two cap boundaries ──────────────────

describe('row 1 — along the length: lesser of d/2 and 400 mm', () => {
  it('immediately below d = 800 mm: d/2 governs', () => {
    const l = limits({ VsRequired: 0, d: D_AT_ALONG_CAP - 0.001 });
    expect(l.alongGovernedBy).toBe('depthTerm');
    expect(l.alongMax).toBeCloseTo(0.3995, 6);
  });

  it('exactly at d = 800 mm: d/2 = 400 mm, equal to the cap, so the depth term is reported', () => {
    const l = limits({ VsRequired: 0, d: D_AT_ALONG_CAP });
    expect(l.alongMax).toBeCloseTo(0.400, 6);
    expect(l.alongGovernedBy).toBe('depthTerm');
  });

  it('immediately above d = 800 mm: the 400 mm cap governs', () => {
    const l = limits({ VsRequired: 0, d: D_AT_ALONG_CAP + 0.001 });
    expect(l.alongGovernedBy).toBe('absoluteCap');
    expect(l.alongMax).toBeCloseTo(0.400, 6);
  });

  it('caps at 400 mm, not the 300 mm the previous implementation used', () => {
    expect(limits({ VsRequired: 0, d: 1.200 }).alongMax).toBeCloseTo(0.400, 6);
  });
});

describe('row 1 — across the width: lesser of d and 400 mm', () => {
  it('immediately below d = 400 mm: d governs', () => {
    const l = limits({ VsRequired: 0, d: D_AT_ACROSS_CAP - 0.001 });
    expect(l.acrossGovernedBy).toBe('depthTerm');
    expect(l.acrossMax).toBeCloseTo(0.399, 6);
  });

  it('exactly at d = 400 mm: d = 400 mm, equal to the cap', () => {
    const l = limits({ VsRequired: 0, d: D_AT_ACROSS_CAP });
    expect(l.acrossMax).toBeCloseTo(0.400, 6);
    expect(l.acrossGovernedBy).toBe('depthTerm');
  });

  it('immediately above d = 400 mm: the 400 mm cap governs', () => {
    const l = limits({ VsRequired: 0, d: D_AT_ACROSS_CAP + 0.001 });
    expect(l.acrossGovernedBy).toBe('absoluteCap');
    expect(l.acrossMax).toBeCloseTo(0.400, 6);
  });

  it('applies the per-row cap to the across-width column, not only to the along one', () => {
    // The flattened Markdown put "400 mm" on its own line where it reads as a footnote to
    // the along-length column. On the rendered page the cell spans all four columns.
    const l = limits({ VsRequired: 0, d: 2.000 });
    expect(l.acrossMax).toBeCloseTo(0.400, 6);
    expect(l.alongMax).toBeCloseTo(0.400, 6);
  });
});

// ─── Row 2 geometry, and the same two cap boundaries ─────────────

describe('row 2 — along the length: lesser of d/4 and 200 mm', () => {
  const HIGH = 1e6; // far above any threshold

  it('immediately below d = 800 mm: d/4 governs', () => {
    const l = limits({ VsRequired: HIGH, d: D_AT_ALONG_CAP - 0.001 });
    expect(l.row).toBe('row2');
    expect(l.alongGovernedBy).toBe('depthTerm');
    expect(l.alongMax).toBeCloseTo(0.19975, 6);
  });

  it('exactly at d = 800 mm: d/4 = 200 mm, equal to the cap', () => {
    const l = limits({ VsRequired: HIGH, d: D_AT_ALONG_CAP });
    expect(l.alongMax).toBeCloseTo(0.200, 6);
    expect(l.alongGovernedBy).toBe('depthTerm');
  });

  it('immediately above d = 800 mm: the 200 mm cap governs', () => {
    const l = limits({ VsRequired: HIGH, d: D_AT_ALONG_CAP + 0.001 });
    expect(l.alongGovernedBy).toBe('absoluteCap');
    expect(l.alongMax).toBeCloseTo(0.200, 6);
  });
});

describe('row 2 — across the width: lesser of d/2 and 200 mm', () => {
  const HIGH = 1e6;

  it('immediately below d = 400 mm: d/2 governs', () => {
    const l = limits({ VsRequired: HIGH, d: D_AT_ACROSS_CAP - 0.001 });
    expect(l.acrossGovernedBy).toBe('depthTerm');
    expect(l.acrossMax).toBeCloseTo(0.1995, 6);
  });

  it('exactly at d = 400 mm: d/2 = 200 mm, equal to the cap', () => {
    const l = limits({ VsRequired: HIGH, d: D_AT_ACROSS_CAP });
    expect(l.acrossMax).toBeCloseTo(0.200, 6);
    expect(l.acrossGovernedBy).toBe('depthTerm');
  });

  it('immediately above d = 400 mm: the 200 mm cap governs', () => {
    const l = limits({ VsRequired: HIGH, d: D_AT_ACROSS_CAP + 0.001 });
    expect(l.acrossGovernedBy).toBe('absoluteCap');
    expect(l.acrossMax).toBeCloseTo(0.200, 6);
  });
});

// ─── Across-width leg counts: narrow and wide members ────────────

describe('legs required across the width', () => {
  it('measures the span between the outermost leg centres', () => {
    // 300 − 2×25 − 8 = 242 mm. Cover is to the OUTSIDE of the stirrup, so a leg centre
    // sits cover + d_stirrup/2 from the face and the two halves of the bar cancel.
    expect(acrossWidthSpan(0.300, 0.025, 8)).toBeCloseTo(0.242, 9);
  });

  it('never returns fewer than two legs — a closed stirrup has two', () => {
    expect(legsForAcrossWidth(0.242, 0.400)).toBe(2);
    expect(legsForAcrossWidth(0.001, 0.200)).toBe(2);
    expect(legsForAcrossWidth(0, 0.200)).toBe(2);
  });

  it('immediately below one gap: two legs', () => {
    expect(legsForAcrossWidth(0.199, 0.200)).toBe(2);
  });

  it('exactly one gap: two legs, the span equals the limit', () => {
    expect(legsForAcrossWidth(0.200, 0.200)).toBe(2);
  });

  it('immediately above one gap: three legs', () => {
    expect(legsForAcrossWidth(0.201, 0.200)).toBe(3);
  });

  it('exactly two gaps: three legs', () => {
    expect(legsForAcrossWidth(0.400, 0.200)).toBe(3);
  });

  it('immediately above two gaps: four legs', () => {
    expect(legsForAcrossWidth(0.401, 0.200)).toBe(4);
  });

  it('a narrow 300 mm web in row 1 needs no crosstie', () => {
    const l = limits({ VsRequired: 0 });
    expect(l.acrossMax).toBeCloseTo(0.400, 6);
    expect(l.acrossSpan).toBeCloseTo(0.242, 9);
    expect(l.requiredLegs).toBe(2);
  });

  it('the same narrow web in row 2 needs three legs', () => {
    // acrossMax = min(d/2, 200) = 200 mm and the span is 242 mm, so two legs do not meet
    // the table. This is the across-width requirement biting on an ordinary beam.
    const l = limits({ VsRequired: 1e6 });
    expect(l.acrossMax).toBeCloseTo(0.200, 6);
    expect(l.requiredLegs).toBe(3);
    expect(l.legSpacingAtRequiredLegs).toBeCloseTo(0.121, 9);
  });

  it('a wide 1200 mm member in row 1 needs four legs', () => {
    // 1200 − 50 − 8 = 1142 mm at 400 mm → 1 + ceil(2,855) = 4.
    const l = limits({ VsRequired: 0, bw: 1.200 });
    expect(l.acrossSpan).toBeCloseTo(1.142, 9);
    expect(l.requiredLegs).toBe(4);
    expect(l.legSpacingAtRequiredLegs).toBeLessThanOrEqual(l.acrossMax);
  });

  it('a wide 1200 mm member in row 2 needs seven legs', () => {
    // 1142 mm at 200 mm → 1 + ceil(5,71) = 7.
    const l = limits({ VsRequired: 1e6, bw: 1.200 });
    expect(l.requiredLegs).toBe(7);
    expect(l.legSpacingAtRequiredLegs).toBeLessThanOrEqual(l.acrossMax + 1e-9);
  });

  it('always returns a leg count whose spacing actually satisfies the limit', () => {
    for (const bw of [0.15, 0.20, 0.30, 0.45, 0.60, 0.90, 1.20, 2.00]) {
      for (const VsRequired of [0, 1, 1e6]) {
        for (const d of [0.20, 0.399, 0.400, 0.401, 0.799, 0.800, 0.801, 1.50]) {
          const l = limits({ VsRequired, bw, d });
          expect(l.legSpacingAtRequiredLegs,
            `bw=${bw} d=${d} Vs=${VsRequired}`).toBeLessThanOrEqual(l.acrossMax + 1e-9);
        }
      }
    }
  });
});

// ─── Leg positions: one function for cage, verifier and drawing ──

describe('leg positions', () => {
  it('places two legs on the cover lines, symmetric about the centreline', () => {
    expect(legOffsetsAcross(2, 0.300, 0.025, 8)).toEqual([-0.121, 0.121]);
  });

  it('places a third leg on the centreline', () => {
    const off = legOffsetsAcross(3, 0.300, 0.025, 8);
    expect(off[0]).toBeCloseTo(-0.121, 9);
    expect(off[1]).toBeCloseTo(0, 9);
    expect(off[2]).toBeCloseTo(0.121, 9);
  });

  it('keeps every gap equal to legSpacingAcross', () => {
    const off = legOffsetsAcross(5, 1.200, 0.030, 10);
    const pitch = legSpacingAcross(5, 1.200, 0.030, 10);
    for (let i = 1; i < off.length; i++) {
      expect(off[i] - off[i - 1]).toBeCloseTo(pitch, 9);
    }
  });

  it('stays symmetric for any leg count', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const off = legOffsetsAcross(n, 0.900, 0.025, 8);
      expect(off[0]).toBeCloseTo(-off[off.length - 1], 12);
    }
  });
});

// ─── Verification of a provided arrangement ──────────────────────

describe('checking a provided arrangement', () => {
  it('passes sufficient legs and spacing in row 1', () => {
    const c = checkTransverseSpacing('2025', { ...BASE, VsRequired: 0 },
      { spacing: 0.250, legs: 2 });
    expect(c.ok).toBe(true);
    expect(c.alongOk).toBe(true);
    expect(c.acrossOk).toBe(true);
    expect(c.reasons).toEqual([]);
  });

  it('fails the along limit immediately above it and passes immediately below', () => {
    const at = checkTransverseSpacing('2025', { ...BASE, VsRequired: 0 },
      { spacing: 0.256, legs: 2 });
    expect(at.alongOk).toBe(true);
    const above = checkTransverseSpacing('2025', { ...BASE, VsRequired: 0 },
      { spacing: 0.257, legs: 2 });
    expect(above.alongOk).toBe(false);
    expect(above.alongUtilization).toBeGreaterThan(1);
    expect(above.reasons.map((r) => r.key))
      .toContain('codes.cirsoc201.transverseSpacing.alongExceeded');
  });

  it('fails an insufficient leg count in row 2 and names the required count', () => {
    const c = checkTransverseSpacing('2025', { ...BASE, VsRequired: 1e6 },
      { spacing: 0.100, legs: 2 });
    expect(c.alongOk).toBe(true);
    expect(c.acrossOk).toBe(false);
    expect(c.acrossProvided).toBeCloseTo(0.242, 9);
    expect(c.acrossUtilization).toBeCloseTo(0.242 / 0.200, 6);
    const reason = c.reasons.find(
      (r) => r.key === 'codes.cirsoc201.transverseSpacing.acrossExceeded');
    expect(reason?.params?.requiredLegs).toBe(3);
    expect(reason?.params?.legs).toBe(2);
  });

  it('passes the same member once the third leg is provided', () => {
    const c = checkTransverseSpacing('2025', { ...BASE, VsRequired: 1e6 },
      { spacing: 0.100, legs: 3 });
    expect(c.ok).toBe(true);
  });

  it('uses the final reduced effective depth it is given, not a nominal one', () => {
    // Coordination moves steel and the effective depth drops. A limit computed on the
    // nominal depth would be looser than the member the drawing shows.
    const nominal = limits({ VsRequired: 0, d: 0.512 });
    const reduced = limits({ VsRequired: 0, d: 0.478 });
    expect(reduced.alongMax).toBeCloseTo(0.239, 6);
    expect(reduced.alongMax).toBeLessThan(nominal.alongMax);
    const c = checkTransverseSpacing('2025', { ...BASE, d: 0.478, VsRequired: 0 },
      { spacing: 0.250, legs: 2 });
    expect(c.alongOk).toBe(false);
  });
});

// ─── Prestressed: explicitly unsupported ─────────────────────────

describe('prestressed members', () => {
  it('returns a structured unsupported result rather than the non-prestressed limits', () => {
    const l = limits({ VsRequired: 0, prestressed: true });
    expect(l.unsupported).toEqual(['unsupportedCheck']);
    expect(transverseSpacingIsSupported(l)).toBe(false);
    expect(l.demandBasis.map((m) => m.key))
      .toContain('codes.cirsoc201.transverseSpacing.prestressedUnsupported');
  });

  it('reports supported for a non-prestressed member', () => {
    expect(transverseSpacingIsSupported(limits({ VsRequired: 0 }))).toBe(true);
    expect(limits({ VsRequired: 0 }).unsupported).toEqual([]);
  });

  it('does not claim 3h/2 by silently reusing the d column', () => {
    // A prestressed row-1 member's across-width limit is 3h/2, which for any ordinary
    // section is LARGER than d — so applying the non-prestressed column would be
    // conservative, and applying the prestressed one without a prestress force would be a
    // check that was never performed. Neither is claimed.
    const l = limits({ VsRequired: 0, prestressed: true });
    expect(l.unsupported.length).toBeGreaterThan(0);
  });
});

// ─── Editions: 2025 only, and 2005 REFUSES ───────────────────────

describe('editions', () => {
  it('names the one edition it implements', () => {
    expect(TRANSVERSE_SPACING_EDITION).toBe('2025');
    expect(transverseSpacingSupportedForEdition('2025')).toBe(true);
    for (const e of ['2005', '2018', '2024'] as const) {
      expect(transverseSpacingSupportedForEdition(e)).toBe(false);
    }
  });

  it('applies the 2025 table without an edition caveat', () => {
    const l = transverseSpacingLimits('2025', { ...BASE, VsRequired: 0 });
    expect(l.unsupported).toEqual([]);
    expect(l.demandBasis.map((m) => m.key))
      .not.toContain('codes.cirsoc201.transverseSpacing.editionUnsupported');
  });

  it('REFUSES a 2005 project rather than substituting the 2025 table', () => {
    // The substitution used to happen and be declared. Conservatism is not provenance: a
    // member stamped 2005 whose spacing came from the 2025 table cites a rule it did not
    // apply, and the reviewing engineer cannot tell.
    const l = transverseSpacingLimits('2005', { ...BASE, VsRequired: 0 });
    expect(transverseSpacingIsSupported(l)).toBe(false);
    expect(l.unsupported).toEqual(['unsupportedCheck']);
    const note = l.demandBasis.find(
      (m) => m.key === 'codes.cirsoc201.transverseSpacing.editionUnsupported');
    expect(note?.params?.edition).toBe('2005');
    // NOT the 2025 numbers.
    expect(l.alongMax).toBe(0);
    expect(l.acrossMax).toBe(0);
    expect(l.requiredLegs).toBe(0);
  });

  it('cites NO clause for an unsupported edition', () => {
    // Citing Table 9.7.6.2.2 here would be the exact mislabelling the gate prevents, and
    // there is no 2005 clause to cite because the text is not supplied.
    expect(transverseSpacingLimits('2005', { ...BASE, VsRequired: 0 }).clauses).toEqual([]);
  });

  it('fails CLOSED — a caller that ignores `unsupported` cannot certify anything', () => {
    // Defence in depth. Every positive spacing exceeds a zero limit, so even a caller that
    // forgets the guard gets a refusal rather than a pass.
    for (const spacing of [0.05, 0.1, 0.225, 0.25, 0.4]) {
      for (const legs of [2, 3, 4]) {
        const c = checkTransverseSpacing('2005', { ...BASE, VsRequired: 0 }, { spacing, legs });
        expect(c.ok, `s=${spacing} legs=${legs}`).toBe(false);
        expect(c.alongOk).toBe(false);
      }
    }
  });

  it('refuses every non-2025 edition, not just 2005', () => {
    for (const e of ['2005', '2018', '2024'] as const) {
      const l = transverseSpacingLimits(e, { ...BASE, VsRequired: 0 });
      expect(l.unsupported, e).toEqual(['unsupportedCheck']);
      expect(l.alongMax, e).toBe(0);
    }
  });

  it('refuses BEFORE the row arithmetic, so no 2025 reasoning leaks into the result', () => {
    const l = transverseSpacingLimits('2005', { ...BASE, VsRequired: 1e6 });
    expect(l.rowThreshold).toBe(0);
    // A row-2 demand under an unsupported edition must not report row-2 limits.
    expect(l.acrossMax).toBe(0);
    expect(l.demandBasis.map((m) => m.key))
      .not.toContain('codes.cirsoc201.transverseSpacing.row2');
  });
});

// ─── Measured regression, from a production trace ────────────────

describe('MEASURED regression — qa-8 beam, f\'c 30 MPa, b 300 mm, d 512 mm', () => {
  // Vc = (1/6)·√30·300·512 / 1000 = 140,2 kN, φ = 0,75. These are the numbers recorded in
  // the production trace, and the expected limits below are read off Table 9.7.6.2.2 by
  // hand rather than produced by this implementation.
  const Vc = 140.2;
  const VsReqFor = (Vu: number) => Math.max(0, Vu / 0.75 - Vc);

  it('Vu = 0 kN → row 1, along 256 mm, across 400 mm, 2 legs', () => {
    const l = limits({ VsRequired: VsReqFor(0) });
    expect(l.row).toBe('row1');
    expect(l.alongMax * 1000).toBeCloseTo(256, 3);
    expect(l.acrossMax * 1000).toBeCloseTo(400, 3);
    expect(l.requiredLegs).toBe(2);
    // The defect: the old code returned min(0,8×512, 300) = 300 mm here.
    expect(l.alongMax * 1000).not.toBeCloseTo(300, 0);
  });

  it('Vu = 20 kN → still row 1, still 256 mm', () => {
    expect(VsReqFor(20)).toBe(0);
    const l = limits({ VsRequired: VsReqFor(20) });
    expect(l.row).toBe('row1');
    expect(l.alongMax * 1000).toBeCloseTo(256, 3);
  });

  it('Vu = 105 kN → still row 1, still 256 mm', () => {
    expect(VsReqFor(105)).toBe(0);
    const l = limits({ VsRequired: VsReqFor(105) });
    expect(l.row).toBe('row1');
    expect(l.alongMax * 1000).toBeCloseTo(256, 3);
    expect(l.acrossMax * 1000).toBeCloseTo(400, 3);
  });

  it('all three measured demands sit below φVc, which is why they share row 1', () => {
    for (const Vu of [0, 20, 105]) expect(Vu).toBeLessThanOrEqual(0.75 * Vc);
  });

  it('the row-2 boundary for this member is Vu = 313,3 kN', () => {
    // Vs,req = Vu/0,75 − 140,2 > 277,58 → Vu > 0,75 × 417,78 = 313,3 kN.
    const threshold = rowThreshold(30, 0.300, 0.512);
    const VuAtRowChange = 0.75 * (threshold + Vc);
    expect(VuAtRowChange).toBeCloseTo(313.3, 0);
    expect(limits({ VsRequired: VsReqFor(VuAtRowChange - 0.1) }).row).toBe('row1');
    expect(limits({ VsRequired: VsReqFor(VuAtRowChange + 0.1) }).row).toBe('row2');
  });
});
