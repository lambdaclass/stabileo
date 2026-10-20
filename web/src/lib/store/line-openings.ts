/**
 * The web openings of a beam line's members, placed along the line: each opening's entry and
 * check (`openingChecks`) at its position on the line and its depth as a share of the member's.
 *
 * A line member can stand for a design span of several model bars (`DesignSpan`): an opening is
 * saved on the bar it falls on, at its position from that bar's i node, and read back through the
 * span's pieces.
 */
import type { OpeningCheck } from './special-elements';
import type { BeamLineReinforcement } from '../design-contract/beam-line';

export interface LineOpening {
  entry: OpeningCheck['entry'];
  status: OpeningCheck['status'];
  /** Centre along the line, m, and its two ends. */
  lineX: number; from: number; to: number;
  /** Height and centre offset (up from mid-depth) as shares of the member's depth. */
  hShare: number; offShare: number;
  /** The largest ratio among its checks, and the clauses that fail. */
  worst: number; failing: string[];
}

/** A line member's pieces when it stands for a span; absent, the member is one bar. */
export type SpanPieces = (memberId: number) => { elements: readonly number[]; reversed: readonly boolean[]; lengths: readonly number[]; offsets: readonly number[] } | undefined;

type Line = Pick<BeamLineReinforcement, 'members' | 'lengths'>;

const offsetsOf = (line: Line) => {
  const offs: number[] = [];
  line.lengths.forEach((_, i) => offs.push(i === 0 ? 0 : offs[i - 1]! + line.lengths[i - 1]!));
  return offs;
};

/** Where a bar's own position x (from its i node) falls on the line, m; null when the bar is not on it. */
export function lineXOf(line: Line, forward: readonly boolean[], spanOf: SpanPieces, elementId: number, x: number): number | null {
  const offs = offsetsOf(line);
  for (let k = 0; k < line.members.length; k++) {
    const L = line.lengths[k]!, sp = spanOf(line.members[k]!);
    let along: number | null = null;
    if (sp) {
      const p = sp.elements.indexOf(elementId);
      if (p >= 0) along = sp.reversed[p] ? sp.offsets[p]! + sp.lengths[p]! - x : sp.offsets[p]! + x;
    } else if (line.members[k] === elementId) along = x;
    if (along !== null) return offs[k]! + (forward[k] !== false ? along : L - along);
  }
  return null;
}

export function lineOpenings(
  checks: readonly OpeningCheck[], line: Line, forward: readonly boolean[],
  depthOf: (elementId: number) => number | undefined, spanOf: SpanPieces = () => undefined,
): LineOpening[] {
  const out: LineOpening[] = [];
  for (const c of checks) {
    const lineX = lineXOf(line, forward, spanOf, c.entry.elementId, c.entry.x);
    if (lineX === null) continue;
    const h = depthOf(c.entry.elementId) ?? 0;
    out.push({
      entry: c.entry, status: c.status, lineX, from: lineX - c.entry.lo / 2, to: lineX + c.entry.lo / 2,
      hShare: h > 0 ? Math.min(1, c.entry.ho / h) : 0, offShare: h > 0 ? (c.entry.offset ?? 0) / h : 0,
      worst: Math.max(0, ...c.rows.map((r) => (typeof r.ratio === 'number' && Number.isFinite(r.ratio) ? r.ratio : 0))),
      failing: c.rows.filter((r) => r.status === 'fail').map((r) => r.clause ?? r.title),
    });
  }
  return out.sort((p, q) => p.lineX - q.lineX);
}

/** The model bar and its own position (from its i node) at a point of the line. */
export function memberAtLine(line: Line, forward: readonly boolean[], x: number, spanOf: SpanPieces = () => undefined): { elementId: number; x: number } | null {
  const offs = offsetsOf(line);
  for (let k = 0; k < line.members.length; k++) {
    const L = line.lengths[k]!, a = offs[k]!;
    if (x < a - 1e-9 || x > a + L + 1e-9) continue;
    const along = forward[k] !== false ? x - a : a + L - x;
    const sp = spanOf(line.members[k]!);
    if (!sp) return { elementId: line.members[k]!, x: along };
    for (let p = 0; p < sp.elements.length; p++) {
      const o = sp.offsets[p]!, l = sp.lengths[p]!;
      if (along >= o - 1e-9 && along <= o + l + 1e-9) return { elementId: sp.elements[p]!, x: sp.reversed[p] ? o + l - along : along - o };
    }
    return null;
  }
  return null;
}
