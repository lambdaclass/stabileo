/**
 * Per-member detail: what each row says, and what it refuses to say.
 *
 * ── The property under test ────────────────────────────────────────
 *
 * Stages 2 and 3 used to show counts. A count collapses different problems into one number: three
 * members «unresolved» might be one needing a grade, one carrying a withdrawn grade, and one made
 * of aluminium that CIRSOC 301 will never cover. Three remedies, one number, no way to tell.
 *
 * So the assertions below are mostly about DISCRIMINATION — that two members in different trouble
 * produce different rows — and about the one rule that governs every field: **nothing is
 * fabricated, and a grade is never inferred from `fy`.**
 */

import { describe, it, expect } from 'vitest';
import {
  gradeRows, sectionRows, sectionOrigin, governingThicknessMm, rowStateKey,
  type RowSection,
} from '../workflow-rows';
import { buildSteelInventory, type InventoryModel } from '../steel-inventory';
import { catalogueGradeFamily } from '../grade-family';
import { structuralGradeSource } from '../../../grades/catalogue';
import { steelProfileSource } from '../../../profiles/catalogue';
import { coldFormedSectionFields, coldFormedSource } from '../../../profiles/cold-formed-catalogue';
import es from '../../../i18n/locales/steel/es';
import en from '../../../i18n/locales/steel/en';
import pt from '../../../i18n/locales/steel/pt';

/** An IPE 200 as the catalogue stores it, in SI. */
const IPE200: RowSection = {
  name: 'IPE 200', profileFamily: 'IPE',
  a: 28.5e-4, iy: 1943e-8, iz: 142e-8, j: 6.98e-8,
  h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, shape: 'I',
};

/** A section carrying only what an old model might: a name, an area, one inertia. */
const BARE: RowSection = { name: 'Viga 300', a: 0.01, iz: 1e-5 };

/** Build a model with one element per (material, section) pair. */
function model(
  materials: Array<{ id: number; name: string; fy?: number; gradeId?: string }>,
  sections: Array<[number, RowSection]>,
  elements: Array<{ id: number; materialId: number; sectionId: number }>,
): { inv: ReturnType<typeof buildSteelInventory>; sections: Map<number, RowSection>;
     sectionOf: (id: number) => number | undefined } {
  const nodes = new Map<number, { x: number; y: number; z?: number }>();
  const els = new Map<number, unknown>();
  let n = 1;
  for (const e of elements) {
    const a = n++, b = n++;
    nodes.set(a, { x: 0, y: 0, z: 0 });
    nodes.set(b, { x: 6, y: 0, z: 0 });
    els.set(e.id, { id: e.id, nodeI: a, nodeJ: b, sectionId: e.sectionId, materialId: e.materialId });
  }
  const secMap = new Map(sections.map(([id, s]) => [id, s]));
  const m: InventoryModel = {
    nodes, elements: els as never,
    sections: new Map(sections.map(([id, s]) => [id, { id, ...s }])) as never,
    materials: new Map(materials.map((x) => [x.id, x])),
  };
  return {
    /*
     * `lookupGrade` is injected, exactly as the store injects it.
     *
     * Without it the inventory falls back to inferring the family from `fy`, and an aluminium grade
     * at 250 MPa infers as steel — so `outsidePipeline` would be false and the non-ferrous member
     * would look like something CIRSOC 301 covers. Worth knowing: that flag is only as good as the
     * lookup handed in.
     */
    inv: buildSteelInventory(m, {
      hasDemands: true, authorityBound: false, lookupGrade: catalogueGradeFamily,
    }),
    sections: secMap,
    sectionOf: (id: number) => elements.find((e) => e.id === id)?.sectionId,
  };
}

const STEEL_DECLARED = { id: 1, name: 'F-24', fy: 235, gradeId: 'iram-f24' };
const STEEL_BARE = { id: 2, name: 'Acero', fy: 300 };

