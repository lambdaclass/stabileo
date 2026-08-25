/**
 * `ProfileSpec` — the one description of a chosen section, wherever it is chosen.
 *
 * ── Why this module exists ──────────────────────────────────────────
 *
 * Four surfaces need to say "this member is two L 75×75×6 back to back, 10 mm apart, rotated
 * 90°": the section selector, the generator's per-role picker, the model, and the 3-D view.
 * Three of them already could. The generator picker has had arrangement, gap and rotation
 * since it was written; `Section.composition` has stored `{profileName, arrangement, gapMm}`
 * since the generators started emitting it; and `three/section-profiles.ts` reads that field
 * to extrude the real assembly outline instead of a fabricated I-beam.
 *
 * What was missing is the **selector**, and the reason is structural rather than accidental:
 * the type lived in `engine/generators/emit.ts`, so it was generator-private, and the only
 * code that ever wrote `Section.composition` was `emit.ts`. A user could get a back-to-back
 * angle by generating a truss and by no other route.
 *
 * So this file is the contract's home, and `emit.ts` re-exports it. Nothing about the
 * generators changes; what changes is that a second writer is now possible.
 *
 * ── The two representations, and why they are not the same shape ────
 *
 * `ProfileSpec` is what a USER PICKED. `Section.composition` + `Section.rotation` is what a
 * MODEL STORES. They differ in exactly one field, and the difference is real:
 *
 *   · `ProfileSpec.rotationDeg` can be `'auto'` — "whatever roll the generator computes for
 *     each member". A purlin on a pitched roof knows its own slope and the picker does not.
 *   · `Section.rotation` is a number of degrees. A stored section has no generator standing
 *     behind it to ask, so `'auto'` has nothing to resolve to there.
 *
 * That is why `specToComposition` takes the resolved angle as an argument instead of guessing
 * one: the caller that knows the member is the caller that must supply it. Collapsing `'auto'`
 * to `0` inside this module would silently flatten every pitched purlin in a generated shed.
 *
 * ── Declarative, like the field it writes ───────────────────────────
 *
 * Nothing here computes a section property. `a`, `iy`, `iz` and `j` on a composed section stay
 * authoritative and are produced by `built-up-section.ts`, which knows which arrangements
 * enclose a cell and therefore when `J` may not be summed at all. This module moves a
 * description around; it does not have an opinion about geometry.
 */

/**
 * How many copies of the profile, and where they sit.
 *
 * Defined here rather than in `engine/generators/built-up-section.ts` because the selector is
 * below the generators, not inside them — a section picked in the sections tab has an
 * arrangement and no generator anywhere near it. `built-up-section.ts` re-exports both names,
 * so every existing import keeps resolving and the placement table stays where it belongs.
 */
export const BUILT_UP_ARRANGEMENTS = [
  'single',
  'doubleBack',
  'doubleFacing',
  'doubleParallel',
  'doubleX',
  'quadBack',
  'quadBox',
] as const;

export type BuiltUpArrangement = (typeof BUILT_UP_ARRANGEMENTS)[number];

/** Whether a string is one of the seven. Used at the boundaries — stored models, share links. */
export function isBuiltUpArrangement(v: unknown): v is BuiltUpArrangement {
  return typeof v === 'string' && (BUILT_UP_ARRANGEMENTS as readonly string[]).includes(v);
}

/** A section as it was chosen, before anything resolved it against a member. */
export interface ProfileSpec {
  /** Exact catalogue name, e.g. `IPE 160`, `L 75x75x6`. Never a description. */
  profileName: string;
  arrangement: BuiltUpArrangement;
  /** Gap between the parts of a compound section, mm. Meaningless for `single`. */
  gapMm: number;
  /**
   * Section rotation about the member axis, degrees, or `'auto'`.
   *
   * `'auto'` defers to whatever roll the GENERATOR computed for each member. A number
   * overrides that for every member of the role.
   */
  rotationDeg: number | 'auto';
}

export function defaultProfileSpec(profileName: string): ProfileSpec {
  return { profileName, arrangement: 'single', gapMm: 0, rotationDeg: 'auto' };
}

/** The make-up of a section as the model stores it. Mirrors `Section.composition`. */
export interface SectionComposition {
  profileName: string;
  arrangement: BuiltUpArrangement;
  gapMm: number;
}

/** What `compositionToSpec` reads. A structural subset of `Section`, so this file imports no store. */
export interface ComposedSectionLike {
  composition?: { profileName: string; arrangement: string; gapMm: number };
  rotation?: number;
  profileFamily?: string;
  name?: string;
}

/**
 * The stored make-up for a spec.
 *
 * `profileName` comes in separately because a spec holds what the user typed or clicked and a
 * stored section must hold what the catalogue RESOLVED — `emit.ts` passes `resolved.name` for
 * exactly that reason. Passing the spec's own name is correct when it already is a catalogue
 * name; it is the caller's call, and making it an argument is what stops this module from
 * quietly picking the wrong one.
 */
export function specToComposition(spec: ProfileSpec, resolvedName = spec.profileName): SectionComposition {
  return {
    profileName: resolvedName,
    arrangement: spec.arrangement,
    // Negative would place the parts inside one another. Clamped rather than rejected,
    // matching what the emitter has always done with the same number.
    gapMm: Math.max(0, spec.gapMm),
  };
}

/**
 * Recover the spec a stored section was made from, or null when it was not made from one.
 *
 * Null rather than a default: a section with no `composition` was built from a template or
 * typed in by hand, and handing back `defaultProfileSpec(name)` would assert that its name is
 * a catalogue designation. For most of them it is not.
 *
 * An arrangement the app does not know — a model written by a later version, a hand-edited
 * `.ded` — also returns null. Reading it as `single` would draw one profile where the file
 * says four.
 */
export function compositionToSpec(sec: ComposedSectionLike | undefined | null): ProfileSpec | null {
  const c = sec?.composition;
  if (!c || !isBuiltUpArrangement(c.arrangement)) return null;
  return {
    profileName: c.profileName,
    arrangement: c.arrangement,
    gapMm: Math.max(0, c.gapMm),
    /*
     * A stored section's rotation is a number or it is absent, and absent means zero — the
     * renderers already read `rotation ?? 0`. It is never `'auto'`, because nothing is left
     * to resolve it against once the model is written.
     */
    rotationDeg: sec?.rotation ?? 0,
  };
}

/**
 * The angle to store for a spec, given what the member itself computed.
 *
 * The whole point of `'auto'` is that this answer is per-member, so the fallback is required
 * rather than defaulted to zero. A caller with no member — the sections tab, picking a section
 * that belongs to nothing yet — passes `0` explicitly, which reads as a decision.
 */
export function resolveRotationDeg(spec: ProfileSpec, autoDeg: number): number {
  return spec.rotationDeg === 'auto' ? autoDeg : spec.rotationDeg;
}

/** Whether the spec describes more than one profile. */
export function isCompound(spec: ProfileSpec): boolean {
  return spec.arrangement !== 'single';
}

/** Two specs describe the same section. Used to tell a real edit from a no-op re-pick. */
export function sameProfileSpec(a: ProfileSpec, b: ProfileSpec): boolean {
  return a.profileName === b.profileName
    && a.arrangement === b.arrangement
    && a.gapMm === b.gapMm
    && a.rotationDeg === b.rotationDeg;
}
