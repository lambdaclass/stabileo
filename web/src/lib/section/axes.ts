/**
 * Whether a section's geometric axes are its principal axes.
 *
 * ══ The problem this exists to name ══
 *
 * This app stores a section as `A`, `Iy`, `Iz`, `J` and analyses it about the axes those are
 * measured on — horizontal and vertical, aligned with how the profile is drawn. For a doubly
 * symmetric section that is exactly right. For a section with no axis of symmetry it is not:
 *
 *   · the **geometric** axes are the ones the app stores inertias about;
 *   · the **principal** axes are the only pair about which bending in one plane does not drag
 *     bending in the other. That is a property of the shape, not a choice;
 *   · they coincide when the section has an axis of symmetry, and only then;
 *   · when they do not coincide, the stored `Iy`/`Iz` do not describe the member's bending
 *     stiffness, and the true minimum inertia is **smaller** than the smaller of the two stored
 *     values — so the error is on the unsafe side, not the conservative one.
 *
 * The app has no field for a product of inertia — `grep -rn "ixy" src/lib` finds nothing — and
 * nothing anywhere says any of the above. This module is the rule that lets a surface say it.
 *
 * It reaches further than the cold-formed zed that prompted it. **37 angles are catalogued and
 * selectable today** (10 European in `steel-profiles.ts`, 27 IRAM-IAS U 500-558 in
 * `iram-angles.ts`), and for an equal-leg angle the true minimum principal inertia is about 40 %
 * of the stored weak-axis value — the stored number is ~2.4× too high. That is the classic reason
 * an angle strut is checked about its `v-v` axis, and it predates every branch here.
 *
 * ══ Why the shape alone decides it ══
 *
 * No dimensions are consulted, and that is not a simplification. Symmetry is topological here:
 * an angle has no axis of symmetry whatever its legs measure, a zed has only point symmetry at
 * every size, and an I, a channel, a tee or a tube has an axis of symmetry at every size. There
 * is no shape in this app that is symmetric for some dimensions and not others, so a rule keyed
 * on `Section.shape` is exact rather than approximate.
 *
 * ══ What this module is NOT ══
 *
 * Not a verification, and not an input to one. It reads nothing the solver produces, adds no
 * field to the model, and changes no number: a model opened before and after this exists gives
 * identical displacements, reactions and forces. That is what makes the warning reversible where
 * adding a product of inertia would not be — see `docs/handoffs/m2-ixy-integration-handoff.md`.
 *
 * It is also **the single rule**. Two surfaces warning on two different predicates would be
 * worse than one surface warning: a reader who sees the notice in one place and not another
 * learns that the app is inconsistent, not that their section is unsymmetric. Every consumer
 * calls this.
 */

import type { Section } from '../store/model.svelte';

/** The shapes a `Section` can declare. Kept local so this module owns its own exhaustiveness. */
type Shape = NonNullable<Section['shape']>;

export type AxesSymmetry =
  /** The section has an axis of symmetry, so its geometric axes ARE its principal axes. */
  | 'principal'
  /** No axis of symmetry: the principal axes are rotated and the stored inertias are not them. */
  | 'notPrincipal'
  /**
   * The app cannot tell.
   *
   * A properties-only section carries no outline, so its symmetry is not a fact the app has. Not
   * warning is the honest response — and so is not claiming symmetry, which is why this is its
   * own value rather than being folded into `principal`.
   */
  | 'unknown';

/**
 * Every shape, with a decision. **A `Record` and not a `switch` on purpose:** adding a literal to
 * `Section['shape']` without deciding about it becomes a COMPILE error here, instead of silently
 * falling through to "do not warn". The zed was added in M1 and this is what stops the next shape
 * from arriving unexamined.
 */
const SYMMETRY: Record<Shape, AxesSymmetry> = {
  // Doubly symmetric — two axes of symmetry.
  I: 'principal',
  H: 'principal',
  RHS: 'principal',
  CHS: 'principal',
  rect: 'principal',
  // One axis of symmetry, which is all it takes.
  U: 'principal',     // channel: symmetric about the horizontal axis
  C: 'principal',     // lipped channel: same
  T: 'principal',     // tee: symmetric about the vertical axis
  // No axis of symmetry.
  L: 'notPrincipal',  // angle: principal axes at 45° when the legs are equal
  invL: 'notPrincipal', // unequal angle: rotated by something other than 45°
  Z: 'notPrincipal',  // zed: point symmetry only
  // No outline, so no answer.
  generic: 'unknown',
};

/**
 * The symmetry of a section's stored axes.
 *
 * A section with no `shape` at all is `unknown` for the same reason `generic` is: it is
 * properties-only, and the app has no geometry to reason from.
 */
export function axesSymmetryOf(shape: Section['shape'] | undefined): AxesSymmetry {
  if (!shape) return 'unknown';
  return SYMMETRY[shape] ?? 'unknown';
}

/**
 * Whether a surface should warn about this section's axes.
 *
 * **True only for `notPrincipal`.** `unknown` does not warn: a warning there would be a guess,
 * and this module's whole point is that guessing about symmetry is what got the app here.
 */
export function warnsAboutAxes(shape: Section['shape'] | undefined): boolean {
  return axesSymmetryOf(shape) === 'notPrincipal';
}

/**
 * The i18n key for the notice, or `null` when there is nothing to say.
 *
 * Two texts, because the two cases genuinely differ and one sentence covering both would have to
 * be vague enough to be useless:
 *
 *   · **an angle** has no escape. Its axes are rotated and that is the end of it.
 *   · **a zed** usually does: a purlin restrained by sheeting really does bend about close to a
 *     geometric axis, which is why practice analyses it that way. But the provision that says
 *     when that restraint counts is in CIRSOC 303, which this app does not carry — so the honest
 *     line is neither "wrong" nor "fine", it is that the assumption cannot be cited.
 *
 * The choice of text lives here rather than in a component so that the rule and its wording stay
 * together. A surface asks one question and renders one answer.
 */
export function axesNoticeKeyFor(shape: Section['shape'] | undefined): string | null {
  if (!warnsAboutAxes(shape)) return null;
  return shape === 'Z' ? 'section.axes.notPrincipal.zed' : 'section.axes.notPrincipal.angle';
}

/**
 * Every shape this module knows, for a test that wants to walk them.
 *
 * Derived from the record's own keys, so it cannot fall behind the decisions above.
 */
export const KNOWN_SHAPES = Object.keys(SYMMETRY) as readonly Shape[];
