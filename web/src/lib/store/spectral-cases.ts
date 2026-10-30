import { errorText } from '../utils/error-text';
/**
 * The results of the model's spectral load cases (`engine/spectral-case.ts`): the modes under the
 * project's mass source, each mode shape imposed and solved once, then each case's modes combined
 * with its own multipliers, direction by direction. Computed when the combinations are solved and
 * handed to them as the cases' results (`engine/combination-methods.ts` `finishBundle`).
 *
 * The mode shapes are imposed on the very structure the modes were found on (`dynamicInput`): its
 * centerline, as every dynamic analysis reads it (member offsets are not expanded), and linear, as
 * the modal analysis is: a tension-only brace or a lifting support is an ordinary member or
 * support here, whatever the static solve does with it. Imposed on the static model instead, the
 * offsets were expanded under modes found without them, and a tension-only brace went slack under
 * a mode, so its modal forces were not K·u.
 */
import { modelStore } from './model.svelte';
import { regulationsStore } from './regulations.svelte';
import { t, tp } from '../i18n';
import { dynamicInput } from './dynamic-input';
import { modalUntilMass } from '../engine/dynamics/requests';
import { solveModal3D, solve3D } from '../engine/wasm-solver';
import { finalizeSolve3DResults } from '../engine/solver-service';
import { designSpectrum, isBlocked, spectralOrdinate, RISK_FACTOR } from '../codes/cirsoc103/spectrum';
import { engineFailureMessage } from '../engine/engine-unavailable';
import { findBehaviour, R_ELASTIC } from '../codes/cirsoc103/behaviour';
import { excitedDirections, modeShapeField, spectralCaseResult, userSa, G, type Direction, type SpectralCaseDef } from '../engine/spectral-case';
import type { AnalysisResults3D, Displacement3D, Reaction3D, SolverInput3D, SolverSupport3D } from '../engine/types-3d';
import type { ModalResult3D } from '../engine/result-types';

/** The mass a spectral case's directions must have moving in its modes, as the codes ask. */
export const PARTICIPATION_TARGET = 0.9;

/** The code's spectrum, Sa in m/s² against period, from the project's seismic regulation. */
export function codeSa(): ((t: number) => number) | string {
  const s = regulationsStore.binding('seismic')?.settings as { zone?: number; site?: string } | undefined;
  if (!s?.zone || !s.site) return t('spectralCase.noCodeSpectrum');
  let spec;
  try {
    spec = designSpectrum({ zone: s.zone as never, site: s.site as never });
  } catch (err) {
    // The code spectrum is the engine's: without it, the reason, not a spectrum.
    const m = engineFailureMessage(err);
    if (!m) throw err;
    return tp(m.key, m.params ?? {});
  }
  if (isBlocked(spec)) return t('spectralCase.noCodeSpectrum');
  return (period) => spectralOrdinate(period, spec) * G;
}

/** γr/R from the project's seismic regulation: the code spectrum's own scale. */
export function codeSpectrumScale(): number {
  const s = regulationsStore.binding('seismic')?.settings as { destinationGroup?: string; systemKey?: string; elastic?: boolean } | undefined;
  const gr = RISK_FACTOR[(s?.destinationGroup ?? 'B') as keyof typeof RISK_FACTOR] ?? 1;
  const r = s?.elastic ? R_ELASTIC : s?.systemKey ? findBehaviour(s.systemKey)?.r ?? 1 : 1;
  return +(gr / r).toFixed(4);
}

/**
 * The regulation's γr/R when a case on the code's spectrum states another scale; null otherwise.
 * The scale is written into the case when it is ticked, and a later change of the regulation does
 * not reach it. Said rather than replaced: the user may have set it on purpose.
 */
export function staleCodeScale(def: Pick<SpectralCaseDef, 'source' | 'scale'>): number | null {
  if (def.source.kind !== 'code') return null;
  const now = codeSpectrumScale();
  return Math.abs(def.scale - now) > 5e-5 ? now : null;
}

/** The structure with every node held at a mode shape's displacements, and nothing loaded. */
export function imposedInput(input: SolverInput3D, field: Map<number, [number, number, number, number, number, number]>): SolverInput3D {
  const supports = new Map<number, SolverSupport3D>();
  for (const nodeId of input.nodes.keys()) {
    const [dx, dy, dz, drx, dry, drz] = field.get(nodeId) ?? [0, 0, 0, 0, 0, 0];
    supports.set(nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true, dx, dy, dz, drx, dry, drz });
  }
  return { ...input, supports, loads: [] };
}

/**
 * The reactions of the real supports under an imposed mode shape. Holding every node, the solve
 * reports a "reaction" at each one: at a free node it is the mode's inertia force, at a pinned
 * support's rotation the same, and a spring is held rigid, so it read the structure's K·φ. Kept:
 * the components a support restrains, as solved; a spring's force, −k·u (the engine's sign for a
 * spring's reaction); along an inclined support's normal, the reaction's projection. A support the
 * input builder added to steady a rotation nothing resists is none, nor are its vanishing springs.
 */
