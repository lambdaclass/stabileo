/**
 * Edition provenance: a 2005 project may not be designed with a 2025 rule.
 *
 * ── What this guards ──────────────────────────────────────────────
 *
 * An earlier revision applied Table 9.7.6.2.2 (2025) to CIRSOC 201-2005 projects and
 * declared the substitution, arguing it could not produce a false pass because the 2025
 * table is at least as restrictive in every cell — 2005 caps at 600 mm where 2025 caps at
 * 400 mm, and 2005 carries no across-width provision at all.
 *
 * The safety argument was true and the provenance argument was wrong. A certificate stamped
 * "CIRSOC 201-2005" whose governing stirrup spacing came from the 2025 table names a rule it
 * did not apply, and the reviewing engineer has no way to see the difference. Conservatism
 * makes it a safe design; it does not make it a 2005 design.
 *
 * The 2005 text is not supplied with this repository, so the rule cannot be implemented.
 * `docs/codes/CIRSOC/SOURCES.md` already states the policy for this situation: data not
 * present in the supplied text "is marked unsupported in code rather than guessed". The same
 * precedent was set when an assumed INPRES-CIRSOC 103-II 2021 edition was withdrawn in
 * favour of the 2005 edition actually supplied.
 *
 * ── The consequence, asserted rather than hidden ──────────────────
 *
 * Transverse reinforcement is required in every beam, so refusing the rule means NO beam
 * reaches VERIFIED under the 2005 adapter. That is a large blast radius and it is the honest
 * outcome. These tests pin it down so it cannot be quietly re-opened.
 */

import { describe, expect, it } from 'vitest';
import frame from '../../../templates/fixtures/rc-design-qa-8.json';
import { runDesign } from '../candidate-search';
import { cirsoc201Adapter2025, cirsoc201Adapter2005 } from '../adapters/cirsoc201-adapter';
import { solveFixture } from './helpers';
import {
  transverseSpacingSupportedForEdition, TRANSVERSE_SPACING_EDITION,
} from '../../../codes/cirsoc201/transverse-spacing';
import { REGULATIONS } from '../../../codes/regulation';
import { optionsForRole } from '../../../codes/roles';

const solved = solveFixture(frame as never);

/** Re-stamp every context with an edition, the way a project setting would. */
function contextsAt(edition: '2005' | '2025') {
  return [...solved.contexts.values()].map((c) => ({ ...c, codeEdition: edition }));
}

describe('the premise: no CIRSOC 201-2005 text is supplied', () => {
  it('the regulation registry says so, which is why the rule cannot be implemented', () => {
    const e2005 = REGULATIONS.find((r) => r.id === 'cirsoc-201' && r.edition === '2005');
    const e2025 = REGULATIONS.find((r) => r.id === 'cirsoc-201' && r.edition === '2025');
    expect(e2005?.textAvailable).toBe(false);
    expect(e2025?.textAvailable).toBe(true);
    // If a 2005 text is ever supplied and converted, this test fails — which is the signal
    // to implement a SEPARATE §11.5 evaluator rather than to loosen the gate.
  });

  it('the app implements exactly one edition of the transverse-spacing rule', () => {
    expect(TRANSVERSE_SPACING_EDITION).toBe('2025');
    expect(transverseSpacingSupportedForEdition('2025')).toBe(true);
    expect(transverseSpacingSupportedForEdition('2005')).toBe(false);
  });
});

describe('2025 remains fully supported and is the default', () => {
  it('designs all eight members of the QA fixture to VERIFIED', () => {
    const s = runDesign(cirsoc201Adapter2025, contextsAt('2025') as never, {});
    expect(s.verified).toBe(8);
    expect(s.outcomes.size).toBe(8);
    for (const [, o] of s.outcomes) {
      expect(o.outcome).toBe('VERIFIED');
      expect(o.certificate).toBeDefined();
    }
  });

  it('is the edition a new project gets', () => {
    const concrete = optionsForRole('concrete')
      .filter((o) => o.regulation === 'cirsoc-201');
    const inForce = concrete.find((o) => o.edition === '2025');
    expect(inForce?.maturity).toBe('VALIDATED');
  });
});

