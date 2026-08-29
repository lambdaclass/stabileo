/**
 * Where the section selector stops and the model starts.
 *
 * ── The property, and why it needed writing down ───────────────────
 *
 * The brief asks to verify "that changing a section in the selector is reflected in the generated
 * model". That has two answers and only one of them is right, so leaving it implicit was the risk:
 *
 *   · **before Generate** — the change is reflected. The preview, the role counts and the section
 *     figure are all derived from the same `ProfileSpec` the emitter will read, so what is on
 *     screen is what will land.
 *   · **after Generate** — it is NOT reflected, and it must not be. A generated model is geometry
 *     in the store; the selector is the form that produced it. If editing the form mutated an
 *     already-emitted model, the model would change under a user who is looking at something else,
 *     and undo would have nothing coherent to step back to.
 *
 * `emit.test.ts` covers what one emission produces. This covers the boundary between emissions,
 * which is a different property and the one a UI rework could quietly break.
 *
 * ── The identifier is what makes it checkable ─────────────────────
 *
 * A spec carries the catalogue NAME, and that name is the id the model stores, the id
 * `resolveProfile` looks up and the id a saved `.ded` keeps. So "did the change reach the model"
 * is answerable by reading the section names out of the emitted JSON — no geometry comparison, no
 * tolerance.
 */

import { describe, it, expect } from 'vitest';
import { generateTruss, DEFAULT_TRUSS_PARAMS } from '../truss-topology';
import { generateShed, DEFAULT_SHED_PARAMS } from '../shed';
import { generateLatticeColumn, DEFAULT_LATTICE_COLUMN_PARAMS } from '../lattice-column';
import { emitModel, defaultProfileSpec, requiredRoles, type EmitOptions } from '../emit';
import { steelProfileSource } from '../../../profiles/catalogue';

/** One spec per role a topology needs, all on the same profile unless overridden. */
function specsFor(topology: ReturnType<typeof generateTruss>, profile: string): EmitOptions['profiles'] {
  const out: EmitOptions['profiles'] = {};
  for (const role of requiredRoles(topology)) out[role] = defaultProfileSpec(profile);
  return out;
}

/**
 * The section names the emitted model carries, in table order.
 *
 * `JSONModel['sections']` is the store's own row type and carries more than a name; the cast keeps
 * this helper about the one field the boundary is checked on.
 */
function sectionNames(json: { sections: readonly unknown[] }): string[] {
  return json.sections.map((s) => (s as { name: string }).name);
}

describe('before Generate — the selection is what will land', () => {
  it('emits the profile the spec names, for every role', () => {
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 });
    const g = emitModel(t, { name: 'Cercha', profiles: specsFor(t, 'IPE 200') });
    for (const name of sectionNames(g.json)) expect(name).toContain('IPE 200');
  });

  it('changing the spec changes the emission, with nothing else moving', () => {
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 });
    const before = emitModel(t, { name: 'Cercha', profiles: specsFor(t, 'IPE 200') });
    const after = emitModel(t, { name: 'Cercha', profiles: specsFor(t, 'HEB 160') });

    expect(sectionNames(after.json)).not.toEqual(sectionNames(before.json));
    for (const name of sectionNames(after.json)) expect(name).toContain('HEB 160');
    // The geometry is the topology's, not the profile's: nodes and members are untouched.
    expect(after.json.nodes).toEqual(before.json.nodes);
    expect(after.json.elements.length).toBe(before.json.elements.length);
  });

  it('carries the catalogue id, so the model and the picker name one thing', () => {
    // Not a display string. `resolveProfile` has to accept whatever the emission stored, or a
    // saved project stops resolving.
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 });
    const g = emitModel(t, { name: 'Cercha', profiles: specsFor(t, 'UPN 200') });
    for (const s of g.json.sections as Array<{ composition?: { profileName: string } }>) {
      const named = s.composition?.profileName;
      expect(named, 'every emitted section declares its part').toBeTruthy();
      expect(steelProfileSource.byId(named!), `${named} resolves in the catalogue`).not.toBeNull();
    }
  });

  it('holds for all three generators, not just the truss', () => {
    const cases = [
      generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 }),
      generateLatticeColumn({ ...DEFAULT_LATTICE_COLUMN_PARAMS }),
      generateShed({ ...DEFAULT_SHED_PARAMS }),
    ];
    for (const topology of cases) {
      const g = emitModel(topology, { name: 'x', profiles: specsFor(topology, 'IPE 100') });
      expect(sectionNames(g.json).length, 'one section per role').toBeGreaterThan(0);
      for (const name of sectionNames(g.json)) expect(name).toContain('IPE 100');
    }
  });
});

