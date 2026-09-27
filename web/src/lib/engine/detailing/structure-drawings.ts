/**
 * The four sheet kinds the drawing set used to declare as missing.
 *
 * ── Built from the SCENE, and that is the point ────────────────────
 *
 * A general plan needs concrete footprints, a level plan needs to know which members belong to
 * a storey, and a horizontal section needs to know where every bar runs in three dimensions.
 * The `SceneModel` already holds exactly that — solids with their family and their prism,
 * bars with their sampled polyline, mark, owner and status — because it is the projection the
 * 3-D view renders.
 *
 * So these read it. Not because it is convenient, but because it is the only way a plan and
 * the 3-D view can be guaranteed to show the same steel: they are two renderings of one
 * projection, in the same sense the report, the schedule and the elevations already were.
 * Deriving footprints a second time from the model would be a parallel geometry source, and
 * the first day it disagreed nobody could say which was right.
 *
 * Pure: no store, no runes, no DOM.
 */

import { LAYERS, PLAN, project, type DrawnPolyline, type DrawnText, type Projection, type Sheet, type TitleBlock } from './drawings';
import type { SceneBar, SceneModel, SceneSolid, SceneSolidKind } from './scene-model';
import { NOT_FOR_CONSTRUCTION_STATUSES, type ElementStatus } from './element-status';

/** Layers for the pieces these sheets add, alongside the existing ones. */
export const STRUCTURE_LAYERS = {
  /** A bar the cut plane passes through, drawn as a dot at the crossing. */
  cutBar: 'RC-CUT-BAR',
  /** A bar seen beyond the cut plane. */
  projectedBar: 'RC-PROJECTED',
  /** Grid lines derived from the members' own positions. */
  grid: 'RC-GRID',
} as const;

export function bbox(points: readonly { x: number; y: number; z: number }[]) {
  return {
    minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)),
    minZ: Math.min(...points.map((p) => p.z)), maxZ: Math.max(...points.map((p) => p.z)),
  };
}

export function solidCorners(s: SceneSolid) {
  return [...s.base, ...s.base.map((p) => ({
    x: p.x + s.extrude.x, y: p.y + s.extrude.y, z: p.z + s.extrude.z,
  }))];
}

/** A solid's outline in a projection, as a closed polyline of its footprint corners. */
export function solidOutline(s: SceneSolid, proj: Projection, layer: string): DrawnPolyline {
  const pts = solidCorners(s).map((p) => project(p, proj));
  const b = {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  };
  return {
    layer,
    points: [
      { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
    ],
    closed: true,
  };
}

/** The sheet's own extents shape: `{ min, max }`, matching every other drawing. */
export function extentsOf(polylines: readonly DrawnPolyline[]): Sheet['extents'] {
  const pts = polylines.flatMap((p) => p.points);
  if (pts.length === 0) return { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } };
  return {
    min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) },
    max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) },
  };
}

/** The statuses a sheet must name, so nothing refused reads as approved. */
export interface StatusLookup {
  (elementId: number): ElementStatus | undefined;
}

/**
 * Status notes for the members a sheet draws.
 *
 * A drawing that shows a refused member exactly as it shows a verified one is the failure the
 * whole status model exists to prevent, and it is worse on paper than on screen: the sheet
 * outlives the session.
 */
export function statusNotes(
  elementIds: readonly number[], statusOf: StatusLookup,
): string[] {
  const byStatus = new Map<ElementStatus, number[]>();
  for (const id of elementIds) {
    const st = statusOf(id);
    if (!st || st === 'MODELLED') continue;
    byStatus.set(st, [...(byStatus.get(st) ?? []), id]);
  }
  return [...byStatus.entries()]
    .sort()
    .map(([st, ids]) => {
      const list = ids.sort((a, b) => a - b).join(', ');
      /**
       * The consequence, not only the label.
       *
       * `PROVISIONAL: 12, 13` names the members and leaves the reader to know what the word
       * costs them. On a sheet that outlives the session — and that somebody may issue — the
       * sentence has to be on the paper. `NOT_FOR_CONSTRUCTION_STATUSES` is the one list every
       * projection reads, so a state added later cannot be honest here and silent elsewhere.
       */
      return NOT_FOR_CONSTRUCTION_STATUSES.includes(st)
        ? `${st} — NO APTO PARA EMISIÓN CONSTRUCTIVA: ${list}`
        : `${st}: ${list}`;
    });
}