export function supportReactions(reactions: readonly Reaction3D[], supports: Iterable<SolverSupport3D>, displacements: readonly Displacement3D[]): Reaction3D[] {
  const at = new Map(reactions.map((r) => [r.nodeId, r]));
  const moved = new Map(displacements.map((d) => [d.nodeId, d]));
  const out: Reaction3D[] = [];
  for (const s of supports) {
    if (s.stabilised === 'created') continue;
    const r = at.get(s.nodeId) ?? { nodeId: s.nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
    const u = moved.get(s.nodeId) ?? { nodeId: s.nodeId, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 };
    const vanishing = s.stabilised === 'springs' ? s.stabilisedAxes ?? [false, false, false] : [false, false, false];
    const part = (held: boolean, k: number | undefined, solved: number, disp: number) => (held ? solved : k ? -k * disp : 0);
    const row: Reaction3D = {
      nodeId: s.nodeId,
      fx: part(s.rx, s.kx, r.fx, u.ux), fy: part(s.ry, s.ky, r.fy, u.uy), fz: part(s.rz, s.kz, r.fz, u.uz),
      mx: part(s.rrx, vanishing[0] ? 0 : s.krx, r.mx, u.rx),
      my: part(s.rry, vanishing[1] ? 0 : s.kry, r.my, u.ry),
      mz: part(s.rrz, vanishing[2] ? 0 : s.krz, r.mz, u.rz),
    };
    const n = s.isInclined ? Math.hypot(s.normalX ?? 0, s.normalY ?? 0, s.normalZ ?? 0) : 0;
    if (n > 0) {
      const nx = s.normalX! / n, ny = s.normalY! / n, nz = s.normalZ! / n;
      const along = r.fx * nx + r.fy * ny + r.fz * nz;
      row.fx += along * nx; row.fy += along * ny; row.fz += along * nz;
    }
    out.push(row);
  }
  return out;
}

/** The spectral cases' results, by case id, and what the reader is to be told of them. */
export interface SpectralCases { results: Map<number, AnalysisResults3D>; warnings: string[] }

/** Each spectral case's result, by case id; a message when they cannot be had. */
export function spectralCaseResults(): SpectralCases | string {
  const cases = modelStore.model.loadCases.filter((c) => c.spectral);
  if (!cases.length) return { results: new Map(), warnings: [] };
  if (modelStore.constraints.length) return t('spectralCase.constrained');
  // The directions the cases excite: modes are asked for until each has its mass moving, Z too.
  const dirs = [...new Set(cases.flatMap((c) => excitedDirections(c.spectral as SpectralCaseDef)))];
  let input: SolverInput3D;
  let modal: ModalResult3D;
  const warnings: string[] = [];
  try {
    const dyn = dynamicInput();
    input = dyn.input;
    const r = modalUntilMass((n) => solveModal3D(input, dyn.densities, n) as never, 12, PARTICIPATION_TARGET, 200, dirs.length ? dirs : ['x', 'y']);
    if (typeof r.result === 'string') return errorText(r.result, t('spectralCase.noModes'));
    modal = r.result as unknown as ModalResult3D;
    // Not reached (no more modes, or the most asked for): the case is worked out on the mass that
    // moves, and the reader is told how much that is.
    for (const d of dirs as Direction[]) {
      if (r[d] < PARTICIPATION_TARGET) warnings.push(tp('spectralCase.participationShort', { dir: d.toUpperCase(), got: (100 * r[d]).toFixed(1), target: String(100 * PARTICIPATION_TARGET), modes: r.modes }));
    }
  } catch (e) {
    return errorText(e, t('spectralCase.noModes'));
  }
  if (!modal.modes?.length) return t('spectralCase.noModes');
  // What reading the results back needs of the model: variable members put back together,
  // inactive ones as zeros, any helper node left out (`finalizeSolve3DResults`).
  const md = {
    nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
    loads: [], materials: modelStore.materials, sections: modelStore.sections,
    analysis: modelStore.model.analysis, groups: modelStore.model.groups,
    plates: modelStore.plates, quads: modelStore.quads,
  };
  // Each mode shape imposed and solved once, linearly, on the modes' own structure; a case
  // scales it by its own multiplier per direction.
  const unit: AnalysisResults3D[] = [];
  for (const m of modal.modes) {
    let r: AnalysisResults3D;
    try {
      r = finalizeSolve3DResults(solve3D(imposedInput(input, modeShapeField(m))), md as never);
    } catch (e) {
      return errorText(e, t('spectralCase.noModes'));
    }
    unit.push({ ...r, reactions: supportReactions(r.reactions, input.supports.values(), r.displacements) });
  }
  const out = new Map<number, AnalysisResults3D>();
  const code = codeSa();
  for (const c of cases) {
    const def = c.spectral as SpectralCaseDef;
    let saOf: (t: number) => number;
    if (def.source.kind === 'code') {
      if (typeof code === 'string') return code;
      saOf = code;
      const now = staleCodeScale(def);
      if (now !== null) warnings.push(tp('spectralCase.scaleStale', { name: c.name, scale: def.scale, code: now }));
    } else {
      const id = def.source.spectrumId;
      const spec = modelStore.model.dynamics?.spectra?.find((s) => s.id === id);
      if (!spec) return t('spectralCase.noSpectrum');
      saOf = (p) => userSa(spec, p);
    }
    out.set(c.id, spectralCaseResult(def, modal, saOf, unit));
  }
  return { results: out, warnings };
}
