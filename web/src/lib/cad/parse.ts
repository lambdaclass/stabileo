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
  CadBlock,
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
 * dxf-parser's CIRCLE, keeping the extrusion direction its own handler drops.
 *
 * A circle mirrored in the drawing carries (0, 0, −1), and its centre is then in a frame whose x
 * runs the other way; read without it, a mirrored hole lands on the wrong side of the section.
 * The groups the IR uses are the same: layer, centre, radius.
 */
class CircleWithExtrusion {
  ForEntityName = 'CIRCLE' as const;
  parseEntity(scanner: { next(): { code: number; value: unknown }; isEOF(): boolean }, curr: { code: number; value: unknown }) {
    const entity: Record<string, unknown> & { center: Partial<CadPt> } = { type: curr.value, center: {} };
    curr = scanner.next();
    while (!scanner.isEOF()) {
      if (curr.code === 0) break;
      switch (curr.code) {
        case 8: entity.layer = curr.value; break;
        case 10: entity.center.x = curr.value as number; break;
        case 20: entity.center.y = curr.value as number; break;
        case 40: entity.radius = curr.value; break;
        case 230: entity.extrusionDirectionZ = curr.value; break;
      }
      curr = scanner.next();
    }
    if (entity.center.x === undefined && entity.center.y === undefined) delete (entity as { center?: unknown }).center;
    return entity;
  }
}

/**
 * True when an entity is drawn in a frame mirrored about the y axis: extrusion direction
 * (0, 0, −1), which is what MIRROR leaves on arcs, circles, polylines and inserts. By DXF's
 * arbitrary-axis rule that frame's x is the drawing's −x and its y the drawing's y.
 */
const mirrored = (z: unknown) => typeof z === 'number' && z < 0;

/**
 * Entity types by where they sit in the text: the ENTITIES section, and each block definition.
 *
 * dxf-parser drops a type it has no handler for (HATCH, REGION, WIPEOUT, ...) without a trace, so
 * what it returns cannot say what it left out. The text can.
 */
function rawEntityTypes(text: string): { entities: Record<string, number>; blocks: Record<string, Record<string, number>> } {
  const lines = text.split(/\r\n|\r|\n/g);
  const entities: Record<string, number> = {};
  const blocks: Record<string, Record<string, number>> = {};
  let section = '', awaitingSection = false;
  let block: Record<string, number> | null = null, inBlockHeader = false;
  const count = (into: Record<string, number>, type: string) => { into[type] = (into[type] ?? 0) + 1; };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i]!, 10), value = lines[i + 1]!.trim();
    if (code === 2 && awaitingSection) { section = value; awaitingSection = false; continue; }
    if (code === 2 && inBlockHeader && block === null) { block = blocks[value] ??= {}; continue; }
    if (code !== 0) continue;
    if (value === 'SECTION') { awaitingSection = true; continue; }
    if (value === 'ENDSEC') { section = ''; continue; }
    if (section === 'ENTITIES') count(entities, value);
    else if (section === 'BLOCKS') {
      if (value === 'BLOCK') { inBlockHeader = true; block = null; }
      else if (value === 'ENDBLK') { inBlockHeader = false; block = null; }
      else { inBlockHeader = false; if (block) count(block, value); }
    }
  }
  return { entities, blocks };
}

/** Records a type that another entity owns, not a drawing entity of its own. */
const OWNED_RECORDS = new Set(['VERTEX', 'SEQEND', 'ATTRIB']);

/**
 * The types in `raw` that dxf-parser returned none of: the ones it has no handler for.
 * A handled type always comes back, refused or not, so this is exactly what it dropped.
 */
function droppedTypes(raw: Record<string, number>, parsed: Array<{ type?: unknown }>): Record<string, number> {
  const seen = new Set(parsed.map((e) => String(e.type)));
  return Object.fromEntries(Object.entries(raw).filter(([t]) => !seen.has(t) && !OWNED_RECORDS.has(t)));
}

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
 * One dxf-parser entity of a supported type as IR, or null when it is refused (numbers that are
 * not usable) or skipped (no size). Entities drawn mirrored (`mirrored`) are brought into the
 * drawing's frame here, so no reader has to know about extrusion directions.
 *
 * An INSERT comes back without its bbox: sizing it needs the block, which the caller has.
 */
