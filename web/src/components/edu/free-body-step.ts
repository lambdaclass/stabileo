import type { ElementForces } from '../../lib/engine/types';
import { tp } from '../../lib/i18n';
import { TOLERANCE } from './exercise-marking';
import type { ModelSpec, ResolvedExerciseSpec } from './exercise-spec';

export type BarEnd = 'i' | 'j';
export type EndDof = 'Fx' | 'Fy' | 'M';
export const END_DOFS: EndDof[] = ['Fx', 'Fy', 'M'];
export const BAR_ENDS: BarEnd[] = ['i', 'j'];

export interface FreeBodyBar {
  /** Element indices from end i to end j, each with whether it runs that way. */
  elements: Array<{ index: number; forward: boolean }>;
  /** Node indices along the bar, from end i to end j. */
  nodes: number[];
}

export type EndAction = Record<EndDof, number>;
export type BarTruth = Record<BarEnd, EndAction>;

const COLLINEAR = 1e-6;

function hingedAt(model: ModelSpec, element: number, node: number): boolean {
  const [i, j] = model.elements[element]!;
  return (model.hinges ?? []).some((h) => h.element === element && (h.end === 'start' ? i : j) === node);
}

function passesThrough(model: ModelSpec, node: number, incident: number[]): boolean {
  if (incident.length !== 2) return false;
  const [a, b] = incident as [number, number];
  if (hingedAt(model, a, node) || hingedAt(model, b, node)) return false;
  const away = (k: number) => {
    const [i, j] = model.elements[k]!;
    const [ox, oy] = model.nodes[node]!, [fx, fy] = model.nodes[i === node ? j : i]!;
    const len = Math.hypot(fx - ox, fy - oy) || 1;
    return [(fx - ox) / len, (fy - oy) / len] as const;
  };
  const [ax, ay] = away(a), [bx, by] = away(b);
  return Math.abs(ax * by - ay * bx) < COLLINEAR && ax * bx + ay * by < 0;
}

/**
 * The physical bars a free-body step asks about: elements joined end to end in a straight line, with no
 * hinge and no third member between them, count as one bar whatever supports or loads sit on the joint.
 * Empty when the structure has fewer than two bars, or has truss members.
 */
export function freeBodyBars(model: ModelSpec): FreeBodyBar[] {
  if ((model.truss ?? []).length > 0) return [];
  const incident = model.nodes.map(() => [] as number[]);
  model.elements.forEach(([i, j], k) => { incident[i]?.push(k); incident[j]?.push(k); });
  const seen = new Set<number>();
  const bars: FreeBodyBar[] = [];
  for (let start = 0; start < model.elements.length; start++) {
    if (seen.has(start)) continue;
    seen.add(start);
    const [si, sj] = model.elements[start]!;
    const nodes = [si, sj];
    const elements = [{ index: start, forward: true }];
    const grow = (atEnd: boolean) => {
      for (;;) {
        const node = atEnd ? nodes[nodes.length - 1]! : nodes[0]!;
        if (!passesThrough(model, node, incident[node]!)) return;
        const next = incident[node]!.find((k) => !seen.has(k));
        if (next === undefined) return;
        seen.add(next);
        const [ni, nj] = model.elements[next]!;
        const far = ni === node ? nj : ni;
        if (atEnd) { nodes.push(far); elements.push({ index: next, forward: ni === node }); }
        else { nodes.unshift(far); elements.unshift({ index: next, forward: nj === node }); }
      }
    };
    grow(true);
    grow(false);
    const [ax, ay] = model.nodes[nodes[0]!]!, [bx, by] = model.nodes[nodes[nodes.length - 1]!]!;
    const backwards = bx < ax - COLLINEAR || (Math.abs(bx - ax) <= COLLINEAR && by < ay);
    bars.push(backwards
      ? { nodes: [...nodes].reverse(), elements: [...elements].reverse().map((e) => ({ index: e.index, forward: !e.forward })) }
      : { elements, nodes });
  }
  return bars.length >= 2 ? bars : [];
}

/** The bars an exercise asks about, or none when it has fewer than two or its author turned the step off. */
export function exerciseBars(ex: Pick<ResolvedExerciseSpec, 'model' | 'freeBody'>): FreeBodyBar[] {
  return ex.freeBody === false ? [] : freeBodyBars(ex.model);
}

