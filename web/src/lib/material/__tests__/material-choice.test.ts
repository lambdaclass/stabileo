import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toMaterialFields, declaresGrade, choiceGradeId } from '../material-choice';
import { materialDataSheet } from '../data-sheet';
import { searchPresets, type MaterialPreset } from '../../data/material-presets';
import { structuralGradeSource } from '../../grades/catalogue';
import { materialFamilyOf } from '../../engine/steel/material-family';
import { catalogueGradeFamily } from '../../engine/steel/grade-family';

const preset = (category: string, name?: string): MaterialPreset => {
  const list = searchPresets('', category, { pro: true });
  const p = name ? list.find((x) => x.name === name) : list.find((x) => x.gradeId) ?? list[0];
  if (!p) throw new Error(`no preset for ${category}${name ? ` / ${name}` : ''}`);
  return p;
};

/** The one catalogue row with no grade id, whichever it is. Skips the test if there is none. */
const ungraded = (): MaterialPreset | null => {
  for (const c of ['acero', 'conformado', 'inox', 'aluminio', 'hormigon', 'madera']) {
    const p = searchPresets('', c, { pro: true }).find((x) => !x.gradeId);
    if (p) return p;
  }
  return null;
};

describe('the field the tab was dropping', () => {
  /*
   * The measurement this module exists for. `ProMaterialsTab.addPreset` wrote five fields and
   * discarded `gradeId`, `standard`, `region` and `fu`. `materialFamilyOf` prefers a declared
   * grade and otherwise falls back to `fy > 80`, which cannot tell one metal from another.
   */
  it('aluminium is aluminium once its grade travels with it', () => {
    const al = preset('aluminio');
    expect(al.gradeId).toBeTruthy();

    const asTheTabWroteIt = { name: al.name, e: al.e, nu: al.nu, rho: al.rho, fy: al.fy };
    expect(materialFamilyOf(asTheTabWroteIt as never, catalogueGradeFamily)).toEqual({
      family: 'steel',
      basis: 'inferredFromFy',
      caveatKey: 'steel.family.inferredMetalNotFerrousChecked',
    });

    const fields = toMaterialFields({ kind: 'preset', preset: al });
    expect(materialFamilyOf(fields as never, catalogueGradeFamily)).toEqual({
      family: 'aluminium',
      basis: 'declaredGrade',
    });
  });

  it('and steel stops resting on a magnitude', () => {
    const fields = toMaterialFields({ kind: 'preset', preset: preset('acero') });
    const verdict = materialFamilyOf(fields as never, catalogueGradeFamily);
    expect(verdict.family).toBe('steel');
    expect(verdict.basis).toBe('declaredGrade');
  });

  /*
   * All four families, not just the two that were measured. Timber and concrete both carry a
   * grade id — `en338-c16`, `cirsoc-h20` — so the declared-grade path has to answer for them
   * too, and it is the only path that can: timber C16 has fy = 0 or none at all, so the
   * `fy > 80` fallback would read it as concrete.
   */
  it.each([
    ['acero', 'steel'],
    ['aluminio', 'aluminium'],
    ['hormigon', 'concrete'],
    ['madera', 'timber'],
  ])('%s is classified as %s from its declared grade', (category, expected) => {
    const p = preset(category);
    const fields = toMaterialFields({ kind: 'preset', preset: p });
    const verdict = materialFamilyOf(fields as never, catalogueGradeFamily);
    expect(verdict.family, `${p.name} (${p.gradeId})`).toBe(expected);
    expect(verdict.basis).toBe('declaredGrade');
  });

  it('carries the product standard, the region and fu as well', () => {
    const p = preset('acero');
    const f = toMaterialFields({ kind: 'preset', preset: p });
    expect(f.standard).toBe(p.standard);
    expect(f.region).toBe(p.region);
    expect(f.fu).toBe(p.fu);
  });

  /*
   * An absent field and an empty one are different claims, and the second satisfies a lookup
   * that then returns nothing.
   *
   * I first wrote this against a concrete preset, assuming the non-metals carry no grade id.
   * They do — `H-20` is `cirsoc-h20`, `C16` is `en338-c16`, and all six categories are fully
   * identified. Exactly ONE row in the whole catalogue has none, so the test looks for that row
   * instead of assuming which category it is in.
   */
  it('omits a field the source does not have, rather than writing an empty one', () => {
    const p = ungraded();
    if (!p) return;
    const f = toMaterialFields({ kind: 'preset', preset: p });
    expect('gradeId' in f).toBe(false);
    expect(f.gradeId).toBeUndefined();
  });

  it('every other catalogue row does carry one', () => {
    const all = ['acero', 'conformado', 'inox', 'aluminio', 'hormigon', 'madera']
      .flatMap((c) => searchPresets('', c, { pro: true }));
    const without = all.filter((p) => !p.gradeId);
    expect(without.length, `rows with no grade id: ${without.map((p) => p.name).join(', ')}`)
      .toBeLessThanOrEqual(1);
  });
});

