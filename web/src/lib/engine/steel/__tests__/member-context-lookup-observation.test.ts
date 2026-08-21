/**
 * What passing the grade catalogue to `member-context` would actually change.
 *
 * ── Why this file exists, and what it deliberately does not do ─────
 *
 * `buildAllMemberContexts` accepts `opts.lookupGrade` and its only production caller
 * (`design-run.svelte.ts:115`) does not pass it, so the concrete pipeline still decides who
 * enters it from the magnitude of `fy`. M1 wired the same lookup into the metallic surface, so
 * the two now answer one question with two authorities. Point 2 of
 * `docs/handoffs/m1-h1-coordination.md` proposes the one-argument fix and assigns it to H1,
 * because it can change WHICH members get designed and the concrete pipeline is not M1's.
 *
 * This file is the evidence for that decision, not the change. It touches nothing shared: it
 * injects the lookup explicitly at the call it makes itself, so every assertion here is a
 * property of `buildAllMemberContexts`'s own parameter and stays true before and after H1 wires
 * the call site. Nothing here becomes a landmine when they do.
 *
 * ── The finding ────────────────────────────────────────────────────
 *
 * The metallic side of the change is a no-op: a steel or aluminium member is excluded from the
 * concrete pipeline either way, only the reason improves. What the wiring also fixes is not
 * metallic at all, and it is the reason this is worth H1 reading:
 *
 *   **Every catalogued timber class is currently handed to the concrete pipeline.**
 *
 * EN 338 runs from C16 to D60, so every class has a characteristic bending strength at or below
 * the 80 MPa concrete ceiling. `materialFamilyOf` reads that magnitude and answers `concrete`,
 * the filter keeps the member, and a C24 beam is designed as if it were 24 MPa concrete. With
 * the lookup passed, the declared grade says `timber` and the member is excluded — which is what
 * the metallic surface has been doing since `6d274e37`.
 */

import { describe, it, expect } from 'vitest';
import { buildAllMemberContexts, buildMemberContext, type ContextModelData } from '../../design/member-context';
import { catalogueGradeFamily } from '../grade-family';
import { TIMBER } from '../../../data/non-metal-grades';

/** One horizontal member, one material. The smallest model that can answer the question. */
function oneMember(material: { id: number; name: string; fy?: number; gradeId?: string }): ContextModelData {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 6, y: 0, z: 0 }],
    ]),
    elements: new Map([
      [10, { id: 10, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: material.id, type: 'frame' }],
    ]),
    sections: new Map([[1, { id: 1, name: 'V 30x50', b: 0.3, h: 0.5 }]]),
    // `gradeId` is not in `ContextModelData`'s material shape, which is why it is cast: the
    // interface predates the field and `materialFamilyOf` reads it defensively. Recorded here
    // because it is the one thing H1 may want to widen while they are in the file.
    materials: new Map([[material.id, material as never]]),
    supports: new Map(),
  };
}

const withLookup = { lookupGrade: catalogueGradeFamily };

describe('the metallic half of the change is a no-op', () => {
  it('excludes a steel member either way, and only the reason improves', () => {
    const model = oneMember({ id: 1, name: 'F-36', fy: 360, gradeId: 'iram-f36' });

    // Without the lookup: excluded because 360 is a big number.
    expect(buildAllMemberContexts(model).size).toBe(0);
    expect(buildMemberContext(10, model)!.materialFamily).toBe('steel');

    // With it: excluded because the project says F-36. Same outcome, checkable basis.
    expect(buildAllMemberContexts(model, withLookup).size).toBe(0);
    expect(buildMemberContext(10, model, withLookup)!.materialFamily).toBe('steel');
  });

  it('excludes an aluminium member either way, and stops calling it steel', () => {
    // 6082-T6's proof stress is 250 MPa, above the ceiling, so the inference calls it steel and
    // the filter drops it. The declaration calls it aluminium and the filter drops it too — but
    // now the surface that lists it can say which metal it is.
    const model = oneMember({ id: 1, name: '6082-T6', fy: 250, gradeId: 'alu-6082-t6' });
    expect(buildAllMemberContexts(model).size).toBe(0);
    expect(buildAllMemberContexts(model, withLookup).size).toBe(0);
    expect(buildMemberContext(10, model)!.materialFamily).toBe('steel');
    expect(buildMemberContext(10, model, withLookup)!.materialFamily).toBe('aluminium');
  });

  it('keeps a declared concrete inside the pipeline, which is the case that must not move', () => {
    // The whole catalogue of concrete runs to 50 MPa, so no declared concrete changes side. This
    // is the assertion that says the change cannot cost H1 a member it was designing.
    const model = oneMember({ id: 1, name: 'H-25', fy: 25, gradeId: 'cirsoc-h25' });
    expect(buildAllMemberContexts(model).size).toBe(1);
    expect(buildAllMemberContexts(model, withLookup).size).toBe(1);
    expect(buildMemberContext(10, model, withLookup)!.materialFamily).toBe('concrete');
  });
});

