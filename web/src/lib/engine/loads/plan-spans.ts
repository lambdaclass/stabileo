/**
 * The spans of a load plan's layout (`plan-gravity.ts`), along X and along Y, and the patterns of
 * partial loading the regulations ask over them.
 *
 * ── Spans ─────────────────────────────────────────────────────────
 *
 * The grid lines along an axis are the coordinates the loaded panels' corners sit on, with the
 * ends of the members loaded by width that run along that axis. A span is the stretch between
 * two consecutive lines; what lies beyond the outer lines (a cantilever) is a span of its own, as
 * CIRSOC 104 §5.1 asks. A panel or a member belongs to the span its centre falls in; a member
 * that runs across the axis stands on a line, and takes load with either span beside it.
 * The lines are the whole model's, so one span index means the same bay on every level.
 *
 * ── Patterns ──────────────────────────────────────────────────────
 *
 *   · CIRSOC 101 §4.3.3, loads each side of a column (its commentary: the arrangement that gives
 *     the larger negative moments): for each grid line between two spans, both spans loaded and,
 *     beyond them, every other span. One pattern per interior line and axis, on every level.
 *   · CIRSOC 104 §5.1, partial snow on continuous systems: case 1, the balanced snow on both end
 *     spans and half of it on the rest; case 2, the reverse; case 3, the balanced snow on each pair
 *     of adjacent spans and half on the rest, n − 1 of them. Not on the spans perpendicular to the
 *     ridge of a gable roof steeper than 21/W + 0,5 degrees.
 *
 * A pattern that loads every span is the full load, and one that repeats another is dropped.
 *
 * Pure: no store.
 */
import type { GravityLayout, GravityModel } from './plan-gravity';

export type Axis = 'x' | 'y';
/** A unit of the layout: a panel by its index, or a member loaded by width. */
export type Unit = { panel: number } | { member: number };

const TOL = 0.05;

export interface Spans {
  /** Grid lines along each axis, sorted. */
  lines: Record<Axis, number[]>;
  /** Where a unit sits along an axis: in a span (by index) or on a line. */
  place: (u: Unit, axis: Axis) => { span: number } | { line: number } | null;
}

function cluster(values: number[]): number[] {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - out[out.length - 1]! > TOL) out.push(v);
  }
  return out;
}

export function layoutSpans(model: GravityModel, layout: GravityLayout): Spans {
  const memberEnds = new Map<number, [{ x: number; y: number }, { x: number; y: number }]>();
  for (const w of layout.widthMembers) {
    const e = model.elements.get(w.elementId);
    const a = e && model.nodes.get(e.nodeI), b = e && model.nodes.get(e.nodeJ);
    if (a && b) memberEnds.set(w.elementId, [a, b]);
  }
  const coords = (axis: Axis) => {
    const k = axis === 'x' ? 0 : 1;
    const vs: number[] = [];
    for (const p of layout.panels) for (const v of p.polygon) vs.push(v[k]!);
    for (const [a, b] of memberEnds.values()) {
      if (Math.abs((axis === 'x' ? b.x - a.x : b.y - a.y)) > TOL) vs.push(axis === 'x' ? a.x : a.y, axis === 'x' ? b.x : b.y);
    }
    return cluster(vs);
  };
  const lines = { x: coords('x'), y: coords('y') };
  const spanOf = (c: number, axis: Axis) => lines[axis].filter((l) => l < c - TOL).length;
  const lineAt = (c: number, axis: Axis) => lines[axis].findIndex((l) => Math.abs(l - c) <= TOL);
  return {
    lines,
    place(u, axis) {
      if ('panel' in u) {
        const poly = layout.panels[u.panel]?.polygon;
        if (!poly) return null;
        const k = axis === 'x' ? 0 : 1;
        const lo = Math.min(...poly.map((v) => v[k]!)), hi = Math.max(...poly.map((v) => v[k]!));
        return { span: spanOf((lo + hi) / 2, axis) };
      }
      const ends = memberEnds.get(u.member);
      if (!ends) return null;
      const [a, b] = ends;
      const ca = axis === 'x' ? a.x : a.y, cb = axis === 'x' ? b.x : b.y;
      if (Math.abs(cb - ca) > TOL) return { span: spanOf((ca + cb) / 2, axis) };
      const l = lineAt(ca, axis);
      return l >= 0 ? { line: l } : { span: spanOf(ca, axis) };
    },
  };
}

