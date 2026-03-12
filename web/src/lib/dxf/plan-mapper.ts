// Map a DXF plan view (top-down) to a 3D frame model
// Converts 2D plan rectangles (beams, columns) into a spatial frame structure

import type { DxfParseResult, DxfParsedLine, DxfUnit } from './types';
import { unitScale } from './types';

// ─── Layer names (all uppercase, prefix DED_P_) ──────────────

const LAYER_VIGAS = 'DED_P_VIGAS';
const LAYER_COLUMNAS = 'DED_P_COLUMNAS';
const LAYER_APOYOS_FIJOS = 'DED_P_APOYOS_FIJOS';
const LAYER_APOYOS_ART = 'DED_P_APOYOS_ART';
const LAYER_CARGA_DIST = 'DED_P_CARGA_DIST';
const LAYER_CARGA_NODAL = 'DED_P_CARGA_NODAL';
// DED_P_TEXTO is ignored (user annotations only)

// ─── Public types ────────────────────────────────────────────

export interface PlanMapperOptions {
  unit: DxfUnit;
  snapTolerance: number;   // meters
  columnHeight: number;    // meters (default 3.0)
  floorZ: number;          // meters (default 0.0)
  defaultBeamSection: { b: number; h: number };   // meters
  defaultColumnSection: { b: number; h: number };  // meters
  defaultMaterialE: number; // MPa (default 30000)
}

export const defaultPlanMapperOptions: PlanMapperOptions = {
  unit: 'm',
  snapTolerance: 0.05,
  columnHeight: 3.0,
  floorZ: 0.0,
  defaultBeamSection: { b: 0.20, h: 0.40 },
  defaultColumnSection: { b: 0.30, h: 0.30 },
  defaultMaterialE: 30000,
};

export interface PlanColumn {
  id: string;
  cx: number; cy: number;  // center in plan (meters)
  shape: 'rect' | 'circular';
  b: number; h: number;     // rect dimensions (meters), 0 for circular
  diameter: number;          // circular diameter (meters), 0 for rect
  textSection: { b: number; h: number } | { diameter: number } | null;
  textDiffersFromGeom: boolean;
  hasSupport: boolean;
  supportType: 'fixed' | 'pinned' | null;
}

export interface PlanBeam {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  geomWidth: number;      // width from rectangle (meters)
  textSection: { b: number; h: number } | null;
  textDiffersFromGeom: boolean;
}

export interface PlanMappingResult {
  nodes: { id: number; x: number; y: number; z: number }[];
  elements: { nodeI: number; nodeJ: number; type: 'frame'; sectionId: number }[];
  supports: { nodeId: number; type: 'fixed' | 'pinned' }[];
  nodalLoads: { nodeId: number; fx: number; fy: number; fz: number }[];
  distributedLoads: { elementIndex: number; qy: number; qz: number }[];
  sections: { id: number; name: string; a: number; iy: number; iz: number; j: number; b?: number; h?: number }[];
  materials: { id: number; name: string; e: number; nu: number; rho: number }[];
  columns: PlanColumn[];
  beams: PlanBeam[];
  warnings: string[];
}

// ─── Internal helpers ────────────────────────────────────────

interface RectInfo {
  cx: number; cy: number;       // center
  width: number; height: number; // width <= height (short side = width)
  angle: number;                 // angle of the long axis (radians)
  corners: { x: number; y: number }[];
}