describe('the half that is not metallic, and is the reason to read this', () => {
  it('hands every catalogued timber class to the concrete pipeline without the lookup', () => {
    // EN 338 runs C16 to D60. Every class is at or under the 80 MPa ceiling, so the inference
    // answers `concrete` for all of them and the filter keeps all of them.
    for (const w of TIMBER) {
      const model = oneMember({ id: 1, name: w.designation, fy: w.fmk, gradeId: w.id });
      expect(buildAllMemberContexts(model).size, `${w.designation} without lookup`).toBe(1);
      expect(buildMemberContext(10, model)!.materialFamily, w.designation).toBe('concrete');
    }
  });

  it('excludes every one of them with the lookup passed', () => {
    for (const w of TIMBER) {
      const model = oneMember({ id: 1, name: w.designation, fy: w.fmk, gradeId: w.id });
      expect(buildAllMemberContexts(model, withLookup).size, `${w.designation} with lookup`).toBe(0);
      expect(buildMemberContext(10, model, withLookup)!.materialFamily, w.designation).toBe('timber');
    }
  });

  it('shows the size of the gap on the class most likely to be modelled', () => {
    // C24 is the ordinary European framing class, and its 24 MPa is indistinguishable from a
    // 24 MPa concrete by magnitude alone. A member designed on that reading gets concrete
    // reinforcement rules applied to timber.
    const c24 = oneMember({ id: 1, name: 'C24', fy: 24, gradeId: 'en338-c24' });
    expect(buildMemberContext(10, c24)!.materialFamily).toBe('concrete');
    expect(buildMemberContext(10, c24, withLookup)!.materialFamily).toBe('timber');
  });
});

describe('what the change cannot do', () => {
  it('leaves a member with no declared grade exactly where it was', () => {
    // Every project saved before the picker carried the field. The inference is kept for them,
    // so wiring the lookup is additive rather than a migration.
    const legacy = oneMember({ id: 1, name: 'Hormigón', fy: 25 });
    expect(buildAllMemberContexts(legacy).size).toBe(1);
    expect(buildAllMemberContexts(legacy, withLookup).size).toBe(1);
    expect(buildMemberContext(10, legacy, withLookup)!.materialFamily).toBe('concrete');
  });

  it('does not carry the BASIS of the family, which is a gap H1 may want to close', () => {
    /*
     * `materialFamilyOf` returns a verdict with its basis attached — `declaredGrade` or
     * `inferredFromFy` — and `buildMemberContext` keeps only `verdict.family` (line 245). So a
     * concrete surface cannot say whether a member's family was declared or guessed, which is
     * exactly the distinction the metallic panel shows with `steel.panel.inferredWarning`.
     *
     * Asserted as an absence rather than left as a remark, because an earlier version of this
     * test read a `familyBasis` that does not exist and passed on `undefined` — a vacuous
     * assertion is worse than no assertion. If H1 adds the field, this fails and the note gets
     * rewritten as coverage.
     */
    const declared = buildMemberContext(10, oneMember({ id: 1, name: 'H-25', fy: 25, gradeId: 'cirsoc-h25' }), withLookup)!;
    const guessed = buildMemberContext(10, oneMember({ id: 1, name: 'H-25', fy: 25 }), withLookup)!;
    expect(declared.materialFamily).toBe(guessed.materialFamily);
    expect(Object.keys(declared)).not.toContain('familyBasis');
    // The two contexts are indistinguishable on this axis, which is the gap.
    expect(Object.keys(declared).some((k) => /basis|inferred|declared/i.test(k))).toBe(false);
  });

  it('leaves a member whose grade the catalogue no longer knows on the inference', () => {
    // A withdrawn grade must not make a member unclassifiable — falling back is the contract.
    const stale = oneMember({ id: 1, name: 'H-25', fy: 25, gradeId: 'withdrawn-1957' });
    expect(buildAllMemberContexts(stale, withLookup).size).toBe(1);
    expect(buildMemberContext(10, stale, withLookup)!.materialFamily).toBe('concrete');
  });
});
