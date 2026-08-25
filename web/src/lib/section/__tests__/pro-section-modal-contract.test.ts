import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import es from '../../i18n/locales/steel/es';
import en from '../../i18n/locales/steel/en';
import pt from '../../i18n/locales/steel/pt';

/*
 * Read as source, the way the metallic workflow's contract test does.
 *
 * The components in this app are covered by Playwright, and Playwright is the right tool for
 * "does the dialog open and pick a profile". It is the wrong tool for the properties below,
 * which are about what the component may NOT contain — an amorphous division, a third tab, a
 * hardcoded colour, an untranslated key. Those are cheaper and sharper to assert against the
 * file, and they fail the moment someone adds one rather than when a browser happens to run.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '../../../components/pro/section', p), 'utf8');
const MODAL = read('ProSectionModal.svelte');
const BUILD = read('BuiltSectionPanel.svelte');
const SHEET = read('SectionDataSheet.svelte');
const BATTEN = read('BattenPanel.svelte');
const ALL = [MODAL, BUILD, SHEET, BATTEN];

describe('exactly two divisions', () => {
  it('offers standard and build, and nothing else', () => {
    expect(MODAL).toContain('section-division-standard');
    expect(MODAL).toContain('section-division-build');
    const divisions = [...MODAL.matchAll(/data-testid="section-division-([a-z]+)"/g)].map((m) => m[1]);
    expect(divisions.sort()).toEqual(['build', 'standard']);
  });

  it('the Division type has two members, so a third cannot be added silently', () => {
    const decl = MODAL.match(/type Division = ([^;]+);/);
    expect(decl).not.toBeNull();
    expect(decl![1].split('|').map((s) => s.trim()).sort()).toEqual(["'build'", "'standard'"]);
  });

  /*
   * The brief's hard rule: no amorphous section. Basic's picker has one — an area and an
   * inertia with no geometry — and a section like that cannot be drawn, composed, classified
   * or checked against a clause, so PRO must not offer it.
   */
  /*
   * Checked against the MARKUP, not the whole file.
   *
   * My first version banned the word outright and failed on the modal's own header, which
   * explains why PRO does not have this division — a comment that DENIES the thing was
   * flagged as offering it. The property that actually matters is that nothing renders it and
   * nothing wires the callback, so that is what is asserted: the template region, plus the
   * prop name Basic's picker uses, anywhere in the file.
   */
  it('never offers an amorphous section', () => {
    for (const src of ALL) {
      const markup = src.slice(src.indexOf('</script>'));
      expect(markup.toLowerCase()).not.toContain('amorphous');
      expect(markup.toLowerCase()).not.toContain('amorfa');
      // The callback Basic's `SectionChanger` exposes for it. Absent from every line, comments
      // included, because there is no reason to name a prop one is not wiring.
      expect(src.toLowerCase()).not.toContain('onamorphousselect');
    }
  });
});

