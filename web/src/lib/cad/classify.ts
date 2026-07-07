// Layer-role classification + semantic ArchPlan extraction.
//
// Suggestion heuristics may propose a role per layer (with evidence shown to
// the user), but the user confirms or overrides every mapping. Unknown layers
// default to 'ignore' — an architectural plan is never guessed into a
// structural system.

import type {
  ArchColumn,
  ArchPlan,
  CadDocument,
  CadEntity,
  CadPt,
  CadUnit,
  LayerMapping,
  LayerRole,
} from './types';
import { CAD_UNIT_SCALE } from './types';
import { attachSpecs } from './specs';
import { classifyRoomLabel } from './rooms';
import {
  beamAxisFromPolygon,
  chainSegmentsIntoLoops,
  dist,
  isAxisAlignedRectilinear,
  pairWallLines,
  polygonBBox,
  pruneCollinear,
  toCCW,
  type Segment,
} from './geometry';

// ─── Name vocabulary (es/en, matched on uppercased layer name) ─

const NAME_VOCAB: Array<{ role: LayerRole; tokens: string[] }> = [
  { role: 'column', tokens: ['COLUMNA', 'COLUMNAS', 'PILAR', 'PILARES', 'COLUMN', 'COLUMNS', 'COL', 'COLS'] },
  { role: 'beam', tokens: ['VIGA', 'VIGAS', 'BEAM', 'BEAMS'] },
  { role: 'wall', tokens: ['TABIQUE', 'TABIQUES', 'MURO', 'MUROS', 'WALL', 'WALLS', 'PARED', 'PAREDES'] },
  { role: 'slab', tokens: ['LOSA', 'LOSAS', 'SLAB', 'SLABS', 'ENTREPISO', 'ENTREPISOS', 'PLACA', 'PLACAS', 'FORJADO', 'FORJADOS'] },
  { role: 'grid', tokens: ['EJE', 'EJES', 'GRID', 'AXIS', 'AXES'] },
  { role: 'opening', tokens: ['HUECO', 'HUECOS', 'VANO', 'VANOS', 'ABERTURA', 'ABERTURAS', 'OPENING', 'OPENINGS', 'VACIO', 'VACÍO', 'AGUJERO', 'AGUJEROS'] },
  { role: 'text', tokens: ['TEXTO', 'TEXTOS', 'TEXT', 'COTA', 'COTAS', 'ROTULO', 'ROTULOS', 'RÓTULO', 'LABEL', 'LABELS', 'ANOTACION', 'ANOTACIONES', 'ANOTACIÓN', 'DIM'] },
];

/** Largest plausible column footprint (m) for the geometry heuristic. */
const MAX_COLUMN_SIDE_M = 1.5;
/** Smallest plausible slab outline area (m²) for the geometry heuristic. */
const MIN_SLAB_AREA_M2 = 2.0;

/** Stabileo DXF template layers (STB_*) → roles, checked first. Schedule,
 *  marks, notes, and load-area layers classify as 'text' (their content is
 *  read by the spec parser, not by geometry extraction). */
const STB_LAYER_ROLES: Array<[RegExp, LayerRole]> = [
  [/^STB_GRID$/i, 'grid'],
  [/^STB_COLUMN_OUTLINE$/i, 'column'],
  [/^STB_BEAM_(FACES|CENTERLINE)$/i, 'beam'],
  [/^STB_WALL_(AXIS|FACES)$/i, 'wall'],
  [/^STB_SLAB_OUTLINE$/i, 'slab'],
  [/^STB_OPENING$/i, 'opening'],
  [/^STB_(COLUMN|BEAM|WALL|SLAB)_MARKS$/i, 'text'],
  [/^STB_(LEVEL_SCHEDULE|SECTION_SCHEDULE_\w+|NOTES|LOAD_AREAS|ROOMS)$/i, 'text'],
  [/^STB_IGNORE$/i, 'ignore'],
];