// ─── Levels ──────────────────────────────────────────────────────

export interface StructureLevel {
  /** Elevation of the storey, m — the top of its columns and the plane of its slabs. */
  z: number;
  /** Members belonging to it. */
  elementIds: number[];
}

/**
 * The storeys a scene contains, from the geometry rather than from an assembly's name.
 *
 * ── Why not the assembly id ────────────────────────────────────────
 *
 * Assemblies are named `level-3.50` and `FLOOR-3.500` and a reader can guess the elevation
 * from either, but a guess parsed out of a label is not a level: a project with a renamed
 * assembly, or one whose floors and frame disagree by a millimetre in their formatting, would
 * silently produce two storeys where there is one.
 *
 * A member's level is where its concrete sits: a column belongs to the storey it rises TO, a
 * beam and a slab to the storey they lie IN. Both come off the solid's own extent.
 */
export function levelsOf(scene: SceneModel, tolerance = 0.25): StructureLevel[] {
  const zOf = new Map<number, number>();
  for (const s of scene.solids) {
    const c = solidCorners(s);
    if (c.length === 0) continue;
    const b = bbox(c);
    // A column spans a storey and belongs to the one it reaches; everything else lies flat and
    // belongs to the plane it occupies.
    const z = s.kind === 'column' ? b.maxZ : (b.minZ + b.maxZ) / 2;
    for (const id of s.elementIds) zOf.set(id, z);
  }

  const levels: StructureLevel[] = [];
  for (const [id, z] of [...zOf.entries()].sort((a, b) => a[1] - b[1])) {
    const near = levels.find((l) => Math.abs(l.z - z) <= tolerance);
    if (near) near.elementIds.push(id);
    else levels.push({ z, elementIds: [id] });
  }
  for (const l of levels) l.elementIds.sort((a, b) => a - b);
  return levels;
}

// ─── The four sheets ─────────────────────────────────────────────

export interface StructureSheetInput {
  scene: SceneModel;
  title: TitleBlock;
  statusOf: StatusLookup;
  /** Draw reinforcement as well as concrete. A whole-building plan is unreadable with it. */
  withBars?: boolean;
}

/**
 * The whole structure in plan.
 *
 * Concrete only by default: 20 917 bars over one footprint is a black rectangle, and a general
 * plan's job is to show where things are. The families are drawn on their own layers so a
 * reader can tell a column from a slab, and the grid comes from the columns' own positions
 * rather than from axes nobody entered.
 */
export function drawGeneralPlan(input: StructureSheetInput): Sheet {
  const { scene } = input;
  const polylines: DrawnPolyline[] = [];
  const texts: DrawnText[] = [];

  for (const s of scene.solids) {
    polylines.push(solidOutline(s, PLAN, layerFor(s.kind)));
  }

  // Grid lines through the column centres, which is where a reader expects axes.
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const s of scene.solids) {
    if (s.kind !== 'column') continue;
    const b = bbox(solidCorners(s));
    xs.add(+(((b.minX + b.maxX) / 2)).toFixed(3));
    ys.add(+(((b.minY + b.maxY) / 2)).toFixed(3));
  }
  const ext = extentsOf(polylines);
  for (const x of xs) {
    polylines.push({
      layer: STRUCTURE_LAYERS.grid, closed: false,
      points: [{ x, y: ext.min.y - 0.5 }, { x, y: ext.max.y + 0.5 }],
    });
  }
  for (const y of ys) {
    polylines.push({
      layer: STRUCTURE_LAYERS.grid, closed: false,
      points: [{ x: ext.min.x - 0.5, y }, { x: ext.max.x + 0.5, y }],
    });
  }

  if (input.withBars) for (const b of scene.bars) polylines.push(barPolyline(b, PLAN));

  // Member ids, so a plan can be read against the model and the 3-D view.
  for (const s of scene.solids) {
    const c = solidCorners(s).map((p) => project(p, PLAN));
    const cx = c.reduce((n, p) => n + p.x, 0) / c.length;
    const cy = c.reduce((n, p) => n + p.y, 0) / c.length;
    texts.push({
      layer: LAYERS.mark, at: { x: cx, y: cy }, height: 0.12,
      text: s.elementIds.length > 0 ? `E${s.elementIds[0]}` : s.id,
    });
  }

  return {
    kind: 'generalPlan',
    title: input.title,
    polylines, circles: [], texts, dimensions: [],
    notes: statusNotes([...new Set(scene.solids.flatMap((s) => s.elementIds))], input.statusOf),
    extents: extentsOf(polylines),
  };
}

