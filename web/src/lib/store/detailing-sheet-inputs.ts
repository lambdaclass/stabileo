/**
 * Building the two sheets — the readings the drawing engines need, in one place.
 *
 * ── Why this is a module and not four getters on the store ─────────
 *
 * The same reason `detailing-project-inputs.ts`, `detailing-floor-inputs.ts` and
 * `detailing-footing-inputs.ts` exist: the store has an 800-line ceiling that
 * `detailing-store-ceiling.test.ts` enforces, and objective 7 added the whole of the sheet's
 * geometry to a getter that used to be twenty lines because it drew no concrete.
 *
 * It also keeps the store's job honest. Resolving a member's cover is a READING of the
 * verification, and deciding where a section is cut when nobody has said is a decision about
 * geometry; neither is state and neither routes user intent, which is what the store is for.
 *
 * ── What it may and may not touch ──────────────────────────────────
 *
 * It reads live state — `modelStore`, `verificationStore` — exactly as its three siblings do,
 * and declares none of its own. `detailing-store-ceiling.test.ts` asserts the no-state half.
 * The geometry itself is `sheet-geometry.ts`'s and is pure; nothing here computes a coordinate.
 */

import { modelStore } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { regulationsStore } from './regulations.svelte';
import { t } from '../i18n';
import { REGULATION_ROLES } from '../codes/roles';
import {
  rcTitleBlockCodes, type RcTitleBlockConfig,
} from '../engine/detailing/title-block-config';
import { membersFromModel } from '../engine/detailing/member-geometry';
import type { MemberGeometry } from '../engine/detailing/scene-model';
import {
  ELEVATION_X, LAYERS, drawElevation, drawSection, type Sheet,
} from '../engine/detailing/drawings';
import {
  elevationDimensions, memberAtStation, memberOutlines, sectionDimensions, sectionOutline,
  sectionStations, sheetGeometryNotes,
} from '../engine/detailing/sheet-geometry';
import { samplePath } from '../codes/cirsoc201/bar-geometry';
import { clause } from '../codes/regulation';
import type { DetailingAssembly } from '../engine/detailing/assembly';
import type { RcTitleBlockCode } from '../engine/detailing/title-block-config';

/**
 * The rótulo a sheet is stamped with — the author's identification and the project's norms.
 *
 * Passed down rather than read here, for the reason `buildTitleBlock` states: a sheet's title
 * block is a claim that SHEET makes, and a builder that reached into live state could head a
 * drawing with a project name edited after the drawing was produced.
 */
export interface SheetRotulo {
  project?: string;
  subtitle?: string;
  office?: string;
  codes?: readonly RcTitleBlockCode[];
}

/**
 * The norms every sheet of this project prints, verified ones first.
 *
 * The VERIFIED half is READ from the regulation bindings, which is what the verification
 * actually ran against — never composed from the author's config. Translated here because this
 * layer is the locale boundary: `roles.ts` keeps an instrument's name as a KEY precisely so a
 * stored project stays readable when the catalogue changes under it.
 *
 * A role with no adapter bound is skipped rather than printed empty: "no code governs shear"
 * and "a code governs shear and I cannot name it" are different statements, and only the first
 * is true of an unbound role.
 */
export function titleBlockCodesFor(config: RcTitleBlockConfig): RcTitleBlockCode[] {
  const bound = REGULATION_ROLES
    .map((role) => regulationsStore.binding(role))
    .filter((b) => b.adapterId !== null)
    .map((b) => ({ label: t(b.nameKey), edition: b.edition, jurisdiction: b.jurisdiction }));
  return rcTitleBlockCodes(bound, config);
}

/** The rótulo a sheet is stamped with: the author's fields plus the project's norms. */
export function rotuloFor(config: RcTitleBlockConfig): SheetRotulo {
  return { ...config, codes: titleBlockCodesFor(config) };
}

/**
 * The concrete the sheets draw, resolved from the model.
 *
 * The SAME resolution the 3-D workspace performs, from the same three collections. Two
 * different reads would be two opinions about which members have concrete — and the sheet and
 * the viewer would disagree about a beam without either of them being able to say so.
 *
 * The caller memoises. `membersFromModel` returns a fresh array on every call, which is the
 * cost `scene-cache.ts` documents at length.
 */
export function sheetMembers(): MemberGeometry[] {
  return membersFromModel({
    elementIds: [...modelStore.model.elements.keys()].sort((a, b) => a - b),
    nodes: [...modelStore.model.nodes.values()],
    elements: [...modelStore.model.elements.values()],
    sections: [...modelStore.model.sections.values()],
  }).members;
}

/**
 * The cover the DESIGN was run with, for one member.
 *
 * `MemberContext.material.cover` and nothing else. It is an input to the verification, so a
 * sheet stating a different number would be dimensioning a member that was never checked.
 * `undefined` when the member has no context — the demand pass has not classified it — and the
 * sheet then dimensions only what it MEASURED, rather than printing a project default as
 * though the design had used one.
 */
