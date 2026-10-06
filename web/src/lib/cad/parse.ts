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

type Group = { code: number; value: unknown };
type Scanner = { next(): Group; isEOF(): boolean };
type Handler = { ForEntityName: string; parseEntity(scanner: Scanner, curr: Group): Record<string, unknown> };

/**
 * dxf-parser's own handler for a type, keeping the extrusion direction (group 230) it drops.
 *
 * A circle or a text mirrored in the drawing carries (0, 0, −1), and its point is then in a frame
 * whose x runs the other way; read without it, a mirrored hole lands on the wrong side of the
 * section and a mirrored label beside the wrong column. The stock handler still reads the entity,
 * through a scanner that notes the 230 going past, so every group it kept stays kept: the handle,
 * the colour, the paper-space flag, the extended data. A first version rewrote CIRCLE by hand with
 * the three groups the IR used, and paper-space circles became section parts.
 */
function withExtrusionZ(stock: Handler) {
  return class {
    ForEntityName = stock.ForEntityName;
    parseEntity(scanner: Scanner, curr: Group) {
      let z: unknown;
      const spy = new Proxy(scanner, {
        get(target, key) {
          if (key === 'next') return () => { const g = target.next(); if (g.code === 230) z = g.value; return g; };
          const v = Reflect.get(target, key, target);
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
      const entity = stock.parseEntity(spy, curr);
      if (z !== undefined) entity.extrusionDirectionZ = z;
      return entity;
    }
  };
}

/**
 * A dxf-parser whose CIRCLE and TEXT keep their extrusion direction (ARC, LWPOLYLINE, POLYLINE and
 * INSERT already do). The stock handlers are the parser's own instances, so a version of
 * dxf-parser that reads more groups is followed rather than shadowed.
 */
export function cadDxfParser(): DxfParser {
  const parser = new DxfParser();
  const stock = (parser as unknown as { _entityHandlers?: Record<string, Handler> })._entityHandlers ?? {};
  for (const type of ['CIRCLE', 'TEXT']) {
    const h = stock[type];
    if (h) parser.registerEntityHandler(withExtrusionZ(h) as unknown as Parameters<DxfParser['registerEntityHandler']>[0]);
  }
  return parser;
}

/**
 * True when an entity is drawn in a frame mirrored about the y axis: extrusion direction
 * (0, 0, −1), which is what MIRROR leaves on arcs, circles, polylines and inserts. By DXF's
 * arbitrary-axis rule that frame's x is the drawing's −x and its y the drawing's y.
 */
const mirrored = (z: unknown) => typeof z === 'number' && z < 0;

/** Records a type that another entity owns, not a drawing entity of its own. */
const OWNED_RECORDS = new Set(['VERTEX', 'SEQEND', 'ATTRIB']);

/**
 * Entity types by where they sit in the text: the ENTITIES section (model space only), and each
 * block definition; the ENTITIES-section entities drawn in paper space, by type; and whether a
 * POLYLINE runs into the next entity without its SEQEND.
 *
 * dxf-parser drops a type it has no handler for (HATCH, REGION, WIPEOUT, ...) without a trace, so
 * what it returns cannot say what it left out. The text can. Paper space (group 67 = 1) is the
 * layout sheet — frames, title blocks, viewports — and not the drawing, so it is counted apart.
 * And a POLYLINE whose vertex list ends in anything but SEQEND sends dxf-parser into a loop it
 * never leaves, which froze the tab; the text is read for it before the parser is.
 */
function rawEntityTypes(text: string): {
  entities: Record<string, number>; blocks: Record<string, Record<string, number>>; paper: Record<string, number>; openPolyline: boolean;
} {
  const lines = text.split(/\r\n|\r|\n/g);
  const entities: Record<string, number> = {};
  const blocks: Record<string, Record<string, number>> = {};
  const paper: Record<string, number> = {};
  let section = '', awaitingSection = false;
  let block: Record<string, number> | null = null, inBlockHeader = false;
  let current = '', inPolyline = false, openPolyline = false;
  const count = (into: Record<string, number>, type: string, by = 1) => { into[type] = (into[type] ?? 0) + by; };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i]!, 10), value = lines[i + 1]!.trim();
    if (code === 2 && awaitingSection) { section = value; awaitingSection = false; continue; }
    if (code === 2 && inBlockHeader && block === null) { block = blocks[value] ??= {}; continue; }
    if (code === 67 && section === 'ENTITIES' && current && !OWNED_RECORDS.has(current) && value === '1') {
      count(entities, current, -1);
      count(paper, current);
      current = '';
      continue;
    }
    if (code !== 0) continue;
    if (inPolyline) {
      if (value === 'SEQEND') inPolyline = false;
      else if (value !== 'VERTEX') { openPolyline = true; inPolyline = false; }
    }
    if (value === 'POLYLINE') inPolyline = true;
    current = '';
    if (value === 'SECTION') { awaitingSection = true; continue; }
    if (value === 'ENDSEC') { section = ''; continue; }
    if (section === 'ENTITIES') { count(entities, value); current = value; }
    else if (section === 'BLOCKS') {
      if (value === 'BLOCK') { inBlockHeader = true; block = null; }
      else if (value === 'ENDBLK') { inBlockHeader = false; block = null; }
      else { inBlockHeader = false; if (block) count(block, value); }
    }
  }
  if (inPolyline) openPolyline = true;
  for (const [t, n] of Object.entries(entities)) if (n <= 0) delete entities[t];
  return { entities, blocks, paper, openPolyline };
}

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

