/**
 * A saved beam line's bars as the detailing lays them, member by member, exactly as drawn.
 *
 * ── What it replaces ───────────────────────────────────────────────
 *
 * The frame editor draws bars along a line: where each starts and ends, its face, row, count,
 * diameter and hooks, and the laps a person cuts or overlaps. The detailing used to receive only
 * the members' three regions and five cut points (`memberCuts`), lay its own bars from them, and
 * let the splice planner decide again where the bars met: a lap drawn mid-span vanished, a second
 * curtailment group fell back to one, an extra bar between two arbitrary points could not be said.
 *
 * Here each bar of the line becomes one piece per member it crosses, in the member's own sense:
 * - an end inside a member is `cut` there (hooked if the bar is);
 * - an end on a node where the bar stops is `support`: anchored in that support, by the plan the
 *   design verified, whether or not the line continues (no lap takes it);
 * - an end on a node the bar runs through is `continue`: the pieces either side are one bar, and
 *   the lap materialiser fuses them (`lap-materialize.ts`).
 * Laps are where two bars of one face and row overlap. They are measured on the LINE, where the
 * whole overlap is, against the splice length the bar needs (`lineLaps`), and every pair of bars
 * lapping inside a member is declared to the collision check as intended (`DrawnLap`).
 *
 * Pure: no store, no runes.
 */
import type { BeamLineBar, BeamLineReinforcement, BeamStirrupZone } from '../../design-contract/beam-line';
import { lineLaps, type LineLap } from '../design/beam-line';

export { lineLaps };

const EPS = 1e-6;

export type LineBarEnd = 'support' | 'continue' | 'cut';

export interface LineBarPiece {
  /** The line bar's own id: the bar's identity, kept across regenerations while the line stands. */
  lineBarId: string;
  face: 'top' | 'bottom';
  row: number;
  count: number;
  diameterMm: number;
  /** Along the member from its i node, m. */
  from: number;
  to: number;
  start: LineBarEnd;
  end: LineBarEnd;
  hookStart?: boolean;
  hookEnd?: boolean;
  /** The line bars this one laps with inside the member, by id. */
  lapsWith: string[];
  /**
   * Where across its row the bar stands, chosen once on the whole line so a bar running through
   * a node stands at the same place in both members (`linePlaces`): the row's positions, outer
   * first, the indices this bar takes, and, for the second bar of a lap, how far beside them it
   * stands in contact (mm, toward the middle). `mirrored` when the member runs against the line.
   */
  place?: { seats: number; slots: number[]; besideMm?: number; mirrored?: boolean };
}

export interface LineStirrupPiece { from: number; to: number; diameter: number; legs: number; spacing: number }

export type { LineLap };

