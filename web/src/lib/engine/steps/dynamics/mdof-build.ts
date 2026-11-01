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
  settings: DynamicsSettings;
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
  try { sol = modalSolve(K, M, dofs); } catch { return { refusal: 'mdof.err.singular' }; }
  if (!(sol.modes[0]?.omega > 0)) return { refusal: 'mdof.err.singular' };
  const Omega = ms.ratio * sol.modes[0].omega;
  const ex: Excitation = ms.excitation === 'free'
    ? { kind: 'free', u0: ust, v0: ust.map(() => 0) }
    : { kind: 'harmonic', F, Omega };
  const resp = modalResponse(sol, M, ms.xi, ex);
  const at = ust.reduce((b, v, i) => (Math.abs(v) > Math.abs(ust[b]) ? i : b), 0);
  const T1 = sol.modes[0].T;
  const tEnd = ex.kind === 'free' ? 4 * T1 : Math.max(6 * T1, (8 * Math.PI) / Omega);
  const N = 160;
  const times = Array.from({ length: N + 1 }, (_, i) => (i * tEnd) / N);
  const modal = times.map((tt) => resp.u(tt));
  const sub = Math.max(1, Math.ceil(tEnd / N / (T1 / 400)));
  const C = modalDampingMatrix(sol, M, ms.xi);
  const force = ex.kind === 'harmonic' ? (tt: number) => F.map((f) => f * Math.sin(Omega * tt)) : () => F.map(() => 0);
  const direct = directIntegration(K, M, C, force, ex.kind === 'free' ? ust : F.map(() => 0), F.map(() => 0), times, tEnd / N / sub);
  return { kind: ms.source, sys, shear, K, M, F, dofs, sol, ex, xi: ms.xi, Omega, ust, resp, at, times, modal, direct, settings };
}
