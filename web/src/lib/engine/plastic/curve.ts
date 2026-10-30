/**
 * The λ–displacement (or rotation) curve of a plastic collapse: one point per
 * event, from the origin, straight between events (the structure is linear
 * between two hinges), and a plateau after the last one when it is a mechanism.
 */
import type { PlasticCollapseResult } from '../plastic-collapse';

export type CurveAxis = { kind: 'node'; node: number; dof: 'ux' | 'uz' | 'ry' } | { kind: 'hinge'; hinge: number };
export interface CurvePoint { step: number; lambda: number; x: number }

export function curveSeries(r: Pick<PlasticCollapseResult, 'steps'>, axis: CurveAxis): CurvePoint[] {
  const out: CurvePoint[] = [{ step: 0, lambda: 0, x: 0 }];
  r.steps.forEach((s, i) => {
    let x = 0;
    if (axis.kind === 'node') {
      const d = s.results.displacements.find((v) => v.nodeId === axis.node);
      x = d ? d[axis.dof] : 0;
    } else {
      x = s.rotations[axis.hinge] ?? 0;
    }
    out.push({ step: i + 1, lambda: s.loadFactor, x });
  });
  return out;
}

/** The node and component that move most at collapse: the default abscissa (the first hinge's rotation when no node moves). */
export function defaultAxis(r: Pick<PlasticCollapseResult, 'steps' | 'hinges'>): CurveAxis | null {
  const last = r.steps[r.steps.length - 1];
  if (!last) return null;
  let best: CurveAxis | null = null, big = -1;
  for (const d of last.results.displacements) {
    for (const dof of ['uz', 'ux'] as const) {
      if (Math.abs(d[dof]) > big * (1 + 1e-9)) { big = Math.abs(d[dof]); best = { kind: 'node', node: d.nodeId, dof }; }
    }
  }
  if (big <= 1e-12) {
    const h = r.hinges.findIndex((x) => x.kind === 'bending');
    if (h >= 0) return { kind: 'hinge', hinge: h };
  }
  return best;
}

/** Round tick values from at or below lo to at or above hi. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const first = Math.floor(lo / step + 1e-9), last = Math.ceil(hi / step - 1e-9);
  const out: number[] = [];
  for (let k = first; k <= last; k++) out.push(Math.abs(k * step) < 1e-12 * step ? 0 : k * step);
  return out;
}

export function curveCsv(points: CurvePoint[], xHeader: string, scale = 1): string {
  return [`step,lambda,${xHeader}`, ...points.map((p) => `${p.step},${p.lambda},${p.x * scale}`)].join('\n');
}