/** More copies than this in one INSERT array is not a drawing anyone sections or frames. */
const MAX_ARRAY_COPIES = 10_000;

type CadInsert = Extract<CadEntity, { kind: 'insert' }>;

/**
 * Where each copy of an INSERT array goes: copy (i, j) at `at + R(rotationDeg)·(i·columnSpacing,
 * j·rowSpacing)`, the array stepping in the insert's turned frame and not scaled with the block.
 * One point, `at`, for a plain insert.
 */
export function insertCopies(e: CadInsert): CadPt[] {
  const cols = e.columns ?? 1, rows = e.rows ?? 1;
  const th = ((e.rotationDeg ?? 0) * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
  const out: CadPt[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const dx = i * (e.columnSpacing ?? 0), dy = j * (e.rowSpacing ?? 0);
      out.push({ x: e.at.x + dx * cos - dy * sin, y: e.at.y + dx * sin + dy * cos });
    }
  }
  return out;
}

/**
 * A block's extent in its own coordinates, and the pieces it lost to unusable numbers — its own
 * and those of the blocks it nests, once per copy placed.
 *
 * Read from the block as the IR holds it, so a piece drawn mirrored counts where it shows: from
 * the raw entities, a circle at (50, 0) with extrusion −1, drawn at x = −50, sized the column
 * symbol on the wrong side of its insertion point. Texts are labels, not the symbol's size.
 *
 * The refusals are the block's, not the drawing's: a definition nobody INSERTs — an unused
 * symbol, an anonymous dimension block, *Paper_Space — never puts anything in the model, and
 * counting its pieces reported losses that were not losses. They are reported through the
 * inserts that use the block (see `incompleteBlocks`).
 */
interface BlockInfo { bbox: CadBBox | null; refused: Record<string, number> }

/**
 * A block-local box placed by an insert: the block's base point onto the insertion point, scaled,
 * turned, and repeated over the array — the box of the corner copies covers every copy between.
 */