function tokenMatch(layerUpper: string, token: string): boolean {
  // Token must appear as a word-ish fragment: full match, or bounded by
  // non-letters (handles "A-COLUMNAS", "COL_HA", "EJES 1").
  if (layerUpper === token) return true;
  const idx = layerUpper.indexOf(token);
  if (idx < 0) return false;
  const before = idx === 0 ? '' : layerUpper[idx - 1];
  const after = idx + token.length >= layerUpper.length ? '' : layerUpper[idx + token.length];
  const isLetter = (c: string) => c !== '' && /[A-ZÁÉÍÓÚÑ]/.test(c);
  return !isLetter(before) && !isLetter(after);
}

/**
 * Suggest a role for every layer in the document.
 * Name vocabulary → high confidence; geometry-only hints → medium/low;
 * anything else → ignore (low confidence).
 */
export function suggestLayerMappings(doc: CadDocument, unit: CadUnit): LayerMapping[] {
  const scale = CAD_UNIT_SCALE[unit];
  const byLayer = new Map<string, CadEntity[]>();
  for (const e of doc.entities) {
    const arr = byLayer.get(e.layer);
    if (arr) arr.push(e);
    else byLayer.set(e.layer, [e]);
  }

  return doc.layers.map((layer) => {
    const upper = layer.name.toUpperCase();
    const entities = byLayer.get(layer.name) ?? [];

    // 0) Stabileo template layers (exact convention, highest confidence).
    for (const [re, role] of STB_LAYER_ROLES) {
      if (re.test(upper)) {
        return {
          layer: layer.name, role, suggested: role,
          confidence: 'high' as const, evidence: 'name:STB',
        };
      }
    }

    // 1) Name vocabulary (first matching role wins; vocab ordered by specificity).
    for (const { role, tokens } of NAME_VOCAB) {
      const hit = tokens.find((tk) => tokenMatch(upper, tk));
      if (hit) {
        return {
          layer: layer.name, role, suggested: role,
          confidence: 'high' as const, evidence: `name:${hit}`,
        };
      }
    }

    // 2) Geometry hints (medium confidence).
    if (entities.length > 0) {
      const closed = entities.filter((e) => e.kind === 'polyline' && e.closed) as
        Array<Extract<CadEntity, { kind: 'polyline' }>>;
      if (closed.length > 0 && closed.length === entities.length) {
        const sizes = closed.map((e) => {
          const bb = polygonBBox(e.pts);
          return Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * scale;
        });
        if (sizes.every((s) => s > 0 && s <= MAX_COLUMN_SIDE_M)) {
          return {
            layer: layer.name, role: 'column' as const, suggested: 'column' as const,
            confidence: 'medium' as const, evidence: 'geometry:smallClosedRects',
          };
        }
        const areas = closed.map((e) => {
          const bb = polygonBBox(e.pts);
          return (bb.maxX - bb.minX) * (bb.maxY - bb.minY) * scale * scale;
        });
        if (areas.every((a) => a >= MIN_SLAB_AREA_M2)) {
          return {
            layer: layer.name, role: 'slab' as const, suggested: 'slab' as const,
            confidence: 'medium' as const, evidence: 'geometry:largeClosedOutlines',
          };
        }
      }
      if (entities.every((e) => e.kind === 'text')) {
        return {
          layer: layer.name, role: 'text' as const, suggested: 'text' as const,
          confidence: 'medium' as const, evidence: 'geometry:onlyText',
        };
      }
    }

    // 3) Unknown → ignore. Never guessed into the structure.
    return {
      layer: layer.name, role: 'ignore' as const, suggested: 'ignore' as const,
      confidence: 'low' as const, evidence: 'unknown',
    };
  });
}

// ─── ArchPlan extraction ──────────────────────────────────────

/** Wall double-line pairing bounds, in metres. */
const WALL_GAP_MIN_M = 0.05;
const WALL_GAP_MAX_M = 0.5;
/** Beam double-line (face pair) bounds, in metres: typical RC beam widths. */
const BEAM_GAP_MIN_M = 0.08;
const BEAM_GAP_MAX_M = 0.5;
/** Endpoint weld tolerance when chaining column outline LINEs into loops. */
const COLUMN_CHAIN_TOL_M = 0.005;

