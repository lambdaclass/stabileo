/**
 * The n degree of freedom case the modal decomposition document explains:
 * the system (bar model or shear building), its modes, the excitation and the
 * modal and direct responses, computed once so the document only writes it.
 */
import type { MethodContext } from '../registry';
import { dynamicsSettings, type DynamicsSettings } from '../../dynamics/course/settings';
import { modelSystem, SystemError, type MdofSystem, type DofRef } from '../../dynamics/course/mdof-system';
import { shearBuilding, type ShearBuilding } from '../../dynamics/course/shear-building';
import { modalSolve, modalResponse, modalDampingMatrix, directIntegration, type ModalSolution, type ModalResponse, type Excitation } from '../../dynamics/course/modal-decomposition';
import { solve, maxAbs, type Mat } from '../../dynamics/course/dense';

export const MAX_MODAL_DOFS = 40;
export const MIN_HARMONIC_RATIO = 0.01;
export const MAX_HARMONIC_RATIO = 100;
export const SAMPLES_PER_PERIOD = 24;
export const MAX_SAMPLES = 6000;
const MIN_SAMPLES = 160;
const MIN_WINDOW_PERIODS = 2;
export const SHOWN_MODES = 4;
const RELEVANT_SHARE = 1e-3;

export interface MdofCase {
  kind: 'model' | 'shear';
  sys: MdofSystem | null;
  shear: ShearBuilding | null;
  K: Mat;
  M: Mat;
  F: number[];
  dofs: DofRef[];
  sol: ModalSolution;
  ex: Excitation;
  xi: number;
  Omega: number;
  /** The static displacement under F: the initial shape of the free vibration. */
  ust: number[];
  resp: ModalResponse;
  /** The degree of freedom whose history is drawn: the one that moves most under F. */
  at: number;
  times: number[];
  modal: number[][];
  direct: number[][];
  settings: DynamicsSettings;
}

