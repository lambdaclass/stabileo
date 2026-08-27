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

/**
 * B-01, closed: the materials tab holds no second source of material creation.
 *
 * The tab used to carry THREE controls that added a material — a strip of preset buttons, the
 * button that opens the dialog, and a `<details>` form for a hand-entered one. The two
 * catalogue paths were not the old defect: both went through `toMaterialFields`, so every field
 * travelled by either. What the inline strip lacked was the origin filter, the data sheet's
 * per-field authority, the thickness bands, the deep grade panel and the dialog's keyboard —
 * and it was the path nearer to hand, so a user took the poorer catalogue without knowing a
 * richer one existed.
 *
 * Asserted as absence of the MACHINERY rather than absence of a rendered strip, for the same
 * reason `pro-section-modal-contract.test.ts` does: a list is easy to hide and easy to bring
 * back. A tab that imports no catalogue cannot grow a second picker without this failing first.
 */
describe('the materials tab is not a second source of material creation', () => {
  const TAB = readFileSync(
    resolve(__dirname, '../../../components/pro/ProMaterialsTab.svelte'), 'utf8',
  );

  /*
   * The tab with its prose removed.
   *
   * The absence assertions below name the machinery that must not come back, and the comment
   * EXPLAINING why each was removed contains every one of those strings. Reading the raw file
   * would make the file's own documentation fail its own test, and the only way to pass would
   * be to stop explaining the decision. Stripping comments first is what lets the component say
   * why it is shaped this way.
   */
  const CODE = TAB
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('holds no catalogue of its own', () => {
    for (const gone of [
      'MATERIAL_CATEGORIES', // the six category tabs
      'searchPresets',       // its own search over the presets
      'MaterialPreset',      // the rows behind them
      'function addPreset',  // its own add path, beside the dialog's
      'cat-tabs',
      'preset-item',
    ]) {
      expect(CODE, gone).not.toContain(gone);
    }
  });

  it('holds no hand-entry form of its own', () => {
    for (const gone of ['function addCustom', 'showCustom', 'custom-form', 'newRho']) {
      expect(CODE, gone).not.toContain(gone);
    }
  });

  /*
   * One call site, and it is the dialog's.
   *
   * `addMaterial` still appears — the tab is where the dialog's choice lands — but exactly once,
   * and inside `applyChoice`. Counting is what catches a second writer that a name-based check
   * would miss, because the second one would be called something else.
   */
  it('writes a material in exactly one place, through the conversion', () => {
    expect([...CODE.matchAll(/modelStore\.addMaterial\(/g)]).toHaveLength(1);
    expect(CODE).toContain('toMaterialFields');
    // `updateMaterial` stays: the two per-material project settings EDIT, they do not create.
    expect(CODE).toContain('updateMaterial');
  });

  it('still reaches the dialog, and asks it for the hand-entry division', () => {
    expect(TAB).toContain('ProMaterialModal');
    expect(TAB).toContain('pro-open-material-modal');
    expect(TAB).toContain('allowCustom');
    // The region keeps its name, so the surface stays findable by the id the QA sheet uses.
    expect(TAB).toContain('pro-add-material-panel');
  });

  /*
   * The trigger is not behind a disclosure any more.
   *
   * It was a collapsed `<details>` because it hid a picker the height of the panel. With the
   * picker gone, a disclosure would be a click that reveals a button — and the E2E helper that
   * had to open it first is the evidence that the extra step was real.
   */
  it('does not hide the one trigger behind a disclosure', () => {
    expect(CODE).not.toContain('<details');
  });
});

/**
 * The hand-entered material: what it writes, and the four fields it refuses to invent.
 */
describe('a custom material states what it is, and no more', () => {
  const custom = { kind: 'custom', name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275 } as const;

  it('writes the five fields it was given', () => {
    expect(toMaterialFields(custom)).toEqual({
      name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275,
    });
  });

  /*
   * The inverse of the defect this module exists for. There, a field the source HAD was being
   * dropped; here, a field the source does NOT have must not be synthesised. A `gradeId` of `''`
   * would satisfy a lookup that then returns nothing, and a `standard` of `'—'` would print as
   * an authority on the data sheet.
   */
  it('invents no grade, no standard and no origin', () => {
    const f = toMaterialFields(custom) as unknown as Record<string, unknown>;
    for (const absent of ['gradeId', 'standard', 'region', 'fu']) {
      expect(f, absent).not.toHaveProperty(absent);
    }
  });

  it('omits fy entirely when the material has no yield point', () => {
    const noFy = { kind: 'custom', name: 'X', e: 30000, nu: 0.2, rho: 24 } as const;
    expect(toMaterialFields(noFy)).not.toHaveProperty('fy');
  });

  /*
   * It declares no grade, and that is a fact about the material rather than a shortcoming of
   * the form. `materialFamilyOf` therefore falls back to `fy`, which is exactly what the
   * panel's own note says on screen — and what the generators' `allowCustom = false` avoids.
   */
  it('declares no grade, and carries no id to persist', () => {
    expect(declaresGrade(custom)).toBe(false);
    expect(choiceGradeId(custom)).toBeNull();
    const family = materialFamilyOf(toMaterialFields(custom) as never, catalogueGradeFamily);
    expect(family).toMatchObject({ family: 'steel', basis: 'inferredFromFy' });
    /*
     * And the inference says so on screen. This is the one place a custom material is worse than
     * a catalogued one, and the caveat key is how that reaches the user rather than staying a
     * property of the classifier.
     */
    expect(family.caveatKey).toBeTruthy();
  });
});

/**
 * The dialog's second division, and the keyboard it must not break.
 */
describe('the dialog carries the hand-entry division the tab gave up', () => {
  const read = (p: string) =>
    readFileSync(resolve(__dirname, '../../../components/pro', p), 'utf8');
  const MODAL = read('material/ProMaterialModal.svelte');
  const PANEL = read('material/CustomMaterialPanel.svelte');

  it('offers exactly two divisions, and only when the caller allows the second', () => {
    expect(MODAL).toContain('material-division-catalogue');
    expect(MODAL).toContain('material-division-custom');
    expect(MODAL).toContain('role="tablist"');
    // The strip is absent for a caller that forbids it, rather than a single disabled tab.
    expect(MODAL).toMatch(/\{#if allowCustom\}/);
    expect(MODAL).toContain('allowCustom = false');
  });

  /*
   * A caller that forbids the division must not be left showing it. Without this the generators
   * could land on `custom` — for instance if the prop were bound and flipped — and their
   * `onApply` keeps only `choiceGradeId`, which a custom material answers with `null`: a control
   * that appears to do nothing.
   */
  it('cannot be left on a division the caller forbids', () => {
    expect(MODAL).toMatch(/if \(!allowCustom && division === 'custom'\) division = 'catalogue'/);
  });

  /*
   * The arrow keys steer the LIST. On the hand-entry division there is no list, and they belong
   * to the text fields being typed in — stealing them there is how a caret stops moving.
   */
  it('gives the arrow keys back to the form on the hand-entry division', () => {
    expect(MODAL).toMatch(/if \(division === 'custom'\)\s*\{\s*\n?\s*if \(e\.key !== 'Tab'\) return;/);
  });

  it('keeps Escape and the Tab trap on both divisions', () => {
    expect(MODAL).toContain("e.key === 'Escape'");
    expect(MODAL).toContain("e.key !== 'Tab'");
    expect(MODAL).toContain('returnFocus');
  });

  /* Focus has somewhere to land on the new division too. */
  it('has an autofocus target on the hand-entry division', () => {
    expect(PANEL).toContain('data-autofocus');
    expect(MODAL).toContain('[data-autofocus]');
  });

  it('refuses to write a material the form cannot describe', () => {
    expect(MODAL).toContain('canApply');
    expect(MODAL).toContain('disabled={!canApply}');
    // And says WHY, rather than leaving a disabled button as the only feedback.
    expect(PANEL).toContain('material-custom-problem');
  });

  /*
   * The bounds are on the physics. The inline form checked only `isNaN`, so `nu = 3` and
   * `rho = -78.5` both reached the model — a Poisson ratio outside (-1, 0.5) means a negative
   * bulk or shear modulus, and the solver would take it.
   */
  it('bounds Poisson, E and the unit weight', () => {
    expect(PANEL).toContain('nuV <= -1 || nuV >= 0.5');
    expect(PANEL).toMatch(/eV === null \|\| eV <= 0/);
    expect(PANEL).toMatch(/rhoV === null \|\| rhoV < 0/);
  });

  /* A Spanish keyboard produces a decimal comma, and `parseFloat('0,3')` is `0`. */
  it('reads a decimal comma rather than silently truncating it', () => {
    expect(PANEL).toContain("replace(',', '.')");
  });

  it('gives every control one focus ring, and uses tokens for it', () => {
    expect(PANEL).toContain(':focus-visible');
    expect(PANEL).toContain('--st-value');
    const style = PANEL.slice(PANEL.indexOf('<style>'));
    expect([...style.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])).toEqual([]);
  });
});

/**
 * The generators keep the narrow selector, and that is the half worth pinning.
 *
 * `onApply` there keeps `choiceGradeId(choice)` and nothing else. A custom material answers that
 * with `null`, so offering the division would put a control on screen that reads as «no grade
 * chosen» after the user filled in five fields.
 */
describe('the generators do not get the hand-entry division', () => {
  const GEN = readFileSync(
    resolve(__dirname, '../../../components/pro/generators/ProGeneratorsPanel.svelte'), 'utf8',
  );

  it('mounts the shared selector without allowing custom', () => {
    expect(GEN).toContain('ProMaterialModal');
    const mount = GEN.slice(GEN.indexOf('<ProMaterialModal'));
    const tag = mount.slice(0, mount.indexOf('/>'));
    expect(tag).toContain('categories={METAL_CATEGORIES}');
    expect(tag).not.toContain('allowCustom');
  });
});
