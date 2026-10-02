/**
 * canonical.ts — one resolution point from a stored `Section` to canonical
 * geometry, or to an explicit refusal.
 *
 * # The two states
 *
 * A section is either **geometry-backed** — its exact outline is known, so
 * properties, stress and drawing all derive from one polygon set — or
 * **properties-only** — it carries declared A/I/J that keep it solvable
 * globally, but its true outline is not known and no detailed geometry-based
 * stress field may be claimed for it.
 *
 * There is no third state and no fallback between them. The previous code
 * inferred a shape from the profile *name* (`IPE…`, `HEB…`, `L\d…`) and
 * invented thicknesses when they were missing (`tw = 0.05·b`, `tf = 0.06·h`),
 * which produced a measured 40 % error in shear stress with no warning. Here a
 * section either has every dimension its family needs or it is
 * properties-only; nothing in between.
 *
 * # Why some rolled profiles are properties-only
 *
 * A rolled I-profile's root fillets are worth 2.4–6.0 % of its area. Without an
 * authoritative root radius the polygon would be wrong by that much, so IPN,
 * UPN, angles and RHS stay properties-only until their radii and tapers can be
 * sourced. That is a data gap, not a product boundary — see the header of
 * `data/steel-profiles.ts`.
 */

import type { Section } from '../store/model.svelte';
import type { SteelProfile } from '../data/steel-profiles';
import { ALL_PROFILES } from '../data/steel-profiles';
import {
  buildSectionGeometry,
  hasCanonicalGeometryExport,
  sectionGeometryDigest,
  type CanonicalGeometryResponse,
} from '../engine/wasm-solver';
import { analyzeDrawn } from './drawn-properties';
import { isSolidCircle } from './solid-circle';

/**
 * Families whose canonical geometry is fully determined by data we hold.
 *
 * IPN and UPN joined this set without any new table: DIN 1025-1 and -5 define
 * their flange taper and both radii as rules on dimensions already here. L
 * joined it with the EN 10056-1 root radii. RHS and SHS joined it when the
 * European tube tables were replaced by the IRAM-IAS ones, which fix the outer
 * corner at R = 2t where EN 10219-2 only gives a range. Every family now has
 * an exact outline.
 */
/** IRAM-IAS standard per American-series I family. */
const IRAM_I_STANDARD: Record<string, string> = {
  W: 'IRAM-IAS U 500-215-6',
  HP: 'IRAM-IAS U 500-215-7',
  M: 'IRAM-IAS U 500-215-8',
};

const GEOMETRY_BACKED_FAMILIES = new Set(['IPE', 'HEA', 'HEB', 'HEM', 'W', 'HP', 'M', 'C', 'T', 'CHS', 'IPN', 'UPN', 'L', 'RHS', 'SHS']);

/**
 * Why a section could not be expressed as canonical geometry.
 * Structured rather than prose so the UI can present it later without this
 * module owning any user-facing text.
 */
export type PropertiesOnlyReason =
  | { kind: 'missingRootRadius'; family: string }
  | { kind: 'missingCornerRadii'; family: string }
  | { kind: 'missingTaperAndRadii'; family: string }
  | { kind: 'missingDimensions'; missing: string[] }
  | { kind: 'unknownFamily'; family: string }
  | { kind: 'noGeometry' }
  /** Its properties are declared (`Section.declared`): the name is not looked up. */
  | { kind: 'declared' }
  /** A drawn section whose parts do not make a section (overlapping materials, a stray hole). */
  | { kind: 'drawnInvalid' };

export interface GeometryBackedSection {
  state: 'geometry-backed';
  /** Stable identity — never the display name. */
  sectionId: number;
  profileId?: string;
  geometry: CanonicalGeometryResponse['geometry'];
  digest: string;
  properties: CanonicalGeometryResponse['properties'];
  /**
   * More than one material: the properties are the transformed section's, and a stress field
   * over the homogeneous geometry would be wrong in every part but the reference one.
   */
  composite?: boolean;
}

export interface PropertiesOnlySection {
  state: 'properties-only';
  sectionId: number;
  profileId?: string;
  reason: PropertiesOnlyReason;
  /** The declared values that keep this section globally solvable. */
  declared: { a: number; iy?: number; iz: number; j?: number };
}

export type ResolvedSection = GeometryBackedSection | PropertiesOnlySection;

