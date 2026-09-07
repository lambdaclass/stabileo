/**
 * The `built` field: what a parametric section remembers about how it was made.
 *
 * ── The gap this closes ───────────────────────────────────────────────
 *
 * A section can reach the model three ways, and until now only two of them could say where
 * they came from: a catalogue pick carries `profileFamily`, an assembly carries `composition`,
 * and a section built from a template carried neither. Its DERIVED numbers were stored — `a`,
 * `iy`, `iz`, `j`, the shape tag, the thicknesses — and its INPUTS were thrown away.
 *
 * Two consequences, and the tests below are organised around them:
 *
 *   · the section could not be re-edited, because nothing recorded what was typed; and
 *   · a parameter the apply path forgot was invisible. That is not hypothetical: the lipped
 *     channel takes `tl` (lip thickness) as its own input, `handleShapeConfirm` was not passing
 *     it, and `createSectionShape`'s `case 'C'` substitutes the FLANGE thickness when it is
 *     missing. The properties were computed from one lip and the outline drawn from another.
 *
 * ── Why the defect stayed hidden ──────────────────────────────────────
 *
 * The C template ships `tf = 0.009` and `tl = 0.009`. On the defaults the substituted value and
 * the real one coincide, so the drawing is right for as long as nobody touches the lip — which
 * is the usual case for cold-formed sheet. `templateDefaults()` below reads those numbers from
 * the template instead of restating them, so the test cannot drift away from what ships, and
 * the visualisation cases deliberately move `tl` off `tf` to make the difference observable.
 *
 * ── What is deliberately NOT asserted ─────────────────────────────────
 *
 * That anything reads `built` to compute something. It is declarative, exactly like
 * `composition`: `a`/`iy`/`iz`/`j` on the section stay authoritative and the canonical resolver
 * is not handed a second opinion about the geometry. `sufficiency` below checks the record is
 * COMPLETE enough to recompute the section — not that anyone recomputes it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, type Section } from '../model.svelte';
import { compressSnapshot, decompressSnapshot } from '../../utils/url-sharing';
import { historyStore } from '../history.svelte';
import { SECTION_SHAPES, computeSectionProperties } from '../../data/section-shapes';
import { createSectionShape } from '../../three/section-profiles';

/** The parameters a template ships with, read from the template — never restated here. */
function templateDefaults(shapeType: string): Record<string, number> {
  const def = SECTION_SHAPES.find((s) => s.id === shapeType);
  if (!def) throw new Error(`no such shape template: ${shapeType}`);
  return Object.fromEntries(def.params.map((p) => [p.id, p.defaultValue]));
}

/**
 * Add a section the way `ProSectionsTab.handleShapeConfirm` does: the computed properties, plus
 * the inputs that produced them.
 *
 * Kept in step with the component by construction — it computes through the same
 * `computeSectionProperties` and stores the same params object, so a change to the shape of
 * `built` fails here rather than passing on a stale duplicate.
 */
function addBuilt(shapeType: string, overrides: Record<string, number> = {}) {
  const params = { ...templateDefaults(shapeType), ...overrides };
  const c = computeSectionProperties(shapeType as never, params);
  if (!c) throw new Error(`template ${shapeType} rejected its own defaults`);
  const id = modelStore.addSection({
    name: `${shapeType} test`,
    a: c.a, iz: c.iz, iy: c.iy, j: c.j,
    b: c.b, h: c.h, shape: c.shape as never,
    tw: c.tw, tf: c.tf, t: c.t, tl: c.tl,
    built: { shapeType, params },
  });
  return { id, params, computed: c };
}

const sectionById = (id: number) => modelStore.model.sections.get(id) as Section;

beforeEach(() => {
  modelStore.clear();
});

