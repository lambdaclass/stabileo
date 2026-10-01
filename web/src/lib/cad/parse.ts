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

/**
 * The box around the finite points, or null when there are none. A NaN point
 * compares false both ways, so it used to be skipped by accident; with no
 * finite point at all the result was the inverted {+∞, +∞, −∞, −∞}, which is
 * truthy, and an INSERT transformed it into a NaN box.
 */
function bboxOfPoints(pts: CadPt[]): CadBBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    any = true;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return any ? { minX, minY, maxX, maxY } : null;
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

/**
 * Bounding box of a block's local geometry (lines/polylines/circles/arcs), and
 * the pieces refused for unusable numbers.
 *
 * The refusals are the block's, not the drawing's: a definition nobody INSERTs
 * — an unused symbol, an anonymous dimension block, *Paper_Space — never puts
 * anything in the model, and counting its pieces reported losses that were not
 * losses. They are reported through the inserts that use the block (see
 * `incompleteBlocks`). A piece with no size (one vertex, radius 0) is skipped,
 * as outside a block.
 */
interface BlockInfo { bbox: CadBBox | null; refused: Record<string, number> }

function blockLocalBBox(entities: Array<Record<string, unknown>>): BlockInfo {
  const pts: CadPt[] = [];
  const refused: Record<string, number> = {};
  const refuse = (kind: string) => { refused[kind] = (refused[kind] ?? 0) + 1; };
  for (const ent of entities ?? []) {
    const type = ent.type as string;
    if (type === 'LINE' || type === 'LWPOLYLINE' || type === 'POLYLINE') {
      const vs = ent.vertices as Array<{ x: number; y: number }> | undefined;
      if (!vs || !vs.every((v) => allFinite(v.x, v.y)) || (type === 'LINE' && vs.length < 2)) { refuse(type); continue; }
      for (const v of vs) pts.push({ x: v.x, y: v.y });
    } else if (type === 'CIRCLE' || type === 'ARC') {
      const c = ent.center as { x: number; y: number } | undefined;
      const r = ent.radius as number | undefined;
      if (!c || !allFinite(c.x, c.y, r) || r! < 0) { refuse(type); continue; }
      if (r === 0) continue;
      pts.push({ x: c.x - r!, y: c.y - r! }, { x: c.x + r!, y: c.y + r! });
    }
  }
  return { bbox: bboxOfPoints(pts), refused };
}

/**
 * Transform a block-local bbox by an INSERT's scale/rotation/position. Null
 * when a corner overflows: a box of the corners that did not would be smaller
 * than the symbol, not an approximation of it.
 */