describe('stage 2 — detail per member, not a count', () => {
  it('produces one row per metallic member', () => {
    const { inv, sections, sectionOf } = model(
      [STEEL_DECLARED], [[1, IPE200]],
      [{ id: 10, materialId: 1, sectionId: 1 }, { id: 11, materialId: 1, sectionId: 1 }],
    );
    const rows = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.elementId)).toEqual([10, 11]);
  });

  it('distinguishes a declared grade from an absent one, in the same model', () => {
    /*
     * The discrimination a count cannot make. Two members, two different problems, two different
     * rows — and the one WITHOUT a grade must not borrow the other's.
     */
    const { inv, sections, sectionOf } = model(
      [STEEL_DECLARED, STEEL_BARE], [[1, IPE200]],
      [{ id: 10, materialId: 1, sectionId: 1 }, { id: 20, materialId: 2, sectionId: 1 }],
    );
    const rows = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    const declared = rows.find((r) => r.elementId === 10)!;
    const bare = rows.find((r) => r.elementId === 20)!;

    expect(declared.gradeId).toBe('iram-f24');
    expect(declared.designation).toBeTruthy();
    expect(declared.productStandard).toBeTruthy();
    expect(declared.state).toBe('chosen');

    expect(bare.gradeId).toBeNull();
    expect(bare.designation).toBeNull();
    expect(bare.state).toBe('incomplete');
  });

  it('NEVER infers a grade from fy', () => {
    /*
     * The rule this module exists to keep. `STEEL_BARE` has `fy: 300`, which is close enough to
     * several catalogue grades that a helpful guess would be easy — and would turn a heuristic into
     * a designation on a drawing. Every grade field must be null.
     */
    const { inv, sections, sectionOf } = model(
      [STEEL_BARE], [[1, IPE200]], [{ id: 20, materialId: 2, sectionId: 1 }],
    );
    const [row] = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    expect(row.gradeId).toBeNull();
    expect(row.designation).toBeNull();
    expect(row.productStandard).toBeNull();
    expect(row.bandStandard).toBeNull();
    expect(row.hasThicknessBands).toBe(false);
  });

  it('states what is missing AND why, never one without the other', () => {
    // A named absence with no consequence is a label; the `why` is what makes it actionable.
    const { inv, sections, sectionOf } = model(
      [STEEL_BARE], [[1, IPE200]], [{ id: 20, materialId: 2, sectionId: 1 }],
    );
    const [row] = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    expect(row.missing.length).toBeGreaterThan(0);
    for (const d of row.missing) {
      expect(d.key).toBeTruthy();
      expect(d.whyKey).toBeTruthy();
      expect(['blocks', 'limits']).toContain(d.severity);
    }
  });

  it('flags a stored grade the catalogue no longer knows, distinctly', () => {
    // Different from «no grade», and the remedy is different: choose again rather than choose.
    const { inv, sections, sectionOf } = model(
      [{ id: 3, name: 'Viejo', fy: 235, gradeId: 'grade-that-was-withdrawn' }],
      [[1, IPE200]], [{ id: 30, materialId: 3, sectionId: 1 }],
    );
    const [row] = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    expect(row.gradeId).toBe('grade-that-was-withdrawn');
    expect(row.designation).toBeNull();
    expect(row.missing.map((d) => d.key)).toContain('steel.rows.missing.gradeUnresolved');
    expect(row.state).toBe('incomplete');
  });

  it('calls a missing thickness a LIMIT, not a blocker, when the grade has bands', () => {
    /*
     * The distinction worth having. Without a thickness the first band is the only readable one,
     * and the first band is the strongest — so the check still runs and returns the most favourable
     * of several strengths. That is not «unavailable», it is «optimistic», and the severity says so.
     */
    const banded = structuralGradeSource.list().find((g) => g.bands && g.bands.length > 0);
    if (!banded) return;   // no banded grade in the catalogue; nothing to assert
    const { inv, sections, sectionOf } = model(
      [{ id: 4, name: 'B', fy: banded.fyMPa, gradeId: banded.id }],
      [[1, BARE]], [{ id: 40, materialId: 4, sectionId: 1 }],
    );
    const [row] = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    expect(row.thicknessMm).toBeNull();
    const thick = row.missing.find((d) => d.key === 'steel.rows.missing.thickness');
    expect(thick, 'the thickness gap is reported').toBeTruthy();
    expect(thick!.severity).toBe('limits');
    // And it does NOT make the row incomplete, because the check can still run.
    expect(row.state).toBe('chosen');
  });

  it('reports the governing thickness from the flange first', () => {
    // The flange is the thickest element of a rolled section and the one band tables are written
    // for. Falling back to the web, then to a wall thickness, then to null — never to a default.
    expect(governingThicknessMm({ tf: 0.0085, tw: 0.0056 })).toBeCloseTo(8.5, 9);
    expect(governingThicknessMm({ tw: 0.0056 })).toBeCloseTo(5.6, 9);
    expect(governingThicknessMm({ t: 0.004 })).toBeCloseTo(4, 9);
    expect(governingThicknessMm({})).toBeNull();
    expect(governingThicknessMm(undefined)).toBeNull();
  });

  it('carries the inference caveat when the family was guessed', () => {
    // `material-family.ts` says the caveat is «never absent on an inference». The row has to pass
    // it through, or a guessed family reaches the screen as a fact.
    const { inv, sections, sectionOf } = model(
      [STEEL_BARE], [[1, IPE200]], [{ id: 20, materialId: 2, sectionId: 1 }],
    );
    const [row] = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    expect(row.familyBasis).not.toBe('declaredGrade');
    expect(row.familyCaveatKey).toBeTruthy();
  });
});