const sc = (p: CadPt, k: number): CadPt => ({ x: p.x * k, y: p.y * k });

/**
 * Read the document through the confirmed layer mappings and produce the
 * semantic plan, in metres. Ambiguity → warnings/skipped, not guesses.
 */
export function extractArchPlan(
  doc: CadDocument,
  mappings: LayerMapping[],
  unit: CadUnit,
): ArchPlan {
  const k = CAD_UNIT_SCALE[unit];
  const roleOf = new Map(mappings.map((m) => [m.layer, m.role]));

  const plan: ArchPlan = {
    unit,
    mappings: mappings.map((m) => ({ ...m })),
    columns: [],
    beams: [],
    walls: [],
    slabs: [],
    openings: [],
    gridLines: [],
    schedules: [],
    roomLabels: [],
    warnings: [],
    skipped: [],
  };

  const wallSegments: Array<Segment & { layer: string }> = [];
  const beamSegments: Array<Segment & { layer: string }> = [];
  const columnLineSegments: Array<Segment & { layer: string }> = [];

  for (const e of doc.entities) {
    const role = roleOf.get(e.layer) ?? 'ignore';
    switch (role) {
      case 'ignore':
      case 'text':
        break;

      case 'grid': {
        if (e.kind === 'line') plan.gridLines.push({ a: sc(e.a, k), b: sc(e.b, k) });
        else if (e.kind === 'polyline') {
          for (let i = 0; i < e.pts.length - 1; i++) {
            plan.gridLines.push({ a: sc(e.pts[i], k), b: sc(e.pts[i + 1], k) });
          }
        }
        break;
      }

      case 'column': {
        // Column rectangles drawn as bare LINEs (common in structural CADs)
        // are chained into closed loops after the entity pass.
        if (e.kind === 'line') {
          columnLineSegments.push({ a: sc(e.a, k), b: sc(e.b, k), layer: e.layer });
          break;
        }
        if (e.kind === 'text') break; // column tag labels — not geometry
        const col = columnFromEntity(e, k);
        if (col) plan.columns.push({ ...col, srcLayer: e.layer });
        else plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'columnShape' });
        break;
      }

      case 'beam': {
        if (e.kind === 'line') {
          beamSegments.push({ a: sc(e.a, k), b: sc(e.b, k), layer: e.layer });
        } else if (e.kind === 'polyline' && e.closed) {
          // A beam drawn as its physical face outline (closed thin rectangle):
          // derive the analytical centerline + width from the polygon directly,
          // bypassing face pairing (PR [14] Layer 4).
          const axis = beamAxisFromPolygon(e.pts.map((p) => sc(p, k)));
          if (axis) {
            plan.beams.push({ a: axis.a, b: axis.b, width: axis.width, geomSource: 'polygon', srcLayer: e.layer });
          } else {
            plan.skipped.push({ kind: 'polyline', layer: e.layer, reason: 'beamShape' });
          }
        } else if (e.kind === 'polyline') {
          // Open polyline: a multi-segment beam path (or two drawn faces that
          // face-pairing will couple). Feed each edge to the pairing pass.
          const n = e.pts.length - 1;
          for (let i = 0; i < n; i++) {
            beamSegments.push({ a: sc(e.pts[i], k), b: sc(e.pts[(i + 1) % e.pts.length], k), layer: e.layer });
          }
        } else if (e.kind === 'arc') {
          plan.skipped.push({ kind: 'arc', layer: e.layer, reason: 'curvedNotConverted' });
        } else if (e.kind === 'text') {
          // beam tag labels — not geometry
        } else {
          plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'beamShape' });
        }
        break;
      }

      case 'wall': {
        if (e.kind === 'line') {
          wallSegments.push({ a: sc(e.a, k), b: sc(e.b, k), layer: e.layer });
        } else if (e.kind === 'polyline') {
          const n = e.closed ? e.pts.length : e.pts.length - 1;
          for (let i = 0; i < n; i++) {
            wallSegments.push({ a: sc(e.pts[i], k), b: sc(e.pts[(i + 1) % e.pts.length], k), layer: e.layer });
          }
        } else if (e.kind === 'arc') {
          plan.skipped.push({ kind: 'arc', layer: e.layer, reason: 'curvedNotConverted' });
        } else {
          plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'wallShape' });
        }
        break;
      }

      case 'slab': {
        if (e.kind === 'polyline' && e.closed) {
          const outline = pruneCollinear(e.pts.map((p) => sc(p, k)), 1e-4);
          if (outline.length < 3) {
            plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'degenerateOutline' });
            break;
          }
          const ccw = toCCW(outline);
          plan.slabs.push({
            outline: ccw,
            isQuad: ccw.length === 4,
            isRectilinear: isAxisAlignedRectilinear(ccw, 1e-4),
            srcLayer: e.layer,
          });
        } else if (e.kind === 'polyline' || e.kind === 'line') {
          plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'slabNotClosed' });
        } else if (e.kind === 'arc' || e.kind === 'circle') {
          plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'curvedNotConverted' });
        } else {
          plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'slabShape' });
        }
        break;
      }

      case 'opening': {
        if (e.kind === 'polyline' && e.closed) {
          plan.openings.push({ outline: pruneCollinear(e.pts.map((p) => sc(p, k)), 1e-4) });
        } else {
          plan.skipped.push({ kind: e.kind, layer: e.layer, reason: 'openingNotClosed' });
        }
        break;
      }
    }
  }

  // Columns drawn as bare LINE outlines: chain into closed loops and read the
  // rectangle size from each loop's bbox. Junction/open leftovers are skipped.
  if (columnLineSegments.length > 0) {
    const { loops, unchained } = chainSegmentsIntoLoops(columnLineSegments, COLUMN_CHAIN_TOL_M);
    for (const loop of loops) {
      const pruned = pruneCollinear(loop, 1e-4);
      const bb = polygonBBox(pruned.length >= 3 ? pruned : loop);
      const b = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
      if (b > 0 && h > 0 && Math.max(b, h) <= MAX_COLUMN_SIDE_M) {
        plan.columns.push({
          at: { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 },
          b, h, sizeSource: 'rect', srcLayer: columnLineSegments[0].layer,
        });
      } else {
        plan.skipped.push({ kind: 'polyline', layer: columnLineSegments[0].layer, reason: 'columnShape' });
      }
    }
    for (const i of unchained) {
      plan.skipped.push({ kind: 'line', layer: columnLineSegments[i].layer, reason: 'columnLinesUnchained' });
    }
  }

  // Beams: pair parallel face lines (drawn beam edges) into centerlines with
  // width = gap; unpaired lines are taken as single-line beam axes.
  if (beamSegments.length > 0) {
    const { paired: beamPairs, unpaired: beamSingles } = pairWallLines(beamSegments, {
      minGap: BEAM_GAP_MIN_M,
      maxGap: BEAM_GAP_MAX_M,
    });
    for (const p of beamPairs) {
      pushBeam(plan, p.a, p.b, p.thickness, 'paired', beamSegments[p.pair[0]]?.layer);
    }
    for (const i of beamSingles) {
      pushBeam(plan, beamSegments[i].a, beamSegments[i].b, undefined, 'centerline', beamSegments[i].layer);
    }
    if (beamPairs.length > 0 && beamSingles.length > 0) {
      plan.warnings.push('beamsMixedPairing');
    }
  }

  // Walls: double-line pairing first, leftovers as single centerlines.
  const { paired, unpaired } = pairWallLines(wallSegments, {
    minGap: WALL_GAP_MIN_M,
    maxGap: WALL_GAP_MAX_M,
  });
  for (const w of paired) {
    plan.walls.push({
      a: w.a, b: w.b, thickness: w.thickness, thicknessSource: 'paired',
      srcLayer: wallSegments[w.pair[0]]?.layer,
    });
  }
  for (const i of unpaired) {
    const s = wallSegments[i];
    if (dist(s.a, s.b) > 1e-6) {
      plan.walls.push({ a: s.a, b: s.b, thicknessSource: 'default', srcLayer: s.layer });
    }
  }
  if (paired.length > 0 && unpaired.length > 0) {
    plan.warnings.push('wallsMixedPairing');
  }

  if (plan.openings.length > 0) plan.warnings.push('openingsNotSubtracted');

  // Attach dimension labels, marks, schedules, and level heights from text.
  attachSpecs(plan, doc, mappings, unit);

  // Collect architectural room/use labels from text on text-role layers
  // (room labels live on dedicated text layers, e.g. "T - Locales" / STB_ROOMS).
  // Skip STRUCTURED-text STB layers (schedules/notes/marks/load-areas) so a
  // notes line that happens to mention room names is not read as a room.
  const structuredText = /_MARKS$|_SCHEDULE|^STB_(NOTES|LOAD_AREAS)$|^STB_LEVEL_SCHEDULE$/i;
  for (const e of doc.entities) {
    if (e.kind !== 'text') continue;
    if ((roleOf.get(e.layer) ?? 'ignore') !== 'text') continue;
    if (structuredText.test(e.layer)) continue;
    const room = classifyRoomLabel(e.value);
    if (room) plan.roomLabels.push({ at: sc(e.at, k), category: room.category, q: room.q, raw: room.raw });
  }

  return plan;
}

