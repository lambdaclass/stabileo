import { computeDiagramValueAt, computeDisplacementAt } from '../../lib/engine/diagrams';
import type { ElementForces } from '../../lib/engine/types';
import { EI, memberLength, memberSign, type GameModel, type Solved } from './game-model';

export type DiagramKind = 'N' | 'V' | 'M' | 'D';
export type Vec = [number, number];

/**
 * One member's curve as offsets from its axis, in global coordinates: the ordinate times the
 * solver's transverse normal for N, V and M (so M lands on the tension side), the displacement for D.
 */
export interface Trace {
  at: (t: number) => Vec;
  /** Positions (0..1) where the curve may jump or kink, sampled on both sides when drawn. */
  breaks: number[];
}

export interface Diagram {
  kind: DiagramKind;
  traces: Trace[];
  /** Set when the curve is another diagram of the structure drawn as if it were `kind`. */
  from?: DiagramKind;
}

const FORCE = { N: 'axial', V: 'shear', M: 'moment' } as const;

export function memberAxis(m: GameModel, e: number): { start: Vec; end: Vec; dir: Vec; normal: Vec; length: number } {
  const [i, j] = m.elements[e]!;
  const start = m.nodes[i]! as Vec, end = m.nodes[j]! as Vec;
  const length = memberLength(m, e);
  const dir: Vec = [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
  return { start, end, dir, normal: [-dir[1], dir[0]], length };
}

function loadBreaks(m: GameModel, e: number): number[] {
  const L = memberLength(m, e);
  return (m.pointLoads ?? []).filter((l) => l.element === e).map((l) => l.a / L).filter((t) => t > 1e-6 && t < 1 - 1e-6);
}

export function forceValue(kind: 'N' | 'V' | 'M', ef: ElementForces, t: number): number {
  return computeDiagramValueAt(FORCE[kind], Math.min(1, Math.max(0, t)), ef);
}

export function diagramOf(s: Solved, kind: DiagramKind): Diagram {
  const m = s.model;
  const traces = m.elements.map((_, e): Trace => {
    const ef = s.forces[e]!;
    const { normal, start, end, length } = memberAxis(m, e);
    const breaks = loadBreaks(m, e);
    if (kind !== 'D') {
      const k = kind;
      return { at: (t) => { const v = forceValue(k, ef, t); return [v * normal[0], v * normal[1]]; }, breaks };
    }
    const [i, j] = m.elements[e]!;
    const di = s.displacements[i]!, dj = s.displacements[j]!;
    if (m.allTruss) return { at: (t) => [di.ux + t * (dj.ux - di.ux), di.uz + t * (dj.uz - di.uz)], breaks: [] };
    const points = ef.pointLoads.map((p) => ({ a: p.a, p: p.p }));
    return {
      at: (t) => {
        const u = computeDisplacementAt(Math.min(1, Math.max(0, t)), start[0], start[1], end[0], end[1], di.ux, di.uz, di.ry, dj.ux, dj.uz, dj.ry,
          length, ef.hingeStart, ef.hingeEnd, EI, ef.qI, ef.qJ, points, ef.distributedLoads);
        return [u.ux, u.uz];
      },
      breaks,
    };
  });
  return { kind, traces };
}

/** Signed ordinate in the drawn axes (the one a student reads a + or − from). */
export function drawnOrdinate(m: GameModel, e: number, offset: Vec, kind: DiagramKind): number {
  const { normal } = memberAxis(m, e);
  const v = offset[0] * normal[0] + offset[1] * normal[1];
  return kind === 'V' ? memberSign(m, e) * v : v;
}

export const GRID = 16;

/** Stations between breaks, never on one, so a jump is compared on its two sides consistently. */
export function gridStations(): number[] {
  return Array.from({ length: GRID }, (_, i) => (i + 0.5) / GRID);
}

export function sampleDiagram(d: Diagram): Vec[] {
  const ts = gridStations();
  return d.traces.flatMap((tr) => ts.map((t) => tr.at(t)));
}

export function peak(samples: Vec[]): number {
  return samples.reduce((a, [x, y]) => Math.max(a, Math.hypot(x, y)), 0);
}

/** RMS distance between two diagrams, each scaled to its own peak: what differs on screen, where every card is drawn to the same size. */
export function shapeDistance(a: Diagram, b: Diagram): number {
  const sa = sampleDiagram(a), sb = sampleDiagram(b);
  const pa = peak(sa), pb = peak(sb);
  if (pa < 1e-12 || pb < 1e-12) return pa < 1e-12 && pb < 1e-12 ? 0 : 1;
  let sum = 0;
  for (let k = 0; k < sa.length; k++) {
    const dx = sa[k]![0] / pa - sb[k]![0] / pb, dy = sa[k]![1] / pa - sb[k]![1] / pb;
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / sa.length);
}

/** The next member along a straight run: it starts where `e` ends and keeps its direction. -1 when there is none. */
export function chainNeighbour(m: GameModel, e: number): number {
  const [, j] = m.elements[e]!;
  const { dir } = memberAxis(m, e);
  return m.elements.findIndex(([i2], e2) => {
    if (e2 === e || i2 !== j) return false;
    const d2 = memberAxis(m, e2).dir;
    return Math.abs(dir[0] * d2[0] + dir[1] * d2[1] - 1) < 1e-6;
  });
}

/**
 * Members that share one sign choice. Textbooks disagree on which side a shear or moment is drawn, and in a
 * frame each straight run can carry its own convention; the deflected shape and a truss share a single one.
 */
export function signGroups(m: GameModel, kind: DiagramKind): number[] {
  if (kind === 'D' || m.allTruss) return m.elements.map(() => 0);
  const group = m.elements.map((_, e) => e);
  const find = (e: number): number => (group[e] === e ? e : (group[e] = find(group[e]!)));
  m.elements.forEach((_, e) => {
    const n = chainNeighbour(m, e);
    if (n >= 0) group[find(n)] = find(e);
  });
  return m.elements.map((_, e) => find(e));
}

/** `shapeDistance` with every sign group free to flip: two options never differ only by a sign convention. */
export function apparentDistance(a: Diagram, b: Diagram, m: GameModel): number {
  return apparentGap(a, b, m).rms;
}

/**
 * How far apart two diagrams look, each scaled to its own peak and with every sign group flipped to match best:
 * the RMS gap, and the widest gap at any station, which is what an eye catches.
 */
export function apparentGap(a: Diagram, b: Diagram, m: GameModel): { rms: number; max: number } {
  const groups = signGroups(m, a.kind);
  const ts = gridStations();
  const sa = sampleDiagram(a), sb = sampleDiagram(b);
  const pa = peak(sa), pb = peak(sb);
  if (pa < 1e-12 || pb < 1e-12) return pa < 1e-12 && pb < 1e-12 ? { rms: 0, max: 0 } : { rms: 1, max: 1 };
  const acc = new Map<number, { same: number; flipped: number; maxSame: number; maxFlipped: number }>();
  for (let k = 0; k < sa.length; k++) {
    const g = groups[Math.floor(k / ts.length)]!;
    const ax = sa[k]![0] / pa, ay = sa[k]![1] / pa, bx = sb[k]![0] / pb, by = sb[k]![1] / pb;
    const s2 = (ax - bx) ** 2 + (ay - by) ** 2, f2 = (ax + bx) ** 2 + (ay + by) ** 2;
    const r = acc.get(g) ?? { same: 0, flipped: 0, maxSame: 0, maxFlipped: 0 };
    r.same += s2; r.flipped += f2; r.maxSame = Math.max(r.maxSame, s2); r.maxFlipped = Math.max(r.maxFlipped, f2);
    acc.set(g, r);
  }
  let sum = 0, max = 0;
  for (const r of acc.values()) {
    const flip = r.flipped < r.same;
    sum += flip ? r.flipped : r.same;
    max = Math.max(max, flip ? r.maxFlipped : r.maxSame);
  }
  return { rms: Math.sqrt(sum / sa.length), max: Math.sqrt(max) };
}

export function negated(d: Diagram): Diagram {
  return { kind: d.kind, traces: d.traces.map((tr) => ({ breaks: tr.breaks, at: (t) => { const p = tr.at(t); return [-p[0], -p[1]]; } })) };
}

export function isEmpty(d: Diagram): boolean {
  return peak(sampleDiagram(d)) < 1e-9;
}