/** One storey, carrying only its own members. */
export function drawLevelPlan(input: StructureSheetInput & { level: StructureLevel }): Sheet {
  const { scene, level } = input;
  const own = new Set(level.elementIds);
  const solids = scene.solids.filter((s) => s.elementIds.some((id) => own.has(id)));
  const bars = scene.bars.filter((b) => b.elementIds.some((id) => own.has(id)));

  const polylines = solids.map((s) => solidOutline(s, PLAN, layerFor(s.kind)));
  for (const b of bars) polylines.push(barPolyline(b, PLAN));

  const texts: DrawnText[] = [];
  for (const b of bars) {
    if (!b.mark || b.polyline.length === 0) continue;
    const mid = project(b.polyline[Math.floor(b.polyline.length / 2)], PLAN);
    texts.push({
      layer: LAYERS.mark, at: { x: mid.x, y: mid.y + 0.04 }, height: 0.05,
      text: `${b.mark} Ø${b.diameterMm}`,
    });
  }

  return {
    kind: 'levelPlan',
    title: input.title,
    polylines, circles: [], texts, dimensions: [],
    notes: [
      `Nivel +${level.z.toFixed(2)} m`,
      ...statusNotes(level.elementIds, input.statusOf),
    ],
    extents: extentsOf(polylines),
  };
}

/**
 * A horizontal cut at a stated elevation.
 *
 * A bar the plane passes through is drawn as a short cross at the crossing; a bar entirely
 * beyond it is drawn as its projection on a separate layer. Collapsing the two would make a
 * section indistinguishable from a plan, and a section's whole value is that it says what is
 * actually there at that elevation.
 */
export function drawHorizontalSection(
  input: StructureSheetInput & { atZ: number },
): Sheet {
  const { scene, atZ } = input;
  const polylines: DrawnPolyline[] = [];
  const texts: DrawnText[] = [];

  // Concrete the plane passes through.
  const cutSolids = scene.solids.filter((s) => {
    const b = bbox(solidCorners(s));
    return b.minZ <= atZ && b.maxZ >= atZ;
  });
  for (const s of cutSolids) polylines.push(solidOutline(s, PLAN, layerFor(s.kind)));

  let cut = 0;
  for (const b of scene.bars) {
    const zs = b.polyline.map((p) => p.z);
    const crosses = Math.min(...zs) <= atZ && Math.max(...zs) >= atZ;
    if (crosses) {
      // The crossing point, marked rather than drawn as a line: a bar cut by the plane is a
      // dot on a real section, not a length.
      const p = b.polyline.reduce((best, q) =>
        Math.abs(q.z - atZ) < Math.abs(best.z - atZ) ? q : best, b.polyline[0]);
      const at = project(p, PLAN);
      const r = Math.max(0.01, b.diameterMm / 2000);
      polylines.push({
        layer: STRUCTURE_LAYERS.cutBar, closed: false,
        points: [{ x: at.x - r, y: at.y - r }, { x: at.x + r, y: at.y + r }],
      });
      polylines.push({
        layer: STRUCTURE_LAYERS.cutBar, closed: false,
        points: [{ x: at.x - r, y: at.y + r }, { x: at.x + r, y: at.y - r }],
      });
      cut += 1;
      if (b.mark) {
        texts.push({
          layer: LAYERS.mark, at: { x: at.x, y: at.y + 0.05 }, height: 0.04,
          text: `${b.mark} Ø${b.diameterMm}`,
        });
      }
    } else {
      polylines.push({ ...barPolyline(b, PLAN), layer: STRUCTURE_LAYERS.projectedBar });
    }
  }

  return {
    kind: 'horizontalSection',
    title: input.title,
    polylines, circles: [], texts, dimensions: [],
    notes: [
      `Corte horizontal en z = ${atZ.toFixed(2)} m — ${cut} barra(s) intersectada(s)`,
      ...statusNotes([...new Set(cutSolids.flatMap((s) => s.elementIds))], input.statusOf),
    ],
    extents: extentsOf(polylines),
  };
}