function pushBeam(
  plan: ArchPlan, a: CadPt, b: CadPt, width: number | undefined,
  geomSource: 'centerline' | 'paired', srcLayer?: string,
): void {
  if (dist(a, b) <= 1e-6) return;
  const beam: ArchPlan['beams'][number] = { a, b, geomSource };
  if (width !== undefined) beam.width = width;
  if (srcLayer !== undefined) beam.srcLayer = srcLayer;
  plan.beams.push(beam);
}

/** A column entity → centre point + optional size, in metres. */
function columnFromEntity(e: CadEntity, k: number): ArchColumn | null {
  switch (e.kind) {
    case 'polyline': {
      if (!e.closed) return null;
      const pruned = pruneCollinear(e.pts, 1e-9);
      const bb = polygonBBox(pruned.map((p) => sc(p, k)));
      const b = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
      if (b <= 0 || h <= 0 || Math.max(b, h) > MAX_COLUMN_SIDE_M) return null;
      const at = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
      // Only a true 4-corner rectangle yields a trusted size; other closed
      // shapes give the centre with the bbox as a suggestion.
      return { at, b, h, sizeSource: 'rect' };
    }
    case 'insert': {
      const at = sc(e.at, k);
      if (e.bbox) {
        const b = (e.bbox.maxX - e.bbox.minX) * k;
        const h = (e.bbox.maxY - e.bbox.minY) * k;
        if (b > 0 && h > 0 && Math.max(b, h) <= MAX_COLUMN_SIDE_M) {
          const cx = ((e.bbox.minX + e.bbox.maxX) / 2) * k;
          const cy = ((e.bbox.minY + e.bbox.maxY) / 2) * k;
          return { at: { x: cx, y: cy }, b, h, sizeSource: 'insert' };
        }
      }
      return { at, sizeSource: 'default' };
    }
    case 'circle': {
      // Circular column approximated as the square of equal area (the RC
      // sections in v1 are rectangular). Flagged via sizeSource for the UI.
      const d = 2 * e.r * k;
      if (d <= 0 || d > MAX_COLUMN_SIDE_M) return null;
      const side = Math.sqrt(Math.PI * (d / 2) ** 2);
      return { at: sc(e.center, k), b: side, h: side, sizeSource: 'circle' };
    }
    case 'line':
    case 'arc':
    case 'text':
      return null;
  }
}