function placeBBox(local: CadBBox, base: CadPt, e: CadInsert): CadBBox | null {
  const shifted = { minX: local.minX - base.x, minY: local.minY - base.y, maxX: local.maxX - base.x, maxY: local.maxY - base.y };
  const copies = insertCopies(e);
  const cols = e.columns ?? 1;
  const corners = [copies[0]!, copies[cols - 1]!, copies[copies.length - cols]!, copies[copies.length - 1]!];
  let out: CadBBox | null = null;
  for (const at of corners) {
    const b = transformBlockBBox(shifted, at, e.xScale ?? 1, e.yScale ?? 1, e.rotationDeg ?? 0);
    if (!b) return null;
    out = mergeBBox(out, b);
  }
  return out;
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
      // An array (MINSERT): columns × rows copies. A count of 0 is read as the default 1, as CAD
      // programs do; a negative or fractional one, or an array past any drawing's size, is damage.
      const columns = e.columnCount ?? 1, rows = e.rowCount ?? 1;
      const columnSpacing = e.columnSpacing ?? 0, rowSpacing = e.rowSpacing ?? 0;
      if (!allFinite(columns, rows, columnSpacing, rowSpacing) || !Number.isInteger(columns) || !Number.isInteger(rows)
          || columns < 0 || rows < 0 || Math.max(1, columns) * Math.max(1, rows) > MAX_ARRAY_COPIES) { refuse('INSERT'); return null; }
      // Mirrored: M·R(θ)·S = R(−θ)·M·S, so the drawing's insert is at the mirrored point, turned
      // the other way, with its x scale negated — and its columns, which step along that x, too.
      const flip = mirrored(e.extrusionDirection?.z);
      const array = columns > 1 || rows > 1
        ? { columns: Math.max(1, columns), rows: Math.max(1, rows), columnSpacing: flip ? -columnSpacing : columnSpacing, rowSpacing }
        : {};
      return {
        kind: 'insert', layer,
        at: { x: flip ? -e.position.x : e.position.x, y: e.position.y },
        blockName: String(e.name ?? ''),
        xScale: flip ? -xScale : xScale, yScale, rotationDeg: flip ? -rotation : rotation,
        ...array,
      };
    }
    case 'TEXT':
    case 'MTEXT': {
      const pos = e.startPoint ?? e.position;
      if (!pos) { refuse(type); return null; }
      if (!allFinite(pos.x, pos.y)) { refuse(type); return null; }
      return {
        kind: 'text', layer,
        // A mirrored TEXT's point is in the mirrored frame, like a circle's centre.
        at: { x: type === 'TEXT' && mirrored(e.extrusionDirectionZ) ? -pos.x : pos.x, y: pos.y },
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
    paperSpace: 0,
    cyclicBlocks: [],
    warnings: [],
  };

  // Read before the parser: a POLYLINE with no SEQEND would never let it return.
  const raw = rawEntityTypes(text);
  if (raw.openPolyline) return { ...empty, warnings: ['parseError', 'polylineWithoutSeqend'] };

  const parser = cadDxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(text);
  } catch {
    return { ...empty, warnings: ['parseError'] };
  }
  if (!dxf) return { ...empty, warnings: ['parseError'] };

  const doc: CadDocument = {
    ...empty, unsupported: {}, malformed: {}, degenerate: {}, incompleteBlocks: {}, cyclicBlocks: [], warnings: [], entities: [],
    paperSpace: Object.values(raw.paper).reduce((a, b) => a + b, 0),
  };

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

  const blocks = (dxf.blocks ?? {}) as unknown as Record<string, { position?: CadPt; entities?: Array<Record<string, unknown>> }>;

  const modelSpace = (dxf.entities ?? []).filter((e) => !(e as { inPaperSpace?: boolean }).inPaperSpace);
  for (const entity of modelSpace) {
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
    if (!read) continue;
    if (read.kind !== 'insert' || (read.columns ?? 1) * (read.rows ?? 1) === 1) { doc.entities.push(read); continue; }
    // An array is every copy it draws, one insert each: a row of column symbols is a row of
    // columns. Only the first copy used to be read.
    const { columns: _c, rows: _r, columnSpacing: _cs, rowSpacing: _rs, ...one } = read;
    for (const at of insertCopies(read)) doc.entities.push({ ...one, at });
  }
  for (const [type, n] of Object.entries(droppedTypes(raw.entities, modelSpace))) {
    doc.unsupported[type] = (doc.unsupported[type] ?? 0) + n;
  }

  // The definitions of the blocks inserted, nested inserts included, for a reader that draws
  // their contents. A piece refused inside one is counted on its block, and reported through the
  // inserts that place it (`incompleteBlocks`); it used to be dropped without a count, and a
  // section drawn from the block lost a hole unannounced.
  const used: Record<string, CadBlock> = {};
  const pending = doc.entities.flatMap((e) => (e.kind === 'insert' ? [e.blockName] : []));
  while (pending.length > 0) {
    const name = pending.pop()!;
    const def = blocks[name];
    if (used[name] || !def) continue;
    const block: CadBlock = { base: { x: def.position?.x ?? 0, y: def.position?.y ?? 0 }, entities: [], unsupported: {}, malformed: {} };
    used[name] = block;
    if (!allFinite(block.base.x, block.base.y)) block.base = { x: 0, y: 0 };
    const refuseIn = (kind: string) => { block.malformed[kind] = (block.malformed[kind] ?? 0) + 1; };
    for (const ent of def.entities ?? []) {
      const type = String(ent.type);
      if (!SUPPORTED_TYPES.has(type)) { block.unsupported[type] = (block.unsupported[type] ?? 0) + 1; continue; }
      const read = type === 'POINT' ? null : readEntity(ent as Record<string, any>, refuseIn, () => {});
      if (!read) continue;
      block.entities.push(read);
      if (read.kind === 'insert') pending.push(read.blockName);
    }
    for (const [type, n] of Object.entries(droppedTypes(raw.blocks[name] ?? {}, (def.entities ?? []) as Array<{ type?: unknown }>))) {
      block.unsupported[type] = (block.unsupported[type] ?? 0) + n;
    }
  }
  if (Object.keys(used).length > 0) doc.blocks = used;

  // Each block's extent and losses, nested blocks included, once each. A block that reaches
  // itself through its inserts is reported and the insert that closes the loop is not followed:
  // followed, it was copies of copies to the depth limit, each one a phantom.
  const infos = new Map<string, BlockInfo>();
  const cyclic = new Set<string>();
  const infoOf = (name: string, stack: string[]): BlockInfo | undefined => {
    const block = used[name];
    if (!block) return undefined;
    if (stack.includes(name)) { cyclic.add(name); return undefined; }
    const memo = infos.get(name);
    if (memo) return memo;
    const refused: Record<string, number> = { ...block.malformed };
    let bbox: CadBBox | null = null;
    for (const e of block.entities) {
      if (e.kind === 'text') continue;
      if (e.kind !== 'insert') { bbox = mergeBBox(bbox, entityBBox(e)); continue; }
      const inner = infoOf(e.blockName, [...stack, name]);
      if (!inner) continue;
      const copies = (e.columns ?? 1) * (e.rows ?? 1);
      for (const [k, n] of Object.entries(inner.refused)) refused[k] = (refused[k] ?? 0) + n * copies;
      if (inner.bbox) bbox = mergeBBox(bbox, placeBBox(inner.bbox, used[e.blockName]!.base, e));
    }
    const info = { bbox, refused };
    infos.set(name, info);
    return info;
  };

  doc.entities = doc.entities.map((e) => {
    if (e.kind !== 'insert') return e;
    const info = infoOf(e.blockName, []);
    // A block that lost pieces places its inserts but does not size them:
    // whether the lost piece was the outline or a detail cannot be told
    // from what is left, and sizing from the remainder made a column the
    // size of its inner circle.
    if (info && Object.keys(info.refused).length > 0) {
      const inc = doc.incompleteBlocks[e.blockName] ??= { inserts: 0, refused: info.refused };
      inc.inserts++;
      return e;
    }
    const bbox = info?.bbox ? placeBBox(info.bbox, used[e.blockName]!.base, e) ?? undefined : undefined;
    return { ...e, bbox };
  });
  doc.cyclicBlocks = [...cyclic];

  // Layer summary: every layer named in the table plus any layer that actually
  // carries entities (files in the wild reference layers missing from the table).
  // A layer turned off (negative colour) or frozen is marked: what is on it is not shown in the
  // drawing, and a reader that draws only what shows (a section outline) leaves it out.
  const layerMap = new Map<string, CadLayer>();
  for (const [name, l] of Object.entries(dxf.tables?.layer?.layers ?? {})) {
    const hidden = l.frozen ? 'frozen' as const : l.visible === false ? 'off' as const : undefined;
    layerMap.set(name, { name, entityCounts: {}, total: 0, ...(hidden ? { hidden } : {}) });
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