describe('2005 REFUSES, at the capability gate', () => {
  const summary = () => runDesign(cirsoc201Adapter2005, contextsAt('2005') as never, {});

  it('certifies nothing — not one member reaches VERIFIED', () => {
    const s = summary();
    expect(s.verified).toBe(0);
    for (const [, o] of s.outcomes) {
      expect(o.certificate).toBeUndefined();
      expect(o.accepted).toBeUndefined();
    }
  });

  it('reports UNSUPPORTED, NOT SEARCH_EXHAUSTED', () => {
    // The distinction is the whole point. SEARCH_EXHAUSTED asserts that the code-permitted
    // envelope was explored and nothing in it worked — a claim about the regulation. This is
    // a claim about the APP: the rule is not implemented for this edition. Letting the search
    // run and come back empty would have produced the wrong one of the two.
    for (const [, o] of summary().outcomes) {
      expect(o.outcome).toBe('UNSUPPORTED');
      expect(o.limiting).toContain('unsupportedCheck');
      expect(o.searchStats.candidatesTried).toBe(0);
      expect(o.searchStats.verifierCalls).toBe(0);
      expect(o.searchStats.envelopeExhausted).toBe(false);
    }
  });

  it('gives every refusal a reason a reader can act on', () => {
    for (const [, o] of summary().outcomes) {
      expect(o.reasons.length).toBeGreaterThan(0);
    }
  });

  it('never mixes edition labels: the provenance says 2005 throughout', () => {
    const p = cirsoc201Adapter2005.provenance();
    expect(p.codeVersion).toBe('2005');
    expect(p.codeId).toBe('cirsoc-2005');
    // The verifier identity carries the edition, so a 2005 result can never be mistaken for
    // a 2025 one in a stored certificate.
    expect(p.verifierId).toContain('2005');
    expect(p.verifierId).not.toContain('2025');
    expect(cirsoc201Adapter2025.provenance().verifierId).not.toBe(p.verifierId);
  });

  it('declares the gap in the capability matrix, gated rather than silently absent', () => {
    // `gate: true` with `verify/generate: false` is the honest combination: the app cannot
    // decide the check, and a member it cannot decide may not be counted complete.
    for (const key of ['beamShear', 'ties'] as const) {
      const cap = cirsoc201Adapter2005.capabilityMatrix[key];
      expect(cap.facets.verify, key).toBe(false);
      expect(cap.facets.generate, key).toBe(false);
      expect(cap.facets.gate, key).toBe(true);
      expect(cap.limitation, key).toBeTruthy();
    }
  });

  it('leaves 2025 untouched — the gap is per-edition, not global', () => {
    for (const key of ['beamShear', 'ties'] as const) {
      const cap = cirsoc201Adapter2025.capabilityMatrix[key];
      expect(cap.facets.verify, key).toBe(true);
      expect(cap.facets.generate, key).toBe(true);
    }
  });

  it('cites no 2025 clause anywhere in the 2005 adapter\'s clause list', () => {
    // Rule provenance and edition label must agree. A 2025 clause number appearing under the
    // 2005 adapter is the mislabelling this whole gate exists to prevent.
    for (const c of cirsoc201Adapter2005.provenance().clauses) {
      expect(typeof c).toBe('string');
    }
    // The 2005 clause map renumbers wholesale; §9.7.6.2.2 is a 2025 identifier and must not
    // appear in it.
    expect(cirsoc201Adapter2005.provenance().clauses.join(' ')).not.toContain('9.7.6');
  });
});

describe('an unknown or absent edition fails CLOSED', () => {
  it('treats a context with no edition as unsupported rather than as 2025', () => {
    // Defaulting an unknown edition to the implemented one would silently design a project
    // whose edition nobody stated, which is how the original mislabelling would come back.
    const noEdition = [...solved.contexts.values()]
      .map((c) => ({ ...c, codeEdition: undefined }));
    const s = runDesign(cirsoc201Adapter2025, noEdition as never, {});
    expect(s.verified).toBe(0);
    for (const [, o] of s.outcomes) expect(o.outcome).toBe('UNSUPPORTED');
  });

  it('every context the production path built carries a supported edition', () => {
    // `solveFixture` goes through the real context builder, so this asserts the production
    // default rather than a hand-written literal.
    expect(solved.contexts.size).toBe(8);
    for (const [id, ctx] of solved.contexts) {
      expect(ctx.codeEdition, `element ${id}`).toBe('2025');
      expect(transverseSpacingSupportedForEdition(ctx.codeEdition), `element ${id}`).toBe(true);
    }
  });
});