/** The end of the bar's element that sits at bar end `end`, as the engine names element ends. */
export function endElement(bar: FreeBodyBar, end: BarEnd): { index: number; at: 'I' | 'J'; node: number } {
  const e = end === 'i' ? bar.elements[0]! : bar.elements[bar.elements.length - 1]!;
  const atStart = end === 'i' ? e.forward : !e.forward;
  return { index: e.index, at: atStart ? 'I' : 'J', node: end === 'i' ? bar.nodes[0]! : bar.nodes[bar.nodes.length - 1]! };
}

const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

/**
 * What the joint exerts on the bar at each end, cut just inside the bar: Fx to the right, Fy upward and
 * M clockwise positive, the signs the reactions step grades. Null until the solve has the forces.
 */
export function freeBodyTruth(model: ModelSpec, bars: FreeBodyBar[], forces: ElementForces[] | null | undefined): BarTruth[] | null {
  if (!forces) return null;
  const out: BarTruth[] = [];
  for (const bar of bars) {
    const truth = {} as BarTruth;
    for (const end of BAR_ENDS) {
      const { index, at } = endElement(bar, end);
      const f = forces[index];
      if (!f) return null;
      const [i, j] = model.elements[index]!;
      const [xi, yi] = model.nodes[i]!, [xj, yj] = model.nodes[j]!;
      const len = Math.hypot(xj - xi, yj - yi) || 1;
      const ux = (xj - xi) / len, uy = (yj - yi) / len;
      const s = at === 'I' ? 1 : -1;
      const [n, v, m] = at === 'I' ? [f.nStart, f.vStart, f.mStart] : [f.nEnd, f.vEnd, f.mEnd];
      truth[end] = { Fx: clean(s * (-ux * n - uy * v)), Fy: clean(s * (-uy * n + ux * v)), M: clean(-s * m) };
    }
    out.push(truth);
  }
  return out;
}

export const freeBodyKey = (bar: number, end: BarEnd, dof: EndDof) => `fb:${bar}:${end}:${dof}`;

export function freeBodyKeys(bars: FreeBodyBar[]): string[] {
  return bars.flatMap((_, b) => BAR_ENDS.flatMap((end) => END_DOFS.map((dof) => freeBodyKey(b, end, dof))));
}

export function parseFreeBodyKey(key: string): { bar: number; end: BarEnd; dof: EndDof } | null {
  const [kind, b, end, dof] = key.split(':');
  if (kind !== 'fb' || (end !== 'i' && end !== 'j') || !END_DOFS.includes(dof as EndDof)) return null;
  const bar = Number(b);
  return Number.isInteger(bar) && bar >= 0 ? { bar, end, dof: dof as EndDof } : null;
}

export function barName(bar: FreeBodyBar, index: number): string {
  return tp('edu.fb.bar', { n: index + 1, a: bar.nodes[0]! + 1, b: bar.nodes[bar.nodes.length - 1]! + 1 });
}

export function freeBodyLabel(bars: FreeBodyBar[], key: string): string {
  const k = parseFreeBodyKey(key);
  const bar = k && bars[k.bar];
  if (!k || !bar) return key;
  return `${barName(bar, k.bar)} — ${tp('edu.fb.node', { n: endElement(bar, k.end).node + 1 })} — ${k.dof}`;
}

export const freeBodyUnit = (dof: EndDof) => (dof === 'M' ? 'kN·m' : 'kN');

/**
 * Whether the student's own diagram of one bar is in equilibrium. The true end actions balance the bar's
 * loads, so the student's balance is their difference from the truth, summed: no load needs redrawing.
 */
export function studentBalanced(model: ModelSpec, bar: FreeBodyBar, student: Record<BarEnd, EndAction>, truth: BarTruth): boolean {
  const [ox, oy] = model.nodes[bar.nodes[0]!]!;
  let fx = 0, fy = 0, m = 0, scaleF = 0, scaleM = 0;
  for (const end of BAR_ENDS) {
    const [x, y] = model.nodes[endElement(bar, end).node]!;
    const dx = student[end].Fx - truth[end].Fx, dy = student[end].Fy - truth[end].Fy;
    fx += dx; fy += dy;
    m += truth[end].M - student[end].M + (x - ox) * dy - (y - oy) * dx;
    scaleF = Math.max(scaleF, Math.abs(truth[end].Fx), Math.abs(truth[end].Fy));
    scaleM = Math.max(scaleM, Math.abs(truth[end].M), scaleF * Math.hypot(x - ox, y - oy));
  }
  const tol = (scale: number) => TOLERANCE * scale + 0.1;
  return Math.abs(fx) <= tol(scaleF) && Math.abs(fy) <= tol(scaleF) && Math.abs(m) <= tol(scaleM);
}