describe('the record itself', () => {
  it('stores the template and the parameters that were typed into it', () => {
    const { id, params } = addBuilt('C-custom', { tl: 0.004 });
    const s = sectionById(id);
    expect(s.built).toBeDefined();
    expect(s.built!.shapeType).toBe('C-custom');
    expect(s.built!.params).toEqual(params);
    // The parameter the apply path used to drop, now on the section.
    expect(s.built!.params.tl).toBe(0.004);
  });

  it('is a copy, not a live reference to the form the user is still editing', () => {
    // The same property `selector-model-boundary.test.ts` fixes for the generators: a section
    // already in the model must not move when the form that produced it changes.
    const params = { ...templateDefaults('C-custom') };
    const c = computeSectionProperties('C-custom', params)!;
    const id = modelStore.addSection({
      name: 'C', a: c.a, iz: c.iz, iy: c.iy, j: c.j, b: c.b, h: c.h,
      shape: c.shape as never, tw: c.tw, tf: c.tf, t: c.t, tl: c.tl,
      built: { shapeType: 'C-custom', params: { ...params } },
    });
    params.tw = 0.999;
    expect(sectionById(id).built!.params.tw).not.toBe(0.999);
  });

  it('records every parameter the template declares, not a hand-picked subset', () => {
    /*
     * The assertion that keeps the field honest as templates grow. `tl` was lost precisely
     * because the apply path enumerated fields by hand; a record built from the template's own
     * parameter list cannot lose one the same way.
     */
    for (const def of SECTION_SHAPES) {
      const params = templateDefaults(def.id);
      if (!computeSectionProperties(def.id, params)) continue; // template needs choices we are not making
      modelStore.clear();
      const { id } = addBuilt(def.id);
      const recorded = Object.keys(sectionById(id).built!.params).sort();
      expect(recorded, `${def.id} records all of its parameters`).toEqual(
        def.params.map((p) => p.id).sort(),
      );
    }
  });
});

describe('sufficiency — the record can rebuild the section', () => {
  it('recomputes the stored properties from the stored parameters', () => {
    /*
     * This is what "the section can be re-edited" means, made checkable: feed `built` back
     * through the same function and the same numbers come out. If the record were incomplete,
     * or named a template that does not exist, this is where it would show.
     */
    for (const def of SECTION_SHAPES) {
      if (!computeSectionProperties(def.id, templateDefaults(def.id))) continue;
      modelStore.clear();
      const { id, computed } = addBuilt(def.id);
      const s = sectionById(id);
      const again = computeSectionProperties(s.built!.shapeType as never, s.built!.params);
      expect(again, `${def.id} recomputes`).not.toBeNull();
      // `iy` and `j` are optional on `SectionProperties` — some templates do not produce them.
      // Compared as "present in the same cases, equal where present", so a template that stops
      // reporting one fails here instead of passing on two undefineds.
      for (const k of ['a', 'iy', 'iz', 'j'] as const) {
        const was = computed[k];
        const now = again![k];
        expect(now === undefined, `${def.id}.${k} presence`).toBe(was === undefined);
        if (was !== undefined && now !== undefined) expect(now).toBeCloseTo(was, 12);
      }
    }
  });

  it('names a template that still exists', () => {
    // A stored id pointing at a removed template would make a project unopenable in the editor
    // even though its numbers are fine. Worth failing loudly on.
    const { id } = addBuilt('I-custom');
    const named = sectionById(id).built!.shapeType;
    expect(SECTION_SHAPES.some((s) => s.id === named)).toBe(true);
  });

  it('does not become the authority for the properties', () => {
    // Declarative. The stored `a` is what the solver sees, even if `built` says otherwise —
    // there is exactly one number in play, not a second opinion to reconcile.
    const { id } = addBuilt('C-custom');
    const s = sectionById(id);
    const storedArea = s.a;
    s.built!.params.h = 9.99;
    expect(sectionById(id).a).toBe(storedArea);
  });
});