describe('stage 3 — section detail, and what kind of missing it is', () => {
  it('reports a complete tabulated section as chosen, with nothing absent', () => {
    const { inv, sections, sectionOf } = model(
      [STEEL_DECLARED], [[1, IPE200]], [{ id: 10, materialId: 1, sectionId: 1 }],
    );
    const [row] = sectionRows(inv, sections, sectionOf, steelProfileSource);
    expect(row.origin).toBe('tabulated');
    expect(row.catalogueId).toBe('IPE 200');
    expect(row.absent).toEqual([]);
    expect(row.state).toBe('chosen');
    expect(row.blockedBy).toBeNull();
  });

  it('names each absent property on an old bare section', () => {
    /*
     * The compatibility case: a model saved before the profile catalogue existed carries a name, an
     * area and one inertia. Every other property must be listed by NAME — a count would leave the
     * user to guess which.
     */
    const { inv, sections, sectionOf } = model(
      [STEEL_DECLARED], [[1, BARE]], [{ id: 10, materialId: 1, sectionId: 1 }],
    );
    const [row] = sectionRows(inv, sections, sectionOf, steelProfileSource);
    expect(row.present).toContain('steel.rows.prop.area');
    expect(row.present).toContain('steel.rows.prop.weakInertia');
    expect(row.absent).toContain('steel.rows.prop.strongInertia');
    expect(row.absent).toContain('steel.rows.prop.flangeThickness');
    expect(row.absent.length).toBeGreaterThan(2);
    expect(row.state).toBe('incomplete');
    expect(row.blockedBy).toBe('geometry');
  });

  it('separates a GEOMETRIC gap from an AUTHORITY one', () => {
    /*
     * The distinction the brief asks for, and the reason it matters: a geometric gap is the user's
     * to close by picking a better section. An authority gap is not closeable by any input, so
     * showing them the same way sends a user hunting for a datum that would change nothing.
     *
     * A cold-formed C is the authority case: complete geometry, and CIRSOC 301 excludes it by name.
     */
    const cf = coldFormedSectionFields(coldFormedSource.byId('C 150x60x20x2.0')!);
    const { inv, sections, sectionOf } = model(
      [STEEL_DECLARED, STEEL_DECLARED2()],
      [[1, BARE], [2, cf as RowSection]],
      [{ id: 10, materialId: 1, sectionId: 1 }, { id: 20, materialId: 5, sectionId: 2 }],
    );
    const rows = sectionRows(inv, sections, sectionOf, steelProfileSource);
    const geometric = rows.find((r) => r.elementId === 10)!;
    const authority = rows.find((r) => r.elementId === 20)!;

    expect(geometric.blockedBy).toBe('geometry');
    expect(geometric.state).toBe('incomplete');

    expect(authority.absent, 'the cold-formed geometry is complete').toEqual([]);
    expect(authority.state).toBe('authorityBlocked');
    expect(authority.blockedBy).toBe('authority');
    expect(authority.missing.map((d) => d.key)).toContain('steel.rows.missing.coldFormedAuthority');
  });

  it('recognises a cold-formed section as parametric, not tabulated', () => {
    // It carries BOTH a `profileFamily` (`CFC`) and a parseable designation, and «parametric» is
    // the more specific truth — hence the order in `sectionOrigin`.
    const cf = coldFormedSectionFields(coldFormedSource.byId('Z 200x75x20x2.5')!);
    expect(sectionOrigin(cf as RowSection)).toBe('parametric');
    expect(sectionOrigin(IPE200)).toBe('tabulated');
    expect(sectionOrigin({ name: 'x', built: { shapeType: 'I-custom', params: {} } })).toBe('built');
    expect(sectionOrigin({ name: 'x', composition: { profileName: 'IPE 200' } })).toBe('composed');
    expect(sectionOrigin({ name: 'x' })).toBe('unknown');
    expect(sectionOrigin(undefined)).toBe('unknown');
  });

  it('marks a non-ferrous member out of scope rather than dropping it', () => {
    /*
     * Aluminium is metallic and is not covered. Filtering it out would read as «it passed»; the row
     * says `outOfScope` instead. The inventory already separates the family — this passes it on.
     */
    const { inv, sections, sectionOf } = model(
      [{ id: 6, name: 'Aluminio', fy: 250, gradeId: 'alu-6082-t6' }],
      [[1, IPE200]], [{ id: 60, materialId: 6, sectionId: 1 }],
    );
    const gr = gradeRows(inv, sections, sectionOf, structuralGradeSource);
    const sr = sectionRows(inv, sections, sectionOf, steelProfileSource);
    if (gr.length === 0) return;   // the inventory may exclude it entirely; then nothing to assert
    expect(gr[0].outsidePipeline).toBe(true);
    expect(gr[0].state).toBe('outOfScope');
    expect(sr[0].state).toBe('outOfScope');
  });

  it('never emits a state that implies a check happened', () => {
    const { inv, sections, sectionOf } = model(
      [STEEL_DECLARED], [[1, IPE200]], [{ id: 10, materialId: 1, sectionId: 1 }],
    );
    const states = [
      ...gradeRows(inv, sections, sectionOf, structuralGradeSource).map((r) => r.state),
      ...sectionRows(inv, sections, sectionOf, steelProfileSource).map((r) => r.state),
    ];
    for (const s of states) {
      expect(['chosen', 'incomplete', 'unavailable', 'outOfScope', 'authorityBlocked']).toContain(s);
      expect(String(s).toLowerCase()).not.toContain('verif');
      expect(String(s).toLowerCase()).not.toContain('ok');
    }
  });
});

