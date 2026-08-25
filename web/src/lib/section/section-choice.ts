/**
 * What the PRO section modal returns, and how it lands on a `Section`.
 *
 * ── Two kinds, because the model already has two ────────────────────
 *
 * `Section` carries `composition` — the catalogue parts an assembly is made of — and `built`
 * — the template and the numbers a parametric section was typed into. They are not variants
 * of one thing: a catalogue pick has a designation and no parameters, a built section has
 * parameters and no designation, and a field that tried to hold both would be a string nobody
 * can act on. That is the defect `composition` was added to close, and this type keeps the
 * two apart on the way in as well as on the way out.
 *
 * ── Why this is not a third representation ─────────────────────────
 *
 * `toSectionFields` produces exactly the fields the store already stores. Nothing here invents
 * a property: the catalogue branch carries a name and lets the existing resolution path
 * compute the assembly, and the built branch carries the numbers `computeSectionProperties`
 * already returned. A choice is a description of what the user did, not a second opinion about
 * geometry.
 */

import type { ProfileSpec } from './profile-spec';
import { specToComposition, resolveRotationDeg } from './profile-spec';
import type { SectionProperties } from '../data/section-shapes';
import { composeBuiltUp } from '../engine/generators/built-up-section';
import { resolveProfile } from '../engine/generators/profile-resolve';
import { familyToShape } from '../data/steel-profiles';

export type SectionChoice =
  /** Picked from a catalogue, possibly composed and rotated. */
  | { kind: 'standard'; spec: ProfileSpec }
  /**
   * Built from a template.
   *
   * `props` are the numbers `computeSectionProperties` produced from `params` — carried rather
   * than recomputed here, so the modal and the store cannot disagree about what the preview
   * showed.
   */
  | {
      kind: 'built';
      name: string;
      shapeType: string;
      params: Record<string, number>;
      props: SectionProperties;
      rotationDeg: number | 'auto';
    };

/** The subset of `Section` a choice writes. Deliberately not the whole interface. */
export interface SectionFields {
  name: string;
  rotation: number;
  composition?: { profileName: string; arrangement: string; gapMm: number };
  built?: { shapeType: string; params: Record<string, number> };
  profileFamily?: string;
  a?: number;
  iy?: number;
  iz?: number;
  j?: number;
  b?: number;
  h?: number;
  shape?: string;
}

/**
 * The fields to write for a choice.
 *
 * `autoDeg` is required rather than defaulted, for the reason `resolveRotationDeg` states: a
 * spec may say `'auto'`, meaning "ask the member", and only the caller knows the member. A
 * sections tab editing a section that belongs to nothing yet passes `0`, which reads as a
 * decision rather than as an oversight.
 */
export function toSectionFields(choice: SectionChoice, autoDeg: number): SectionFields | null {
  if (choice.kind === 'standard') {
    const { spec } = choice;
    const resolved = resolveProfile(spec.profileName);
    /*
     * Null when the catalogue does not know the name.
     *
     * Not a fallback: `Section` requires an area and an inertia, and the only honest source
     * for them is the catalogue entry. Returning a section with `a: undefined` would create a
     * row the canonical resolver then reports as having no known geometry — which reads to a
     * user as "amorphous section" for what they just picked out of a list.
     */
    if (!resolved) return null;

    /*
     * The properties come from `composeBuiltUp`, exactly as the emitter's do.
     *
     * Not summed here, and that is the point. `composeBuiltUp` knows which arrangements
     * enclose a cell and therefore when `J` may NOT be summed — it returns `null` with a
     * basis rather than a wrong number. Reimplementing the arithmetic in this module would
     * either duplicate that rule or quietly drop it, and dropping it means reporting a
     * torsional constant for a closed assembly that does not have one.
     */
    const built = composeBuiltUp(resolved.profile, spec.arrangement, spec.gapMm / 1000);
    const single = built.count === 1;
    return {
      name: built.name,
      rotation: resolveRotationDeg(spec, autoDeg),
      composition: specToComposition(spec, resolved.name),
      profileFamily: resolved.family,
      a: built.a,
      iy: built.iy,
      iz: built.iz,
      ...(built.j !== null ? { j: built.j } : {}),
      b: built.b,
      h: built.h,
      /*
       * `shape` for a single profile only, and this is not stylistic.
       *
       * `resolveCanonicalSection` switches on `shape`. For a compound section that would make
       * it rebuild ONE part's outline from b/h and replace the assembly's composed A, Iy and
       * Iz with a single profile's — the solver would then analyse a double-channel member as
       * one channel. The emitter takes the same care for the same reason.
       */
      ...(single ? { shape: familyToShape(resolved.family as never) } : {}),
    };
  }
  const { name, shapeType, params, props, rotationDeg } = choice;
  return {
    name,
    rotation: rotationDeg === 'auto' ? autoDeg : rotationDeg,
    built: { shapeType, params },
    a: props.a,
    iy: props.iy,
    iz: props.iz,
    ...(props.j !== undefined ? { j: props.j } : {}),
    ...(props.b !== undefined ? { b: props.b } : {}),
    ...(props.h !== undefined ? { h: props.h } : {}),
    shape: props.shape,
  };
}

/** Whether a choice describes a catalogue pick. Kept here so no surface re-derives the rule. */
export function isStandard(c: SectionChoice): c is Extract<SectionChoice, { kind: 'standard' }> {
  return c.kind === 'standard';
}
