/**
 * The metallic surface, audited as a whole rather than module by module.
 *
 * ── What this file is for ──────────────────────────────────────────
 *
 * Every other suite on this branch checks one thing well: the catalogue queries, the derived
 * properties, the grade source, the bracing. This one checks the properties that only exist
 * ACROSS them, and that a per-module test therefore cannot see:
 *
 *   · the five declared limitations of the joints panel are still five, and still those five;
 *   · every number a picker shows names an authority, and the set of authorities is closed;
 *   · the catalogue and the grade source stay reusable — a component holds a source, never a
 *     table, so the general PRO picker can hand either of them a different one;
 *   · provenance is never invented: every standard, every band source, every id resolves;
 *   · and the two mitigations M1 owes to the coordination handoff — the threshold that exists
 *     twice, and PR21's picker keys that no gate covered.
 *
 * The last two are the interesting ones. Both are cases where the honest move was NOT to edit a
 * shared file, so what M1 can do instead is make the divergence loud. See
 * `docs/handoffs/m1-h1-coordination.md`, points 1 and 4.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { materialFamilyOf, CONCRETE_FY_CEILING } from '../material-family';
import { catalogueGradeFamily } from '../grade-family';
import { rcCheckability } from '../../auto-verify';
import { queryProfiles, steelProfileSource, standardsInFamily } from '../../../profiles/catalogue';
import { profileProperties, PROPERTY_BASES, propertyRows } from '../../../profiles/properties';
import { GRADE_BASES, bandTable, gradePropertyRows, queryGrades, structuralGradeSource } from '../../../grades/catalogue';
import { FAMILY_CLASSIFICATION } from '../../../data/section-catalog';
import esMain from '../../../i18n/locales/es';
import enMain from '../../../i18n/locales/en';
import ptMain from '../../../i18n/locales/pt';

const SRC = new URL('../../../..', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

// ─── The five declared gaps ──────────────────────────────────────────

describe('the joints panel keeps its five limitations, and exactly those', () => {
  const tab = read('components/pro/ProConnectionsTab.svelte');
  const block = tab.slice(tab.indexOf('const GAPS = ['), tab.indexOf('] as const;'));
  const ids = [...block.matchAll(/id: '([A-Za-z]+)'/g)].map((m) => m[1]);

  it('declares the five by name, so removing one is a visible change', () => {
    // Pinned by VALUE rather than by count. A count would let a limitation be swapped for
    // another and stay green, and these five are the ones that were audited by reading the
    // code — base metal rupture, bolt group geometry, torsion, aluminium, FvExcl.
    expect([...ids].sort()).toEqual(
      ['aluminium', 'baseMetal', 'boltGeometry', 'fvExcl', 'torsion'],
    );
  });

  it('separates a missing limit state from a number that is simply not drawn', () => {
    // `affects` is the field that earns the list its place, and torsion is the case: the number
    // exists and is not shown, which is not the same kind of statement as "nothing computes
    // this". A list where every entry affected the result would be a list of apologies.
    const affects = Object.fromEntries(
      [...block.matchAll(/id: '([A-Za-z]+)', affects: (true|false)/g)].map((m) => [m[1], m[2] === 'true']),
    );
    expect(affects.torsion).toBe(false);
    expect(affects.baseMetal).toBe(true);
    expect(affects.boltGeometry).toBe(true);
    expect(affects.aluminium).toBe(true);
    expect(affects.fvExcl).toBe(true);
  });

  it('says none of it is certifiable, once, at the end', () => {
    expect(tab).toContain('conn.gap.notCertifiable');
    for (const dict of [esMain, enMain, ptMain] as unknown as Record<string, string>[]) {
      expect(dict['conn.gap.notCertifiable']).toBeTruthy();
    }
  });
});

// ─── Authorities are a closed set ────────────────────────────────────

describe('every number a metallic picker shows names its authority', () => {
  it('uses only the declared property bases, on every profile in the catalogue', () => {
    for (const e of queryProfiles()) {
      for (const row of propertyRows(profileProperties(e))) {
        expect(PROPERTY_BASES, `${e.id}.${row.key}`).toContain(row.quantity.basis);
      }
    }
  });

  it('uses only the declared grade bases, on every grade in the catalogue', () => {
    for (const g of queryGrades()) {
      for (const row of gradePropertyRows(g)) {
        expect(GRADE_BASES, `${g.id}.${row.key}`).toContain(row.quantity.basis);
      }
    }
  });

  it('renders the basis as TEXT, not only as a tooltip', () => {
    // A `title` is mouse-only: absent on touch, and a child span's title never reaches the
    // button's accessible name. The authority behind a number is safety-relevant, so the label
    // is text and the longer explanation is what lives in the tooltip.
    for (const f of [
      'components/pro/steel/GradePickerPanel.svelte',
      'components/pro/generators/ProfileSelectorPanel.svelte',
    ]) {
      const src = read(f);
      // `>{t(`…basis.${…}`)}` — the label in a text position.
      expect(src, `${f}: basis label is text`).toMatch(/>\{t\(`[a-z.]*\.basis\.\$\{/);
      // And the explanation, separately, in a title.
      expect(src, `${f}: basis explanation is a tooltip`).toMatch(/title=\{t\(`[a-z.]*\.basis\.title\.\$\{/);
    }
  });
});

// ─── The seams stay seams ────────────────────────────────────────────

describe('the catalogue and the grade source stay reusable', () => {
  /**
   * The whole reason both layers exist. A component that reached into the tables would work
   * exactly as well today and would make the general PRO picker impossible to point at a
   * project library or a server, which is the stated future need.
   */
  const PICKERS = [
    'components/pro/generators/ProfileSelectorPanel.svelte',
    'components/pro/generators/ProfilePicker.svelte',
    'components/pro/steel/GradePickerPanel.svelte',
    // The PRO section modal is a picker and is held to the same two rules: it may not reach
    // past the source into a table, and it must hold a swappable source. It satisfies the
    // second by delegating to `ProfileSelectorPanel`, which is what that seam was built for.
    'components/pro/section/ProSectionModal.svelte',
    // And the material modal, which contains `GradePickerPanel` for the metal categories.
    'components/pro/material/ProMaterialModal.svelte',
  ];

  it('never lets a picker import a concrete table', () => {
    for (const f of PICKERS) {
      const src = read(f);
      for (const table of [
        'data/steel-profiles', 'data/iram-', 'data/structural-grades\'', 'data/non-metal-grades',
        'data/material-presets', 'data/section-catalog',
      ]) {
        // Type-only imports are allowed — a component may name `ProfileFamily` — so the check
        // is on VALUE imports, which is what would bypass the source.
        const valueImport = new RegExp(`import\\s+(?!type)[^;]*from '[^']*${table}`);
        expect(valueImport.test(src), `${f} imports ${table}`).toBe(false);
      }
    }
  });

  it('lets a picker hold a swappable source, with the shipped one only as a default', () => {
    for (const f of PICKERS) {
      const src = read(f);
      // Either the component takes a source prop, or it delegates to one that does.
      const takesSource = /source\s*[?:]/.test(src) || /source\s*=\s*(steelProfileSource|structuralGradeSource)/.test(src);
      /*
       * Delegation now has two more targets, and adding them is the rule working rather than
       * being relaxed: `ProfilePicker` used to render `ProfileSelectorPanel` directly and now
       * hands the whole `ProfileSpec` to `ProSectionModal` — which is itself in this list and
       * holds the source. This test caught that change the moment it landed, which is what it
       * is for; a row that delegates to something un-audited would still fail.
       */
      const delegates = /<(ProfileSelectorPanel|GradePickerPanel|ProSectionModal|ProMaterialModal)/.test(src);
      expect(takesSource || delegates, `${f} holds a source`).toBe(true);
    }
  });

  it('answers every source method for every family, so a caller cannot hit a hole', () => {
    for (const f of steelProfileSource.families()) {
      expect(steelProfileSource.classify(f), f).toBeTruthy();
      expect(steelProfileSource.standards(f).length, f).toBeGreaterThan(0);
    }
    for (const f of structuralGradeSource.families()) {
      expect(structuralGradeSource.designCodes(f).length, f).toBeGreaterThan(0);
    }
    expect(structuralGradeSource.regions().length).toBeGreaterThan(0);
  });
});

