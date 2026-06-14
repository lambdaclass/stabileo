// Structural spec extraction from CAD text: member dimension labels, mark
// tags, section schedules, and level schedules.
//
// Generic by design — patterns cover the conventions seen in real Argentine
// structural plans ("C1 (40x20)", "V-101: 15x40", "VIGA 20x50", "TABIQUE 20",
// "LOSA h=15") plus the Stabileo template layers (STB_*). Nothing here is
// file-specific.
//
// Dimension precedence is applied by the generator:
//   1. schedule row (CAD STB_SECTION_SCHEDULE_* text or wizard editor row),
//   2. label near the member,
//   3. measured CAD geometry (rect/bbox/face-pair width),
//   4. wizard default (with a warning).

import type {
  ArchPlan,
  CadDocument,
  CadPt,
  CadUnit,
  LayerMapping,
  SectionScheduleEntry,
} from './types';
import { CAD_UNIT_SCALE } from './types';
import { dist, pointOnSegment } from './geometry';

// ─── Text label parsing ───────────────────────────────────────

export interface MemberSpec {
  /** Member kind hinted by the mark prefix or keyword (C/V/T-M/L). */
  kind?: 'column' | 'beam' | 'wall' | 'slab';
  mark?: string;
  /** Dimensions in metres (labels are authored in cm). */
  b?: number;
  h?: number;
  t?: number;
}

const KIND_BY_PREFIX: Record<string, MemberSpec['kind']> = {
  C: 'column', P: 'column', V: 'beam', B: 'beam', T: 'wall', M: 'wall', L: 'slab', S: 'slab',
};

const KIND_KEYWORDS: Array<[RegExp, MemberSpec['kind']]> = [
  [/\b(COLUMNA|PILAR|COLUMN)\b/i, 'column'],
  [/\b(VIGA|BEAM)\b/i, 'beam'],
  [/\b(TABIQUE|MURO|WALL)\b/i, 'wall'],
  // Slab keywords include balcony/cantilever labels (balcón / voladizo).
  [/\b(LOSA|SLAB|PLACA|BALC[OÓ]N|BALCON|VOLADIZO)\b/i, 'slab'],
];

// A structural mark: a prefix letter (C/V/T/M/L/P/B/S) followed by either a
// numeric tag ("V1", "V-101", "M-3") or a dash + word role tag ("V-INT",
// "V-BALCON", "V-PERIM"). The dash is REQUIRED for an alpha tag so plain
// keyword words ("VIGA", "TABIQUE", "COCINA") are never mistaken for marks.
const MARK_RE = /\b([CVTMLPBS](?:-?\d{1,4}|-[A-Z][A-Z0-9]{0,7}))\b/g;

