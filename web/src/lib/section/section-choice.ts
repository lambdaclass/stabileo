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
import { drawnDesignShape } from './drawn-design';
import { findProfile } from '../engine/generators/profile-resolve';

const findProfileFamily = (name: string) => findProfile(name)?.family;

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
    }
  /**
   * Drawn from parts. The parts are the geometry, and `props` the analysis the editor showed:
   * carried for the same reason as a built section's, so the store and the preview agree.
   */
  | {
      kind: 'drawn';
      name: string;
      drawn: import('./drawn').DrawnSection;
      props: { a: number; iy: number; iz: number; j: number | null; b: number; h: number };
    };

/** The subset of `Section` a choice writes. Deliberately not the whole interface. */
export interface SectionFields {
  name: string;
  rotation: number;
  composition?: { profileName: string; arrangement: string; gapMm: number };
  built?: { shapeType: string; params: Record<string, number> };
  /**
   * Written as `undefined` by every choice that is not drawn, so replacing a drawn section with a
   * catalogue pick does not leave the parts behind, winning over the name at the next resolve.
   */
  drawn?: import('./drawn').DrawnSection;
  profileFamily?: string;
  a?: number;
  iy?: number;
  iz?: number;
  j?: number;
  b?: number;
  h?: number;
  shape?: string;
  /*
   * The wall thicknesses, for a BUILT section only.
   *
   * A catalogue pick does not need them here: `resolveCanonicalSection` finds the entry from
   * the name and reads the published `tw`/`tf`/`t`/`r` off the catalogue, which is the only
   * authority for a rolled profile's outline. A built section has no entry, so the resolver
   * switches on `shape` and reads these four off the section itself — and `need()` treats an
   * absent one as a missing dimension.
   *
   * Leaving them out is therefore not a smaller record, it is a section with no geometry:
   * measured, `properties-only` with `missing: ['tw','tf']` for a lipped channel built through
   * the modal, against `geometry-backed` for the identical section built through the tab it
   * replaces. Undrawn, unextruded, and outside every clause helper that dispatches on shape.
   */
  tw?: number;
  tf?: number;
  t?: number;
  /** Lip thickness, C-channel only. `createSectionShape` substitutes `tf` when it is absent. */
  tl?: number;
  /**
   * Always written as `undefined`: shear areas declared for a section are numbers about THAT
   * section, and a replacement kept them — a 10×10 rectangle's declared As went on describing the
   * IPE 600 chosen in its place. The geometric basis is the caller's to carry over (it is a way
   * of reading whatever section is there, not a number about the old one).
   */
  shearAreas?: import('./shear-areas').ShearAreaSpec;
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
  if (choice.kind === 'drawn') {
    const { name, drawn, props } = choice;
    /*
     * The shape and thicknesses a steel check reads, only when the drawing IS that shape: a welded
     * I of three plates, or one catalogue profile. Otherwise they are written as `undefined`, so no
     * check can take a cover-plated or cut section for a plain I. The geometry is the parts either
     * way; the canonical resolver reads `drawn` before `shape`.
     */
    const design = drawnDesignShape(drawn);
    const d = 'shape' in design ? design.shape : null;
    return {
      name,
      rotation: 0,
      drawn,
      // Nothing of a previous make-up may survive: each of these would describe another section.
      built: undefined, composition: undefined, tl: undefined, shearAreas: undefined,
      shape: d?.shape, tw: d?.tw, tf: d?.tf, t: d?.t,
      profileFamily: d?.profileName ? findProfileFamily(d.profileName) : undefined,
      a: props.a, iy: props.iy, iz: props.iz,
      // Written even when the drawing has no torsion constant: a previous one would otherwise
      // survive and be reported for a section it was never computed for.
      j: props.j ?? undefined,
      b: props.b, h: props.h,
    };
  }
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
    const catalogue = findProfile(spec.profileName);
    const single = built.count === 1;
    return {
      name: built.name,
      // A template's record and its lip would otherwise stay, and the section reopen as the
      // template it no longer is.
      drawn: undefined, built: undefined, tl: undefined, shearAreas: undefined,
      rotation: resolveRotationDeg(spec, autoDeg),
      composition: specToComposition(spec, resolved.name),
      profileFamily: resolved.family,
      a: built.a,
      iy: built.iy,
      iz: built.iz,
      // Written even when the assembly has none, for the reason the drawn branch gives.
      j: built.j ?? undefined,
      b: built.b,
      h: built.h,
      // The profile's own thicknesses, or none: a previous make-up's (a drawn welded I, say) would
      // otherwise stay, and a section whose dimensions differ from its profile's is not that
      // profile (`canonical.ts`).
      tw: single && catalogue?.tw != null ? catalogue.tw / 1000 : undefined,
      tf: single && catalogue?.tf != null ? catalogue.tf / 1000 : undefined,
      t: undefined,
      /*
       * `shape` for a single profile only, and this is not stylistic.
       *
       * `resolveCanonicalSection` switches on `shape`. For a compound section that would make
       * it rebuild ONE part's outline from b/h and replace the assembly's composed A, Iy and
       * Iz with a single profile's — the solver would then analyse a double-channel member as
       * one channel. The emitter takes the same care for the same reason.
       */
      // And written as `undefined` for an assembly, so a previous single profile's shape does not.
      shape: single ? familyToShape(resolved.family as never) : undefined,
    };
  }
  const { name, shapeType, params, props, rotationDeg } = choice;
  /*
   * Every field a template can define is written, `undefined` when this one does not define it.
   * The store merges a patch into the section, so a field left out keeps the previous template's
   * value: a tube edited into a solid round bar kept its wall `t` and stayed a tube, 85 % short of
   * the bar's area.
   */
  return {
    name,
    drawn: undefined, composition: undefined, profileFamily: undefined, shearAreas: undefined,
    rotation: rotationDeg === 'auto' ? autoDeg : rotationDeg,
    built: { shapeType, params },
    a: props.a,
    iy: props.iy,
    iz: props.iz,
    j: props.j,
    b: props.b,
    h: props.h,
    // The four the resolver needs for a section with no catalogue entry. See `SectionFields`.
    tw: props.tw,
    tf: props.tf,
    t: props.t,
    tl: props.tl,
    shape: props.shape,
  };
}

/**
 * Whether a drawn choice is the drawing it was reopened from, as it was: same name, same parts.
 *
 * What the editor derives on the way out — each part's modular ratio, the material areas — is not
 * an edit, nor is the reference material of a drawing in one material, which the editor leaves
 * out. Closing a drawing reopened and left alone used to ask whether to discard it.
 */
export function drawnUnchanged(
  choice: SectionChoice | null,
  initial: { name: string; drawn: import('./drawn').DrawnSection } | null,
): boolean {
  if (!choice || choice.kind !== 'drawn' || !initial || choice.name !== initial.name) return false;
  const norm = (d: import('./drawn').DrawnSection) => {
    const { areas: _a, refMaterialId, ...rest } = d;
    const parts = d.parts.map(({ ratio: _r, ...p }) => p);
    const composite = parts.some((p) => !p.void && p.materialId != null);
    return canonical({ ...rest, parts, ...(composite ? { refMaterialId } : {}) });
  };
  return norm(choice.drawn) === norm(initial.drawn);
}

/** JSON with every object's keys sorted, so two equal values read the same however they were built. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Whether a choice describes a catalogue pick. Kept here so no surface re-derives the rule. */
export function isStandard(c: SectionChoice): c is Extract<SectionChoice, { kind: 'standard' }> {
  return c.kind === 'standard';
}