/** The pieces of a line's bars and stirrups in each of its members, in each member's own sense. */
export function linePieces(
  line: BeamLineReinforcement, forward: readonly boolean[],
): Map<number, { bars: LineBarPiece[]; stirrups: LineStirrupPiece[] }> {
  const X: number[] = [];
  line.lengths.forEach((_, i) => X.push(i === 0 ? 0 : X[i - 1]! + line.lengths[i - 1]!));
  const laps = lineLaps(line);
  const places = linePlaces(line, laps);
  const out = new Map<number, { bars: LineBarPiece[]; stirrups: LineStirrupPiece[] }>();
  line.members.forEach((id, k) => {
    const a = X[k]!, L = line.lengths[k]!, b = a + L, fwd = forward[k] !== false;
    const bars: LineBarPiece[] = [];
    for (const bar of line.bars) {
      const s = Math.max(a, bar.from), e = Math.min(b, bar.to);
      if (e - s < EPS) continue;
      // An end on a node inside a lap of this bar is part of the lap, made where it was drawn: not
      // an anchorage in the support (the bar it laps with carries the force through the node).
      const inLap = (x: number) => laps.some((l) => (l.a === bar.id || l.b === bar.id) && l.from <= x + EPS && l.to >= x - EPS && l.to - l.from > EPS);
      const startKind: LineBarEnd = s > a + EPS ? 'cut' : bar.from < a - EPS ? 'continue' : inLap(a) ? 'cut' : 'support';
      const endKind: LineBarEnd = e < b - EPS ? 'cut' : bar.to > b + EPS ? 'continue' : inLap(b) ? 'cut' : 'support';
      const lapsWith = laps.filter((l) => (l.a === bar.id || l.b === bar.id) && l.to > a + EPS && l.from < b - EPS).map((l) => (l.a === bar.id ? l.b : l.a));
      const piece: LineBarPiece = {
        lineBarId: bar.id, face: bar.face, row: bar.row, count: bar.count, diameterMm: bar.diameter,
        from: s - a, to: e - a, start: startKind, end: endKind,
        ...(startKind !== 'continue' && bar.hookStart ? { hookStart: true } : {}),
        ...(endKind !== 'continue' && bar.hookEnd ? { hookEnd: true } : {}),
        lapsWith,
        ...(places.get(bar.id) ? { place: { ...places.get(bar.id)!, ...(fwd ? {} : { mirrored: true }) } } : {}),
      };
      bars.push(fwd ? piece : mirrorPiece(piece, L));
    }
    const stirrups: LineStirrupPiece[] = [];
    for (const z of line.stirrups) {
      const s = Math.max(a, z.from), e = Math.min(b, z.to);
      if (e - s < EPS) continue;
      const p = { from: s - a, to: e - a, diameter: z.diameter, legs: z.legs, spacing: z.spacing };
      stirrups.push(fwd ? p : { ...p, from: L - p.to, to: L - p.from });
    }
    out.set(id, { bars, stirrups: stirrups.sort((p, q) => p.from - q.from) });
  });
  return out;
}

/**
 * Each bar's place across its row, chosen on the whole line. Bars are seated longest first, so the
 * bars that run the line take the outer positions (the stirrup's bends) and the shorter ones the
 * positions between; a bar takes the first positions no bar overlapping it along the line holds.
 * The second bar of a lap stands in contact beside the first (§25.5.1.2) and takes no position of
 * its own; a third bar lapping that one goes back to the first's positions.
 */
function linePlaces(line: BeamLineReinforcement, laps: readonly LineLap[]): Map<string, { seats: number; slots: number[]; besideMm?: number }> {
  const out = new Map<string, { seats: number; slots: number[]; besideMm?: number }>();
  const overlaps = (p: BeamLineBar, q: BeamLineBar) => p.to > q.from + EPS && p.from < q.to - EPS;
  const lapped = (p: BeamLineBar, q: BeamLineBar) => laps.some((l) => (l.a === p.id && l.b === q.id) || (l.a === q.id && l.b === p.id));
  const keys = [...new Set(line.bars.map((b) => `${b.face}|${b.row}`))];
  for (const key of keys) {
    const row = line.bars.filter((b) => `${b.face}|${b.row}` === key)
      .sort((p, q) => (q.to - q.from) - (p.to - p.from) || p.from - q.from || p.id.localeCompare(q.id));
    const seated: Array<{ bar: BeamLineBar; slots: number[]; beside: boolean }> = [];
    for (const b of row) {
      const partner = seated.find((t) => lapped(b, t.bar) && overlaps(b, t.bar));
      if (partner) {
        seated.push({ bar: b, slots: partner.slots.slice(0, b.count), beside: !partner.beside });
        continue;
      }
      const busy = new Set(seated.filter((t) => overlaps(b, t.bar) && !t.beside).flatMap((t) => t.slots));
      const slots: number[] = [];
      for (let i = 0; slots.length < b.count; i++) if (!busy.has(i)) slots.push(i);
      seated.push({ bar: b, slots, beside: false });
    }
    const seats = Math.max(1, ...seated.flatMap((t) => t.slots.map((i) => i + 1)));
    for (const t of seated) {
      const partner = t.beside ? seated.find((o) => o !== t && lapped(t.bar, o.bar) && overlaps(t.bar, o.bar) && !o.beside) : undefined;
      out.set(t.bar.id, { seats, slots: t.slots, ...(partner ? { besideMm: (partner.bar.diameter + t.bar.diameter) / 2 } : {}) });
    }
  }
  return out;
}

