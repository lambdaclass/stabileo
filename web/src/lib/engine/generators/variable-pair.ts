/**
 * The two sections of a generated member of variable section: one at the end it starts from
 * (a beam's support, a column's base) and one at the end it grows toward (mid-span, the head).
 *
 * A role whose members vary takes, beside its own profile, a second one. Either may be a
 * catalogue profile or a section built from a template; the usual case, a welded I whose web
 * deepens toward mid-span with the same flanges, is two `I-custom` templates, and
 * `weldedIPair` makes it from whatever profile the role had.
 *
 * The pair must have a transition that means something, the rule `section/variable.ts` applies
 * to any member: two templates of one kind, or two single profiles of one family. What the
 * solve does with it is the variable-section member's (`engine/variable-members.ts`).
 *
 * Pure of stores.
 */
import { computeSectionProperties, generateSectionName, type ShapeType } from '../../data/section-shapes';
import { toSectionFields, type SectionFields } from '../../section/section-choice';
import type { ProfileSpec } from '../../section/profile-spec';
import { findProfile, resolveProfile } from './profile-resolve';

/** A spec for a section built from a template. */
export function builtSpec(shapeType: string, params: Record<string, number>): ProfileSpec {
  return {
    profileName: generateSectionName(shapeType as ShapeType, params),
    arrangement: 'single', gapMm: 0, rotationDeg: 'auto',
    built: { shapeType, params: { ...params } },
  };
}

/** The section fields of a built spec, or null when its numbers make no section. */
export function builtSectionFields(spec: ProfileSpec): SectionFields | null {
  if (!spec.built) return null;
  const props = computeSectionProperties(spec.built.shapeType as ShapeType, spec.built.params);
  if (!props || !(props.a > 0)) return null;
  return toSectionFields({ kind: 'built', name: spec.profileName, shapeType: spec.built.shapeType, params: spec.built.params, props, rotationDeg: 0 }, 0);
}

/**
 * The usual variable member: a welded I with the role's profile's plates at the start, and the
 * same flanges and web with `factor` times the depth at the other end. A profile with no
 * thicknesses in the catalogue gives a 300 mm welded I to start from.
 */
export function weldedIPair(spec: ProfileSpec, factor = 2): { start: ProfileSpec; end: ProfileSpec } {
  const own = spec.built?.shapeType === 'I-custom' ? spec.built.params : null;
  const p = own ? null : findProfile(spec.profileName);
  // Metres from the catalogue's millimetres, to the tenth of a millimetre a plate is cut to.
  const m = (mm: number) => Math.round(mm * 10) / 1e4;
  const plates = own ?? (p && p.tw && p.tf
    ? { h: m(p.h), b: m(p.b), tw: m(p.tw), tf: m(p.tf) }
    : { h: 0.3, b: 0.15, tw: 0.0063, tf: 0.0095 });
  return {
    start: builtSpec('I-custom', plates),
    end: builtSpec('I-custom', { ...plates, h: m(plates.h * factor * 1000) }),
  };
}

/**
 * Why two specs cannot be the ends of one member, as an i18n key, or null. The geometry check
 * proper (`variableSectionPlan`) runs on the sections once they exist; this one refuses, before
 * Generate, what can never pass it.
 */
export function variablePairProblem(start: ProfileSpec, end: ProfileSpec): string | null {
  if (start.arrangement !== 'single' || end.arrangement !== 'single') return 'generator.problem.variableCompound';
  if (!!start.built !== !!end.built) return 'generator.problem.variableMakeUp';
  if (start.built && end.built) {
    if (start.built.shapeType !== end.built.shapeType) return 'generator.problem.variableMakeUp';
    if (JSON.stringify(start.built.params) === JSON.stringify(end.built.params)) return 'generator.problem.variableSame';
    return null;
  }
  if (start.profileName === end.profileName) return 'generator.problem.variableSame';
  const a = resolveProfile(start.profileName), b = resolveProfile(end.profileName);
  if (a && b && a.family !== b.family) return 'generator.problem.variableMakeUp';
  return null;
}
