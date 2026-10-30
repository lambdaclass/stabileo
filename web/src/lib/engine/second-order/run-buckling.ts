/**
 * The Basic mode's critical load: the engine's eigenproblem on the model cut into n elements
 * per member, or the teaching solver (stability functions, chord matrix, members that keep
 * their length). The modes are drawn on the cut model; each member's effective length factor
 * comes from the refined λ₁ and the most compressed of its pieces.
 */
import type { SolverInput } from '../types';
import type { BucklingResult, ElementBucklingData } from '../result-types';
import type { Txt } from '../steps/doc';
import { solveBuckling } from '../wasm-solver';
import { teachingBuckling } from './buckling';
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
export function memberBucklingData(original: SolverInput, r: Refined, pieceN: Map<number, number>, lambda1: number): ElementBucklingData[] {
  const out: ElementBucklingData[] = [];
  for (const [id, list] of r.pieces) {
    const e = original.elements.get(id)!;
    const n = Math.min(...list.map((p) => pieceN.get(p.id) ?? 0));
    if (!(n < -1e-6)) continue;
    const mat = original.materials.get(e.materialId), sec = original.sections.get(e.sectionId);
    const EI = (mat?.e ?? 0) * 1000 * (sec?.iz ?? 0);
    const L = list[list.length - 1].x1;
    const pcr = lambda1 * Math.abs(n);
    const k = pcr > 1e-9 && EI > 0 ? (Math.PI * Math.sqrt(EI / pcr)) / L : 1;
    const r2 = sec && sec.a > 0 ? Math.sqrt(sec.iz / sec.a) : 0;
    out.push({ elementId: id, axialForce: n, criticalForce: pcr, kEffective: k, effectiveLength: k * L, length: L, slenderness: r2 > 0 ? (k * L) / r2 : 0 });
  }
  return out.sort((a, b) => a.elementId - b.elementId);
}

export function runBuckling2D(input: SolverInput, s: SoSettings): { ok: true; result: SoBucklingResult } | { ok: false; reason: Txt } {
  const r = refineInput(input, s.n);
  const geometry = r.identity ? null : refinedGeometry(r);
  if (usesEngine(s)) {
    const raw = solveBuckling(r.input, s.modes) as SoBucklingResult;
    const pieceN = new Map(raw.elementData.map((d) => [d.elementId, d.axialForce]));
    const lambda1 = raw.modes[0]?.loadFactor ?? 0;
    return { ok: true, result: { ...raw, elementData: memberBucklingData(input, r, pieceN, lambda1), secondOrder: { settings: s, geometry, engineFactors: null } } };
  }
  const got = teachingBuckling(r.input, teachingOptions(s), s.modes);
  if (!got.ok) return got;
  const { run } = got;
  const modes = run.modes.map((m) => ({
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
      modes: modes as unknown as BucklingResult['modes'],
      nDof: run.sys.free.length,
      elementData: memberBucklingData(input, r, run.N0, modes[0].loadFactor),
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
