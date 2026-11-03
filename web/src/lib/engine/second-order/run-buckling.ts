/**
 * The Basic mode's critical load: the engine's eigenproblem on the model cut into n elements
 * per member, or the teaching solver (stability functions, chord matrix, members that keep
 * their length). The modes are drawn on the cut model; each member's effective length factor
 * comes from the refined λ₁ and the most compressed of its pieces.
 */
import type { SolverInput } from '../types';
import type { BucklingResult, ElementBucklingData } from '../result-types';
import { tx, type Txt } from '../steps/doc';
import { solveBuckling } from '../wasm-solver';
import { teachingBuckling, firstOrderAxial, representsFirstMode } from './buckling';
import { buildSystem } from './system';
import { refineInput, refinedGeometry, type Refined } from './refine';
import { teachingOptions, usesEngine, type SoSettings } from './settings';

export interface BucklingInfo {
  settings: SoSettings;
  /** The cut model's geometry, when there were cuts: the modes live on its nodes. */
  geometry: ReturnType<typeof refinedGeometry> | null;
  /** The engine's factors on the same cut model, when this run is the teaching solver's. */
  engineFactors: number[] | null;
}

export type SoBucklingResult = BucklingResult & { secondOrder: BucklingInfo; discardedModes?: unknown[] };

/** Effective length factors per member of the model, from the factor and each piece's N. */
export function memberBucklingData(original: SolverInput, r: Refined, pieceN: Map<number, number>, lambda1: number, noise?: Map<number, number>): ElementBucklingData[] {
  const out: ElementBucklingData[] = [];
  if (!(lambda1 > 0 && Number.isFinite(lambda1))) return out;
  const scale = Math.max(0, ...[...pieceN.values()].map(Math.abs));
  const floor = (piece: number) => noise?.get(piece) ?? 1e-9 * scale;
  for (const [id, list] of r.pieces) {
    const e = original.elements.get(id)!;
    if (e.type === 'truss') continue;
    const most = list.reduce((a, p) => ((pieceN.get(p.id) ?? 0) < (pieceN.get(a.id) ?? 0) ? p : a), list[0]);
    const n = pieceN.get(most.id) ?? 0;
    if (!(n < -floor(most.id))) continue;
    const mat = original.materials.get(e.materialId), sec = original.sections.get(e.sectionId);
    const EI = (mat?.e ?? 0) * 1000 * (sec?.iz ?? 0);
    const L = list[list.length - 1].x1;
    const pcr = lambda1 * Math.abs(n);
    const k = (Math.PI * Math.sqrt(EI / pcr)) / L;
    if (!(EI > 0 && pcr > 0 && Number.isFinite(k) && k > 0)) continue;
    const r2 = sec && sec.a > 0 ? Math.sqrt(sec.iz / sec.a) : 0;
    out.push({ elementId: id, axialForce: n, criticalForce: pcr, kEffective: k, effectiveLength: k * L, length: L, slenderness: r2 > 0 ? (k * L) / r2 : 0 });
  }
  return out.sort((a, b) => a.elementId - b.elementId);
}

function firstOrder(input: SolverInput) {
  const b = buildSystem(input, { method: 'consistent', axialRigid: false }, true);
  if (!b.ok) return undefined;
  const first = firstOrderAxial(b.sys);
  return first.ok ? { sys: b.sys, N0: first.N0, noise: first.noise } : undefined;
}

export function runBuckling2D(input: SolverInput, s: SoSettings): { ok: true; result: SoBucklingResult } | { ok: false; reason: Txt } {
  const r = refineInput(input, s.n);
  const geometry = r.identity ? null : refinedGeometry(r);
  if (usesEngine(s)) {
    const raw = solveBuckling(r.input, s.modes) as SoBucklingResult;
    const pieceN = new Map(raw.elementData.map((d) => [d.elementId, d.axialForce]));
    const lambda1 = raw.modes[0]?.loadFactor ?? NaN;
    const first = firstOrder(r.input);
    if (first && !representsFirstMode(first.sys, first.N0, lambda1)) return { ok: false, reason: tx('course.second-order.refuse.noModeRepresented') };
    return { ok: true, result: { ...raw, elementData: memberBucklingData(input, r, pieceN, lambda1, first?.noise), secondOrder: { settings: s, geometry, engineFactors: null } } };
  }
  const got = teachingBuckling(r.input, teachingOptions(s), s.modes);
  if (!got.ok) return got;
  const { run } = got;
  const modes: BucklingResult['modes'] = run.modes.map((m) => ({
    ...(m.internal ? { internal: true as const } : {}),
    loadFactor: m.lambda,
    displacements: run.sys.pm.nodeOrder.map((id) => ({ nodeId: id, ux: m.D[run.sys.dof(id, 0)], uz: m.D[run.sys.dof(id, 1)], ry: m.D[run.sys.dof(id, 2)] })),
  }));
  let engineFactors: number[] | null = null;
  if (!s.axialRigid) {
    try { engineFactors = solveBuckling(r.input, s.modes).modes.map((m: { loadFactor: number }) => m.loadFactor); } catch { engineFactors = null; }
  }
  return {
    ok: true,
    result: {
      modes,
      nDof: run.sys.free.length,
      elementData: memberBucklingData(input, r, run.N0, modes[0]?.loadFactor ?? NaN, run.N0Noise),
      secondOrder: { settings: s, geometry, engineFactors },
    },
  };
}

export interface BucklingConvergenceRow { label: 'n' | 'phi'; n: number; lambda1: number | null }

/** λ₁ with 1, 2, 4 and 8 elements per member (engine), and with the stability functions. */
export function bucklingConvergence(input: SolverInput, s: SoSettings, counts: readonly number[] = [1, 2, 4, 8]): BucklingConvergenceRow[] {
  const rows: BucklingConvergenceRow[] = [];
  const method = s.method === 'phi' ? 'consistent' : s.method;
  for (const n of counts) {
    try {
      const got = runBuckling2D(input, { ...s, method, n, modes: 1 });
      rows.push({ label: 'n', n, lambda1: got.ok ? got.result.modes[0]?.loadFactor ?? null : null });
    } catch {
      rows.push({ label: 'n', n, lambda1: null });
    }
  }
  const phi = runBuckling2D(input, { ...s, method: 'phi', n: 1, modes: 1 });
  rows.push({ label: 'phi', n: 1, lambda1: phi.ok ? phi.result.modes[0]?.loadFactor ?? null : null });
  return rows;
}
