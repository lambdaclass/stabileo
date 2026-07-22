// Parse DXF text into the CadDocument IR (see types.ts).
//
// Unlike lib/dxf/parser.ts (which flattens everything into bare line segments
// for the 2D bar-model importer), this parser preserves the information an
// architectural plan carries:
//   - closed polylines stay closed regions (slab outlines, column rects),
//   - layer names are preserved exactly as authored,
//   - arcs/circles/inserts/texts are kept as first-class entities,
//   - INSERT block geometry is expanded to a bounding box (column symbols),
//   - $INSUNITS is read as a unit *suggestion* (the user always confirms),
//   - every entity type we cannot represent is counted and reported.

import DxfParser from 'dxf-parser';
import type {
  CadBBox,
  CadDocument,
  CadEntity,
  CadLayer,
  CadPt,
  CadUnit,
} from './types';
import { CAD_UNIT_SCALE } from './types';

/** DXF $INSUNITS codes we trust as a pre-fill. Everything else → null. */
const INSUNITS_TO_UNIT: Record<number, CadUnit> = { 4: 'mm', 5: 'cm', 6: 'm' };

/** Entity types handled by this parser; everything else lands in `unsupported`. */
const SUPPORTED_TYPES = new Set([
  'LINE', 'LWPOLYLINE', 'POLYLINE', 'ARC', 'CIRCLE', 'INSERT', 'TEXT', 'MTEXT', 'POINT',
]);

const CLOSE_EPS = 1e-9;

