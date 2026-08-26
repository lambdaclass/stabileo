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
  });

  /*
   * The three parts of the restore, each of which was wrong at some point and each of which the
   * browser proved necessary:
   *
   *   · **`$effect.pre`** — child effects run first, and this dialog's body focuses its own
   *     search box on mount. A plain `$effect` captured THAT as the thing to return focus to.
   *     An instrumented probe read `{captured: "profile-search", afterRaf: "BODY"}`.
   *   · **the `wasOpen` latch** — without it the capture re-runs while the dialog is open and
   *     lands back inside it.
   *   · **`requestAnimationFrame`** — restoring synchronously loses to the teardown that
   *     follows.
   *
   * Pinned at the source level because all three are invisible in behaviour until all three are
   * present, and a future edit that drops one would look harmless.
   */
  it('captures before the DOM updates, latches the transition, and restores a frame later', () => {
    expect(MODAL).toContain('$effect.pre(');
    expect(MODAL).toContain('let wasOpen = false;');
    expect(MODAL).toContain('requestAnimationFrame(() => el?.focus?.())');
  });

  it('closes on Escape', () => {
    expect(MODAL).toContain("e.key === 'Escape'");
  });

  it('moves focus INTO the dialog when it opens', () => {
    /*
     * Both landing places, and the search first.
     *
     * The assertion this replaces pinned the exact call that focused `[data-autofocus]` — the
     * division tab. That was the wrong target: the catalogue's search box is what a user types
     * into, and focusing the tab instead meant ArrowDown walked the tabs rather than the profile
     * list. The tab stays as the fallback for the build division, which has no search.
     *
     * `e2e/m2-section-modal.spec.ts` asserts the effect in a browser; this only guards that the
     * dialog still reaches inside ITSELF for the element, rather than focusing something in the
     * page behind it.
     */
    expect(MODAL).toContain('data-autofocus');
    expect(MODAL).toMatch(/dialogEl\?\.querySelector<HTMLElement>\('\[data-testid="profile-search"\]'\)/);
    expect(MODAL).toMatch(/dialogEl\?\.querySelector<HTMLElement>\('\[data-autofocus\]'\)/);
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

  /**
   * The tab with its prose removed.
   *
   * The absence assertions below name the machinery that must not come back — `SECTION_SHAPES`,
   * `<tr onclick>`, a second `addSection`. A comment EXPLAINING why each was removed contains
   * every one of those strings, so reading the raw file makes the file's own documentation fail
   * its own test, and the only way to pass is to stop explaining the decision. Stripping
   * comments first is what lets the component say why it is shaped this way.
   */
  const CODE = TAB
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('mounts the modal and offers a way in', () => {
    expect(TAB).toContain('ProSectionModal');
    expect(TAB).toContain('pro-open-section-modal');
  });

  /*
   * There is no second catalogue on this tab, and that is the whole decision.
   *
   * It used to carry the old Basic strip inline — `FAMILY_LIST` buttons, `searchProfiles`, and
   * a table whose rows called `modelStore.addSection` directly through a local `addProfile`.
   * Two surfaces onto one catalogue, and the inline one was the poorer by four measures: no
   * arrangement, gap or rotation (it never built a `ProfileSpec`), no standards body / design
   * code / depth filter, no data sheet, and `<tr onclick>` rows no keyboard could reach.
   *
   * Asserted as absence of the MACHINERY rather than absence of a rendered table, because a
   * table is easy to hide and easy to bring back. A tab that imports no catalogue cannot grow
   * a second picker without this failing first.
   */
  it('holds no catalogue of its own', () => {
    for (const gone of [
      'FAMILY_LIST',        // the fifteen family buttons
      'PROFILE_FAMILIES',   // the rows behind them
      'searchProfiles',     // its own search
      'familyToShape',      // its own family → shape mapping
      'function addProfile', // its own add path, bypassing ProfileSpec
      'SECTION_SHAPES',     // and the inline build form, duplicating the `build` division
      'computeSectionProperties',
    ]) {
      expect(CODE, `${gone} must not be back on the sections tab`).not.toContain(gone);
    }
  });

  /*
   * One writer to the model, and it goes through the choice type.
   *
   * `toSectionFields` is where composition, gap, rotation, provenance and — since the defect
   * this decision surfaced — the wall thicknesses are decided. A second `addSection` call is
   * how the inline path drifted away from it in the first place.
   */
  it('writes to the model exactly once, through the choice', () => {
    expect([...CODE.matchAll(/modelStore\.addSection/g)]).toHaveLength(1);
    expect(TAB).toContain('toSectionFields(choice, 0)');
  });

  /*
   * And the way in is a button, not a row.
   *
   * `<tr onclick>` is what the inline catalogue used, and it is unreachable by keyboard: no
   * tab stop, no Enter, no role. It must not come back on this tab in any form.
   */
  it('offers the trigger as a button a keyboard can reach', () => {
    expect(CODE).not.toContain('<tr onclick');
    expect(TAB).toMatch(/<button[^>]*data-testid="pro-open-section-modal"/s);
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