// ─── Provenance is never invented ────────────────────────────────────

describe('provenance', () => {
  it('gives every profile a published standard and a body that publishes it', () => {
    const bodies = new Set(Object.values(FAMILY_CLASSIFICATION).map((c) => c.standardsBody));
    bodies.add('IRAM-IAS');
    for (const e of queryProfiles()) {
      expect(e.standard, e.id).toBeTruthy();
      expect(bodies, e.id).toContain(e.standardsBody);
      // The row's own standard is one the family actually holds — never a third value.
      expect(standardsInFamily(e.family), e.id).toContain(e.standard);
    }
  });

  it('gives every grade a product standard, and never attributes a band to it', () => {
    for (const g of queryGrades()) {
      expect(g.productStandard, g.id).toBeTruthy();
      const table = bandTable(g);
      if (!table) continue;
      expect(table.standard, g.id).toBeTruthy();
      expect(table.standard, g.id).not.toBe(g.productStandard);
    }
  });

  it('resolves every id the model can store, in both catalogues', () => {
    // The contract that makes a saved `.ded` keep working: whatever a picker hands back is
    // something the resolver accepts.
    for (const e of queryProfiles()) expect(steelProfileSource.byId(e.id), e.id).not.toBeNull();
    for (const g of queryGrades()) {
      expect(structuralGradeSource.byId(g.id), g.id).not.toBeNull();
      expect(catalogueGradeFamily(g.id), g.id).not.toBeNull();
    }
  });
});