/**
 * Missing-data reasons per rolled family, so the message is derived from the
 * catalogue rather than restated in three places.
 */
function rolledReason(family: string): PropertiesOnlyReason {
  switch (family) {
    // Miscellaneous channels: the published slope contradicts the published
    // properties, and fitting it would be circular. See iram-mc.ts.
    case 'MC':
      return { kind: 'missingTaperAndRadii', family };
    case 'RHS':
      return { kind: 'missingCornerRadii', family };
    default:
      return { kind: 'unknownFamily', family };
  }
}

/** Find the catalogue profile a section came from, by name match. */
function catalogueProfile(sec: Section): SteelProfile | undefined {
  if (!sec.name) return undefined;
  const target = sec.name.trim().toUpperCase();
  const p = ALL_PROFILES.find((q) => q.name.trim().toUpperCase() === target);
  // A section that carries dimensions of its own, other than the profile's, is not that profile:
  // a CSV row named "IPE 300" with h = 400 mm solved as the IPE 300 while storing h = 0.4 m.
  // The name looks up dimensions only when the section has none, or the same ones.
  return p && ownDimensionsDiffer(sec, p) ? undefined : p;
}

function ownDimensionsDiffer(sec: Section, p: SteelProfile): boolean {
  const s = sec as { h?: number; b?: number; tw?: number; tf?: number };
  const off = (own: number | undefined, mm: number | undefined, tol: number) => own != null && mm != null && Math.abs(own * 1000 - mm) > tol;
  return off(s.h, p.h, 0.5) || off(s.b, p.b, 0.5) || off(s.tw, p.tw, 0.05) || off(s.tf, p.tf, 0.05);
}

const propertiesOnly = (
  sec: Section,
  reason: PropertiesOnlyReason,
  profileId?: string,
): PropertiesOnlySection => ({
  state: 'properties-only',
  sectionId: sec.id,
  profileId,
  reason,
  declared: { a: sec.a, iy: sec.iy, iz: sec.iz, j: sec.j },
});

/**
 * Resolve a stored section to canonical geometry, or explain why not.
 *
 * `profileId` is the stable catalogue identity. It is read from the section's
 * name only to *look up* dimensions — the resulting geometry depends on the
 * dimensions alone, so renaming a section can never change its geometry,
 * digest or results. A test pins that.
 */