/** Distance between two 2D points */
function dist2(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/** Check if two points are within tolerance */
function ptEq(ax: number, ay: number, bx: number, by: number, tol: number): boolean {
  return dist2(ax, ay, bx, by) < tol;
}

/**
 * Reconstruct closed polygons from LINE segments on a given layer.
 * Groups lines by connected endpoints (within tolerance), finds closed loops,
 * and returns arrays of ordered vertex coordinates.
 */
function reconstructClosedPolygons(
  lines: DxfParsedLine[],
  layer: string,
  scale: number,
  tol: number,
): { x: number; y: number }[][] {
  const filtered = lines.filter(l => l.layer === layer);
  if (filtered.length === 0) return [];

  // Convert to scaled segments
  const segments = filtered.map(l => ({
    sx: l.start.x * scale, sy: l.start.y * scale,
    ex: l.end.x * scale, ey: l.end.y * scale,
    used: false,
  }));

  const polygons: { x: number; y: number }[][] = [];

  // Greedily chain segments into closed loops
  for (let seed = 0; seed < segments.length; seed++) {
    if (segments[seed].used) continue;

    const chain: { x: number; y: number }[] = [];
    segments[seed].used = true;
    chain.push({ x: segments[seed].sx, y: segments[seed].sy });
    chain.push({ x: segments[seed].ex, y: segments[seed].ey });

    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1];
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].used) continue;
        const s = segments[i];
        if (ptEq(tail.x, tail.y, s.sx, s.sy, tol)) {
          chain.push({ x: s.ex, y: s.ey });
          s.used = true;
          extended = true;
          break;
        }
        if (ptEq(tail.x, tail.y, s.ex, s.ey, tol)) {
          chain.push({ x: s.sx, y: s.sy });
          s.used = true;
          extended = true;
          break;
        }
      }
    }

    // Check if closed (first ≈ last)
    if (chain.length >= 4 && ptEq(chain[0].x, chain[0].y, chain[chain.length - 1].x, chain[chain.length - 1].y, tol)) {
      // Remove the duplicated closing vertex
      chain.pop();
      polygons.push(chain);
    }
  }

  return polygons;
}

/**
 * Check if a polygon with exactly 4 vertices forms a rectangle.
 * Returns rectangle info with width (shorter side) and height (longer side),
 * or null if not a rectangle.
 */
function detectRectangle(vertices: { x: number; y: number }[]): RectInfo | null {
  if (vertices.length !== 4) return null;

  // Check that all 4 angles are ~90 degrees
  for (let i = 0; i < 4; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 4];
    const c = vertices[(i + 2) % 4];
    const abx = b.x - a.x, aby = b.y - a.y;
    const bcx = c.x - b.x, bcy = c.y - b.y;
    const dot = abx * bcx + aby * bcy;
    const magAB = Math.sqrt(abx * abx + aby * aby);
    const magBC = Math.sqrt(bcx * bcx + bcy * bcy);
    if (magAB < 1e-9 || magBC < 1e-9) return null;
    const cosAngle = Math.abs(dot / (magAB * magBC));
    if (cosAngle > 0.05) return null; // Not ~90 degrees (tolerance ~3 degrees)
  }

  // Side lengths
  const side01 = dist2(vertices[0].x, vertices[0].y, vertices[1].x, vertices[1].y);
  const side12 = dist2(vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y);

  // Center
  const cx = (vertices[0].x + vertices[1].x + vertices[2].x + vertices[3].x) / 4;
  const cy = (vertices[0].y + vertices[1].y + vertices[2].y + vertices[3].y) / 4;

  // Width = shorter side, height = longer side
  let width: number, height: number, angle: number;
  if (side01 <= side12) {
    width = side01;
    height = side12;
    // Angle of the long axis (side 1→2 direction)
    angle = Math.atan2(vertices[2].y - vertices[1].y, vertices[2].x - vertices[1].x);
  } else {
    width = side12;
    height = side01;
    // Angle of the long axis (side 0→1 direction)
    angle = Math.atan2(vertices[1].y - vertices[0].y, vertices[1].x - vertices[0].x);
  }

  return { cx, cy, width, height, angle, corners: vertices };
}

/**
 * Extract the centerline (long axis) of a rectangle.
 * Returns the midpoints of the two short sides.
 */