describe('a grade chosen directly', () => {
  const grade = () => structuralGradeSource.list({ families: ['hot-rolled'] })[0];

  it('writes the designation as the name, with the standard as its own field', () => {
    const g = grade();
    const f = toMaterialFields({ kind: 'grade', grade: g });
    expect(f.name).toBe(g.designation);
    // Not «F-24 (IRAM-IAS U 500-503)»: folding the standard into the name is how a designation
    // stops being matchable.
    expect(f.name).not.toContain(g.productStandard);
    expect(f.standard).toBe(g.productStandard);
  });

  it('always declares its grade', () => {
    const g = grade();
    expect(declaresGrade({ kind: 'grade', grade: g })).toBe(true);
    expect(choiceGradeId({ kind: 'grade', grade: g })).toBe(g.id);
  });
});

describe('the data sheet', () => {
  it('keeps the product standard and the design code apart', () => {
    const s = materialDataSheet({ preset: preset('acero') });
    expect(s.identity.productStandard).toBeTruthy();
    // A product standard fixes what the steel IS; a design code says how to verify a member.
    expect(s.identity.productStandard).not.toMatch(/CIRSOC|Eurocode|AISC|NBR/);
    expect(s.identity.designCodes.length).toBeGreaterThan(0);
  });

  it('every property row carries its basis', () => {
    const s = materialDataSheet({ preset: preset('acero') });
    expect(s.rows.length).toBeGreaterThan(0);
    for (const r of s.rows) expect(r.quantity.basis).toBeTruthy();
  });

  /*
   * The third standard, and the reason `GradeEntry` carries `bandStandard` separately: every
   * band in this catalogue comes from a DESIGN code's table, never from the product standard.
   * Showing it beside the designation would attribute the table to a document that never
   * published it.
   */
  it('shows the band table under the standard that publishes it', () => {
    const banded = structuralGradeSource.list({ families: ['hot-rolled'] })
      .find((g) => g.bands && g.bands.length > 0);
    if (!banded) return;
    const s = materialDataSheet({ grade: banded });
    expect(s.bands.present).toBe(true);
    if (!s.bands.present) throw new Error('unreachable');
    expect(s.bands.standard).toBe(banded.bandStandard);
    expect(s.bands.standard).not.toBe(banded.productStandard);
  });

  it('distinguishes "one value for every thickness" from "no band concept at all"', () => {
    const concrete = materialDataSheet({ preset: preset('hormigon') });
    expect(concrete.bands.present).toBe(false);
    expect(concrete.bands.present === false && concrete.bands.reasonKey)
      .toBe('material.sheet.bands.notApplicable');

    const unbanded = structuralGradeSource.list({ families: ['hot-rolled'] })
      .find((g) => !g.bands || g.bands.length === 0);
    if (!unbanded) return;
    const s = materialDataSheet({ grade: unbanded });
    expect(s.bands.present === false && s.bands.reasonKey)
      .toBe('material.sheet.bands.singleValue');
  });

  it('names the classification limitation only when no grade is declared', () => {
    const p = ungraded();
    if (!p) return;
    const s = materialDataSheet({ preset: p });
    const keys = s.limitations.filter((l) => l.kind === 'classification').map((l) => l.key);
    expect(keys).toContain('material.sheet.limit.noGradeId');
  });

  /*
   * The non-metals are identified but not described by the METAL grade database, and those are
   * different facts. The sheet says which one applies rather than showing an empty card.
   */
  it('says when a grade is known but lives outside the metal database', () => {
    const s = materialDataSheet({ preset: preset('hormigon') });
    expect(s.identity.gradeId).toBeTruthy();
    expect(s.limitations.map((l) => l.key)).toContain('material.sheet.limit.gradeNotInMetalDatabase');
  });

  it('and still shows the numbers the preset carries, marked as typical', () => {
    const s = materialDataSheet({ preset: preset('hormigon') });
    expect(s.rows.length).toBe(6);
    const e = s.rows.find((r) => r.key === 'e')!;
    expect(e.quantity.value).toBeGreaterThan(0);
    // Not promoted to `productStandard`: the preset names a standard but does not say which of
    // its numbers that standard fixes.
    expect(e.quantity.basis).toBe('typicalValue');
    // The shear modulus is exact isotropic elasticity on two present numbers, so it is derived
    // here exactly as on a full grade card.
    expect(s.rows.find((r) => r.key === 'g')!.quantity.basis).toBe('derived');
  });

  it('and does not, when one is', () => {
    const s = materialDataSheet({ preset: preset('acero') });
    expect(s.limitations.filter((l) => l.kind === 'classification')).toHaveLength(0);
    expect(s.identity.gradeId).toBeTruthy();
  });
});