export function resolveCanonicalSection(sec: Section): ResolvedSection {
  // Older WASM builds (or builds from branches that predate the section engine)
  // do not export buildSectionGeometry. Treat the missing export the same as an
  // unknown geometry: properties-only, never a throw.
  if (!hasCanonicalGeometryExport()) {
    return propertiesOnly(sec, { kind: 'noGeometry' });
  }

  const backed = (r: CanonicalGeometryResponse, profileId?: string): GeometryBackedSection => {
    // Section rotation is part of the geometry's identity, not a view setting:
    // it changes which moment component the section sees and therefore the
    // stress field. Carrying it here means the digest covers it, so a rotated
    // and an unrotated section can never be mistaken for each other, and the
    // engine can map element-local moments into the section's own frame.
    const rotationRad = ((sec.rotation ?? 0) * Math.PI) / 180;
    const geometry = rotationRad === 0 ? r.geometry : { ...r.geometry, rotation: rotationRad };
    return {
      state: 'geometry-backed',
      sectionId: sec.id,
      profileId,
      geometry,
      // The digest must describe the geometry actually carried, so it is
      // recomputed whenever rotation changes it.
      digest: rotationRad === 0 ? r.digest : sectionGeometryDigest(geometry).digest,
      properties: r.properties,
    };
  };

  // ── A drawn section: its parts are the geometry ───────────────
  if (sec.drawn) {
    const d = analyzeDrawn(sec.drawn, catalogueOutline, { torsion: false });
    if (!d.geometry || !d.digest || !d.properties) return propertiesOnly(sec, { kind: 'drawnInvalid' });
    const p = d.properties;
    const r = backed({
      geometry: d.geometry,
      digest: d.digest,
      properties: {
        a: p.a, yc: p.yc, zc: p.zc, iy: p.iy, iz: p.iz, iyz: p.iyz, i1: p.i1, i2: p.i2, thetaP: p.thetaP,
        // The torsion constant is solved per piece in `state.ts`; this slot is never read for it.
        j: 0, bbox: p.bbox,
      },
    });
    return p.composite ? { ...r, composite: true } : r;
  }

  // ── Explicit custom geometry always wins ──────────────────────
  if (sec.polygon && sec.polygon.length >= 3) {
    return backed(
      buildSectionGeometry({ kind: 'custom', outer: sec.polygon, holes: sec.holes ?? [] }),
    );
  }

  // ── Declared properties: the name is a label, not a lookup ─────
  if (sec.declared) return propertiesOnly(sec, { kind: 'declared' });

  const profile = catalogueProfile(sec);
  const mm = (v: number) => v / 1000;

  // ── Rolled catalogue profile ──────────────────────────────────
  if (profile) {
    if (!GEOMETRY_BACKED_FAMILIES.has(profile.family)) {
      return propertiesOnly(sec, rolledReason(profile.family), profile.name);
    }
    // IPN / UPN — the standard's own rules supply the taper and both radii, so
    // the published web and flange thicknesses are all the outline needs.
    if (profile.family === 'IPN' || profile.family === 'UPN') {
      const missing: string[] = [];
      if (profile.tw == null) missing.push('tw');
      if (profile.tf == null) missing.push('tf');
      if (missing.length > 0) {
        return propertiesOnly(sec, { kind: 'missingDimensions', missing }, profile.name);
      }
      return backed(
        buildSectionGeometry({
          kind: profile.family === 'IPN' ? 'ipn' : 'upn',
          h: mm(profile.h),
          b: mm(profile.b),
          tw: mm(profile.tw!),
          tf: mm(profile.tf!),
          profileId: profile.name,
          standard: profile.family === 'IPN' ? 'DIN 1025-1' : 'DIN 1026-1',
        }),
        profile.name,
      );
    }
    // Rolled tees — both fillet radii are published per profile.
    if (profile.family === 'T') {
      const missing: string[] = [];
      if (profile.tw == null) missing.push('tw');
      if (profile.tf == null) missing.push('tf');
      if (profile.r == null) missing.push('r');
      if (missing.length > 0) {
        return propertiesOnly(sec, { kind: 'missingDimensions', missing }, profile.name);
      }
      return backed(
        buildSectionGeometry({
          kind: 'tee',
          h: mm(profile.h), b: mm(profile.b),
          tw: mm(profile.tw!), tf: mm(profile.tf!),
          rootRadius: mm(profile.r!),
          toeRadius: mm(Math.min(profile.r!, profile.tf!) / 1.5),
          profileId: profile.name,
          standard: 'IRAM-IAS U 500-561',
        }),
        profile.name,
      );
    }
    // American channels — 1:6 flange taper, roller radius constant per rolling
    // depth, tf quoted at mid-overhang. The C9 group ships radius 0 because its
    // published clear web depth is not a geometry; see iram-c.ts.
    if (profile.family === 'C') {
      const missing: string[] = [];
      if (profile.tw == null) missing.push('tw');
      if (profile.tf == null) missing.push('tf');
      if (missing.length > 0) {
        return propertiesOnly(sec, { kind: 'missingDimensions', missing }, profile.name);
      }
      const r = profile.r ?? 0;
      return backed(
        buildSectionGeometry({
          kind: 'channel',
          h: mm(profile.h), b: mm(profile.b),
          tw: mm(profile.tw!), tf: mm(profile.tf!),
          slope: 1 / 6,
          rootRadius: mm(r),
          toeRadius: mm(r / 2),
          taperRef: mm(profile.tw! + (profile.b - profile.tw!) / 2),
          profileId: profile.name,
          standard: 'IRAM-IAS U 500-509-4',
        }),
        profile.name,
      );
    }
    // Structural tubes — IRAM-IAS fixes the outer corner at exactly 2t, which
    // is the whole reason these are geometry-backed rather than properties-only.
    if (profile.family === 'RHS' || profile.family === 'SHS') {
      if (profile.t == null) {
        return propertiesOnly(sec, { kind: 'missingDimensions', missing: ['t'] }, profile.name);
      }
      return backed(
        buildSectionGeometry({
          kind: 'rhs',
          b: mm(profile.b),
          h: mm(profile.h),
          t: mm(profile.t),
          cornerRadius: mm(2 * profile.t),
          profileId: profile.name,
          standard: 'IRAM-IAS U 500-218',
        }),
        profile.name,
      );
    }
    // L — EN 10056-1 tabulates the root radius; the toe radius is half of it.
    if (profile.family === 'L') {
      const missing: string[] = [];
      if (profile.t == null) missing.push('t');
      if (profile.r == null) missing.push('r');
      if (missing.length > 0) {
        return propertiesOnly(sec, { kind: 'missingDimensions', missing }, profile.name);
      }
      return backed(
        buildSectionGeometry({
          kind: 'angle',
          h: mm(profile.h),
          b: mm(profile.b),
          t: mm(profile.t!),
          rootRadius: mm(profile.r!),
          toeRadius: mm(profile.r! / 2),
          profileId: profile.name,
          standard: 'EN 10056-1',
        }),
        profile.name,
      );
    }
    if (profile.family === 'CHS') {
      // A tube needs only outer diameter and wall thickness — no fillet or
      // corner data is involved, which is why every CHS is geometry-backed.
      if (profile.t == null) {
        return propertiesOnly(sec, { kind: 'missingDimensions', missing: ['t'] }, profile.name);
      }
      return backed(
        buildSectionGeometry({ kind: 'chs', d: mm(profile.h), t: mm(profile.t) }),
        profile.name,
      );
    }
    // IPE / HEA / HEB — need the root radius, and it must never be guessed.
    const missing: string[] = [];
    if (profile.tw == null) missing.push('tw');
    if (profile.tf == null) missing.push('tf');
    if (profile.r == null) missing.push('r');
    if (missing.length > 0) {
      return propertiesOnly(sec, { kind: 'missingDimensions', missing }, profile.name);
    }
    return backed(
      buildSectionGeometry({
        kind: 'iSection',
        h: mm(profile.h),
        b: mm(profile.b),
        tw: mm(profile.tw!),
        tf: mm(profile.tf!),
        rootRadius: mm(profile.r!),
        profileId: profile.name,
        standard: IRAM_I_STANDARD[profile.family] ?? 'EN 10365',
      }),
      profile.name,
    );
  }

  // ── User-parametric section ───────────────────────────────────
  // Sharp corners are the declared shape here, not an approximation of a
  // rolled profile, so no radius is required — but every other dimension is.
  /*
   * A dimension of zero is a missing dimension, not a dimension of zero.
   *
   * This only rejected null and NaN, so `t: 0` on a tube reached the geometry
   * builder, which correctly refuses a wall with no thickness — by throwing.
   * The throw escaped the whole load, so ONE malformed section emptied the
   * entire model: the 3D industrial-building example opened to a blank canvas
   * and an error in the console. Treating it as missing routes it to the
   * properties-only path this module already has for incomplete sections, so
   * the model still opens and still solves, and only that section goes
   * undrawn.
   */
  const need = (...keys: Array<keyof Section>): string[] =>
    keys
      .filter((k) => {
        const v = sec[k] as number | null | undefined;
        return v == null || !Number.isFinite(v) || v <= 0;
      })
      .map(String);

  switch (sec.shape) {
    case 'rect': {
      const missing = need('b', 'h');
      return missing.length
        ? propertiesOnly(sec, { kind: 'missingDimensions', missing })
        : backed(buildSectionGeometry({ kind: 'rect', b: mm(sec.b! * 1000), h: mm(sec.h! * 1000) }));
    }
    case 'I':
    case 'H': {
      const missing = need('b', 'h', 'tw', 'tf');
      return missing.length
        ? propertiesOnly(sec, { kind: 'missingDimensions', missing })
        : backed(
            buildSectionGeometry({
              kind: 'iSection', h: sec.h!, b: sec.b!, tw: sec.tw!, tf: sec.tf!, rootRadius: 0,
            }),
          );
    }
    case 'T': {
      const missing = need('b', 'h', 'tw', 'tf');
      return missing.length
        ? propertiesOnly(sec, { kind: 'missingDimensions', missing })
        : backed(buildSectionGeometry({ kind: 'tee', h: sec.h!, b: sec.b!, tw: sec.tw!, tf: sec.tf! }));
    }
    case 'invL': {
      // A spandrel beam: the web flush with one edge of the flange, which is what makes it an L.
      // A tee would centre the web and hand the stresses and the drawing a symmetric section.
      const missing = need('b', 'h', 'tw', 'tf');
      if (missing.length) return propertiesOnly(sec, { kind: 'missingDimensions', missing });
      const { b, h, tw, tf } = sec as Required<Pick<Section, 'b' | 'h' | 'tw' | 'tf'>>;
      return backed(buildSectionGeometry({
        kind: 'custom', outer: [[0, 0], [tw, 0], [tw, h - tf], [b, h - tf], [b, h], [0, h]],
      }));
    }
    case 'L': {
      const missing = need('b', 'h', 't');
      return missing.length
        ? propertiesOnly(sec, { kind: 'missingDimensions', missing })
        : backed(buildSectionGeometry({ kind: 'angle', h: sec.h!, b: sec.b!, t: sec.t! }));
    }
    case 'U':
    case 'C': {
      const missing = need('b', 'h', 'tw', 'tf');
      if (missing.length) return propertiesOnly(sec, { kind: 'missingDimensions', missing });
      /*
       * A lipped channel keeps its lips. On a built 'C', `t` is the lip depth from the flange's
       * outer face and `tl` its thickness (the convention `computeSectionProperties` and the
       * drawing share); a lip no deeper than the flange is a plain channel, as both of them read it.
       */
      const { b, h, tw, tf } = sec as Required<Pick<Section, 'b' | 'h' | 'tw' | 'tf'>>;
      const c = sec.shape === 'C' ? sec.t ?? 0 : 0;
      if (c > tf && c <= h / 2) {
        const tl = sec.tl && sec.tl > 0 ? sec.tl : tf;
        const y = h / 2;
        return backed(buildSectionGeometry({
          kind: 'custom',
          outer: [
            [0, -y], [b, -y], [b, -y + c], [b - tl, -y + c], [b - tl, -y + tf], [tw, -y + tf],
            [tw, y - tf], [b - tl, y - tf], [b - tl, y - c], [b, y - c], [b, y], [0, y],
          ],
        }));
      }
      return backed(buildSectionGeometry({ kind: 'channel', h, b, tw, tf }));
    }
    case 'RHS': {
      const missing = need('b', 'h', 't');
      return missing.length
        ? propertiesOnly(sec, { kind: 'missingDimensions', missing })
        : backed(buildSectionGeometry({ kind: 'rhs', b: sec.b!, h: sec.h!, t: sec.t! }));
    }
    case 'CHS': {
      // The round templates store a disc as a CHS with no wall.
      if (isSolidCircle(sec)) return backed(buildSectionGeometry({ kind: 'circle', d: sec.h! }));
      const missing = need('h', 't');
      return missing.length
        ? propertiesOnly(sec, { kind: 'missingDimensions', missing })
        : backed(buildSectionGeometry({ kind: 'chs', d: sec.h!, t: sec.t! }));
    }
    default:
      // No shape and no polygon: an amorphous properties-only section. It
      // stays globally solvable and is simply not a geometry the app knows.
      return propertiesOnly(sec, { kind: 'noGeometry' });
  }
}