function bboxOfPoints(pts: CadPt[]): CadBBox | null {
  if (pts.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function mergeBBox(a: CadBBox | null, b: CadBBox | null): CadBBox | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function entityBBox(e: CadEntity): CadBBox | null {
  switch (e.kind) {
    case 'line': return bboxOfPoints([e.a, e.b]);
    case 'polyline': return bboxOfPoints(e.pts);
    case 'arc':
    case 'circle':
      return {
        minX: e.center.x - e.r, minY: e.center.y - e.r,
        maxX: e.center.x + e.r, maxY: e.center.y + e.r,
      };
    case 'insert': return e.bbox ?? bboxOfPoints([e.at]);
    case 'text': return bboxOfPoints([e.at]);
  }
}

/** Bounding box of a block's local geometry (lines/polylines/circles/arcs). */
function blockLocalBBox(entities: Array<Record<string, unknown>>): CadBBox | null {
  const pts: CadPt[] = [];
  for (const ent of entities ?? []) {
    const type = ent.type as string;
    if (type === 'LINE' || type === 'LWPOLYLINE' || type === 'POLYLINE') {
      const vs = ent.vertices as Array<{ x: number; y: number }> | undefined;
      for (const v of vs ?? []) pts.push({ x: v.x, y: v.y });
    } else if (type === 'CIRCLE' || type === 'ARC') {
      const c = ent.center as { x: number; y: number } | undefined;
      const r = (ent.radius as number) ?? 0;
      if (c) {
        pts.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
      }
    }
  }
  return bboxOfPoints(pts);
}

/** Transform a block-local bbox by an INSERT's scale/rotation/position. */
function transformBlockBBox(
  local: CadBBox,
  at: CadPt,
  xScale: number,
  yScale: number,
  rotationDeg: number,
): CadBBox {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const corners: CadPt[] = [
    { x: local.minX, y: local.minY },
    { x: local.maxX, y: local.minY },
    { x: local.maxX, y: local.maxY },
    { x: local.minX, y: local.maxY },
  ].map((p) => {
    const sx = p.x * xScale, sy = p.y * yScale;
    return { x: at.x + sx * cos - sy * sin, y: at.y + sx * sin + sy * cos };
  });
  return bboxOfPoints(corners)!;
}

export function parseCadDxf(text: string, sourceName: string): CadDocument {
  const empty: CadDocument = {
    sourceName,
    suggestedUnit: null,
    layers: [],
    entities: [],
    bbox: null,
    unsupported: {},
    warnings: [],
  };

  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(text);
  } catch {
    return { ...empty, warnings: ['parseError'] };
  }
  if (!dxf) return { ...empty, warnings: ['parseError'] };

  const doc: CadDocument = { ...empty, unsupported: {}, warnings: [], entities: [] };

  // Unit suggestion from $INSUNITS (number). Never trusted blindly.
  const insunits = dxf.header?.['$INSUNITS'];
  if (typeof insunits === 'number') {
    doc.suggestedUnit = INSUNITS_TO_UNIT[insunits] ?? null;
    if (doc.suggestedUnit === null && insunits !== 0) {
      doc.warnings.push(`insunitsUnknown:${insunits}`);
    }
  }

  // Pre-compute block bounding boxes for INSERT expansion.
  const blockBoxes = new Map<string, CadBBox>();
  for (const [name, block] of Object.entries(dxf.blocks ?? {})) {
    const local = blockLocalBBox((block as unknown as { entities?: Array<Record<string, unknown>> }).entities ?? []);
    if (local) blockBoxes.set(name, local);
  }

  for (const entity of dxf.entities ?? []) {
    const layer = String(entity.layer ?? '0');
    const type = entity.type;

    if (!SUPPORTED_TYPES.has(type)) {
      doc.unsupported[type] = (doc.unsupported[type] ?? 0) + 1;
      continue;
    }

    const e = entity as unknown as Record<string, any>;
    switch (type) {
      case 'LINE': {
        const vs = e.vertices as Array<{ x: number; y: number }> | undefined;
        if (vs && vs.length >= 2) {
          doc.entities.push({
            kind: 'line', layer,
            a: { x: vs[0].x, y: vs[0].y },
            b: { x: vs[1].x, y: vs[1].y },
          });
        }
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const vs = e.vertices as Array<{ x: number; y: number }> | undefined;
        if (!vs || vs.length < 2) break;
        let pts: CadPt[] = vs.map((v) => ({ x: v.x, y: v.y }));
        // Closed when the shape flag is set, or first == last point.
        let closed = e.shape === true;
        const first = pts[0], last = pts[pts.length - 1];
        if (!closed && pts.length >= 4 &&
            Math.abs(first.x - last.x) < CLOSE_EPS && Math.abs(first.y - last.y) < CLOSE_EPS) {
          closed = true;
        }
        // Normalize: a closed outline never repeats its first point.
        if (closed && pts.length >= 2 &&
            Math.abs(pts[0].x - pts[pts.length - 1].x) < CLOSE_EPS &&
            Math.abs(pts[0].y - pts[pts.length - 1].y) < CLOSE_EPS) {
          pts = pts.slice(0, -1);
        }
        if (pts.length >= 2) doc.entities.push({ kind: 'polyline', layer, pts, closed });
        break;
      }
      case 'ARC': {
        if (e.center) {
          doc.entities.push({
            kind: 'arc', layer,
            center: { x: e.center.x, y: e.center.y },
            r: e.radius ?? 0,
            startAngle: e.startAngle ?? 0, // radians (dxf-parser converts)
            endAngle: e.endAngle ?? 0,
          });
        }
        break;
      }
      case 'CIRCLE': {
        if (e.center) {
          doc.entities.push({
            kind: 'circle', layer,
            center: { x: e.center.x, y: e.center.y },
            r: e.radius ?? 0,
          });
        }
        break;
      }
      case 'INSERT': {
        if (!e.position) break;
        const at: CadPt = { x: e.position.x, y: e.position.y };
        const blockName = String(e.name ?? '');
        const local = blockBoxes.get(blockName);
        const bbox = local
          ? transformBlockBBox(local, at, e.xScale ?? 1, e.yScale ?? 1, e.rotation ?? 0)
          : undefined;
        doc.entities.push({ kind: 'insert', layer, at, blockName, bbox });
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const pos = e.startPoint ?? e.position;
        if (pos) {
          doc.entities.push({
            kind: 'text', layer,
            at: { x: pos.x, y: pos.y },
            value: String(e.text ?? ''),
          });
        }
        break;
      }
      case 'POINT':
        // Bare points carry no architectural meaning in v1; count but keep quiet.
        doc.unsupported['POINT'] = (doc.unsupported['POINT'] ?? 0) + 1;
        break;
    }
  }

  // Layer summary: every layer named in the table plus any layer that actually
  // carries entities (files in the wild reference layers missing from the table).
  const layerMap = new Map<string, CadLayer>();
  for (const name of Object.keys(dxf.tables?.layer?.layers ?? {})) {
    layerMap.set(name, { name, entityCounts: {}, total: 0 });
  }
  for (const ent of doc.entities) {
    let cl = layerMap.get(ent.layer);
    if (!cl) {
      cl = { name: ent.layer, entityCounts: {}, total: 0 };
      layerMap.set(ent.layer, cl);
    }
    cl.entityCounts[ent.kind] = (cl.entityCounts[ent.kind] ?? 0) + 1;
    cl.total++;
  }
  doc.layers = [...layerMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  // Drawing extent.
  let bbox: CadBBox | null = null;
  for (const ent of doc.entities) bbox = mergeBBox(bbox, entityBBox(ent));
  doc.bbox = bbox;

  for (const [type, count] of Object.entries(doc.unsupported)) {
    if (type !== 'POINT') doc.warnings.push(`unsupportedEntity:${type}:${count}`);
  }

  return doc;
}

/**
 * Sanity-check the chosen unit against the drawing extent (PR [14] Layer 1).
 *
 * Architectural floor plans are ~3–300 m across. A DXF whose `$INSUNITS`
 * header lies (e.g. says `mm` on a metre-authored drawing, as both real
 * fixtures do) silently produces a model 1000× off — every node welds together
 * and the structure collapses. This compares the bbox extent under each unit
 * and proposes the unit that lands the building in a plausible size range, so
 * the wizard can warn before the user commits to a wrong unit.
 *
 * Returns null when there is no bbox or the current unit is already plausible
 * and no better candidate exists.
 */
const PLAUSIBLE_MIN_M = 2;
const PLAUSIBLE_MAX_M = 400;
const TYPICAL_LOG = Math.log(30); // ~30 m typical plan diagonal
// Above this extent a "more typical" suggestion is treated as inflation: two
// plausible units are always ~10× apart, and closeness-to-30 m over-picks the
// larger one for small plans (a real 7.3 m plan → cm reads 73 m). When a smaller
// plausible unit exists at or under this size, prefer it (don't inflate).
const INFLATION_GUARD_M = 50;

export function suggestUnitFromExtent(
  bbox: CadBBox | null,
  current: CadUnit,
): { suggested: CadUnit; currentExtentM: number; suggestedExtentM: number } | null {
  if (!bbox) return null;
  const raw = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
  if (!(raw > 0) || !Number.isFinite(raw)) return null;
  const units: CadUnit[] = ['m', 'cm', 'mm'];
  const extM = (u: CadUnit) => raw * CAD_UNIT_SCALE[u];
  const plausible = (u: CadUnit) => extM(u) >= PLAUSIBLE_MIN_M && extM(u) <= PLAUSIBLE_MAX_M;
  // Best plausible unit = the one whose extent is closest to a typical plan.
  const plausibleUnits = units.filter(plausible);
  const ranked = plausibleUnits
    .slice()
    .sort((a, b) => Math.abs(Math.log(extM(a)) - TYPICAL_LOG) - Math.abs(Math.log(extM(b)) - TYPICAL_LOG));
  let best = ranked[0];
  // Anti-inflation: when the closeness metric picks an oversized unit but a
  // smaller plausible one fits within a normal plan size, prefer the largest
  // such smaller unit — so a 7.3 m plan misread as metres suggests mm (7.3 m),
  // not cm (73 m). No effect when only one unit is plausible (single candidate).
  if (best && extM(best) > INFLATION_GUARD_M) {
    const withinNormal = plausibleUnits
      .filter((u) => extM(u) <= INFLATION_GUARD_M)
      .sort((a, b) => extM(b) - extM(a));
    if (withinNormal.length > 0) best = withinNormal[0];
  }
  // Warn ONLY when the current unit is IMPLAUSIBLE. If the drawing is already a
  // sensible building size under the chosen unit, never nag toward a "more
  // typical" unit — a valid small plan in mm must not be pushed to cm (a silent
  // 10× inflation). We do not second-guess a plausible current unit.
  if (best && best !== current && !plausible(current)) {
    return { suggested: best, currentExtentM: extM(current), suggestedExtentM: extM(best) };
  }
  return null;
}

/** Kinds of files we explicitly do not read, with the honest reason. */
export function unsupportedFileKind(fileName: string): 'dwg' | 'svg' | 'pdf' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.dwg')) return 'dwg';
  if (lower.endsWith('.svg')) return 'svg';
  if (lower.endsWith('.pdf')) return 'pdf';
  return null;
}