describe('persistence — every path that carries a model', () => {
  it('round-trips through snapshot/restore', () => {
    const { id, params } = addBuilt('C-custom', { tl: 0.004 });
    const snap = modelStore.snapshot();
    modelStore.clear();
    // `clear()` reseeds the default section, so the check is that OUR section is gone —
    // not that the table is empty.
    expect(modelStore.model.sections.get(id)).toBeUndefined();

    modelStore.restore(snap);
    const s = sectionById(id);
    expect(s.built).toEqual({ shapeType: 'C-custom', params });
    expect(s.tl).toBe(0.004);
  });

  it('does NOT survive a share link — and neither does anything else about a section', () => {
    /*
     * Recorded as it is, not as it should be.
     *
     * The share codec is a hand-written POSITIONAL whitelist: `compressV2` writes
     * `[id, name, a, iz, {s,b,h,w,f,t,iy,j,rot}]` and nothing else. It carries no `tl`, no
     * `profileFamily` and no `composition` — so a shared link already loses the make-up of a
     * built-up assembly and the lip of a cold-formed channel, today, before this field existed.
     *
     * `built` therefore does not round-trip through a URL, and this test pins that rather than
     * hiding it. Extending the codec is a SEPARATE decision: it is a versioned wire format
     * (`SHARE_VERSION`) shared with the concrete work, and widening it here would be exactly the
     * unilateral change to a shared file this branch is not making. Reported in the handoff.
     */
    const { id } = addBuilt('C-custom', { tl: 0.004 });
    const assembly = modelStore.addSection({
      name: '2 × IPE 200', a: 0.0057, iz: 2.84e-6, iy: 3.886e-5, profileFamily: 'IPE',
      composition: { profileName: 'IPE 200', arrangement: 'back-to-back', gapMm: 10 },
    });
    const packed = compressSnapshot(modelStore.snapshot());
    modelStore.clear();
    const decoded = decompressSnapshot(packed);
    expect(decoded).not.toBeNull();
    modelStore.restore(decoded!);

    const built = sectionById(id);
    const asm = sectionById(assembly);
    expect(built, 'the section itself does survive').toBeDefined();
    expect(built.a, 'with its area — what the solver needs').toBeGreaterThan(0);
    // The three fields the codec has never carried, asserted together so a future widening of
    // the format has to come here and say which of them it now covers.
    expect(built.built, 'built: not in the share codec').toBeUndefined();
    expect(built.tl, 'tl: not in the share codec').toBeUndefined();
    expect(asm.composition, 'composition: not in the share codec either').toBeUndefined();
  });

  it('survives undo', () => {
    // `pushState()` captures the state to come back TO, then the edit happens, then `undo()`
    // restores it — the same order the toolbar uses.
    historyStore.clear();
    const { id, params } = addBuilt('C-custom', { tl: 0.004 });
    historyStore.pushState();
    modelStore.removeSection(id);
    expect(modelStore.model.sections.get(id)).toBeUndefined();

    historyStore.undo();
    expect(sectionById(id).built!.params).toEqual(params);
    expect(sectionById(id).tl).toBe(0.004);
  });

  it('and redo puts it back', () => {
    historyStore.clear();
    const { id, params } = addBuilt('C-custom', { tl: 0.004 });
    historyStore.pushState();
    modelStore.updateSection(id, { name: 'renamed' });
    historyStore.undo();
    historyStore.redo();
    const s = sectionById(id);
    expect(s.name).toBe('renamed');
    expect(s.built!.params).toEqual(params);
  });
});

