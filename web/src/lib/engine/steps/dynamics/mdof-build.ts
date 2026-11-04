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
  /** The direct integration's step, and whether it follows every excited mode within the budget. */
  directStep: DirectStep;
  settings: DynamicsSettings;
}

export interface DirectStep {
  dt: number;
  steps: number;
  /** The phase error the step leaves at the end of the record, as a share of the peak at the drawn degree of freedom. */
  estimate: number;
  resolved: boolean;
  /** The fastest component the step has to follow, rad/s. */
  omega: number;
}

/** Steps × n² the direct integration may take, so the panel stays responsive. */
export const DIRECT_BUDGET = 2e7;
const DIRECT_MAX_STEPS = 200_000;
export const DIRECT_TOL = 0.005;

/** Newmark's average acceleration keeps each amplitude and lengthens its period: ω̄ = (2/Δt)·atan(ω·Δt/2). */
export function newmarkDrift(omega: number, dt: number, tEnd: number): number {
  const wb = (2 / dt) * Math.atan((omega * dt) / 2);
  return 2 * Math.abs(Math.sin(((omega - wb) * tEnd) / 2));
}

/**
 * The step: halved from the sampling interval until the phase error of every component that moves
 * the drawn degree of freedom stays under DIRECT_TOL of its peak, or until the budget runs out.
 */
export function directStepFor(components: ReadonlyArray<{ omega: number; amp: number }>, tEnd: number, sample: number, peak: number, n: number): DirectStep {
  const maxSteps = Math.min(DIRECT_MAX_STEPS, Math.floor(DIRECT_BUDGET / Math.max(1, n * n)));
  const live = components.filter((c) => c.amp > 1e-6 * peak && c.omega > 0);
  const omega = Math.max(0, ...live.map((c) => c.omega));
  const err = (dt: number) => live.reduce((s, c) => s + c.amp * newmarkDrift(c.omega, dt, tEnd), 0) / peak;
  let dt = sample;
  while (err(dt) > DIRECT_TOL && Math.ceil(tEnd / (dt / 2)) <= maxSteps) dt /= 2;
  const estimate = err(dt);
  return { dt, steps: Math.ceil(tEnd / dt), estimate, resolved: estimate <= DIRECT_TOL, omega };
}

export function resolveMdof(ctx: Pick<MethodContext, 'model'>, settings: DynamicsSettings = dynamicsSettings()): MdofCase | { refusal: string; params?: Record<string, number> } {
  const model = ctx.model;
  if (!model) return { refusal: 'mdof.err.empty' };
  const points = model.massSource?.points ?? [];
  const ms = settings.mdof;
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
  try { sol = modalSolve(K, M, dofs, sys?.inertia); } catch { return { refusal: 'mdof.err.singular' }; }
  if (!(sol.modes[0]?.omega > 0)) return { refusal: 'mdof.err.singular' };
  if (ms.excitation === 'harmonic' && !(Number.isFinite(ms.ratio) && ms.ratio > 0)) return { refusal: 'mdof.err.omega' };
  const Omega = ms.ratio * sol.modes[0].omega;
  const ex: Excitation = ms.excitation === 'free'
    ? { kind: 'free', u0: ust, v0: ust.map(() => 0) }
    : { kind: 'harmonic', F, Omega };
  const resp = modalResponse(sol, M, ms.xi, ex);
  const at = ust.reduce((b, v, i) => (Math.abs(v) > Math.abs(ust[b]) ? i : b), 0);
  const T1 = sol.modes[0].T;
  const tEnd = ex.kind === 'free' ? 4 * T1 : Math.max(6 * T1, (8 * Math.PI) / Omega);
  const amps = sol.modes.map((_, i) => {
    const p = resp.sdof[i], h = resp.harmonics[i];
    const wd = p.omegaD || p.omega;
    if (!h) return Math.hypot(resp.q0[i], (resp.qd0[i] + ms.xi * p.omega * resp.q0[i]) / wd);
    return h.resonant ? (Math.abs(h.ust) * p.omega * tEnd) / 2 : Math.abs(h.X) * (1 + h.beta);
  });
  const components = sol.modes.map((m, i) => ({ omega: m.omega, amp: Math.abs(m.phi[at]) * amps[i] }));
  if (ex.kind === 'harmonic') components.push({ omega: Omega, amp: components.reduce((s, c) => s + c.amp, 0) });
  const scale = Math.max(...components.map((c) => c.amp), 1e-15);
  const fastest = Math.max(...components.filter((c) => c.amp > 0.01 * scale).map((c) => c.omega), sol.modes[0].omega);
  const N = Math.min(1600, Math.max(160, Math.ceil(((tEnd * fastest) / (2 * Math.PI)) * 12)));
  const times = Array.from({ length: N + 1 }, (_, i) => (i * tEnd) / N);
  const modal = times.map((tt) => resp.u(tt));
  const peak = Math.max(...modal.map((u) => Math.abs(u[at])), 1e-15);
  const directStep = directStepFor(components, tEnd, tEnd / N, peak, K.length);
  const C = modalDampingMatrix(sol, M, ms.xi);
  const force = ex.kind === 'harmonic' ? (tt: number) => F.map((f) => f * Math.sin(Omega * tt)) : () => F.map(() => 0);
  const direct = directIntegration(K, M, C, force, ex.kind === 'free' ? ust : F.map(() => 0), F.map(() => 0), times, directStep.dt);
  return { kind: ms.source, sys, shear, K, M, F, dofs, sol, ex, xi: ms.xi, Omega, ust, resp, at, times, modal, direct, directStep, settings };
}