/** Strip MTEXT formatting codes ({\f...;TEXT}, \P line breaks, \pxqc;…). */
export function cleanCadText(raw: string): string {
  return raw
    .replace(/\\P/g, ' ')
    .replace(/\\p[^;]*;/g, '')
    .replace(/\{\\[^;{}]*;/g, '')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

/**
 * Parse one CAD text label into a member spec. Returns null when the text
 * carries no usable structural information.
 * Recognized: "C1 (40x20)", "V-101: 15x40", "VIGA 20x50", "TABIQUE 20",
 * "T2 e=20", "LOSA h=15", "L1 15", "(40x20)", "h=12".
 */
export function parseMemberSpecText(raw: string): MemberSpec | null {
  const text = cleanCadText(raw).toUpperCase();
  if (!text || text.length > 80) return null;

  const spec: MemberSpec = {};

  // Mark: the first structural-prefix token that is not itself a kind keyword
  // ("VIGA V2 15x40" → mark V2, not VIGA). The mark prefix fixes the kind, so
  // "V-BALCON" stays a beam even though it contains the BALCON slab keyword.
  for (const m of text.matchAll(MARK_RE)) {
    spec.mark = m[1];
    spec.kind = KIND_BY_PREFIX[m[1][0]];
    break;
  }
  // Kind keyword only when no prefixed mark already determined the kind.
  if (!spec.kind) {
    for (const [re, kind] of KIND_KEYWORDS) {
      if (re.test(text)) { spec.kind = kind; break; }
    }
  }

  // b×h pair in cm: "40x20", "40 X 20", "40×20"
  const dims = text.match(/(\d{1,3}(?:\.\d+)?)\s*[X×]\s*(\d{1,3}(?:\.\d+)?)/);
  if (dims) {
    spec.b = parseFloat(dims[1]) / 100;
    spec.h = parseFloat(dims[2]) / 100;
  }

  // Thickness: "h=15", "e=20", "H = 12" — plausible member range only
  // (5–60 cm), so ceiling-height notes like "H = 2.40 m" are rejected.
  const thick = text.match(/\b[HE]\s*=\s*(\d{1,3}(?:\.\d+)?)/);
  if (thick) {
    const v = parseFloat(thick[1]);
    if (v >= 5 && v <= 60) spec.t = v / 100;
  }

  // Bare trailing number after a kind keyword or mark: "TABIQUE 20", "L1 15".
  if (!dims && !thick && (spec.kind || spec.mark)) {
    const bare = text.match(/(?:^|\s)(\d{1,3})\s*$/);
    // Plausible member thickness only (8–60 cm) — avoids axis numbers etc.
    if (bare) {
      const v = parseFloat(bare[1]);
      if (v >= 8 && v <= 60) spec.t = v / 100;
    }
  }

  if (spec.b === undefined && spec.t === undefined && spec.mark === undefined) return null;
  if (spec.b === undefined && spec.t === undefined && spec.kind === undefined) return null;
  return spec;
}

// ─── Schedule parsing ─────────────────────────────────────────

/**
 * Parse one schedule row: "<mark|*> <from>-<to> <b>x<h>" or
 * "<mark|*> <from>-<to> <t>" (walls/slabs). Floors are 1-based inclusive.
 * Examples: "C* 1-3 40x60", "C1 4-10 30x50", "T* 1-10 20", "L* 10 12".
 */
export function parseScheduleRow(
  raw: string,
  kind: SectionScheduleEntry['kind'],
): SectionScheduleEntry | null {
  const text = cleanCadText(raw).toUpperCase();
  const m = text.match(/^([A-Z]{1,3}\*|[A-Z]{1,3}-?\d{1,4}|\*)\s+(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s+(.+)$/);
  if (!m) return null;
  const entry: Partial<SectionScheduleEntry> = {
    kind,
    mark: m[1].includes('*') ? '*' : m[1],
    fromFloor: parseInt(m[2], 10),
    toFloor: m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10),
    source: 'cad',
  };
  const dims = m[4].match(/(\d{1,3}(?:\.\d+)?)\s*[X×]\s*(\d{1,3}(?:\.\d+)?)/);
  if (dims) {
    entry.b = parseFloat(dims[1]) / 100;
    entry.h = parseFloat(dims[2]) / 100;
  } else {
    const t = m[4].match(/(\d{1,3}(?:\.\d+)?)/);
    if (!t) return null;
    entry.t = parseFloat(t[1]) / 100;
  }
  return entry as SectionScheduleEntry;
}

/** Parse a level-schedule row: "LEVELS <from>[-<to>] <height_m>", e.g.
 *  "LEVELS 1 3.0" or "LEVELS 2-10 2.8". Returns floor range + height in m. */
export function parseLevelRow(raw: string): { from: number; to: number; h: number } | null {
  const text = cleanCadText(raw).toUpperCase();
  const m = text.match(/^(?:LEVELS?|NIVELES?)\s+(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s+(\d+(?:\.\d+)?)\s*M?$/);
  if (!m) return null;
  return { from: parseInt(m[1], 10), to: m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10), h: parseFloat(m[3]) };
}

const SCHEDULE_LAYER: Array<[RegExp, SectionScheduleEntry['kind']]> = [
  [/SECTION_SCHEDULE_COLUMNS|SCHED.*COL/i, 'column'],
  [/SECTION_SCHEDULE_BEAMS|SCHED.*BEAM|SCHED.*VIGA/i, 'beam'],
  [/SECTION_SCHEDULE_WALLS|SCHED.*WALL|SCHED.*TABIQUE|SCHED.*MURO/i, 'wall'],
  [/SECTION_SCHEDULE_SLABS|SCHED.*SLAB|SCHED.*LOSA/i, 'slab'],
];

const LEVEL_LAYER = /LEVEL_SCHEDULE|NIVELES/i;

// ─── Attachment to the plan ───────────────────────────────────

/** Max distance (m) from a label anchor to the member it annotates. */
const LABEL_RADIUS = 1.2;

/**
 * Read spec/mark labels and schedules from the document and attach them to
 * the extracted plan IN PLACE:
 *   - schedule layers → plan.schedules (+ level heights),
 *   - texts on/near member layers → nearest member's mark/dimensions
 *     (label beats measured geometry; schedules are resolved later by the
 *     generator, beating both).
 */
export function attachSpecs(
  plan: ArchPlan,
  doc: CadDocument,
  mappings: LayerMapping[],
  unit: CadUnit,
): void {
  const k = CAD_UNIT_SCALE[unit];
  const roleOf = new Map(mappings.map((m) => [m.layer, m.role]));

  const texts = doc.entities.filter((e) => e.kind === 'text') as
    Array<Extract<typeof doc.entities[number], { kind: 'text' }>>;

  // 1) Schedules + levels from dedicated layers.
  const levels: Array<{ from: number; to: number; h: number }> = [];
  for (const t of texts) {
    const schedKind = SCHEDULE_LAYER.find(([re]) => re.test(t.layer))?.[1];
    if (schedKind) {
      const row = parseScheduleRow(t.value, schedKind);
      if (row) plan.schedules.push(row);
      else plan.skipped.push({ kind: 'text', layer: t.layer, reason: 'scheduleRowUnparsed' });
      continue;
    }
    if (LEVEL_LAYER.test(t.layer)) {
      const row = parseLevelRow(t.value);
      if (row) levels.push(row);
      else plan.skipped.push({ kind: 'text', layer: t.layer, reason: 'levelRowUnparsed' });
    }
  }
  if (levels.length > 0) {
    const maxFloor = Math.max(...levels.map((l) => l.to));
    const heights = new Array<number>(maxFloor).fill(0);
    for (const l of levels) {
      for (let f = l.from; f <= l.to && f <= maxFloor; f++) heights[f - 1] = l.h;
    }
    if (heights.every((h) => h > 0)) plan.levelHeights = heights;
    else plan.warnings.push('levelScheduleIncomplete');
  }

  // 2) Member labels: texts on member-role layers or *_MARKS layers,
  //    attached to the nearest member of the right kind within LABEL_RADIUS.
  const at = (t: { at: CadPt }): CadPt => ({ x: t.at.x * k, y: t.at.y * k });
  const nearestSegment = <T extends { a: CadPt; b: CadPt }>(p: CadPt, arr: T[]): T | null => {
    let best: T | null = null;
    let bestD = LABEL_RADIUS;
    for (const s of arr) {
      const t = pointOnSegment(p, s.a, s.b, LABEL_RADIUS, 0);
      const d = t !== null
        ? Math.hypot(p.x - (s.a.x + t * (s.b.x - s.a.x)), p.y - (s.a.y + t * (s.b.y - s.a.y)))
        : Math.min(dist(p, s.a), dist(p, s.b));
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  };

  for (const t of texts) {
    const role = roleOf.get(t.layer);
    const isMarksLayer = /_MARKS|_REF\b/i.test(t.layer);
    if (!isMarksLayer && role !== 'column' && role !== 'beam' && role !== 'wall' && role !== 'slab') continue;
    const spec = parseMemberSpecText(t.value);
    if (!spec) continue;
    const p = at(t);

    const kind = spec.kind
      ?? (role === 'column' || role === 'beam' || role === 'wall' || role === 'slab' ? role : undefined);
    if (kind === 'column') {
      let best: ArchPlan['columns'][number] | null = null;
      let bestD = LABEL_RADIUS;
      for (const c of plan.columns) {
        const d = dist(p, c.at);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) {
        if (spec.mark) best.mark = spec.mark;
        if (spec.b !== undefined && spec.h !== undefined) {
          best.b = spec.b; best.h = spec.h; best.specSource = 'label';
        }
      }
    } else if (kind === 'beam') {
      const best = nearestSegment(p, plan.beams);
      if (best) {
        if (spec.mark) best.mark = spec.mark;
        if (spec.b !== undefined && spec.h !== undefined) {
          best.width = spec.b; best.depth = spec.h; best.specSource = 'label';
        }
      }
    } else if (kind === 'wall') {
      const best = nearestSegment(p, plan.walls);
      if (best) {
        if (spec.mark) best.mark = spec.mark;
        const t2 = spec.t ?? spec.b;
        if (t2 !== undefined) { best.thickness = t2; best.specSource = 'label'; }
      }
    } else if (kind === 'slab') {
      let best: ArchPlan['slabs'][number] | null = null;
      let bestD = Infinity;
      for (const s of plan.slabs) {
        const c = s.outline.reduce(
          (acc, q) => ({ x: acc.x + q.x / s.outline.length, y: acc.y + q.y / s.outline.length }),
          { x: 0, y: 0 },
        );
        const d = dist(p, c);
        if (d < bestD) { bestD = d; best = s; }
      }
      // Slab labels sit inside the panel — accept the nearest centroid.
      if (best && bestD < 20) {
        if (spec.mark) best.mark = spec.mark;
        if (spec.t !== undefined) { best.thickness = spec.t; best.specSource = 'label'; }
      }
    }
  }
}

/**
 * Resolve a member's section through the precedence chain. `floor` is
 * 1-based. Returns dims in metres plus the winning source.
 */
export function resolveSection(
  kind: SectionScheduleEntry['kind'],
  mark: string | undefined,
  floor: number,
  schedules: SectionScheduleEntry[],
  labelDims: { b?: number; h?: number; t?: number } | undefined,
  geometryDims: { b?: number; h?: number; t?: number } | undefined,
  defaults: { b?: number; h?: number; t?: number },
): { b?: number; h?: number; t?: number; source: 'schedule' | 'label' | 'geometry' | 'default' } {
  // Precedence (specific beats generic):
  //   1. EXACT-mark schedule row (a row written for this member's mark),
  //   2. the member's own text LABEL,
  //   3. WILDCARD schedule row (the "V*" / "C*" catch-all),
  //   4. measured CAD geometry,
  //   5. wizard default.
  // So a beam labelled "V1 20x50" keeps 20x50 even when a "V* 15x40" wildcard
  // exists, but an explicit "V1 …" schedule row still overrides the label.
  // Within a tier, wizard editor rows beat CAD-drawn rows.
  const rows = schedules.filter((s) =>
    s.kind === kind && floor >= s.fromFloor && floor <= s.toFloor &&
    (s.mark === '*' || (mark !== undefined && s.mark === mark)));
  const exact = rows.filter((s) => s.mark !== '*');
  const exactPick = exact.find((s) => s.source === 'wizard') ?? exact[0];
  if (exactPick) return { b: exactPick.b, h: exactPick.h, t: exactPick.t, source: 'schedule' };

  if (labelDims && (labelDims.b !== undefined || labelDims.t !== undefined)) {
    return { ...labelDims, source: 'label' };
  }

  const wild = rows.filter((s) => s.mark === '*');
  const wildPick = wild.find((s) => s.source === 'wizard') ?? wild[0];
  if (wildPick) return { b: wildPick.b, h: wildPick.h, t: wildPick.t, source: 'schedule' };

  if (geometryDims && (geometryDims.b !== undefined || geometryDims.t !== undefined)) {
    return { ...geometryDims, source: 'geometry' };
  }
  return { ...defaults, source: 'default' };
}