/** Convenience predicate for call sites that only care about the state. */
export function isGeometryBacked(r: ResolvedSection): r is GeometryBackedSection {
  return r.state === 'geometry-backed';
}

/**
 * A catalogue profile's outline as polygons with holes, in metres around its own frame, or null
 * when the catalogue does not know the name or the profile has no exact outline.
 *
 * What a drawn section places when one of its parts is a profile, so a cover plate on a W and
 * the W picked on its own share one outline.
 */
export function catalogueOutline(name: string): Array<Array<Array<[number, number]>>> | null {
  const r = resolveCanonicalSection({ id: 0, name, a: 0, iz: 0 } as Section);
  if (r.state !== 'geometry-backed') return null;
  const solids = r.geometry.polygons.filter((p) => !p.isVoid);
  const voids = r.geometry.polygons.filter((p) => p.isVoid);
  const inside = (pt: [number, number], ring: Array<[number, number]>) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, zi] = ring[i]!, [yj, zj] = ring[j]!;
      if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < ((yj - yi) * (pt[1] - zi)) / (zj - zi) + yi) c = !c;
    }
    return c;
  };
  return solids.map((s) => [
    s.vertices,
    ...voids.filter((v) => v.vertices[0] && inside(v.vertices[0], s.vertices)).map((v) => v.vertices),
  ]);
}