export function coverForMember(elementId: number): number | undefined {
  return verificationStore.contexts.get(elementId)?.material.cover;
}

/** The stations the section may be cut at, and the one to prefer. See `sectionStations`. */
export function stationsFor(
  assembly: DetailingAssembly | null, members: readonly MemberGeometry[],
) {
  return assembly
    ? sectionStations(assembly.elementIds ?? [], members, ELEVATION_X)
    : null;
}

/** The clauses every sheet of this assembly is produced under. */
function clausesFor(assembly: DetailingAssembly) {
  return [
    clause('cirsoc-201', assembly.provenance.edition, '9.7.3'),
    clause('cirsoc-201', assembly.provenance.edition, '25.2'),
  ];
}

/**
 * The elevation: every member's concrete, its steel, its dimensions and its cover.
 *
 * It was called with `outlines: []`. An elevation with no concrete on it is a bar diagram, and
 * the three things the objective asks for — contour, cover, dimensions — are the three that
 * turn one into the other.
 */
export function buildElevationSheet(
  assembly: DetailingAssembly, members: readonly MemberGeometry[], rotulo?: SheetRotulo,
): Sheet {
  const ids = assembly.elementIds ?? [];
  const { outlines, refused } = memberOutlines(ids, members, ELEVATION_X);
  const { dimensions, undimensioned } = elevationDimensions({
    layer: LAYERS.dim,
    outlines,
    // The assembly's own sampled centrelines, so the cover measured on the sheet is measured
    // off the same polyline the clash check measured.
    bars: assembly.bars.map((b) => ({
      diameterMm: b.diameterMm,
      ownerElementIds: b.ownerElementIds,
      polyline: samplePath(b),
    })),
    projection: ELEVATION_X,
    coverOf: coverForMember,
  });
  return drawElevation({
    assembly,
    outlines: outlines.map((o) => ({ points: o.points, closed: true as const })),
    dimensions,
    extraNotes: sheetGeometryNotes(refused, undimensioned),
    projection: ELEVATION_X,
    clauses: clausesFor(assembly),
    sheetNumber: `${assembly.id}-E`,
    title: `${assembly.label} — elevación`,
    rotulo,
  });
}

/**
 * The section: the member the cut passes through, its steel, its cover line and b × h.
 *
 * ── The three things this replaces ─────────────────────────────────
 *
 * A hard-coded `±0.15 × ±0.30` outline, the same box for every member in every project. It was
 * centred on (0, 0) while `drawSection` places every bar at its ABSOLUTE position from the
 * projection's origin, so on any member away from the origin the concrete stood metres from
 * the steel. And the plane was cut through the whole ASSEMBLY, so the bars on it included
 * steel from members metres away across the sheet.
 */
export function buildSectionSheet(
  assembly: DetailingAssembly, members: readonly MemberGeometry[], station: number,
  rotulo?: SheetRotulo,
): Sheet {
  const ids = assembly.elementIds ?? [];
  /*
   * Which member the cut passes through, and its real rectangle.
   *
   * `null` when the station misses every member the assembly claims — a real answer, and why
   * the sheet says so rather than falling back to a box. The old outline WAS that fallback,
   * permanently on.
   */
  const cut = memberAtStation(ids, members, station, ELEVATION_X);
  const outline = cut ? sectionOutline(cut, station, ELEVATION_X) : null;
  const { dimensions, coverLine } = outline
    ? sectionDimensions({
      layer: LAYERS.dim, outline, cover: cut ? coverForMember(cut.elementId) : undefined,
    })
    : { dimensions: [], coverLine: null };

  return drawSection({
    assembly,
    atX: station,
    outline: outline ?? [],
    // The steel of the member the cut passes through, and no other. Without it the section
    // carries every bar in the LEVEL that happens to cross the plane — measured on
    // `rc-design-qa-8`, one at u = −4,84 m against an outline 300 mm wide.
    restrictToMembers: cut ? [cut.elementId] : undefined,
    dimensions,
    coverLine: coverLine ?? undefined,
    extraNotes: outline ? [] : [
      `SIN CONTORNO — el corte en x = ${station.toFixed(2)} m no atraviesa ningún elemento de `
      + 'este conjunto cuya sección esté definida. Las barras que se ven están dibujadas en su '
      + 'posición real; el hormigón que las rodea no se conoce.',
    ],
    projection: ELEVATION_X,
    clauses: clausesFor(assembly),
    sheetNumber: `${assembly.id}-S`,
    // The member and the station, on the sheet. A section titled only "sección" does not say
    // what it is a section OF, and every one of them looks like the others.
    title: cut
      ? `${assembly.label} — sección elem. ${cut.elementId} en x = ${station.toFixed(2)} m`
      : `${assembly.label} — sección en x = ${station.toFixed(2)} m`,
    rotulo,
  });
}