/**
 * One column lift: its section, its longitudinals and every transverse piece.
 *
 * The section is cut at the lift's mid height, which is where the cage is at its regular
 * spacing rather than inside a joint band or a splice zone.
 */
export function drawColumnDetail(
  input: StructureSheetInput & { elementId: number },
): Sheet {
  const { scene, elementId } = input;
  const solid = scene.solids.find(
    (s) => s.kind === 'column' && s.elementIds.includes(elementId));
  const bars = scene.bars.filter(
    (b) => b.ownerScope === 'frame' && b.elementIds.includes(elementId));

  const polylines: DrawnPolyline[] = [];
  const texts: DrawnText[] = [];
  const circles: Array<{ layer: string; centre: { x: number; y: number }; radius: number }> = [];

  const extent = solid ? bbox(solidCorners(solid)) : null;
  const atZ = extent ? (extent.minZ + extent.maxZ) / 2 : 0;

  if (solid) polylines.push(solidOutline(solid, PLAN, LAYERS.outline));

  let longitudinals = 0;
  let transverse = 0;
  for (const b of bars) {
    const zs = b.polyline.map((p) => p.z);
    const atLevel = Math.min(...zs) <= atZ && Math.max(...zs) >= atZ;
    if (b.role === 'longitudinal') {
      if (!atLevel) continue;
      const p = b.polyline.reduce((best, q) =>
        Math.abs(q.z - atZ) < Math.abs(best.z - atZ) ? q : best, b.polyline[0]);
      const at = project(p, PLAN);
      circles.push({ layer: LAYERS.bar, centre: at, radius: b.diameterMm / 2000 });
      longitudinals += 1;
    } else {
      /**
       * The transverse piece nearest the cut, drawn whole.
       *
       * A closed tie and a crosstie are different pieces under different sub-clauses, and this
       * is the sheet where a builder reads which is which. Drawing only the perimeter hoop
       * would omit the crossties §25.7.2.3 requires.
       */
      const near = Math.abs((Math.min(...zs) + Math.max(...zs)) / 2 - atZ);
      if (near > 0.4) continue;
      polylines.push({ ...barPolyline(b, PLAN), layer: LAYERS.stirrup });
      transverse += 1;
    }
  }

  const status = input.statusOf(elementId);
  const notes = [
    `Elemento ${elementId} — corte en z = ${atZ.toFixed(2)} m`,
    `${longitudinals} longitudinal(es), ${transverse} pieza(s) transversal(es)`,
  ];
  if (status && status !== 'MODELLED') notes.push(`Estado: ${status}`);
  if (bars.length === 0) {
    // Said rather than shown as an empty box: a column with no steel on its own detail sheet
    // is the sheet a reader most needs a sentence on.
    notes.push('Sin armadura en el modelo para este elemento.');
  }

  return {
    kind: 'columnDetail',
    title: input.title,
    polylines, circles, texts, dimensions: [],
    notes,
    extents: extentsOf(polylines),
  };
}

// ─── Shared ──────────────────────────────────────────────────────

function layerFor(kind: SceneSolidKind): string {
  return kind === 'column' || kind === 'beam' ? LAYERS.outline : LAYERS.outline;
}

export function barPolyline(b: SceneBar, proj: Projection): DrawnPolyline {
  return {
    layer: b.role === 'transverse' ? LAYERS.stirrup : LAYERS.bar,
    points: b.polyline.map((p) => project(p, proj)),
    closed: false,
  };
}