function transformBlockBBox(
  local: CadBBox,
  at: CadPt,
  xScale: number,
  yScale: number,
  rotationDeg: number,
): CadBBox | null {
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
  if (!corners.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  return bboxOfPoints(corners);
}

/**
 * True only when every value is a real, finite number.
 *
 * dxf-parser hands back NaN for a group code whose value is not a number (a
 * truncated or corrupt file), and NaN used to travel straight into the IR. It
 * hides well: `NaN < minX` and `NaN > maxX` are both false, so a bad point does
 * not even widen the bbox — the extent silently ignores it while the entity
 * keeps it. Downstream it is worse than a wrong number. In `pairWallLines` the
 * segment's length is NaN, so `len <= 0` is false (not rejected as degenerate)
 * and `len > 0` is also false (not collected as unpaired): the member is
 * neither paired, nor kept, nor recorded in `skipped`. It disappears from the
 * model and nothing in the result says it ever existed.
 *
 * So the coordinates are checked here, at the one place that is still talking
 * about the FILE, where a refusal can be counted and shown.
 */
function allFinite(...vs: unknown[]): boolean {
  return vs.every((v) => typeof v === 'number' && Number.isFinite(v));
}

/**
 * Why a parsed file cannot be imported, or null when it can.
 *
 * A file whose every usable entity was refused is not an empty file: calling
 * it one told the reader there was nothing there, and the wizard then hid the
 * counts that said what was wrong with it.
 */
export function cadImportProblem(doc: CadDocument): 'parseError' | 'allMalformed' | 'emptyFile' | null {
  if (doc.warnings.includes('parseError')) return 'parseError';
  if (doc.entities.length > 0) return null;
  return Object.keys(doc.malformed).length > 0 ? 'allMalformed' : 'emptyFile';
}

export function parseCadDxf(text: string, sourceName: string): CadDocument {
  const empty: CadDocument = {
    sourceName,
    suggestedUnit: null,
    layers: [],
    entities: [],
    bbox: null,
    unsupported: {},
    malformed: {},
    degenerate: {},
    incompleteBlocks: {},
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

  const doc: CadDocument = { ...empty, unsupported: {}, malformed: {}, degenerate: {}, incompleteBlocks: {}, warnings: [], entities: [] };

  /** Refuse an entity of a supported type whose numbers are not usable. */
  const refuse = (kind: string) => { doc.malformed[kind] = (doc.malformed[kind] ?? 0) + 1; };
  /** Skip readable geometry with no size — a leftover, not damage. */
  const skipDegenerate = (kind: string) => { doc.degenerate[kind] = (doc.degenerate[kind] ?? 0) + 1; };

  // Unit suggestion from $INSUNITS (number). Never trusted blindly.
  const insunits = dxf.header?.['$INSUNITS'];
  if (typeof insunits === 'number') {
    doc.suggestedUnit = INSUNITS_TO_UNIT[insunits] ?? null;
    if (doc.suggestedUnit === null && insunits !== 0) {
      doc.warnings.push(`insunitsUnknown:${insunits}`);
    }
  }

  // Block bounding boxes for INSERT expansion, computed for the blocks an
  // INSERT actually uses, once each.
  const blocks = (dxf.blocks ?? {}) as unknown as Record<string, { entities?: Array<Record<string, unknown>> }>;
  const blockInfo = new Map<string, BlockInfo>();
  const infoOf = (name: string): BlockInfo | undefined => {
    if (!blockInfo.has(name) && blocks[name]) blockInfo.set(name, blockLocalBBox(blocks[name].entities ?? []));
    return blockInfo.get(name);
  };

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
        // A missing end point is as unusable as an unreadable one: a file cut
        // off mid-entity leaves one vertex, and the beam used to vanish unseen.
        if (!vs || vs.length < 2 || !allFinite(vs[0].x, vs[0].y, vs[1].x, vs[1].y)) { refuse('LINE'); break; }
        doc.entities.push({
          kind: 'line', layer,
          a: { x: vs[0].x, y: vs[0].y },
          b: { x: vs[1].x, y: vs[1].y },
        });
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const vs = e.vertices as Array<{ x: number; y: number }> | undefined;
        if (!vs) { refuse(type); break; }
        // One bad vertex condemns the outline: a polyline is a shape, and a
        // shape with a hole where a corner should be is not a smaller shape.
        if (!vs.every((v) => allFinite(v.x, v.y))) { refuse(type); break; }
        // Readable, but a single point: a leftover of the export, not damage.
        if (vs.length < 2) { skipDegenerate(type); break; }
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
        else skipDegenerate(type);
        break;
      }
      case 'ARC': {
        if (!e.center) { refuse('ARC'); break; }
        const r = e.radius;
        const startAngle = e.startAngle ?? 0; // radians (dxf-parser converts)
        const endAngle = e.endAngle ?? 0;
        // A non-finite radius is the worst of these: entityBBox computes
        // `center.x - r`, so one bad arc poisons the whole drawing extent
        // through Math.min/Math.max, which do NOT skip NaN the way the
        // comparisons in bboxOfPoints do. A missing or negative radius is not
        // a size — a negative one drew an inverted box. Zero is a readable
        // radius of nothing: skipped as a leftover, not refused as damage.
        if (!allFinite(e.center.x, e.center.y, r, startAngle, endAngle) || r < 0) { refuse('ARC'); break; }
        if (r === 0) { skipDegenerate('ARC'); break; }
        doc.entities.push({
          kind: 'arc', layer,
          center: { x: e.center.x, y: e.center.y },
          r, startAngle, endAngle,
        });
        break;
      }
      case 'CIRCLE': {
        if (!e.center) { refuse('CIRCLE'); break; }
        const r = e.radius;
        if (!allFinite(e.center.x, e.center.y, r) || r < 0) { refuse('CIRCLE'); break; }
        if (r === 0) { skipDegenerate('CIRCLE'); break; }
        doc.entities.push({
          kind: 'circle', layer,
          center: { x: e.center.x, y: e.center.y },
          r,
        });
        break;
      }
      case 'INSERT': {
        if (!e.position) { refuse('INSERT'); break; }
        const xScale = e.xScale ?? 1, yScale = e.yScale ?? 1, rotation = e.rotation ?? 0;
        // The scale and rotation matter as much as the position: they go into
        // transformBlockBBox, so a NaN there produces a NaN bbox for a column
        // symbol that looks perfectly well-formed in the entity list.
        if (!allFinite(e.position.x, e.position.y, xScale, yScale, rotation)) { refuse('INSERT'); break; }
        const at: CadPt = { x: e.position.x, y: e.position.y };
        const blockName = String(e.name ?? '');
        const info = infoOf(blockName);
        // A block that lost pieces places its inserts but does not size them:
        // whether the lost piece was the outline or a detail cannot be told
        // from what is left, and sizing from the remainder made a column the
        // size of its inner circle.
        if (info && Object.keys(info.refused).length > 0) {
          const inc = doc.incompleteBlocks[blockName] ??= { inserts: 0, refused: info.refused };
          inc.inserts++;
          doc.entities.push({ kind: 'insert', layer, at, blockName, bbox: undefined });
          break;
        }
        const bbox = info?.bbox ? transformBlockBBox(info.bbox, at, xScale, yScale, rotation) ?? undefined : undefined;
        doc.entities.push({ kind: 'insert', layer, at, blockName, bbox });
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const pos = e.startPoint ?? e.position;
        if (!pos) { refuse(type); break; }
        if (!allFinite(pos.x, pos.y)) { refuse(type); break; }
        doc.entities.push({
          kind: 'text', layer,
          at: { x: pos.x, y: pos.y },
          value: String(e.text ?? ''),
        });
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