function rectangleCenterline(rect: RectInfo): { x1: number; y1: number; x2: number; y2: number } {
  const v = rect.corners;
  const side01 = dist2(v[0].x, v[0].y, v[1].x, v[1].y);
  const side12 = dist2(v[1].x, v[1].y, v[2].x, v[2].y);

  if (side01 <= side12) {
    // Short sides are 0-1 and 2-3; long sides are 1-2 and 3-0
    // Centerline connects midpoints of short sides (0-1) and (2-3)
    const mx1 = (v[0].x + v[1].x) / 2, my1 = (v[0].y + v[1].y) / 2;
    const mx2 = (v[2].x + v[3].x) / 2, my2 = (v[2].y + v[3].y) / 2;
    return { x1: mx1, y1: my1, x2: mx2, y2: my2 };
  } else {
    // Short sides are 1-2 and 3-0; long sides are 0-1 and 2-3
    const mx1 = (v[1].x + v[2].x) / 2, my1 = (v[1].y + v[2].y) / 2;
    const mx2 = (v[3].x + v[0].x) / 2, my2 = (v[3].y + v[0].y) / 2;
    return { x1: mx1, y1: my1, x2: mx2, y2: my2 };
  }
}

/**
 * Project a point onto a line segment.
 * Returns the parameter t (0..1), distance from the point to the segment,
 * and the projected point coordinates.
 */
function projectPointOnSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): { t: number; dist: number; projX: number; projY: number } {
  const dx = x2 - x1, dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) {
    return { t: 0, dist: dist2(px, py, x1, y1), projX: x1, projY: y1 };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { t, dist: dist2(px, py, projX, projY), projX, projY };
}

/**
 * Find the nearest text entity matching a regex pattern within maxDist of (x, y).
 * Coordinates must already be in meters.
 */
function findNearbyText(
  texts: { x: number; y: number; value: string }[],
  x: number, y: number,
  maxDist: number,
  pattern: RegExp,
): { match: RegExpMatchArray; textValue: string } | null {
  let bestDist = maxDist;
  let bestMatch: RegExpMatchArray | null = null;
  let bestValue = '';

  for (const t of texts) {
    const d = dist2(t.x, t.y, x, y);
    if (d >= bestDist) continue;
    const m = t.value.match(pattern);
    if (m) {
      bestDist = d;
      bestMatch = m;
      bestValue = t.value;
    }
  }

  return bestMatch ? { match: bestMatch, textValue: bestValue } : null;
}

/**
 * Compute rectangular section properties (A, Iy, Iz, J) from b and h in meters.
 */
function rectSectionProps(b: number, h: number) {
  const a = b * h;
  // Iy = moment of inertia about local y (weak axis for beams)
  const iy = (h * b * b * b) / 12;
  // Iz = moment of inertia about local z (strong axis for beams)
  const iz = (b * h * h * h) / 12;
  // J = torsion constant (approximation for rectangular sections)
  const longer = Math.max(b, h);
  const shorter = Math.min(b, h);
  const j = longer * shorter * shorter * shorter * (1 / 3 - 0.21 * (shorter / longer) * (1 - (shorter * shorter * shorter * shorter) / (12 * longer * longer * longer * longer)));
  return { a, iy, iz, j };
}

// ─── Main mapping function ───────────────────────────────────

