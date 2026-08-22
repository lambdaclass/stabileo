/**
 * The clause map: a contract, and the guard that it stays one.
 *
 * ── What is worth asserting about a map of citations ───────────────
 *
 * Not that the citations are right — nobody in this repository can certify that, which is the whole
 * reason every entry is `unvalidated`. What CAN be asserted is that the map keeps the properties
 * that make it reviewable and that it cannot quietly become a claim:
 *
 *   · nothing is marked `signed`, so the map never reads as validated;
 *   · every entry carries all six fields, because an expression with no inputs or no clause is not
 *     reviewable;
 *   · the clause numbers are in CIRSOC's DOTTED form, not AISC's — the mistake this map exists to
 *     have avoided;
 *   · the departures the mapping exercise found are still recorded, so a future edit cannot drop
 *     them silently.
 */

import { describe, it, expect } from 'vitest';
import {
  CIRSOC301_CLAUSE_MAP, CIRSOC301_CLAUSE_MAP_VALIDATED, CIRSOC301_CLAUSES_UNVALIDATED,
  CIRSOC301_CLAUSE_MAP_EDITION,
} from '../cirsoc301-clause-map';
import { STEEL_CAPABILITY_KEYS } from '../cirsoc301-capabilities';

describe('nothing here is validated, and it cannot pretend to be', () => {
  it('marks every entry unvalidated', () => {
    for (const e of CIRSOC301_CLAUSE_MAP) {
      expect(e.validation, `${e.clause} ${e.expression}`).toBe('unvalidated');
    }
  });

  it('reports the map as not validated', () => {
    expect(CIRSOC301_CLAUSE_MAP_VALIDATED).toBe(false);
    expect(CIRSOC301_CLAUSES_UNVALIDATED).toHaveLength(CIRSOC301_CLAUSE_MAP.length);
  });

  it('is frozen, so nothing can mark an entry signed without a signature', () => {
    expect(Object.isFrozen(CIRSOC301_CLAUSE_MAP)).toBe(true);
  });

  it('and does not gate anything by itself', () => {
    /*
     * The map is one of four blockers, not the switch. Even fully signed it would leave the unbraced
     * length and the human signature standing — so a reader who took `VALIDATED` as permission would
     * be reading it wrong, and this says so in the suite rather than only in a comment.
     */
    expect(CIRSOC301_CLAUSE_MAP_VALIDATED).toBe(false);
  });
});

describe('every entry is reviewable', () => {
  it('carries all six fields', () => {
    // An expression with no clause, or a clause with no inputs, cannot be checked against the text.
    for (const e of CIRSOC301_CLAUSE_MAP) {
      expect(e.capability, 'capability').toBeTruthy();
      expect(e.expression.length, `${e.clause} expression`).toBeGreaterThan(8);
      expect(e.clause, 'clause').toBeTruthy();
      expect(e.inputs.length, `${e.clause} inputs`).toBeGreaterThan(0);
      expect(Array.isArray(e.assumptions), `${e.clause} assumptions`).toBe(true);
      expect(Array.isArray(e.limitations), `${e.clause} limitations`).toBe(true);
    }
  });

  it('names capabilities the matrix knows', () => {
    // A capability nobody else declares would be a limit state the gate does not cover.
    for (const e of CIRSOC301_CLAUSE_MAP) {
      expect(STEEL_CAPABILITY_KEYS as readonly string[], e.capability).toContain(e.capability);
    }
  });

  it('covers every limit state the checker actually computes', () => {
    const covered = new Set(CIRSOC301_CLAUSE_MAP.map((e) => e.capability));
    for (const cap of ['steelTension', 'steelCompression', 'steelFlexure',
                       'steelLateralTorsionalBuckling', 'steelShear', 'steelInteraction']) {
      expect(covered, cap).toContain(cap);
    }
  });
});

describe('the clause numbers are CIRSOC’s, not AISC’s', () => {
  it('uses the dotted form throughout', () => {
    /*
     * CIRSOC 301-2018 numbers its expressions `D.2.1`, `E.3.2a`, `F.2.1`, `G.2.3`; AISC 360 writes
     * `D2-1`, `E3-2`, `F2-1`, `G2-3`. Cited in the AISC style every reference here would have been
     * wrong for the regulation the project declares — which is why they were read out of the
     * shipped text rather than recalled.
     */
    for (const e of CIRSOC301_CLAUSE_MAP) {
      expect(e.clause, `${e.expression} cites ${e.clause}`)
        .toMatch(/^[A-H]\.\d+(\.\d+[a-z]?)?( \/ [A-H]\.\d+(\.\d+)?)?$/);
      expect(e.clause, 'no AISC hyphen form').not.toMatch(/^[A-H]\d+-\d+/);
    }
  });

  it('names the edition the numbers belong to', () => {
    // A clause number with no edition is ambiguous: the 2018 text renumbered against earlier ones.
    expect(CIRSOC301_CLAUSE_MAP_EDITION).toEqual({ regulation: 'cirsoc-301', edition: '2018' });
  });
});

describe('the departures the mapping found are still recorded', () => {
  it('records that the flexural plateau has no 1,5·My cap', () => {
    /*
     * F.2.1 reads `Mn = Mp = Fy·Zx ≤ 1,5·My` and the code applies no cap — it never computes My.
     * A missing upper bound is unconservative, so this must not leave the map without someone
     * deciding it is no longer true.
     */
    const mp = CIRSOC301_CLAUSE_MAP.find((e) => e.clause === 'F.2.1')!;
    expect(mp).toBeTruthy();
    expect(mp.limitations.join(' ')).toMatch(/1,5·My|1,5 ?· ?My/);
  });

  it('records that Ae is taken equal to Ag', () => {
    // Rupture with no hole deduction: right for a welded member, optimistic for a bolted one, and
    // the checker has no connection geometry to deduct from.
    const rupture = CIRSOC301_CLAUSE_MAP.find((e) => e.clause === 'D.2.2')!;
    expect(rupture.assumptions.join(' ')).toMatch(/Ae/);
    expect(rupture.limitations.length).toBeGreaterThan(0);
  });

  it('cites the `a` variant for the inelastic compression branch', () => {
    // The text prints both forms; the code evaluates the Fe one, which is E.3.2a. Citing E.3.2
    // would cite the λc form the code does not use.
    const inelastic = CIRSOC301_CLAUSE_MAP.find((e) => e.expression.includes('0.658'))!;
    expect(inelastic.clause).toBe('E.3.2a');
  });

  it('records that torsional buckling is not covered', () => {
    // E.4 governs for angles, tees and cruciforms — exactly the sections whose axes M2 already
    // warns about. Not implemented, so those are checked on the wrong mode.
    const axial = CIRSOC301_CLAUSE_MAP.find((e) => e.clause === 'E.3.1')!;
    expect(axial.limitations.join(' ')).toMatch(/E\.4|torsional/);
  });

  it('and records the Lb assumption on the LTB entries', () => {
    const ltb = CIRSOC301_CLAUSE_MAP.filter((e) => e.capability === 'steelLateralTorsionalBuckling');
    expect(ltb.length).toBeGreaterThan(0);
    expect(ltb.some((e) => e.assumptions.join(' ').includes('unbraced'))).toBe(true);
  });
});
