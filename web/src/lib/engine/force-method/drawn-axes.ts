/**
 * The flexibility-method answer, for display, in the drawn local axes.
 *
 * The method works in the solver's plane convention (a bar's transverse axis
 * is x turned 90° counter-clockwise) and checks itself against the stiffness
 * solution in that convention. What the wizard shows is converted, like every
 * other plane result in the app (transverse-sign-2d.ts): on a bar whose drawn
 * z is the opposite side, V, M and the diagram samples change sign and the
 * sketches draw toward the drawn z. The flexibility coefficients are integrals
 * of products of two diagrams, so they do not change.
 */
import type { ForceMethodResult, StateResult, Geometry } from './result-types';
import { transverseSign } from '../transverse-sign-2d';

export function forceMethodToDrawnAxes(r: ForceMethodResult): ForceMethodResult {
  if (r.is3D) return r;
  const sign = new Map<number, 1 | -1>();
  for (const e of r.original.elements) {
    const a = r.original.nodes.find((n) => n.id === e.nodeI), b = r.original.nodes.find((n) => n.id === e.nodeJ);
    if (a && b) sign.set(e.id, transverseSign(b.x - a.x, b.z - a.z));
  }
  if (![...sign.values()].some((s) => s < 0)) return r;
  const s = (id: number) => sign.get(id) ?? 1;
  const state = (st: StateResult): StateResult => ({
    ...st,
    bars: st.bars.map((b) => (s(b.elementId) > 0 ? b : {
      ...b,
      ends: { ...b.ends, vStart: -b.ends.vStart, vEnd: -b.ends.vEnd, mStart: -b.ends.mStart, mEnd: -b.ends.mEnd },
      samples: b.samples.map((p) => ({ ...p, m: -p.m })),
    })),
  });
  const geometry = (g: Geometry): Geometry => ({
    ...g,
    elements: g.elements.map((e) => {
      const a = g.nodes.find((n) => n.id === e.nodeI), b = g.nodes.find((n) => n.id === e.nodeJ);
      if (!a || !b || e.ey) return e;
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      const k = transverseSign(dx, dz) / L;
      return { ...e, ey: [-dz * k, 0, dx * k] as [number, number, number] };
    }),
  });
  return {
    ...r,
    original: geometry(r.original),
    primary: geometry(r.primary),
    states: r.states.map(state),
    final: state(r.final),
    stiffness: state(r.stiffness),
  };
}