function readEntity(
  e: Record<string, any>,
  refuse: (kind: string) => void,
  skipDegenerate: (kind: string) => void,
): CadEntity | null {
  const layer = String(e.layer ?? '0');
  const type = e.type as string;
  switch (type) {
    case 'LINE': {
      const vs = e.vertices as Array<{ x: number; y: number }> | undefined;
      // A missing end point is as unusable as an unreadable one: a file cut
      // off mid-entity leaves one vertex, and the beam used to vanish unseen.
      if (!vs || vs.length < 2 || !allFinite(vs[0].x, vs[0].y, vs[1].x, vs[1].y)) { refuse('LINE'); return null; }
      return {
        kind: 'line', layer,
        a: { x: vs[0].x, y: vs[0].y },
        b: { x: vs[1].x, y: vs[1].y },
      };
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const vs = e.vertices as Array<{ x: number; y: number; bulge?: number }> | undefined;
      if (!vs) { refuse(type); return null; }
      // One bad vertex condemns the outline: a polyline is a shape, and a
      // shape with a hole where a corner should be is not a smaller shape.
      if (!vs.every((v) => allFinite(v.x, v.y, v.bulge ?? 0))) { refuse(type); return null; }
      // Readable, but a single point: a leftover of the export, not damage.
      if (vs.length < 2) { skipDegenerate(type); return null; }
      const flip = mirrored(type === 'LWPOLYLINE' ? e.extrusionDirectionZ : e.extrusionDirection?.z);
      // Mirrored, the vertices keep their order and every arc turns the other way.
      let pts: CadPt[] = vs.map((v) => ({ x: flip ? -v.x : v.x, y: v.y }));
      let bulges: number[] | undefined = vs.some((v) => v.bulge) ? vs.map((v) => (flip ? -(v.bulge ?? 0) : v.bulge ?? 0)) : undefined;
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
        bulges = bulges?.slice(0, -1);
      }
      if (pts.length < 2) { skipDegenerate(type); return null; }
      return { kind: 'polyline', layer, pts, closed, ...(bulges ? { bulges } : {}) };
    }
    case 'ARC': {
      if (!e.center) { refuse('ARC'); return null; }
      const r = e.radius;
      const startAngle = e.startAngle ?? 0; // radians (dxf-parser converts)
      const endAngle = e.endAngle ?? 0;
      // A non-finite radius is the worst of these: entityBBox computes
      // `center.x - r`, so one bad arc poisons the whole drawing extent
      // through Math.min/Math.max, which do NOT skip NaN the way the
      // comparisons in bboxOfPoints do. A missing or negative radius is not
      // a size — a negative one drew an inverted box. Zero is a readable
      // radius of nothing: skipped as a leftover, not refused as damage.
      if (!allFinite(e.center.x, e.center.y, r, startAngle, endAngle) || r < 0) { refuse('ARC'); return null; }
      if (r === 0) { skipDegenerate('ARC'); return null; }
      // Mirrored, the angle θ is the drawing's π − θ and the arc runs the other way round, so
      // the counter-clockwise arc from start to end is the one from π − end to π − start.
      return mirrored(e.extrusionDirectionZ)
        ? { kind: 'arc', layer, center: { x: -e.center.x, y: e.center.y }, r, startAngle: Math.PI - endAngle, endAngle: Math.PI - startAngle }
        : { kind: 'arc', layer, center: { x: e.center.x, y: e.center.y }, r, startAngle, endAngle };
    }
    case 'CIRCLE': {
      if (!e.center) { refuse('CIRCLE'); return null; }
      const r = e.radius;
      if (!allFinite(e.center.x, e.center.y, r) || r < 0) { refuse('CIRCLE'); return null; }
      if (r === 0) { skipDegenerate('CIRCLE'); return null; }
      return {
        kind: 'circle', layer,
        center: { x: mirrored(e.extrusionDirectionZ) ? -e.center.x : e.center.x, y: e.center.y },
        r,
      };
    }
    case 'INSERT': {
      if (!e.position) { refuse('INSERT'); return null; }
      const xScale = e.xScale ?? 1, yScale = e.yScale ?? 1, rotation = e.rotation ?? 0;
      // The scale and rotation matter as much as the position: they go into
      // transformBlockBBox, so a NaN there produces a NaN bbox for a column
      // symbol that looks perfectly well-formed in the entity list.
      if (!allFinite(e.position.x, e.position.y, xScale, yScale, rotation)) { refuse('INSERT'); return null; }
      // Mirrored: M·R(θ)·S = R(−θ)·M·S, so the drawing's insert is at the mirrored point, turned
      // the other way, with its x scale negated.
      const flip = mirrored(e.extrusionDirection?.z);
      return {
        kind: 'insert', layer,
        at: { x: flip ? -e.position.x : e.position.x, y: e.position.y },
        blockName: String(e.name ?? ''),
        xScale: flip ? -xScale : xScale, yScale, rotationDeg: flip ? -rotation : rotation,
      };
    }
    case 'TEXT':
    case 'MTEXT': {
      const pos = e.startPoint ?? e.position;
      if (!pos) { refuse(type); return null; }
      if (!allFinite(pos.x, pos.y)) { refuse(type); return null; }
      return {
        kind: 'text', layer,
        at: { x: pos.x, y: pos.y },
        value: String(e.text ?? ''),
      };
    }
  }
  return null;
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
  parser.registerEntityHandler(CircleWithExtrusion as unknown as Parameters<DxfParser['registerEntityHandler']>[0]);
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
  const blocks = (dxf.blocks ?? {}) as unknown as Record<string, { position?: CadPt; entities?: Array<Record<string, unknown>> }>;
  const raw = rawEntityTypes(text);
  const blockInfo = new Map<string, BlockInfo>();
  const infoOf = (name: string): BlockInfo | undefined => {
    if (!blockInfo.has(name) && blocks[name]) blockInfo.set(name, blockLocalBBox(blocks[name].entities ?? []));
    return blockInfo.get(name);
  };

  for (const entity of dxf.entities ?? []) {
    const type = entity.type;
    if (!SUPPORTED_TYPES.has(type)) {
      doc.unsupported[type] = (doc.unsupported[type] ?? 0) + 1;
      continue;
    }
    if (type === 'POINT') {
      // Bare points carry no architectural meaning in v1; count but keep quiet.
      doc.unsupported['POINT'] = (doc.unsupported['POINT'] ?? 0) + 1;
      continue;
    }
    const read = readEntity(entity as unknown as Record<string, any>, refuse, skipDegenerate);
    if (!read || read.kind !== 'insert') {
      if (read) doc.entities.push(read);
      continue;
    }
    const info = infoOf(read.blockName);
    // A block that lost pieces places its inserts but does not size them:
    // whether the lost piece was the outline or a detail cannot be told
    // from what is left, and sizing from the remainder made a column the
    // size of its inner circle.
    if (info && Object.keys(info.refused).length > 0) {
      const inc = doc.incompleteBlocks[read.blockName] ??= { inserts: 0, refused: info.refused };
      inc.inserts++;
      doc.entities.push(read);
      continue;
    }
    const bbox = info?.bbox
      ? transformBlockBBox(info.bbox, read.at, read.xScale ?? 1, read.yScale ?? 1, read.rotationDeg ?? 0) ?? undefined
      : undefined;
    doc.entities.push({ ...read, bbox });
  }
  for (const [type, n] of Object.entries(droppedTypes(raw.entities, dxf.entities ?? []))) {
    doc.unsupported[type] = (doc.unsupported[type] ?? 0) + n;
  }

  // The definitions of the blocks inserted, nested inserts included, for a reader that draws
  // their contents. A piece refused inside one is already reported through `incompleteBlocks`.
  const used: Record<string, CadBlock> = {};
  const pending = doc.entities.flatMap((e) => (e.kind === 'insert' ? [e.blockName] : []));
  while (pending.length > 0) {
    const name = pending.pop()!;
    const def = blocks[name];
    if (used[name] || !def) continue;
    const block: CadBlock = { base: { x: def.position?.x ?? 0, y: def.position?.y ?? 0 }, entities: [], unsupported: {} };
    used[name] = block;
    if (!allFinite(block.base.x, block.base.y)) block.base = { x: 0, y: 0 };
    for (const ent of def.entities ?? []) {
      const type = String(ent.type);
      if (!SUPPORTED_TYPES.has(type)) { block.unsupported[type] = (block.unsupported[type] ?? 0) + 1; continue; }
      const read = type === 'POINT' ? null : readEntity(ent as Record<string, any>, () => {}, () => {});
      if (!read) continue;
      block.entities.push(read);
      if (read.kind === 'insert') pending.push(read.blockName);
    }
    for (const [type, n] of Object.entries(droppedTypes(raw.blocks[name] ?? {}, (def.entities ?? []) as Array<{ type?: unknown }>))) {
      block.unsupported[type] = (block.unsupported[type] ?? 0) + n;
    }
  }
  if (Object.keys(used).length > 0) doc.blocks = used;

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