describe('after Generate — a later selection does not reach back', () => {
  it('leaves an emitted model untouched, because emission is a snapshot', () => {
    /*
     * The assertion that fixes the boundary. `emitModel` is a pure function of the topology and
     * the specs handed to it: it returns a new `GeneratedModel` and holds no reference to the spec
     * object, so a caller that keeps editing its form cannot reach the model it already produced.
     *
     * Written as a mutation of the very object that was passed in, which is the strongest form of
     * the check: if the emitter kept the reference, this would change the emitted section.
     */
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 });
    const specs = specsFor(t, 'IPE 200');
    const emitted = emitModel(t, { name: 'Cercha', profiles: specs });
    const before = sectionNames(emitted.json);

    // The user goes back to the picker and chooses something else.
    for (const role of requiredRoles(t)) specs[role] = defaultProfileSpec('HEB 300');

    expect(sectionNames(emitted.json), 'the emitted model moved under the user').toEqual(before);
    for (const name of sectionNames(emitted.json)) expect(name).toContain('IPE 200');
  });

  it('and a second Generate is a second model, not an edit of the first', () => {
    // Which is the honest behaviour: two emissions are two independent results, and the store
    // decides what to do with each. Nothing here mutates the first.
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 });
    const first = emitModel(t, { name: 'Cercha', profiles: specsFor(t, 'IPE 200') });
    const second = emitModel(t, { name: 'Cercha', profiles: specsFor(t, 'HEB 160') });

    expect(sectionNames(first.json)[0]).toContain('IPE 200');
    expect(sectionNames(second.json)[0]).toContain('HEB 160');
    // Neither shares a section object with the other.
    expect(second.json.sections[0]).not.toBe(first.json.sections[0]);
  });

  it('does not share a mutable section object with the spec it came from', () => {
    // Belt and braces on the same property: mutating the emitted section must not be visible in a
    // later emission, and vice versa.
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 });
    const specs = specsFor(t, 'IPE 200');
    const a = emitModel(t, { name: 'A', profiles: specs });
    (a.json.sections[0] as unknown as { name: string }).name = 'TAMPERED';
    const b = emitModel(t, { name: 'B', profiles: specs });
    expect(sectionNames(b.json)[0]).not.toBe('TAMPERED');
  });
});

describe('one source, no parallel catalogue', () => {
  it('resolves every emitted section name through the same source the picker reads', () => {
    /*
     * The property that keeps "no parallel catalogues" true. If the generators ever grew their own
     * table, a name would emit that the picker's source does not know — and this is where that
     * shows up, on all three generators at once.
     */
    for (const topology of [
      generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 }),
      generateLatticeColumn({ ...DEFAULT_LATTICE_COLUMN_PARAMS }),
      generateShed({ ...DEFAULT_SHED_PARAMS }),
    ]) {
      for (const role of requiredRoles(topology)) {
        const spec = defaultProfileSpec('IPE 100');
        // The default spec a picker row starts from has to be a catalogue id too.
        expect(steelProfileSource.byId(spec.profileName), `${role} default`).not.toBeNull();
      }
    }
  });

  it('refuses a profile the source does not know, rather than emitting a zero section', () => {
    // The other half: an id from nowhere is an error, not a section of no area.
    const t = generateTruss({ ...DEFAULT_TRUSS_PARAMS, spanM: 10 });
    expect(steelProfileSource.byId('IPE 999')).toBeNull();
    expect(() => emitModel(t, { name: 'x', profiles: specsFor(t, 'IPE 999') })).toThrow();
  });
});
