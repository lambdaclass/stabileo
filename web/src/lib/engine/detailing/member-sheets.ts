/**
 * Elevation and section sheets drawn from the members' real geometry.
 *
 * One builder for the panel's preview and for the exported drawings. The export used to frame
 * the elevation with the bounding box of the STEEL and cut the section with the outline in one
 * plane and the bars in another, while the preview drew the concrete and its dimensions
 * correctly; both now come from here. The projection is the assembly's own: the preview always
 * looked along global X, so a beam running along Y was drawn end-on.
 */
import { samplePath } from '../../codes/cirsoc201/bar-geometry';
import type { ClauseRef } from '../../codes/regulation';
import type { DetailingAssembly } from './assembly';
import type { MemberGeometry } from './scene-model';
import {
  ELEVATION_X, LAYERS, drawElevation, drawSection, type Projection, type Sheet,
} from './drawings';
import {
  elevationDimensions, memberAtStation, memberOutlines, sectionDimensions, sectionOutline,
  sectionStations, sheetGeometryNotes,
} from './sheet-geometry';

type Rotulo = Parameters<typeof drawElevation>[0]['rotulo'];

/** The plan direction the assembly's longest bar runs, as the sheet's +x; Z up. */
export function assemblyProjection(assembly: Pick<DetailingAssembly, 'bars'>): Projection {
  const longest = assembly.bars.reduce<DetailingAssembly['bars'][number] | null>(
    (m, b) => (!m || b.cuttingLength > m.cuttingLength ? b : m), null);
  if (!longest || longest.segments.length === 0) return ELEVATION_X;
  const s0 = longest.segments[0]!.start;
  const e0 = longest.segments[longest.segments.length - 1]!.end;
  const dx = e0.x - s0.x, dy = e0.y - s0.y;
  const len = Math.hypot(dx, dy);
  // A vertical bar (a column) has no plan direction: look along X, as before.
  if (len < 1e-9) return ELEVATION_X;
  return { right: { x: dx / len, y: dy / len, z: 0 }, up: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 } };
}

export interface MemberSheetInput {
  assembly: DetailingAssembly;
  members: readonly MemberGeometry[];
  projection: Projection;
  coverOf?: (elementId: number) => number | undefined;
  clauses: ClauseRef[];
  sheetNumber: string;
  title: string;
  extraNotes?: string[];
  rotulo?: Rotulo;
}

/** The elevation: the members' concrete outlines, their dimensions and the steel. */
export function memberElevationSheet(input: MemberSheetInput): Sheet {
  const ids = input.assembly.elementIds ?? [];
  const { outlines, refused } = memberOutlines(ids, input.members, input.projection);
  const { dimensions, undimensioned } = elevationDimensions({
    layer: LAYERS.dim,
    outlines,
    bars: input.assembly.bars.map((b) => ({
      diameterMm: b.diameterMm, ownerElementIds: b.ownerElementIds, polyline: samplePath(b),
    })),
    projection: input.projection,
    coverOf: input.coverOf,
  });
  return drawElevation({
    assembly: input.assembly,
    outlines: outlines.map((o) => ({ points: o.points, closed: true as const })),
    dimensions,
    extraNotes: [...sheetGeometryNotes(refused, undimensioned), ...(input.extraNotes ?? [])],
    projection: input.projection,
    clauses: input.clauses,
    sheetNumber: input.sheetNumber,
    title: input.title,
    rotulo: input.rotulo,
  });
}

/** Where to cut the section when the caller names no station: the preferred one. */
export function preferredStation(input: Pick<MemberSheetInput, 'assembly' | 'members' | 'projection'>): number | null {
  return sectionStations(input.assembly.elementIds ?? [], input.members, input.projection)?.preferred ?? null;
}

/**
 * The section at `station`: the one member the cut passes through, its outline, cover line and
 * b × h, and only its steel. `noOutlineNote` is said on the sheet when no member is cut.
 */
export function memberSectionSheet(input: MemberSheetInput & { station: number; noOutlineNote: string }): Sheet {
  const ids = input.assembly.elementIds ?? [];
  const cut = memberAtStation(ids, input.members, input.station, input.projection);
  const outline = cut ? sectionOutline(cut, input.station, input.projection) : null;
  const { dimensions, coverLine } = outline
    ? sectionDimensions({ layer: LAYERS.dim, outline, cover: cut ? input.coverOf?.(cut.elementId) : undefined })
    : { dimensions: [], coverLine: null };
  return drawSection({
    assembly: input.assembly,
    atX: input.station,
    outline: outline ?? [],
    restrictToMembers: cut ? [cut.elementId] : undefined,
    dimensions,
    coverLine: coverLine ?? undefined,
    extraNotes: [...(outline ? [] : [input.noOutlineNote]), ...(input.extraNotes ?? [])],
    projection: input.projection,
    clauses: input.clauses,
    sheetNumber: input.sheetNumber,
    title: input.title,
    rotulo: input.rotulo,
  });
}