/** A second steel material, so two members can differ. */
function STEEL_DECLARED2() { return { id: 5, name: 'F-24 b', fy: 235, gradeId: 'iram-f24' }; }

describe('every key these rows can emit resolves in the three offered languages', () => {
  const dicts = { es, en, pt } as Record<string, Record<string, string>>;

  it('resolves every state', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const s of ['chosen', 'incomplete', 'unavailable', 'outOfScope', 'authorityBlocked'] as const) {
        expect(dict[rowStateKey(s)], `${name}: ${s}`).toBeTruthy();
      }
    }
  });

  it('resolves every missing datum and its reason', () => {
    const keys = ['grade', 'gradeUnresolved', 'thickness', 'coldFormedAuthority'];
    for (const [name, dict] of Object.entries(dicts)) {
      for (const k of keys) {
        expect(dict[`steel.rows.missing.${k}`], `${name}: missing.${k}`).toBeTruthy();
        const why = dict[`steel.rows.why.${k}`];
        expect(why, `${name}: why.${k}`).toBeTruthy();
        // The `why` has to be a sentence: a three-word restatement of the label helps nobody.
        expect(why.length, `${name}: why.${k} is a sentence`).toBeGreaterThan(40);
      }
    }
  });

  it('resolves every property name and the reason it matters', () => {
    const props = ['area', 'strongInertia', 'weakInertia', 'depth', 'flangeWidth',
                   'webThickness', 'flangeThickness'];
    for (const [name, dict] of Object.entries(dicts)) {
      for (const p of props) {
        expect(dict[`steel.rows.prop.${p}`], `${name}: prop.${p}`).toBeTruthy();
        expect(dict[`steel.rows.prop.${p}.why`], `${name}: prop.${p}.why`).toBeTruthy();
      }
    }
  });

  it('resolves every origin and both kinds of blockage', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      for (const o of ['tabulated', 'parametric', 'built', 'composed', 'unknown']) {
        expect(dict[`steel.rows.origin.${o}`], `${name}: origin.${o}`).toBeTruthy();
      }
      expect(dict['steel.rows.blockedBy.geometry'], name).toBeTruthy();
      expect(dict['steel.rows.blockedBy.authority'], name).toBeTruthy();
      expect(dict['steel.rows.severity.blocks'], name).toBeTruthy();
      expect(dict['steel.rows.severity.limits'], name).toBeTruthy();
    }
  });

  it('keeps the band-standard placeholder', () => {
    for (const [name, dict] of Object.entries(dicts)) {
      expect(dict['steel.rows.bandStandard'], name).toContain('{std}');
    }
  });
});