// ─── Coordination point 1: the threshold that exists twice ───────────

describe('the concrete/metal threshold, until the two copies become one', () => {
  /**
   * `auto-verify.ts:46` declares its own `CONCRETE_FY_CEILING = 80`, the same value as the one
   * exported from `material-family.ts:54`, on purpose — PR21 chose the same number so that
   * unifying them later would be a two-line change. Both files now live in `main`, and
   * `auto-verify.ts` is a shared file M1 does not edit.
   *
   * So the divergence is made LOUD instead: this reads the local copy through its only
   * observable effect and requires it to agree with the exported one. With the constant shared
   * it is a tautology; with two copies it is the assertion that ties them, and the day someone
   * moves one it fails here rather than letting the two surfaces classify the same material
   * differently in silence.
   *
   * Proposed fix and its owner: `docs/handoffs/m1-h1-coordination.md`, point 1.
   */
  const model = (fy: number) => ({
    sections: new Map([[1, { id: 1, name: 'R', b: 0.3, h: 0.5 }]]),
    materials: new Map([[1, { id: 1, name: 'M', fy }]]),
  });
  const elem = { sectionId: 1, materialId: 1 };

  it('agrees with the exported ceiling exactly at the boundary', () => {
    // At the ceiling: concrete for both readers.
    expect(rcCheckability(elem, model(CONCRETE_FY_CEILING))).toBe('checkable');
    expect(materialFamilyOf({ fy: CONCRETE_FY_CEILING }).family).toBe('concrete');

    // Just above it: metal for both.
    expect(rcCheckability(elem, model(CONCRETE_FY_CEILING + 0.001))).toBe('notConcrete');
    expect(materialFamilyOf({ fy: CONCRETE_FY_CEILING + 0.001 }).family).toBe('steel');
  });

  it('agrees across the whole range, not only at the boundary', () => {
    for (const fy of [1, 20, 25, 50, 79.9, 80, 80.1, 130, 240, 355, 700]) {
      const isConcreteToRc = rcCheckability(elem, model(fy)) !== 'notConcrete';
      const isConcreteToSteel = materialFamilyOf({ fy }).family === 'concrete';
      expect(isConcreteToRc, `fy=${fy}: the two readers disagree`).toBe(isConcreteToSteel);
    }
  });
});

// ─── Coordination point 4: the picker keys no gate covered ───────────

describe('PR21 picker keys, until they move into the steel namespace', () => {
  /**
   * PR21 put the profile picker's strings in the MAIN dictionaries. M1 could not add to those
   * files, so its own went to `steel.profileSelector.*`, and the component now reads two
   * prefixes. The consequence worth testing is not the inelegance: it is that the steel i18n
   * gate reads `locales/steel/*`, so the seven keys in the main dictionaries are covered by
   * nothing.
   *
   * Covered here, by reading those files without editing them — the same thing M1 did for the
   * 77 `conn.*` keys, which were in exactly this position.
   *
   * Proposed consolidation and its owner: `docs/handoffs/m1-h1-coordination.md`, point 4.
   */
  const dicts = [['es', esMain], ['en', enMain], ['pt', ptMain]] as const;

  it('exists in all three offered languages', () => {
    const src = read('components/pro/generators/ProfileSelectorPanel.svelte');
    const used = [...src.matchAll(/t\('(profileSelector\.[A-Za-z0-9_.]+)'\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const [name, dict] of dicts) {
      for (const key of used) {
        const value = (dict as unknown as Record<string, string>)[key];
        expect(value, `${name} ${key}`).toBeTruthy();
        expect(value, `${name} ${key} left as its own key`).not.toBe(key);
      }
    }
  });

  it('does not leave the component reading a key that exists in only one prefix', () => {
    // Both prefixes have to resolve. A key present under neither would render as itself, and a
    // key present under both would be ambiguous about which text wins.
    const src = read('components/pro/generators/ProfileSelectorPanel.svelte');
    const steelKeys = [...src.matchAll(/t\('(steel\.profileSelector\.[A-Za-z0-9_.]+)'\)/g)].map((m) => m[1]);
    const mainKeys = [...src.matchAll(/t\('(profileSelector\.[A-Za-z0-9_.]+)'\)/g)].map((m) => m[1]);
    expect(steelKeys.length).toBeGreaterThan(0);
    // No key is read under both prefixes, which is what would make the merge order matter.
    const bare = new Set(mainKeys.map((k) => k.replace(/^profileSelector\./, '')));
    for (const k of steelKeys) {
      expect(bare.has(k.replace(/^steel\.profileSelector\./, '')), `${k} exists under both prefixes`).toBe(false);
    }
  });
});