function mirrorPiece(p: LineBarPiece, L: number): LineBarPiece {
  const { hookStart, hookEnd, ...rest } = p;
  return {
    ...rest, from: L - p.to, to: L - p.from, start: p.end, end: p.start,
    ...(hookEnd ? { hookStart: true } : {}), ...(hookStart ? { hookEnd: true } : {}),
  };
}

/** The stirrup zones of a line, as `BeamStirrupZone`s re-exported for callers that only read pieces. */
export type { BeamLineBar, BeamStirrupZone };

/**
 * A line's bars read from the bars the detailing laid along it: each longitudinal bar of its
 * members as one line bar, from where it starts to where it ends along the line (clipped to the
 * line's ends, where it runs on into a support), with its face and row from its layer, its
 * diameter and its hooks; equal bars (same face, row, diameter, ends and hooks) become one bar of
 * that many. Taking a beam's bars as drawn from this changes no bar the detailing laid: the
 * run-through pair §25.7.1.2 adds, the curtailment points and the laps at the joints come with it.
 *
 * `start` and `dir` are the line's first point and its unit direction; `length` its whole length.
 */
export function lineBarsFromDetailing(
  bars: ReadonlyArray<{
    id: string; role: string; diameterMm: number; layerId?: string; purpose?: string;
    segments: ReadonlyArray<{ start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }>;
    startTreatment: { kind: string }; endTreatment: { kind: string };
  }>,
  start: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, length: number,
): BeamLineBar[] {
  const along = (p: { x: number; y: number; z: number }) => (p.x - start.x) * dir.x + (p.y - start.y) * dir.y + (p.z - start.z) * dir.z;
  const rows: Array<Omit<BeamLineBar, 'id' | 'count'> & { key: string; n: number }> = [];
  for (const b of bars) {
    if (b.role !== 'longitudinal' || !b.layerId || b.segments.length === 0) continue;
    const [, faceRaw, layer] = b.layerId.split(':');
    const face: 'top' | 'bottom' = (faceRaw ?? '').startsWith('top') ? 'top' : 'bottom';
    const xs = b.segments.flatMap((s) => [along(s.start), along(s.end)]);
    const a0 = along(b.segments[0]!.start), a1 = along(b.segments[b.segments.length - 1]!.end);
    const forwardBar = a1 >= a0;
    const from = Math.max(0, Math.min(...xs)), to = Math.min(length, Math.max(...xs));
    if (to - from < 1e-3) continue;
    const hookAtLow = (forwardBar ? b.startTreatment : b.endTreatment).kind === 'hook';
    const hookAtHigh = (forwardBar ? b.endTreatment : b.startTreatment).kind === 'hook';
    const row = Number(layer) || 0;
    const role: BeamLineBar['role'] = b.purpose === 'stirrupHanger' ? 'mounting' : face === 'bottom' ? (from <= 1e-3 && to >= length - 1e-3 ? 'main' : 'extra') : 'support';
    const r3 = (v: number) => Math.round(v * 200) / 200;
    const key = `${face}|${row}|${b.diameterMm}|${r3(from)}|${r3(to)}|${hookAtLow}|${hookAtHigh}`;
    const same = rows.find((x) => x.key === key);
    if (same) { same.n += 1; continue; }
    rows.push({
      key, n: 1, face, row, diameter: b.diameterMm, from, to, role,
      ...(hookAtLow ? { hookStart: true } : {}), ...(hookAtHigh ? { hookEnd: true } : {}),
    });
  }
  return rows
    .sort((p, q) => (p.face === q.face ? 0 : p.face === 'bottom' ? -1 : 1) || p.row - q.row || p.from - q.from || p.to - q.to)
    .map(({ key: _k, n, ...r }, i) => ({ ...r, id: `d${i + 1}`, count: n }));
}