describe('the materials tab uses the conversion instead of hand-picking fields', () => {
  const read = (p: string) =>
    readFileSync(resolve(__dirname, '../../../components/pro', p), 'utf8');
  const TAB = read('ProMaterialsTab.svelte');
  const MODAL = read('material/ProMaterialModal.svelte');
  const SHEET = read('material/MaterialDataSheet.svelte');

  it('no longer builds the material literal by hand', () => {
    expect(TAB).toContain('toMaterialFields');
    // The five-field literal that dropped the grade.
    expect(TAB).not.toMatch(/addMaterial\(\{\s*name: p\.name/);
  });

  it('mounts the modal and offers a way in', () => {
    expect(TAB).toContain('ProMaterialModal');
    expect(TAB).toContain('pro-open-material-modal');
  });

  it('the modal behaves like a dialog, the same way the section modal does', () => {
    expect(MODAL).toContain('role="dialog"');
    expect(MODAL).toContain('aria-modal="true"');
    expect(MODAL).toContain("e.key === 'Escape'");
    expect(MODAL).toContain("e.key !== 'Tab'");
    expect(MODAL).toContain('returnFocus');
    expect(MODAL).toContain('data-autofocus');
  });

  it('walks the list with the keyboard, not only the mouse', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      expect(MODAL, key).toContain(`e.key === '${key}'`);
    }
  });

  /*
   * The catalogue is Basic's. Duplicating it is the one thing this was told not to do, and the
   * check is that the modal reads `material-presets` and never restates a grade table.
   */
  /*
   * Value imports only, the same distinction `steel-surface-audit.test.ts` draws for the profile
   * pickers: naming a type like `GradeRegion` is fine and is what a filter chip is typed with;
   * pulling the TABLE in is what bypasses the shipped catalogue. My first version banned the
   * module outright and flagged `import type { GradeRegion }`, which imports no data at all.
   */
  it('reuses the shipped catalogue rather than carrying its own', () => {
    expect(MODAL).toContain("from '../../../lib/data/material-presets'");
    for (const table of ['data/structural-grades', 'data/non-metal-grades', 'data/iram-']) {
      const valueImport = new RegExp(`import\\s+(?!type)[^;]*from '[^']*${table}`);
      expect(valueImport.test(MODAL), `imports ${table} as a value`).toBe(false);
    }
    // And no inline table of its own.
    expect(MODAL).not.toMatch(/const\s+[A-Z_]+\s*=\s*\[\s*\{\s*name:/);
  });

  it('every property row shows its authority', () => {
    expect(SHEET).toContain('msheet-basis-');
    expect(SHEET).toMatch(/material\.sheet\.basis\.\$\{row\.quantity\.basis\}/);
  });

  /*
   * Three different standards on one card, and the band table belongs to none of the other two.
   * Printing it beside the designation would attribute a design code's table to the product
   * standard, which is why `GradeEntry` carries `bandStandard` separately in the first place.
   */
  it('prints the band standard on the band block and nowhere else', () => {
    const bandBlock = SHEET.slice(SHEET.indexOf("msheet-band-standard"));
    expect(bandBlock).toContain('sheet.bands.standard');
    const identityBlock = SHEET.slice(SHEET.indexOf('msheet-designation'), SHEET.indexOf('msheet-band-standard'));
    expect(identityBlock).not.toContain('bands.standard');
  });

  it('says once, at the end, that a grade is not a verification', () => {
    expect(MODAL).toContain('material.modal.noAuthority');
    const upper = MODAL.toUpperCase();
    expect(upper).not.toContain('VERIFIED');
    expect(upper).not.toContain('VERIFICADO');
  });

  it('uses tokens, not hardcoded colours', () => {
    for (const src of [MODAL, SHEET]) {
      const style = src.slice(src.indexOf('<style>'));
      expect([...style.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])).toEqual([]);
    }
  });
});
