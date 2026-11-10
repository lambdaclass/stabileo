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
    if (m.truss) return { at: (t) => [di.ux + t * (dj.ux - di.ux), di.uz + t * (dj.uz - di.uz)], breaks: [] };
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

export function isEmpty(d: Diagram): boolean {
  return peak(sampleDiagram(d)) < 1e-9;
}