describe('the dialog behaves like a dialog', () => {
  it('declares itself modal and names itself', () => {
    expect(MODAL).toContain('role="dialog"');
    expect(MODAL).toContain('aria-modal="true"');
    expect(MODAL).toMatch(/aria-label=\{/);
  });

  /*
   * Focus is the half of "coherent with Basic" that had to be built rather than inherited:
   * Basic's `ProfileSelector` handles Escape and nothing else — no trap, no restore — so
   * tabbing off its last control lands on the browser chrome with the modal still covering
   * the page.
   */
  it('traps Tab and restores focus to whatever opened it', () => {
    expect(MODAL).toContain("e.key !== 'Tab'");
    expect(MODAL).toContain('shiftKey');
    expect(MODAL).toContain('returnFocus');
    expect(MODAL).toMatch(/returnFocus\?\.focus\?\.\(\)/);
  });

  it('closes on Escape', () => {
    expect(MODAL).toContain("e.key === 'Escape'");
  });

  it('moves focus INTO the dialog when it opens', () => {
    expect(MODAL).toContain('data-autofocus');
    expect(MODAL).toMatch(/querySelector<HTMLElement>\('\[data-autofocus\]'\)\?\.focus\(\)/);
  });

  it('the backdrop is a real button, so it has a name and a keyboard', () => {
    expect(MODAL).toMatch(/<button class="backdrop"[\s\S]*?aria-label=/);
  });
});

describe('composition belongs to the catalogue division only', () => {
  /*
   * An arrangement places copies of a CATALOGUE profile, using the resolved profile's extents.
   * A built section has no catalogue part to place, so offering the control there would offer
   * something the emitter must refuse.
   */
  it('guards the arrangement, gap and rotation controls', () => {
    const guarded = MODAL.slice(MODAL.indexOf("{#if division === 'standard'}\n          <div class=\"controls\">"));
    expect(guarded).toContain('section-arrangement');
    expect(guarded).toContain('section-rotation');
    // And the guard closes before the footer, so it wraps the controls rather than the page.
    expect(MODAL.indexOf('section-arrangement')).toBeGreaterThan(
      MODAL.indexOf("{#if division === 'standard'}"),
    );
  });

  it('the gap only appears for a compound arrangement', () => {
    expect(MODAL).toContain('{#if isCompound(draft)}');
    const gapAt = MODAL.indexOf('section-gap');
    const compoundAt = MODAL.indexOf('{#if isCompound(draft)}');
    expect(gapAt).toBeGreaterThan(compoundAt);
  });
});

describe('the sheet never shows a number without its provenance', () => {
  it('renders a basis for every property row', () => {
    expect(SHEET).toContain('sheet-basis-');
    expect(SHEET).toMatch(/section\.sheet\.basis\.\$\{row\.quantity\.basis\}/);
  });

  it('explains an absent cold-formed block instead of leaving it empty', () => {
    expect(SHEET).toContain('sheet-coldformed-absent');
    expect(SHEET).toContain('sheet.coldFormed.reasonKey');
  });

  it('says why a centroid is missing rather than printing h/2', () => {
    expect(SHEET).toContain('sheet-centroid-missing');
    expect(SHEET).toContain('section.sheet.centroidUnavailable');
  });
});

describe('every key these components render exists in all three offered locales', () => {
  const KEY = /t\('([a-z][A-Za-z0-9.]+)'\)/g;

  it('es, en and pt all have them', () => {
    const dicts = { es, en, pt } as Record<string, Record<string, string>>;
    const missing: string[] = [];
    for (const src of ALL) {
      for (const m of src.matchAll(KEY)) {
        const key = m[1];
        // Keys owned by the main dictionaries are resolved there; this file only guards the
        // ones these components introduced.
        if (!key.startsWith('section.')) continue;
        for (const [lang, d] of Object.entries(dicts)) {
          if (!(key in d)) missing.push(`${lang}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('the visual system', () => {
  /*
   * PRO has `--st-*` tokens. Basic's pickers predate them and carry seventeen hardcoded hex
   * values between them, which is why this modal was written rather than copied.
   */
  it('uses tokens, not hardcoded colours', () => {
    for (const src of ALL) {
      const style = src.slice(src.indexOf('<style>'));
      const hexes = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
      expect(hexes).toEqual([]);
    }
  });

  it('gives every control one focus ring', () => {
    for (const src of [MODAL, BUILD]) {
      expect(src).toContain(':focus-visible');
      expect(src).toContain('--st-value');
    }
  });
});

describe('the sections tab reaches the modal, and stops shaping profiles by hand', () => {
  const TAB = readFileSync(
    resolve(__dirname, '../../../components/pro/ProSectionsTab.svelte'), 'utf8',
  );

  it('mounts the modal and offers a way in', () => {
    expect(TAB).toContain('ProSectionModal');
    expect(TAB).toContain('pro-open-section-modal');
  });

  /*
   * The local `shapeForFamily` this replaces knew six families and returned `'CHS'` — a round
   * tube — for everything else. Measured across all fifteen: **eight diverged from the
   * catalogue's own map, seven of them to CHS**, including every American wide-flange (W),
   * both American channels (C, MC), the tees and the square tubes. The eighth, HEA, came back
   * `'H'` where the catalogue says `'I'`.
   *
   * Stiffness was not affected — `a`, `iy` and `iz` are written from the profile's own numbers
   * and the canonical resolver returned the same properties either way, which I checked before
   * claiming otherwise. What the wrong shape does affect is everything DISPATCHED on it: the
   * drawn outline, the shear-flow path, the 3-D extrusion, and the clause helpers that ask what
   * shape a member is — `flangeWidthForSlenderness` answers `null` for a CHS, so §F.6.2 would
   * have reported a W-section beam out of scope.
   *
   * `familyToShape` was already imported by this file and simply never called.
   */
  it('uses the catalogue map, which is exhaustive, not a local one that is not', () => {
    expect(TAB).toContain('familyToShape(p.family)');
    expect(TAB).not.toContain('function shapeForFamily');
  });

  it('passes the auto-rotation fallback explicitly', () => {
    // A section created in this tab belongs to no member, so `'auto'` has nothing to resolve
    // against. Zero is the answer, and it is written rather than defaulted.
    expect(TAB).toContain('toSectionFields(choice, 0)');
  });
});


describe('the batten panel states the code and draws nothing', () => {
  /*
   * §E.6 names no batten thickness, width or depth anywhere. The only property of a batten the
   * clause gives is `Ip`, and only inside E.6.19's inequality. So the panel may show the state
   * and the condition, and must not show a dimension.
   */
  it('renders the unavailable state rather than a plate size', () => {
    // The literal string lives in `battens.ts`; the panel RENDERS the field, which is the
    // property worth pinning — a component that hardcoded the word could drift from the module.
    expect(BATTEN).toContain('{plan.geometry.state}');
    expect(BATTEN).toContain('batten-geometry-unavailable');
    for (const invented of ['thicknessMm', 'widthMm', 'depthMm', 'plateThickness']) {
      expect(BATTEN).not.toContain(invented);
    }
  });

  it('prints a dotted clause on every row', () => {
    expect(BATTEN).toContain('§{row.q.clause}');
    expect(BATTEN).toContain('§{plan.geometry.conditionClause}');
  });

  /*
   * No arithmetic in the component. Everything is decided in `battens.ts`, where the tests are,
   * and a formula appearing here would be a second opinion the clause never authorised.
   */
  it('computes nothing itself', () => {
    const script = BATTEN.slice(0, BATTEN.indexOf('</script>'));
    // The two numbers §E.6 would tempt a component into: the three-segment divisor and the
    // three-quarters slenderness factor. Both belong in `battens.ts`, where the tests are.
    expect(script).not.toContain('0.75');
    expect(script).not.toContain('/ 3');
    expect(script).not.toContain('lengthM');
  });

  it('is only mounted for a compound arrangement', () => {
    expect(MODAL).toContain("{#if division === 'standard' && isCompound(draft)}");
  });

  /*
   * And the modal does NOT pass a member length. A section is a cross-section and sits on
   * members of any length; passing one would make the spacing a number computed against an
   * assumption.
   */
  it('is given no member length by the modal', () => {
    const call = MODAL.match(/battenPlan\(\{[^}]*\}\)/)?.[0] ?? '';
    expect(call).not.toContain('lengthM');
  });
});