export function resolveMdof(ctx: Pick<MethodContext, 'model'>, settings: DynamicsSettings = dynamicsSettings()): MdofCase | { refusal: string; params?: Record<string, number> } {
  const model = ctx.model;
  if (!model) return { refusal: 'mdof.err.empty' };
  const points = model.massSource?.points ?? [];
  const ms = settings.mdof;
  if (!(Number.isFinite(ms.xi) && ms.xi >= 0)) return { refusal: 'mdof.err.xi' };
  if (ms.excitation !== 'free' && !(ms.ratio >= MIN_HARMONIC_RATIO && ms.ratio <= MAX_HARMONIC_RATIO)) return { refusal: 'mdof.err.ratio', params: { min: MIN_HARMONIC_RATIO, max: MAX_HARMONIC_RATIO } };
  let sys: MdofSystem | null = null, shear: ShearBuilding | null = null;
  let K: Mat, M: Mat, F: number[], dofs: DofRef[];
  if (ms.source === 'shear') {
    const r = shearBuilding(model, points, ms.barMass);
    if (typeof r === 'string') return { refusal: `mdof.err.shear.${r}` };
    shear = r; ({ K, M, F, dofs } = r);
  } else {
    try {
      sys = modelSystem(model, points, { nPerMember: settings.mass.nPerMember, massModel: settings.mass.massModel, barMass: ms.barMass });
    } catch (e) {
      if (e instanceof SystemError) return { refusal: `mdof.err.${e.code}`, params: e.params };
      throw e;
    }
    ({ K, M, F, dofs } = sys);
  }
  if (dofs.length > MAX_MODAL_DOFS) return { refusal: 'mdof.err.tooBig', params: { n: dofs.length, max: MAX_MODAL_DOFS } };
  if (maxAbs(F) < 1e-12) return { refusal: 'mdof.err.noLoad' };
  let ust: number[];
  try { ust = solve(K, F); } catch { return { refusal: 'mdof.err.singular' }; }
  let sol: ModalSolution;
  try { sol = modalSolve(K, M, dofs, sys?.ground); } catch (e) { return { refusal: e instanceof SystemError && e.code === 'indefinite' ? 'mdof.err.indefinite' : 'mdof.err.singular' }; }
  if (!(sol.modes[0]?.omega > 0)) return { refusal: 'mdof.err.singular' };
  const Omega = ms.ratio * sol.modes[0].omega;
  const ex: Excitation = ms.excitation === 'free'
    ? { kind: 'free', u0: ust, v0: ust.map(() => 0) }
    : { kind: 'harmonic', F, Omega };
  const resp = modalResponse(sol, M, ms.xi, ex);
  const moves = dofs.map((_, i) => i).filter((i) => dofs[i].dir !== 'ry');
  if (!moves.length) return { refusal: 'mdof.err.noMass' };
  const at = moves.reduce((b, i) => (Math.abs(ust[i]) > Math.abs(ust[b]) ? i : b), moves[0]);
  const T1 = sol.modes[0].T;
  const Tmin = shortestPeriodShown(sol, resp, at, ex);
  const tWanted = ex.kind === 'free' ? 4 * T1 : Math.max(6 * T1, (8 * Math.PI) / Omega);
  const tFits = (MAX_SAMPLES / SAMPLES_PER_PERIOD) * Tmin;
  if (tFits < MIN_WINDOW_PERIODS * T1) return { refusal: 'mdof.err.tooFine', params: { ratio: Math.round(T1 / Tmin), max: Math.floor(MAX_SAMPLES / SAMPLES_PER_PERIOD / MIN_WINDOW_PERIODS) } };
  const tEnd = Math.min(tWanted, tFits);
  const N = Math.max(MIN_SAMPLES, Math.ceil((SAMPLES_PER_PERIOD * tEnd) / Tmin));
  const times = Array.from({ length: N + 1 }, (_, i) => (i * tEnd) / N);
  const modal = times.map((tt) => resp.u(tt));
  const sub = Math.max(1, Math.ceil(tEnd / N / Math.min(T1 / 400, Tmin / 40)));
  const C = modalDampingMatrix(sol, M, ms.xi);
  const force = ex.kind === 'harmonic' ? (tt: number) => F.map((f) => f * Math.sin(Omega * tt)) : () => F.map(() => 0);
  const direct = directIntegration(K, M, C, force, ex.kind === 'free' ? ust : F.map(() => 0), F.map(() => 0), times, tEnd / N / sub);
  if (!((ex.kind === 'free' || Number.isFinite(Omega)) && [...modal, ...direct].every((u) => u.every(Number.isFinite)))) return { refusal: 'mdof.err.notFinite' };
  return { kind: ms.source, sys, shear, K, M, F, dofs, sol, ex, xi: ms.xi, Omega, ust, resp, at, times, modal, direct, settings };
}

/**
 * The shortest period the plots draw: the excitation, the modes plotted on their own, and every
 * other mode whose share at the plotted degree of freedom reaches 10⁻³ of the largest.
 */
export function shortestPeriodShown(sol: ModalSolution, resp: ModalResponse, at: number, ex: Excitation): number {
  const resonant = sol.modes.map((m, i) => !!resp.harmonics[i]?.resonant && m.phi[at] !== 0);
  const share = sol.modes.map((m, i) => {
    const h = resp.harmonics[i];
    if (resonant[i] || h?.resonant) return 0;
    const amp = h ? Math.abs(h.X) * Math.max(1, h.beta) : Math.hypot(resp.q0[i], resp.qd0[i] / m.omega);
    return Math.abs(m.phi[at]) * amp;
  });
  const top = Math.max(0, ...share.filter(Number.isFinite));
  const periods = sol.modes.filter((_, i) => i < SHOWN_MODES || resonant[i] || (top > 0 && share[i] >= RELEVANT_SHARE * top)).map((m) => m.T);
  if (ex.kind === 'harmonic') periods.push((2 * Math.PI) / ex.Omega);
  return Math.min(...periods);
}
