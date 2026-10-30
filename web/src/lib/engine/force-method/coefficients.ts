/**
 * The flexibility coefficients term by term: Mohr's integrals over the bars,
 * the springs as R̄ᵢ·R̄ⱼ/k, a removed biela's own L/EA, a released spring's
 * own 1/k, and in δᵢ₀ the temperature and the settlements.
 */
import type { SolverInput } from '../types';
import type { SolverElement } from '../types';
import { loadAlpha, loadDepth } from '../thermal-alpha';
import type { Redundant } from './primary';
import { internalAt, breakpoints, integrate, NO_LOADS, type BarLoads } from './internal';
import type { TermRow } from './result-types';
import type { Solved } from './state';
import { lenOf } from './state';
import { springRows } from './terms';

export interface Bar {
  e: SolverElement;
  L: number;
  EI: number;
  EA: number;
  loads: BarLoads;
  /** Axial force only: a truss bar, or a frame member hinged at both ends with nothing across it. */
  biela: boolean;
}

const endAt = (f: number[]) => ({ N: f[0], V: f[1], M: f[2] });

/** Σ ∫ over the bars of the product of two states' diagrams, and the springs of the primary. */
export function mohr(
  bars: Bar[], primary: SolverInput, a: Solved, la: (id: number) => BarLoads, b: Solved, lb: (id: number) => BarLoads,
): TermRow[] {
  const rows: TermRow[] = [];
  for (const bar of bars) {
    const fa = a.forces(bar.e.id);
    const fb = b.forces(bar.e.id);
    if (!fa || !fb) continue;
    const A = la(bar.e.id);
    const B = lb(bar.e.id);
    const pts = breakpoints(bar.L, A, B);
    const ia = (x: number) => internalAt(endAt(fa), A, x);
    const ib = (x: number) => internalAt(endAt(fb), B, x);
    const axial = integrate(pts, (x) => ia(x).n * ib(x).n) / bar.EA;
    if (bar.e.type === 'frame') rows.push({ elementId: bar.e.id, source: 'bending', value: integrate(pts, (x) => ia(x).m * ib(x).m) / bar.EI });
    rows.push({
      elementId: bar.e.id, source: 'axial', value: axial,
      ...(bar.biela ? { detail: { biela: true, a: ia(bar.L / 2).n, b: ib(bar.L / 2).n, L: bar.L, EA: bar.EA } } : {}),
    });
  }
  for (const sup of primary.supports.values()) {
    if (sup.type === 'spring') rows.push(...springRows(sup, a.disp, b.disp));
  }
  return rows;
}

/** A redundant's own term in δᵢᵢ: the removed biela stretching under its unit force, or the released spring. */
export function selfTerm(input: SolverInput, r: Redundant): TermRow | null {
  if (r.kind === 'barForce') {
    const e = input.elements.get(r.elementId!)!;
    const sec = input.sections.get(e.sectionId)!;
    const mat = input.materials.get(e.materialId)!;
    const L = lenOf(input, e.nodeI, e.nodeJ);
    const EA = mat.e * 1000 * sec.a;
    return { elementId: e.id, source: 'bar', value: L / EA, detail: { biela: true, a: 1, b: 1, L, EA } };
  }
  if (r.kind === 'spring') {
    const sup = [...input.supports.values()].find((s) => s.nodeId === r.nodeId)!;
    const k = [sup.kx, sup.ky, sup.kz][r.component ?? 0] ?? 0;
    return { elementId: null, source: 'spring', value: 1 / k, detail: { nodeId: r.nodeId, component: r.component, a: 1, b: 1, k, released: true } };
  }
  return null;
}

/** The free thermal strain α·ΔT and curvature α·ΔTg/h of a bar, with each load's own α and depth. */
export function thermalOf(input: SolverInput, elementId: number) {
  let epsU = 0, kapG = 0;
  const e = input.elements.get(elementId);
  const sec = e && input.sections.get(e.sectionId);
  for (const l of input.loads) {
    if (l.type === 'thermal' && l.data.elementId === elementId) {
      const alpha = loadAlpha(l.data);
      epsU += alpha * l.data.dtUniform;
      if (l.data.dtGradient && sec) kapG += (alpha * l.data.dtGradient) / loadDepth(l.data.depth, sec.a, sec.iz);
    }
  }
  return { epsU, kapG };
}

/** The rows of δᵢ₀ beyond Mohr's: temperature on every bar, on a removed biela, and the settlements that stay. */
export function loadExtras(input: SolverInput, primary: SolverInput, bars: Bar[], unit: Solved, r: Redundant): TermRow[] {
  const rows: TermRow[] = [];
  for (const bar of bars) {
    const { epsU, kapG } = thermalOf(input, bar.e.id);
    if (!epsU && !kapG) continue;
    const f = unit.forces(bar.e.id)!;
    let v = 0;
    if (epsU) v += (-f[0]) * epsU * bar.L;
    /* A hotter top face curves the bar against a positive m in the diagrams' sign, hence the minus. */
    if (kapG && bar.e.type === 'frame') v += integrate([0, bar.L], (x) => internalAt(endAt(f), NO_LOADS, x).m) * -kapG;
    rows.push({ elementId: bar.e.id, source: 'thermal', value: v });
  }
  if (r.kind === 'barForce') {
    const { epsU } = thermalOf(input, r.elementId!);
    if (epsU) {
      const e = input.elements.get(r.elementId!)!;
      rows.push({ elementId: e.id, source: 'thermal', value: epsU * lenOf(input, e.nodeI, e.nodeJ) });
    }
  }
  let settle = 0;
  for (const sup of primary.supports.values()) {
    if (sup.type === 'spring') continue;
    [sup.dx, sup.dz, sup.dry].forEach((d, c) => {
      if (!d) return;
      const R = unit.reactions.find((q) => q.nodeId === sup.nodeId && q.component === c);
      if (R) settle -= R.value * d;
    });
  }
  if (settle) rows.push({ elementId: null, source: 'settlement', value: settle });
  return rows;
}