describe('backward compatibility — the field is optional and stays optional', () => {
  it('restores a model saved before the field existed', () => {
    /*
     * The whole reason the change is additive. This snapshot is shaped like one written by an
     * earlier build: a section with its derived numbers and no `built` at all. It must restore
     * cleanly, keep its properties, and not acquire an invented record.
     */
    const { id } = addBuilt('C-custom');
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    for (const [, s] of snap.sections) delete s.built;
    modelStore.clear();
    modelStore.restore(snap);

    const s = sectionById(id);
    expect(s.built).toBeUndefined();
    expect(s.a).toBeGreaterThan(0);
    expect(s.shape).toBe('C');
  });

  it('leaves catalogue picks and assemblies alone', () => {
    // The field describes ONE of the three ways a section is created. The other two say where
    // they came from already, and must not be given a fabricated `built` to match.
    const catalogue = modelStore.addSection({
      name: 'IPE 200', a: 0.00285, iz: 1.42e-6, iy: 1.943e-5, profileFamily: 'IPE',
    });
    const assembly = modelStore.addSection({
      name: '2 × IPE 200', a: 0.0057, iz: 2.84e-6, iy: 3.886e-5,
      composition: { profileName: 'IPE 200', arrangement: 'back-to-back', gapMm: 10 },
    });
    expect(sectionById(catalogue).built).toBeUndefined();
    expect(sectionById(assembly).built).toBeUndefined();
    expect(sectionById(assembly).composition!.profileName).toBe('IPE 200');
  });

  it('does not put a catalogue name on a parametric section', () => {
    // `composition.profileName` is documented as an exact catalogue name. A built section has
    // no catalogue part to name, so writing one would be a string nobody can resolve.
    const { id } = addBuilt('C-custom');
    expect(sectionById(id).composition).toBeUndefined();
  });
});

describe('visualisation — the outline the viewer draws', () => {
  it('draws the lip thickness that was entered, not the flange thickness', () => {
    /*
     * The regression. `case 'C'` reads `tl` and falls back to `tf` when it is absent, so a
     * section that lost its lip thickness is drawn with a lip as thick as its flange. Moving
     * `tl` well off `tf` makes the two outlines differ measurably.
     */
    const { id } = addBuilt('C-custom', { tl: 0.003 });
    const withLip = sectionById(id);
    expect(withLip.tl).toBe(0.003);

    const dropped: Section = { ...withLip, tl: undefined };
    const a = createSectionShape(withLip);
    const b = createSectionShape(dropped);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Same vertex count, different geometry: the lip is the only thing that moved.
    expect(a!.getPoints().length).toBe(b!.getPoints().length);
    expect(a!.getPoints()).not.toEqual(b!.getPoints());
  });

  it('and the two agree only when the lip happens to match the flange', () => {
    // Which is why nobody noticed: on the template defaults the substituted value is correct.
    const defaults = templateDefaults('C-custom');
    expect(defaults.tl, 'template default lip equals default flange').toBe(defaults.tf);

    const { id } = addBuilt('C-custom');
    const s = sectionById(id);
    const dropped: Section = { ...s, tl: undefined };
    expect(createSectionShape(s)!.getPoints()).toEqual(createSectionShape(dropped)!.getPoints());
  });

  it('draws a real outline for every template, not a fallback', () => {
    /*
     * The claim worth pinning down, because an earlier draft of the M1/M2 study got it wrong in
     * the other direction: it asserted a parametric section falls to `createSectionShape`'s
     * I-beam `default:`. It does not — every shape tag `computeSectionProperties` emits has its
     * own case. This test is what makes that statement checkable rather than remembered.
     */
    for (const def of SECTION_SHAPES) {
      if (!computeSectionProperties(def.id, templateDefaults(def.id))) continue;
      modelStore.clear();
      const { id } = addBuilt(def.id);
      const s = sectionById(id);
      const shape = createSectionShape(s);
      expect(shape, `${def.id} (shape ${s.shape}) draws`).not.toBeNull();
      expect(shape!.getPoints().length, `${def.id} has an outline`).toBeGreaterThan(3);
    }
  });

  it('survives persistence with its outline intact', () => {
    // The two halves together: the parameters come back, and what is drawn after a reload is
    // what was drawn before it.
    const { id } = addBuilt('C-custom', { tl: 0.003 });
    const before = createSectionShape(sectionById(id))!.getPoints();
    const snap = modelStore.snapshot();
    modelStore.clear();
    modelStore.restore(snap);
    expect(createSectionShape(sectionById(id))!.getPoints()).toEqual(before);
  });
});