export function mapPlanToModel(
  parsed: DxfParseResult,
  options: PlanMapperOptions = defaultPlanMapperOptions,
): PlanMappingResult {
  const scale = unitScale(options.unit);
  const tol = options.snapTolerance;
  const warnings: string[] = [];

  // Pre-process all text entities (scale positions to meters)
  const allTexts = parsed.texts.map(t => ({
    x: t.position.x * scale,
    y: t.position.y * scale,
    value: t.value.trim(),
    layer: t.layer,
  }));

  // ─── Step 1: Parse Columns ─────────────────────────────────

  const columns: PlanColumn[] = [];
  let colAutoId = 1;

  // Reconstruct polygons from column layer lines
  const colPolygons = reconstructClosedPolygons(parsed.lines, LAYER_COLUMNAS, scale, tol * 0.5);

  // Text patterns for column annotations
  const colRectPattern = /C(\d+)\s*[-–]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/;
  const colCircPattern = /C(\d+)\s*[-–]\s*[DdØø∅](\d+(?:\.\d+)?)/;
  // Broader search radius for text (columns can have labels a bit away)
  const textSearchDist = 2.0; // meters

  for (const poly of colPolygons) {
    const rect = detectRectangle(poly);
    if (!rect) {
      warnings.push(`Column layer: polygon with ${poly.length} vertices is not a rectangle, skipped`);
      continue;
    }

    // Determine column dimensions (smaller = b, larger = h)
    const geomB = Math.min(rect.width, rect.height);
    const geomH = Math.max(rect.width, rect.height);

    // Search for text annotation
    let id = `C${String(colAutoId++).padStart(3, '0')}`;
    let textSection: PlanColumn['textSection'] = null;
    let textDiffersFromGeom = false;
    let finalB = geomB;
    let finalH = geomH;

    const rectTextResult = findNearbyText(allTexts, rect.cx, rect.cy, textSearchDist, colRectPattern);
    if (rectTextResult) {
      id = `C${rectTextResult.match[1]}`;
      const tb = parseFloat(rectTextResult.match[2]) * 0.01; // cm → m
      const th = parseFloat(rectTextResult.match[3]) * 0.01;
      const sortedB = Math.min(tb, th);
      const sortedH = Math.max(tb, th);
      textSection = { b: sortedB, h: sortedH };
      if (Math.abs(sortedB - geomB) > 0.01 || Math.abs(sortedH - geomH) > 0.01) {
        textDiffersFromGeom = true;
        warnings.push(`Column ${id}: text dimensions (${(sortedB * 100).toFixed(0)}x${(sortedH * 100).toFixed(0)}cm) differ from drawn geometry (${(geomB * 100).toFixed(0)}x${(geomH * 100).toFixed(0)}cm). Using text dimensions.`);
        finalB = sortedB;
        finalH = sortedH;
      }
    }

    columns.push({
      id, cx: rect.cx, cy: rect.cy,
      shape: 'rect',
      b: finalB, h: finalH,
      diameter: 0,
      textSection, textDiffersFromGeom,
      hasSupport: false, supportType: null,
    });
  }

  // Circular columns from CIRCLE entities on column layer
  const colCircles = parsed.circles.filter(c => c.layer === LAYER_COLUMNAS);
  for (const circ of colCircles) {
    const cx = circ.center.x * scale;
    const cy = circ.center.y * scale;
    const geomDiam = circ.radius * 2 * scale;

    let id = `C${String(colAutoId++).padStart(3, '0')}`;
    let textSection: PlanColumn['textSection'] = null;
    let textDiffersFromGeom = false;
    let finalDiam = geomDiam;

    const circTextResult = findNearbyText(allTexts, cx, cy, textSearchDist, colCircPattern);
    if (circTextResult) {
      id = `C${circTextResult.match[1]}`;
      const td = parseFloat(circTextResult.match[2]) * 0.01; // cm → m
      textSection = { diameter: td };
      if (Math.abs(td - geomDiam) > 0.01) {
        textDiffersFromGeom = true;
        warnings.push(`Column ${id}: text diameter (Ø${(td * 100).toFixed(0)}cm) differs from drawn geometry (Ø${(geomDiam * 100).toFixed(0)}cm). Using text dimensions.`);
        finalDiam = td;
      }
    }

    columns.push({
      id, cx, cy,
      shape: 'circular',
      b: 0, h: 0,
      diameter: finalDiam,
      textSection, textDiffersFromGeom,
      hasSupport: false, supportType: null,
    });
  }

  if (columns.length === 0) {
    warnings.push(`No columns found on layer ${LAYER_COLUMNAS}. The model will have no vertical elements.`);
  }

  // ─── Step 2: Parse Beams ───────────────────────────────────

  const beams: PlanBeam[] = [];
  let beamAutoId = 1;

  const beamPolygons = reconstructClosedPolygons(parsed.lines, LAYER_VIGAS, scale, tol * 0.5);
  const beamTextPattern = /V(\d+)\s*[-–]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/;

  for (const poly of beamPolygons) {
    const rect = detectRectangle(poly);
    if (!rect) {
      warnings.push(`Beam layer: polygon with ${poly.length} vertices is not a rectangle, skipped`);
      continue;
    }

    const cl = rectangleCenterline(rect);
    const geomWidth = rect.width; // short dimension = section width

    let id = `V${String(beamAutoId++).padStart(3, '0')}`;
    let textSection: PlanBeam['textSection'] = null;
    let textDiffersFromGeom = false;

    // Search for text near the beam centerline midpoint
    const midX = (cl.x1 + cl.x2) / 2;
    const midY = (cl.y1 + cl.y2) / 2;
    const beamTextResult = findNearbyText(allTexts, midX, midY, textSearchDist, beamTextPattern);

    if (beamTextResult) {
      id = `V${beamTextResult.match[1]}`;
      const tb = parseFloat(beamTextResult.match[2]) * 0.01; // cm → m
      const th = parseFloat(beamTextResult.match[3]) * 0.01;
      textSection = { b: tb, h: th };
      if (Math.abs(tb - geomWidth) > 0.01) {
        textDiffersFromGeom = true;
        warnings.push(`Beam ${id}: text width (${(tb * 100).toFixed(0)}cm) differs from drawn width (${(geomWidth * 100).toFixed(0)}cm). Using text dimensions.`);
      }
    }

    beams.push({
      id,
      x1: cl.x1, y1: cl.y1,
      x2: cl.x2, y2: cl.y2,
      geomWidth,
      textSection, textDiffersFromGeom,
    });
  }

  if (beams.length === 0) {
    warnings.push(`No beams found on layer ${LAYER_VIGAS}.`);
  }

  // ─── Step 3: Find Intersections & Create Nodes ─────────────

  const nodes: { id: number; x: number; y: number; z: number }[] = [];

  /** Find or create a node, merging if within tolerance */
  function findOrAddNode(x: number, y: number, z: number): number {
    for (const n of nodes) {
      if (Math.abs(n.x - x) < tol && Math.abs(n.y - y) < tol && Math.abs(n.z - z) < tol) {
        return n.id;
      }
    }
    const id = nodes.length;
    nodes.push({ id, x, y, z });
    return id;
  }

  const floorZ = options.floorZ;
  const baseZ = floorZ - options.columnHeight;

  // For each beam, find columns it passes through and record intersection points
  // beamSegments[i] = sorted list of parameter t values (0 = beam start, 1 = beam end)
  // plus the column index that intersection comes from
  interface BeamIntersection {
    t: number;
    projX: number;
    projY: number;
    columnIdx: number;
  }
  const beamIntersections: BeamIntersection[][] = beams.map(() => []);

  // Track which columns are connected to at least one beam
  const columnConnected = new Array(columns.length).fill(false);

  for (let bi = 0; bi < beams.length; bi++) {
    const beam = beams[bi];
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci];
      // Compute half-width of column in plan for snap tolerance
      let colHalf: number;
      if (col.shape === 'rect') {
        colHalf = Math.max(col.b, col.h) / 2;
      } else {
        colHalf = col.diameter / 2;
      }
      const proj = projectPointOnSegment(col.cx, col.cy, beam.x1, beam.y1, beam.x2, beam.y2);
      if (proj.dist < tol + colHalf) {
        beamIntersections[bi].push({
          t: proj.t,
          projX: proj.projX,
          projY: proj.projY,
          columnIdx: ci,
        });
        columnConnected[ci] = true;
      }
    }
    // Sort intersections by parameter t
    beamIntersections[bi].sort((a, b) => a.t - b.t);
  }

  // Warn about disconnected columns
  for (let ci = 0; ci < columns.length; ci++) {
    if (!columnConnected[ci]) {
      warnings.push(`Column ${columns[ci].id} at (${columns[ci].cx.toFixed(2)}, ${columns[ci].cy.toFixed(2)}) does not intersect any beam.`);
    }
  }

  // Create floor-level nodes at beam endpoints and intersection points
  // Also create column base nodes
  // Map: columnIdx → { topNodeId, baseNodeId }
  const columnNodes = new Map<number, { topNodeId: number; baseNodeId: number }>();

  // Ensure each column has floor-level and base-level nodes
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const topId = findOrAddNode(col.cx, col.cy, floorZ);
    const baseId = findOrAddNode(col.cx, col.cy, baseZ);
    columnNodes.set(ci, { topNodeId: topId, baseNodeId: baseId });
  }

  // For each beam, create nodes at endpoints and at each intersection
  // beamNodeSequence[i] = ordered list of node IDs along the beam axis
  const beamNodeSequences: number[][] = [];

  for (let bi = 0; bi < beams.length; bi++) {
    const beam = beams[bi];
    const inters = beamIntersections[bi];

    // Collect all t-values: 0 (start), intersections, 1 (end)
    interface TPoint { t: number; x: number; y: number; }
    const tPoints: TPoint[] = [];

    // Beam start
    tPoints.push({ t: 0, x: beam.x1, y: beam.y1 });

    // Column intersections
    for (const inter of inters) {
      // Skip if very close to start or end (will be merged by findOrAddNode anyway)
      tPoints.push({ t: inter.t, x: inter.projX, y: inter.projY });
    }

    // Beam end
    tPoints.push({ t: 1, x: beam.x2, y: beam.y2 });

    // Remove duplicates (by t proximity)
    const uniquePoints: TPoint[] = [tPoints[0]];
    for (let i = 1; i < tPoints.length; i++) {
      if (Math.abs(tPoints[i].t - uniquePoints[uniquePoints.length - 1].t) > 0.001) {
        uniquePoints.push(tPoints[i]);
      }
    }

    const nodeSeq = uniquePoints.map(p => findOrAddNode(p.x, p.y, floorZ));
    beamNodeSequences.push(nodeSeq);
  }

  // ─── Step 4: Create Elements ───────────────────────────────

  // Create sections
  const sections: PlanMappingResult['sections'] = [];
  const sectionMap = new Map<string, number>(); // key → sectionId

  function getOrCreateSection(name: string, b: number, h: number): number {
    const key = `${name}_${b.toFixed(4)}_${h.toFixed(4)}`;
    const existing = sectionMap.get(key);
    if (existing !== undefined) return existing;
    const props = rectSectionProps(b, h);
    const id = sections.length;
    sections.push({ id, name, a: props.a, iy: props.iy, iz: props.iz, j: props.j, b, h });
    sectionMap.set(key, id);
    return id;
  }

  function getOrCreateCircularSection(name: string, diameter: number): number {
    const key = `circ_${name}_${diameter.toFixed(4)}`;
    const existing = sectionMap.get(key);
    if (existing !== undefined) return existing;
    const r = diameter / 2;
    const a = Math.PI * r * r;
    const i = (Math.PI * r * r * r * r) / 4;
    const j = (Math.PI * r * r * r * r) / 2;
    const id = sections.length;
    sections.push({ id, name, a, iy: i, iz: i, j });
    sectionMap.set(key, id);
    return id;
  }

  const elements: PlanMappingResult['elements'] = [];

  // Beam elements (horizontal at floor level)
  for (let bi = 0; bi < beams.length; bi++) {
    const beam = beams[bi];
    const seq = beamNodeSequences[bi];

    // Determine beam section
    let bVal: number, hVal: number;
    if (beam.textSection) {
      bVal = beam.textSection.b;
      hVal = beam.textSection.h;
    } else {
      bVal = beam.geomWidth;
      hVal = options.defaultBeamSection.h;
    }
    const secId = getOrCreateSection(`Beam ${beam.id} (${(bVal * 100).toFixed(0)}x${(hVal * 100).toFixed(0)})`, bVal, hVal);

    // Create segments between consecutive nodes
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i] === seq[i + 1]) continue; // skip zero-length
      elements.push({ nodeI: seq[i], nodeJ: seq[i + 1], type: 'frame', sectionId: secId });
    }
  }

  // Column elements (vertical from base to floor)
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    const cn = columnNodes.get(ci);
    if (!cn) continue;

    let secId: number;
    if (col.shape === 'circular') {
      secId = getOrCreateCircularSection(
        `Col ${col.id} (Ø${(col.diameter * 100).toFixed(0)})`,
        col.diameter,
      );
    } else {
      secId = getOrCreateSection(
        `Col ${col.id} (${(col.b * 100).toFixed(0)}x${(col.h * 100).toFixed(0)})`,
        col.b, col.h,
      );
    }

    elements.push({ nodeI: cn.baseNodeId, nodeJ: cn.topNodeId, type: 'frame', sectionId: secId });
  }

  // ─── Step 5: Parse Supports ────────────────────────────────

  const supports: PlanMappingResult['supports'] = [];

  // Fixed supports
  const fixedPoints = parsed.points.filter(p => p.layer === LAYER_APOYOS_FIJOS);
  const fixedCircles = parsed.circles.filter(c => c.layer === LAYER_APOYOS_FIJOS);

  for (const fp of fixedPoints) {
    assignSupport(fp.position.x * scale, fp.position.y * scale, 'fixed');
  }
  for (const fc of fixedCircles) {
    assignSupport(fc.center.x * scale, fc.center.y * scale, 'fixed');
  }

  // Pinned supports
  const pinnedPoints = parsed.points.filter(p => p.layer === LAYER_APOYOS_ART);
  const pinnedCircles = parsed.circles.filter(c => c.layer === LAYER_APOYOS_ART);

  for (const pp of pinnedPoints) {
    assignSupport(pp.position.x * scale, pp.position.y * scale, 'pinned');
  }
  for (const pc of pinnedCircles) {
    assignSupport(pc.center.x * scale, pc.center.y * scale, 'pinned');
  }

  function assignSupport(sx: number, sy: number, type: 'fixed' | 'pinned') {
    // Find nearest column
    let bestDist = tol * 10; // generous search radius
    let bestCol = -1;
    for (let ci = 0; ci < columns.length; ci++) {
      const d = dist2(sx, sy, columns[ci].cx, columns[ci].cy);
      if (d < bestDist) {
        bestDist = d;
        bestCol = ci;
      }
    }

    if (bestCol < 0) {
      warnings.push(`Support marker (${type}) at (${sx.toFixed(2)}, ${sy.toFixed(2)}) has no nearby column.`);
      return;
    }

    const cn = columnNodes.get(bestCol);
    if (!cn) return;

    // Support is at column BASE
    const existing = supports.find(s => s.nodeId === cn.baseNodeId);
    if (existing) {
      warnings.push(`Duplicate support at column ${columns[bestCol].id} base. Keeping ${existing.type}, ignoring ${type}.`);
      return;
    }

    supports.push({ nodeId: cn.baseNodeId, type });
    columns[bestCol].hasSupport = true;
    columns[bestCol].supportType = type;
  }

  // Warn about columns without supports
  for (const col of columns) {
    if (!col.hasSupport) {
      warnings.push(`Column ${col.id} has no support at its base. Consider adding one on ${LAYER_APOYOS_FIJOS} or ${LAYER_APOYOS_ART}.`);
    }
  }

  // ─── Step 6: Parse Loads ───────────────────────────────────

  const nodalLoads: PlanMappingResult['nodalLoads'] = [];
  const distributedLoads: PlanMappingResult['distributedLoads'] = [];

  // Distributed loads: rectangles on DED_P_CARGA_DIST + nearby TEXT with magnitude
  const distLoadPolygons = reconstructClosedPolygons(parsed.lines, LAYER_CARGA_DIST, scale, tol * 0.5);
  const loadMagnitudePattern = /([-+]?\d+(?:\.\d+)?)/;

  // Build beam→element index map so we can assign loads to all elements of a beam
  const beamElementIndices: number[][] = [];
  let elementIdx = 0;
  for (let bi = 0; bi < beams.length; bi++) {
    const seq = beamNodeSequences[bi];
    const indices: number[] = [];
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i] === seq[i + 1]) continue;
      indices.push(elementIdx);
      elementIdx++;
    }
    beamElementIndices.push(indices);
  }

  for (const poly of distLoadPolygons) {
    const rect = detectRectangle(poly);
    if (!rect) {
      warnings.push('Distributed load layer: non-rectangular polygon, skipped');
      continue;
    }

    // The load rectangle centerline should overlap a beam
    const cl = rectangleCenterline(rect);
    const loadMidX = (cl.x1 + cl.x2) / 2;
    const loadMidY = (cl.y1 + cl.y2) / 2;

    // Find magnitude from nearby text on the load layer or any layer
    const distLoadTexts = allTexts.filter(t => t.layer === LAYER_CARGA_DIST);
    const allSearchTexts = distLoadTexts.length > 0 ? distLoadTexts : allTexts;
    const magResult = findNearbyText(allSearchTexts, loadMidX, loadMidY, textSearchDist, loadMagnitudePattern);

    if (!magResult) {
      warnings.push(`Distributed load at (${loadMidX.toFixed(2)}, ${loadMidY.toFixed(2)}): no magnitude text found, skipped`);
      continue;
    }

    const magnitude = parseFloat(magResult.match[1]);

    // Match load against beam axes (not individual elements) to use beam geometry width
    let matched = false;
    for (let bi = 0; bi < beams.length; bi++) {
      const beam = beams[bi];
      // Project load midpoint onto beam axis
      const proj = projectPointOnSegment(loadMidX, loadMidY, beam.x1, beam.y1, beam.x2, beam.y2);
      // Tolerance: beam half-width + load rect half-width + snap tolerance
      const matchDist = beam.geomWidth / 2 + rect.width / 2 + tol;
      if (proj.dist < matchDist) {
        // Assign load to all elements of this beam
        for (const ei of beamElementIndices[bi]) {
          distributedLoads.push({ elementIndex: ei, qy: 0, qz: -Math.abs(magnitude) }); // gravity = -Z
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      warnings.push(`Distributed load (${magnitude} kN/m) at (${loadMidX.toFixed(2)}, ${loadMidY.toFixed(2)}) does not overlap any beam.`);
    }
  }

  // Nodal loads: POINT on DED_P_CARGA_NODAL + nearby TEXT with magnitude
  const nodalLoadPoints = parsed.points.filter(p => p.layer === LAYER_CARGA_NODAL);

  for (const nlp of nodalLoadPoints) {
    const px = nlp.position.x * scale;
    const py = nlp.position.y * scale;

    // Find magnitude text
    const nodalLoadTexts = allTexts.filter(t => t.layer === LAYER_CARGA_NODAL);
    const searchTexts = nodalLoadTexts.length > 0 ? nodalLoadTexts : allTexts;
    const magResult = findNearbyText(searchTexts, px, py, textSearchDist, loadMagnitudePattern);

    if (!magResult) {
      warnings.push(`Nodal load at (${px.toFixed(2)}, ${py.toFixed(2)}): no magnitude text found, skipped`);
      continue;
    }

    const magnitude = parseFloat(magResult.match[1]);

    // Find nearest floor-level node
    let bestDist = tol * 10;
    let bestNodeId = -1;
    for (const n of nodes) {
      if (Math.abs(n.z - floorZ) > tol) continue;
      const d = dist2(px, py, n.x, n.y);
      if (d < bestDist) {
        bestDist = d;
        bestNodeId = n.id;
      }
    }

    if (bestNodeId < 0) {
      warnings.push(`Nodal load (${magnitude} kN) at (${px.toFixed(2)}, ${py.toFixed(2)}) has no nearby node.`);
      continue;
    }

    nodalLoads.push({ nodeId: bestNodeId, fx: 0, fy: 0, fz: -Math.abs(magnitude) }); // gravity = -Z
  }

  // ─── Create material ──────────────────────────────────────

  const materials: PlanMappingResult['materials'] = [{
    id: 0,
    name: `Concrete E=${options.defaultMaterialE} MPa`,
    e: options.defaultMaterialE,
    nu: 0.2,
    rho: 25, // kN/m³
  }];

  return {
    nodes, elements, supports, nodalLoads, distributedLoads,
    sections, materials,
    columns, beams, warnings,
  };
}