/** The units of a layout, the ones `keep` accepts. */
export function layoutUnits(layout: GravityLayout, keep: (u: Unit) => boolean = () => true): Unit[] {
  const out: Unit[] = layout.panels.map((_, k) => ({ panel: k }));
  for (const w of layout.widthMembers) out.push({ member: w.elementId });
  return out.filter(keep);
}

/** A pattern: the factor each unit carries (1 the full load, 0.5 half of it, 0 none). */
export interface SpanPattern {
  axis: Axis;
  /** For the name: the grid line's coordinate (adjacent spans) or the case of §5.1. */
  at?: number;
  snowCase?: 1 | 2 | 3;
  factor: (u: Unit) => number;
}

/** The spans along an axis that carry any of `units`, in order. */
function usedSpans(spans: Spans, units: Unit[], axis: Axis): number[] {
  const s = new Set<number>();
  for (const u of units) {
    const p = spans.place(u, axis);
    if (p && 'span' in p) s.add(p.span);
  }
  return [...s].sort((a, b) => a - b);
}

/** A unit's factor under a set of loaded spans: on a line it takes the larger of its two spans. */
function factorFor(spans: Spans, axis: Axis, loaded: Map<number, number>, rest: number) {
  return (u: Unit) => {
    const p = spans.place(u, axis);
    if (!p) return 1;
    if ('span' in p) return loaded.get(p.span) ?? rest;
    return Math.max(loaded.get(p.line) ?? rest, loaded.get(p.line + 1) ?? rest);
  };
}

const keyOf = (units: Unit[], f: (u: Unit) => number) => units.map(f).join(',');

/**
 * CIRSOC 101 §4.3.3, the spans each side of each interior grid line loaded, then every other one
 * (see the header). `units` are the ones carrying the load.
 */
export function adjacentSpanPatterns(spans: Spans, units: Unit[]): SpanPattern[] {
  const out: SpanPattern[] = [];
  const seen = new Set<string>([keyOf(units, () => 1)]);
  for (const axis of ['x', 'y'] as const) {
    const S = usedSpans(spans, units, axis);
    for (let j = 0; j + 1 < S.length; j++) {
      const loaded = new Map<number, number>();
      for (let k = 0; k < S.length; k++) {
        const on = k === j || k === j + 1 || (k < j && (j - k) % 2 === 0) || (k > j + 1 && (k - j - 1) % 2 === 0);
        if (on) loaded.set(S[k]!, 1);
      }
      const factor = factorFor(spans, axis, loaded, 0);
      const key = keyOf(units, factor);
      if (seen.has(key)) continue;
      seen.add(key);
      // The line between span j and span j + 1 is the one closing span j.
      out.push({ axis, at: spans.lines[axis][S[j]!] ?? spans.lines[axis][spans.lines[axis].length - 1], factor });
    }
  }
  return out;
}

/**
 * CIRSOC 104 §5.1, the partial snow loads of a continuous system (see the header), as factors of
 * the balanced snow. `skip` names an axis whose spans are exempt.
 */
export function partialSnowPatterns(spans: Spans, units: Unit[], skip?: Axis): SpanPattern[] {
  const out: SpanPattern[] = [];
  const seen = new Set<string>([keyOf(units, () => 1), keyOf(units, () => 0.5)]);
  for (const axis of ['x', 'y'] as const) {
    if (axis === skip) continue;
    const S = usedSpans(spans, units, axis);
    const n = S.length;
    if (n < 3) continue;
    const sets: Array<{ c: 1 | 2 | 3; full: number[] }> = [
      { c: 1, full: [S[0]!, S[n - 1]!] },
      { c: 2, full: S.slice(1, n - 1) },
      ...S.slice(0, n - 1).map((s, j) => ({ c: 3 as const, full: [s, S[j + 1]!] })),
    ];
    for (const { c, full } of sets) {
      const loaded = new Map(full.map((s) => [s, 1]));
      const factor = factorFor(spans, axis, loaded, 0.5);
      const key = keyOf(units, factor);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ axis, snowCase: c, at: c === 3 ? spans.lines[axis][full[0]!] : undefined, factor });
    }
  }
  return out;
}
