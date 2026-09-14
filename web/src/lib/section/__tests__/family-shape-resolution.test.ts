import { describe, it, expect } from 'vitest';
import { resolveCanonicalSection } from '../canonical';
import { steelProfileSource } from '../../profiles/catalogue';
import { familyToShape, type ProfileFamily } from '../../data/steel-profiles';
import { toSectionFields } from '../section-choice';
import { defaultProfileSpec } from '../profile-spec';
import { ALL_FAMILIES } from '../../data/section-catalog';

/**
 * Every catalogue family, through the picker's own path, into the canonical resolver.
 *
 * ── Why this file exists ────────────────────────────────────────────
 *
 * `ProSectionsTab` used to map family → shape with a local function that knew six families and
 * returned `'CHS'` — a round tube — for the rest. Nothing caught it, because nothing had ever
 * walked all fifteen families end to end. This does.
 *
 * The check is deliberately NOT "does `familyToShape` return what I expect" — that would be one
 * table compared against another table I wrote. It takes each family's real catalogue entry
 * through `toSectionFields`, the same call the modal makes, and hands the result to the
 * canonical resolver, which is what the solver and every drawing consume.
 */

const families = ALL_FAMILIES as readonly ProfileFamily[];

/** One real entry per family, or null when the family ships none. */
function sample(f: ProfileFamily) {
  const list = steelProfileSource.list({ families: [f] });
  return list.length > 0 ? list[Math.floor(list.length / 2)] : null;
}

describe('all fifteen families reach the resolver', () => {
  it('every family in the picker order ships at least one profile', () => {
    expect(families).toHaveLength(15);
    const empty = families.filter((f) => sample(f) === null);
    expect(empty, `families with no profiles: ${empty.join(', ')}`).toEqual([]);
  });

  it.each(families)('%s resolves without falling back to properties-only by accident', (f) => {
    const entry = sample(f)!;
    const fields = toSectionFields({ kind: 'standard', spec: defaultProfileSpec(entry.name) }, 0);
    expect(fields, `${entry.name} did not resolve through the catalogue`).not.toBeNull();

    const resolved = resolveCanonicalSection({ id: 1, ...fields } as never);
    /*
     * `state` is the discriminant on the returned object itself — `'geometry-backed'` or
     * `'properties-only'`. My first version read `resolved.state.kind`, which is undefined, and
     * every family "failed"; the resolver was fine and the test was reading the wrong field.
     *
     * Either outcome is legitimate, and which one is legitimate is decided by the catalogue's
     * own `fidelity`. What must never happen is a silent fallback for a family whose fidelity
     * says its outline is exact.
     */
    if (entry.fidelity === 'propertiesOnly') {
      expect(resolved.state).toBe('properties-only');
    } else {
      expect(resolved.state, `${entry.name} (${entry.fidelity}) resolved as ${resolved.state}`)
        .toBe('geometry-backed');
    }
  });
});

describe('the shape written is the shape the family has', () => {
  /*
   * The property that the old local map broke: seven families were written as `CHS`. A round
   * tube has no flanges and no web, so the drawn outline, the shear-flow path, the 3-D
   * extrusion and every clause helper that asks "what shape is this" all get the wrong answer —
   * even though A, Iy and Iz stay right, which is why it was invisible.
   */
  it.each(families)('%s is not silently written as a tube', (f) => {
    const entry = sample(f)!;
    const fields = toSectionFields({ kind: 'standard', spec: defaultProfileSpec(entry.name) }, 0)!;
    const expected = familyToShape(f);
    expect(fields.shape, `${entry.name}`).toBe(expected);
    if (f !== 'CHS') expect(fields.shape).not.toBe('CHS');
  });

  /*
   * And the map is exhaustive by construction: `familyToShape` is a switch with no `default`,
   * so a family added to `ProfileFamily` fails to compile until it is given a shape. Asserted
   * here as a runtime property too, since a `default` could be added without anyone noticing.
   */
  it('every family has a shape, and none is undefined', () => {
    for (const f of families) {
      expect(familyToShape(f), f).toBeTruthy();
    }
  });

  it('the shapes used are ones the resolver dispatches on', () => {
    const KNOWN = ['I', 'H', 'U', 'L', 'RHS', 'CHS', 'T', 'C', 'Z', 'invL', 'rect', 'generic'];
    for (const f of families) expect(KNOWN, f).toContain(familyToShape(f));
  });
});

describe('resolution is by designation, not by resemblance', () => {
  const resolveName = (name: string) =>
    toSectionFields({ kind: 'standard', spec: defaultProfileSpec(name) }, 0)?.name ?? null;

  it('the exact designation resolves', () => {
    expect(resolveName('IPE 200')).toBe('IPE 200');
  });

  /*
   * Case and surrounding whitespace ARE normalised, and that is deliberate rather than sloppy:
   * `catalogueProfile` matches on `name.trim().toUpperCase()`, so a designation typed in lower
   * case is the same designation. This is exact matching after normalisation, not a fuzzy one.
   *
   * I first wrote this as a case that must NOT resolve, and it failed — correctly. The rule the
   * brief asks for is that nothing resembling a designation lands on a neighbour, which is the
   * next test, not that the match is byte-for-byte.
   */
  it('normalises case and surrounding whitespace, and nothing else', () => {
    expect(resolveName('ipe 200 ')).toBe('IPE 200');
  });

  /*
   * The rule that matters: a near miss resolves to nothing rather than to whatever is closest.
   * `IPE 20` is a real prefix of `IPE 200` and `IPE200` differs by one character — both are
   * exactly the inputs a prefix or fuzzy matcher would land on the wrong profile.
   */
  it.each([
    ['IPE 20', 'a truncated designation'],
    ['IPE200', 'the space removed'],
    ['IPE 201', 'a neighbouring size that does not exist'],
    ['HEA 200x', 'a trailing character'],
  ])('%s (%s) resolves to nothing, not to a neighbour', (name) => {
    expect(resolveName(name)).toBeNull();
  });
});
