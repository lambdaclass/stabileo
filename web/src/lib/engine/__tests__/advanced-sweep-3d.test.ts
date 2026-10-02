/**
 * Robustness sweep of Basic mode's advanced functions in 3D.
 *
 * `advanced-examples-audit.test.ts` runs P-Δ, buckling, modal and the combination envelope on
 * the ten 3D examples of the Basic menu. A user's own structure is not one of those ten, so this
 * builds several hundred seeded random models through the model store (the same calls drawing in
 * Basic 3D makes) and runs, on every one, what the Advanced panel runs in 3D, calling the same
 * entry points the panel calls:
 *
 *   static        modelStore.solve3D                       (Calcular; what every other panel reads)
 *   P-Δ           solvePDelta3D(buildSolverInput3D(...))    (ToolbarAdvanced.handlePDelta3D)
 *   buckling      solveBuckling3D(same input)               (handleBuckling3D)
 *   modal         solveModal3D(same input, ρ·1000/g)        (handleModal3D)
 *   kinematic     analyzeKinematics3D(same input)           (instability.explain after a failed solve)
 *   section σ     analyzeSectionStress3D / stationForces3D  (SectionStressPanel, 3D branch)
 *   what-if       whatIf store                              (WhatIfPanel, the Explore session)
 *
 * and asserts physical invariants, not only "it returned": global equilibrium, B₂ against the
 * buckling factor, Euler loads, the cantilever's first frequency, frequency scaling with E,
 * mass-ratio bounds, the Navier formula at a fibre, linearity of the what-if sliders.
 *
 * Not covered, because Basic 3D does not offer it: the moving train and the influence line
 * (both buttons are `disabled={is3D}` in ToolbarAdvanced.svelte), plastic collapse (2D only).
 *
 * Each defect the sweep found was an `it.fails` with the defect written next to it. All ten are
 * fixed now; their tests are plain `it` and stay as regression checks, with the defect as it was
 * described next to each:
 *
 *   D1  section panel: stationForces3D interpolates My/Mz linearly (wrong inside loaded spans)
 *   D2  what-if: the slider of a 3D point load on a member does nothing
 *   D3  modal: a sway mechanism gets ≈0 Hz "modes" and a success toast
 *   D4  kinematic: a My+Mz hinge counted as 3 releases in the 3D degree
 *   D5  Kinematic panel in 3D analyses the plane (2D) wire
 *   D6  buckling: λ1 ≈ 1e-12 or "Eigenvalue decomposition failed" on mechanisms
 *   D7  static: a nodal moment on a node only truss bars meet vanishes (ΣM ≠ 0, θ ~ 1e5 rad)
 *   D8  modal: "Eigenvalue decomposition failed" on any frame model with a truss-only node
 *   D9  P-Δ "converged and stable" (B2 ≈ 0) and buckling λ1 = 1.5e4 on a mechanism held by tension
 *   D10 P-Δ / buckling / modal skip the static solve's model checks (stray node → "mechanism")
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { whatIf } from '../../store/whatif.svelte';
import { solvePDelta3D, solveBuckling3D, solveModal3D } from '../wasm-solver';
// The corrected one the app shows (instability.explain, the Kinematic panel): the JS count
// for the degree, the engine's rank check, the diagnosis in the active language.
import { analyzeKinematics3D } from '../kinematic-3d';
import { analyzeSectionStress3D } from '../section-stress-3d';
import { evaluateDiagramAt } from '../diagrams-3d';
import { stationForces3D } from '../../section/panel';
import { supportsDetailedAnalysis } from '../../section/drawing';
import { generateKinematicReport3D } from '../kinematic-report';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import {
  FAMILIES, buildRandom, equilibriumError, errMsg, isClearMessage, allFinite,
  resetModel3D, addPalette, frame, truss, support, DOF, Rng, type ModelCase,
} from './helpers/random-models-3d';

const SEEDS_PER_FAMILY = 30;
const EQ_TOL = 1e-6;

const input3D = () => modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false });
const densities = () => new Map([...modelStore.materials].map(([id, m]) => [id, (m.rho * 1000) / 9.81]));
const staticSolve = () => modelStore.solve3D(false, false, false);
const isMechanismMsg = (s: string) => /mecanismo|mechanism|hipost|hypostat|singular|inestable|unstable/i.test(s);

type Outcome<T> = { ok: true; value: T } | { ok: false; msg: string };
function attempt<T>(fn: () => T): Outcome<T> {
  try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, msg: errMsg(e) }; }
}

const maxAbsU = (r: AnalysisResults3D) => Math.max(0, ...r.displacements.map((d) => Math.max(Math.abs(d.ux), Math.abs(d.uy), Math.abs(d.uz))));

/** One model through every function; each list collects human-readable violations. */
interface SweepLog {
  models: number;
  staticOk: number;
  staticRefused: string[];
  staticThrow: string[];
  staticNonFinite: string[];
  equilibrium: string[];
  kinematic: string[];
  pdelta: string[];
  pdeltaEq: string[];
  pdeltaB2Bound: string[];
  buckling: string[];
  modal: string[];
  stressForces: string[];
  stressNavier: string[];
  stressProps: string[];
  stressCanonicalStation: string[];
  /** Models the static solve accepts although the rank check finds a mechanism the loads do not excite. */
  unexcited: string[];
  /** What the other analyses said on those. */
  unexcitedOthers: string[];
  /** analyzeSectionStress3D on a properties-only section (the panel refuses those as amorphous first). */
  stressPropsOnlyThrow: number;
  stressChecked: number;
  /** D6: buckling answers a mechanism with λ1 ≈ 0 or an opaque eigen failure. */
  bucklingMechanism: string[];
  /** D8: modal fails on a frame model where some node is met only by truss bars. */
  modalTrussOnlyNode: string[];
}
const emptyLog = (): SweepLog => ({
  models: 0, staticOk: 0, staticRefused: [], staticThrow: [], staticNonFinite: [], equilibrium: [], kinematic: [],
  pdelta: [], pdeltaEq: [], pdeltaB2Bound: [], buckling: [], modal: [], stressForces: [], stressNavier: [],
  stressProps: [], stressCanonicalStation: [], unexcited: [], unexcitedOthers: [], stressPropsOnlyThrow: 0, stressChecked: 0,
  bucklingMechanism: [], modalTrussOnlyNode: [],
});

function checkSectionStress(cs: ModelCase, tag: string, input: SolverInput3D, res: AnalysisResults3D, log: SweepLog, r: Rng): void {
  const frames = res.elementForces.filter((ef) => modelStore.elements.get(ef.elementId)?.type === 'frame');
  const chosen = [...new Set([...cs.loadedFrames.slice(0, 3), ...frames.slice(0, 2).map((f) => f.elementId)])];
  for (const id of chosen) {
    const ef = res.elementForces.find((f) => f.elementId === id);
    const elem = modelStore.elements.get(id);
    if (!ef || !elem || elem.type !== 'frame') continue;
    const sec = modelStore.sections.get(elem.sectionId)!;
    const mat = modelStore.materials.get(elem.materialId)!;
    const solverSec = input.sections.get(elem.sectionId)!;
    if (!supportsDetailedAnalysis(sec)) {
      // SectionStressPanel shows "amorphous section" for these and never calls the analysis.
      if (!attempt(() => analyzeSectionStress3D(ef, sec, mat.fy, 0.5)).ok) log.stressPropsOnlyThrow++;
      continue;
    }
    log.stressChecked++;
    for (const t of [0, 0.5, 1, Math.round(r.uni(0.05, 0.95) * 100) / 100]) {
      // Same fibre construction as SectionStressPanel's 3D branch.
      const halfH = (sec.h ?? Math.sqrt(12 * (sec.iy ?? sec.iz) / sec.a)) / 2;
      const halfB = (sec.b ?? sec.h ?? Math.sqrt(12 * sec.iz / sec.a)) / 2;
      const yF = -halfH + r.next() * 2 * halfH, zF = -halfB + r.next() * 2 * halfB;
      const out = attempt(() => analyzeSectionStress3D(ef, sec, mat.fy, t, yF, zF));
      if (!out.ok) { log.stressForces.push(`${tag} e${id} t=${t}: threw ${out.msg}`); continue; }
      const s = out.value;
      if (!allFinite([s.sigmaAtFiber, s.tauTotal, s.N, s.My, s.Mz, s.failure?.vonMises ?? 0])) {
        log.stressForces.push(`${tag} e${id} t=${t}: non-finite stress`); continue;
      }
      // (a) The resultants at the station are the diagram's.
      const want = { N: evaluateDiagramAt(ef, 'axial', t), My: evaluateDiagramAt(ef, 'momentY', t), Mz: evaluateDiagramAt(ef, 'momentZ', t) };
      const scale = 1 + Math.max(Math.abs(ef.myStart), Math.abs(ef.myEnd), Math.abs(ef.mzStart), Math.abs(ef.mzEnd), Math.abs(ef.nStart), Math.abs(want.My), Math.abs(want.Mz));
      for (const k of ['N', 'My', 'Mz'] as const) {
        if (Math.abs(s[k] - want[k]) > 1e-6 * scale) log.stressForces.push(`${tag} e${id} t=${t}: ${k} section=${s[k].toFixed(4)} diagram=${want[k].toFixed(4)}`);
      }
      // (b) Navier biaxial at the fibre, with the app's documented sign convention
      //     σ = N/A − My·y/Iy + Mz·z/Iz (section-stress-3d.ts header), y = depth, z = width.
      const rs = s.resolved;
      const sig = (s.N / rs.a - s.My * yF / rs.iy + s.Mz * zF / rs.iz) / 1000;
      const sigScale = 1e-3 * (Math.abs(s.N) / rs.a + Math.abs(s.My) * halfH / rs.iy + Math.abs(s.Mz) * halfB / rs.iz) + 1e-9;
      if (Math.abs(s.sigmaAtFiber - sig) > 1e-6 * sigScale + 1e-9) log.stressNavier.push(`${tag} e${id} t=${t}: σ=${s.sigmaAtFiber.toFixed(4)} Navier=${sig.toFixed(4)} MPa`);
      // (c) The stresses are computed with the stiffness the member was solved with.
      if (t === 0) {
        for (const [k, a, b] of [['A', rs.a, solverSec.a], ['Iy', rs.iy, solverSec.iy], ['Iz', rs.iz, solverSec.iz]] as const) {
          if (Math.abs(a - b) > 0.02 * Math.abs(b)) log.stressProps.push(`${tag} e${id} ${sec.name}: ${k} stress=${a.toExponential(3)} solve=${b.toExponential(3)}`);
        }
      }
      // (d) The canonical panel (geometry-backed sections) reads the station forces from
      //     stationForces3D; they have to be the diagram's too.
      if (t > 0 && t < 1) {
        const st = stationForces3D(ef, t);
        const bad = Math.abs(st.my - want.My) > 1e-6 * scale || Math.abs(st.mz - want.Mz) > 1e-6 * scale;
        if (bad) log.stressCanonicalStation.push(`${tag} e${id} t=${t}: stationForces3D My=${st.my.toFixed(3)} Mz=${st.mz.toFixed(3)} vs diagram My=${want.My.toFixed(3)} Mz=${want.Mz.toFixed(3)}`);
      }
    }
  }
}

function runModel(cs: ModelCase, log: SweepLog): void {
  const tag = `${cs.family}#${cs.seed}`;
  const r = new Rng(cs.seed * 31 + 7);
  log.models++;
  const input = input3D();
  if (!input) { log.staticRefused.push(`${tag}: no solver input`); return; }

  // ── static ──
  const st = attempt(() => staticSolve());
  let res: AnalysisResults3D | null = null;
  if (!st.ok) log.staticThrow.push(`${tag}: ${st.msg}`);
  else if (typeof st.value === 'string' || !st.value) {
    log.staticRefused.push(`${tag}: ${st.value}`);
    if (!isClearMessage(String(st.value))) log.staticThrow.push(`${tag}: unclear refusal "${st.value}"`);
  } else {
    res = st.value;
    log.staticOk++;
    if (!allFinite([res.displacements, res.reactions, res.elementForces.map((f) => [f.nStart, f.nEnd, f.myStart, f.myEnd, f.mzStart, f.mzEnd, f.mxStart, f.vyStart, f.vzStart])])) log.staticNonFinite.push(tag);
    const eq = equilibriumError(input, res);
    if (eq.force > EQ_TOL || eq.moment > EQ_TOL) log.equilibrium.push(`${tag}: ΣF rel=${eq.force.toExponential(2)} ΣM rel=${eq.moment.toExponential(2)}`);
  }

  // ── kinematic ── agrees with whether the static solve succeeds.
  const kin = attempt(() => analyzeKinematics3D(input));
  if (!kin.ok) log.kinematic.push(`${tag}: threw ${kin.msg}`);
  else {
    const k = kin.value;
    const kinMech = k.mechanismModes > 0 || !k.isSolvable;
    if (res && kinMech) log.unexcited.push(`${tag}: static solved, rank check finds ${k.mechanismModes} mechanism mode(s) at ${JSON.stringify(k.unconstrainedDofs).slice(0, 80)}`);
    if (!res && st.ok && typeof st.value === 'string' && isMechanismMsg(st.value) && !kinMech) log.kinematic.push(`${tag}: static refused as mechanism, kinematic says solvable`);
    if (!res && !kinMech) log.kinematic.push(`${tag}: static refused ("${String(st.ok ? st.value : st.msg).slice(0, 60)}"), kinematic says solvable`);
    const cls = k.degree > 0 ? 'hyperstatic' : k.degree === 0 ? 'isostatic' : 'hypostatic';
    if (k.mechanismModes === 0 && k.classification !== cls) log.kinematic.push(`${tag}: classification ${k.classification} vs degree ${k.degree}`);
  }

  // ── buckling ──
  let lambda1: number | null = null;
  const bk = attempt(() => solveBuckling3D(input));
  if (!bk.ok) {
    if (/eigenvalue decomposition failed/i.test(bk.msg)) log.bucklingMechanism.push(`${tag}: "${bk.msg}" (static ${res ? 'solved' : 'refused'})`);
    else if (!/no compressed elements/i.test(bk.msg) && !isClearMessage(bk.msg)) log.buckling.push(`${tag}: unclear refusal "${bk.msg.slice(0, 100)}"`);
    else if (!/no compressed elements/i.test(bk.msg) && res) log.buckling.push(`${tag}: refused a solvable model: ${bk.msg.slice(0, 100)}`);
  } else {
    const lf = bk.value.modes.map((m: { loadFactor: number }) => m.loadFactor);
    if (lf.length === 0) log.buckling.push(`${tag}: no modes and no refusal`);
    else if (!allFinite(lf) || lf.some((x: number) => x <= 0)) log.buckling.push(`${tag}: λ = ${lf.join(', ')}`);
    else if (lf.some((x: number, i: number) => i > 0 && x < lf[i - 1] * (1 - 1e-9))) log.buckling.push(`${tag}: λ not ascending ${lf.map((x: number) => x.toFixed(3)).join(', ')}`);
    else if (lf[0] < 1e-6) log.bucklingMechanism.push(`${tag}: λ1=${lf[0].toExponential(2)} reported as a critical load factor (static ${res ? 'solved' : 'refused'})`);
    else lambda1 = lf[0];
    if (!allFinite(bk.value.modes.map((m: { displacements: unknown }) => m.displacements))) log.buckling.push(`${tag}: non-finite mode shape`);
  }

  // ── P-Δ ──
  const pd = attempt(() => solvePDelta3D(input));
  if (!pd.ok) { if (!isClearMessage(pd.msg) || res) log.pdelta.push(`${tag}: threw ${pd.msg.slice(0, 100)}`); }
  else {
    const p = pd.value;
    if (p.converged && p.isStable) {
      // Tension stiffens: B2 < 1 is right when members pull. Only a model with no tension must have B2 ≥ 1.
      const anyTension = (res ?? p.linearResults).elementForces.some((f: { nStart: number; nEnd: number }) => Math.max(f.nStart, f.nEnd) > 1e-6);
      if (!Number.isFinite(p.b2Factor) || (!anyTension && p.b2Factor < 0.99) || p.b2Factor < 0.5) log.pdelta.push(`${tag}: stable but B2=${p.b2Factor} (tension members: ${anyTension})`);
      if (!allFinite([p.results.displacements, p.results.reactions])) log.pdelta.push(`${tag}: stable but non-finite results`);
      else {
        const eq = equilibriumError(input, p.results);
        if (eq.force > 1e-5) log.pdeltaEq.push(`${tag}: ΣF rel=${eq.force.toExponential(2)}`);
      }
      if (lambda1 !== null && lambda1 < 0.95) log.pdelta.push(`${tag}: λ1=${lambda1.toFixed(3)} < 1 yet P-Δ converged and stable (B2=${p.b2Factor.toFixed(3)})`);
      if (lambda1 !== null && lambda1 > 1.5) {
        const theory = 1 / (1 - 1 / lambda1);
        if (p.b2Factor > 1.25 * theory) log.pdeltaB2Bound.push(`${tag}: B2=${p.b2Factor.toFixed(3)} > 1.25/(1−1/λ1)=${(1.25 * theory).toFixed(3)} (λ1=${lambda1.toFixed(2)})`);
      }
    }
    if (res && p.converged && p.isStable && p.linearResults) {
      const a = maxAbsU(res), b = maxAbsU(p.linearResults);
      if (Math.abs(a - b) > 1e-6 * Math.max(a, 1e-12)) log.pdelta.push(`${tag}: P-Δ linear pass max|u|=${b.toExponential(4)} ≠ static ${a.toExponential(4)}`);
    }
  }

  // ── modal ──
  const md = attempt(() => solveModal3D(input, densities()));
  if (!md.ok) {
    if (/eigenvalue decomposition failed/i.test(md.msg) && hasTrussOnlyNode(input)) log.modalTrussOnlyNode.push(`${tag}: "${md.msg}" (static ${res ? 'solved' : 'refused'})`);
    else if (!isClearMessage(md.msg) || res) log.modal.push(`${tag}: threw ${md.msg.slice(0, 100)}`);
  }
  else {
    const m = md.value;
    const f = m.modes.map((x: { frequency: number }) => x.frequency);
    if (f.length === 0) log.modal.push(`${tag}: no modes`);
    if (!allFinite(f) || f.some((x: number) => !(x > 0))) log.modal.push(`${tag}: frequencies ${f.map((x: number) => x?.toFixed?.(4)).join(', ')}`);
    if (f.some((x: number, i: number) => i > 0 && x < f[i - 1] * (1 - 1e-6))) log.modal.push(`${tag}: frequencies not ascending`);
    for (const dir of ['X', 'Y', 'Z'] as const) {
      const ratios = m.modes.map((x: Record<string, number>) => x[`massRatio${dir}`]);
      if (ratios.some((x: number) => !(x >= -1e-9 && x <= 1 + 1e-9))) log.modal.push(`${tag}: massRatio${dir} out of [0,1]: ${ratios.map((x: number) => x.toFixed(3)).join(', ')}`);
      const sum = ratios.reduce((a: number, b: number) => a + b, 0);
      if (sum > 1 + 1e-6) log.modal.push(`${tag}: Σ massRatio${dir} = ${sum.toFixed(6)} > 1`);
      const cum = m[`cumulativeMassRatio${dir}`];
      if (!(Math.abs(cum - sum) <= 1e-6)) log.modal.push(`${tag}: cumulativeMassRatio${dir}=${cum} ≠ Σ modes ${sum}`);
    }
  }

  if (res && kin.ok && (kin.value.mechanismModes > 0 || !kin.value.isSolvable)) {
    log.unexcitedOthers.push(`${tag}: buckling ${bk.ok ? 'λ1=' + bk.value.modes[0]?.loadFactor?.toExponential(2) : '"' + bk.msg.slice(0, 50) + '"'}; P-Δ ${pd.ok ? `converged=${pd.value.converged} stable=${pd.value.isStable}` : '"' + pd.msg.slice(0, 50) + '"'}; modal ${md.ok ? 'f1=' + md.value.modes[0]?.frequency?.toFixed(3) : '"' + md.msg.slice(0, 50) + '"'}`);
  }
  if (res) checkSectionStress(cs, tag, input, res, log, r);
}

/** A model with frames where some node is met only by truss bars (its rotations carry nothing). */
function hasTrussOnlyNode(input: SolverInput3D): boolean {
  const els = [...input.elements.values()];
  if (!els.some((e) => e.type === 'frame')) return false;
  const frameNodes = new Set(els.filter((e) => e.type === 'frame').flatMap((e) => [e.nodeI, e.nodeJ]));
  return els.some((e) => e.type === 'truss' && (!frameNodes.has(e.nodeI) || !frameNodes.has(e.nodeJ)));
}

/**
 * Two portal frames (fixed IPN columns, CHS eaves beams) with a triangular truss roof and a truss
 * ridge line. `braced` adds the diagonal bar that holds the ridge along X.
 */
function ridgeRoof(o: { braced: boolean; ridgeFx?: number; ridgeFz?: number; ridgeMx?: number }) {
  resetModel3D();
  modelStore.bulkMutate(() => {
    const P = addPalette();
    const A: number[] = [], B: number[] = [], R: number[] = [];
    for (let i = 0; i <= 1; i++) {
      const a0 = modelStore.addNode(i * 5, 0, 0), b0 = modelStore.addNode(i * 5, 6, 0);
      A.push(modelStore.addNode(i * 5, 0, 4)); B.push(modelStore.addNode(i * 5, 6, 4)); R.push(modelStore.addNode(i * 5, 3, 5));
      frame(a0, A[i], P.ipn); frame(b0, B[i], P.ipn);
      support(a0, 'fixed3d'); support(b0, 'fixed3d');
      truss(A[i], R[i], P.tube); truss(R[i], B[i], P.tube); truss(A[i], B[i], P.bar);
    }
    frame(A[0], A[1], P.tube); frame(B[0], B[1], P.tube); truss(R[0], R[1], P.tube);
    if (o.braced) truss(A[0], R[1], P.bar);
    for (const r of R) modelStore.addNodalLoad3D(r, o.ridgeFx ?? 0, 0, o.ridgeFz ?? -10, 0, 0, 0);
    if (o.ridgeMx) modelStore.addNodalLoad3D(R[0], 0, 0, 0, o.ridgeMx, 0, 0);
    modelStore.addNodalLoad3D(A[1], 1, 1, -5, 0, 0, 0);
  });
}

const report = (lines: string[], n = 12) => (lines.length ? `${lines.length} case(s):\n  ${lines.slice(0, n).join('\n  ')}` : '');

// ═════════════════════════════════════════════════════════════════
// 1. The sweep: every family × SEEDS_PER_FAMILY seeds × every function
// ═════════════════════════════════════════════════════════════════

const LOGS = new Map<string, SweepLog>();

describe.each(Object.keys(FAMILIES))('sweep: %s', (family) => {
  let log: SweepLog;
  beforeAll(() => {
    log = emptyLog();
    for (let seed = 1; seed <= SEEDS_PER_FAMILY; seed++) runModel(buildRandom(family, seed), log);
    LOGS.set(family, log);
  }, 120_000);

  it('builds and solves the models (no throw, clear refusals, finite numbers)', () => {
    expect(log.models).toBe(SEEDS_PER_FAMILY);
    expect(report(log.staticThrow)).toBe('');
    expect(report(log.staticNonFinite)).toBe('');
    // Hinged frames may be mechanisms; every other family is built stable.
    if (family !== 'hinged-frame') expect(report(log.staticRefused)).toBe('');
  });
  it('static: global equilibrium of forces and moments about the origin', () => { expect(report(log.equilibrium)).toBe(''); });
  it('kinematic: agrees with the static solve', () => { expect(report(log.kinematic)).toBe(''); });
  it('buckling: λ > 0 ascending, or the clear "no compressed elements" refusal', () => { expect(report(log.buckling)).toBe(''); });
  it('P-Δ: converges or reports instability; B2 ≥ 1; linear pass = static', () => { expect(report(log.pdelta)).toBe(''); });
  it('P-Δ: reactions balance the loads', () => { expect(report(log.pdeltaEq)).toBe(''); });
  it('modal: f > 0 ascending, mass ratios in [0,1], Σ ≤ 1 per direction', () => { expect(report(log.modal)).toBe(''); });
  it('section stress: resultants at the station are the diagram values', () => { expect(report(log.stressForces)).toBe(''); });
  it('section stress: σ = N/A − My·y/Iy + Mz·z/Iz at the fibre', () => { expect(report(log.stressNavier)).toBe(''); });
});

describe('sweep: observations that are bounds, not identities', () => {
  it('unexcited mechanisms: the static solve accepts them (by design, solver-service excitedMechanism3D); what the rest said (reported)', () => {
    const a = [...LOGS.values()].flatMap((l) => l.unexcited);
    const b = [...LOGS.values()].flatMap((l) => l.unexcitedOthers);
    if (a.length) console.info(`[sweep] unexcited mechanisms (${a.length}):\n  ${a.slice(0, 8).join('\n  ')}\n  others:\n  ${b.slice(0, 8).join('\n  ')}`);
    expect(a.length).toBe(b.length);
  });
  it('section stress coverage (reported)', () => {
    const checked = [...LOGS.values()].reduce((a, l) => a + l.stressChecked, 0);
    const thrown = [...LOGS.values()].reduce((a, l) => a + l.stressPropsOnlyThrow, 0);
    console.info(`[sweep] section stress: ${checked} geometry-backed members checked; analyzeSectionStress3D threw on ${thrown} properties-only members (not reachable from the panel, which refuses them as amorphous first)`);
    expect(checked).toBeGreaterThan(100);
  });
  /*
   * B₂ is the engine's largest DOF-wise ratio u_PΔ/u_lin (pdelta.rs b2_factor), which for an
   * arbitrary load pattern is not bounded by the first-mode amplification 1/(1−1/λ1): a DOF
   * whose linear value comes from cancelling contributions can be amplified more. So this is
   * reported, not asserted, for random models; the sway-frame family below asserts the
   * identity where it holds.
   */
  it('B2 vs 1/(1−1/λ1) on random models (reported)', () => {
    const all = [...LOGS.values()].flatMap((l) => l.pdeltaB2Bound);
    if (all.length) console.info(`[sweep] B2 above 1.25/(1−1/λ1) on ${all.length} random models:\n  ${all.slice(0, 10).join('\n  ')}`);
    const n = [...LOGS.values()].reduce((a, l) => a + l.models, 0);
    expect(n).toBe(SEEDS_PER_FAMILY * Object.keys(FAMILIES).length);
  });
});

/*
 * DEFECT D1 (fixed; kept as a regression test). It was: the canonical section panel reads the station forces with a straight line.
 *
 * `stationForces3D` (src/lib/section/panel.ts:86-124) interpolates My and Mz linearly between
 * the member ends. For any member with a distributed or point load the moment is not linear, so
 * for every geometry-backed section (catalogue profiles: IPN, HEB, RHS, CHS, rect — the only
 * ones SectionStressPanel analyses) the canonical stress state the panel shows over the drawn
 * section (`canonical` → `stateInputs` → canonicalStressState, SectionStressPanel.svelte:199-214
 * and 405-450) uses the wrong moment inside a loaded span: at midspan of a simply supported beam
 * under q it gets M = 0 instead of qL²/8. The 2D twin (`stationForces2D`) reads
 * `computeDiagramValueAt` and is right; the 3D one should read `evaluateDiagramAt`
 * (diagrams-3d.ts) the same way. The panel's legacy `analysis3D` branch interpolates correctly
 * (interpolateForces3D), so two readouts of the same panel disagree.
 */
describe('section panel station forces (D1)', () => {
  it('D1: stationForces3D gives qL²/8 at midspan of a simply supported IPN under q', () => {
    resetModel3D();
    let el = 0;
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
      el = frame(a, b, 1); // IPN 300, geometry-backed
      support(a, 'custom3d', DOF('xyzX')); support(b, 'custom3d', DOF('yz'));
      modelStore.addDistributedLoad3D(el, 0, 0, -10, -10);
    });
    const res = staticSolve() as AnalysisResults3D;
    const ef = res.elementForces.find((f) => f.elementId === el)!;
    expect(Math.abs(evaluateDiagramAt(ef, 'momentY', 0.5))).toBeCloseTo(45, 6); // the diagram is right
    expect(Math.abs(stationForces3D(ef, 0.5).my)).toBeCloseTo(45, 6);           // the panel's station is not
  });
  it('D1 (sweep): stationForces3D matches the diagram inside every loaded span of the sweep', () => {
    const all = [...LOGS.values()].flatMap((l) => l.stressCanonicalStation);
    expect(report(all)).toBe('');
  });
  it('section stress uses the same A, Iy, Iz the member was solved with (reported)', () => {
    const all = [...LOGS.values()].flatMap((l) => l.stressProps);
    if (all.length) console.info(`[sweep] stress/solve property mismatch:\n  ${[...new Set(all.map((x) => x.replace(/^\S+ e\d+ /, '')))].slice(0, 10).join('\n  ')}`);
    expect(true).toBe(true);
  });
});

/*
 * DEFECT D6 (fixed; kept as a regression test). It was: buckling reports a mechanism mode as a critical load factor.
 *
 * On a model with a mechanism, solveBuckling3D (handleBuckling3D, ToolbarAdvanced.svelte:430)
 * sometimes refuses ("Singular stiffness matrix"), but often returns λ1 ≈ 1e-12 — the zero
 * eigenvalue of the mechanism — which the toast shows as "factor 0.00" with a success style, or
 * throws the opaque "Eigenvalue decomposition failed". Seen in the sweep on (a) frames where a
 * pinned-base column carries only beams released about the vertical, so the column can spin about
 * its own axis (an unexcited mechanism the static solve accepts), and (b) a truss ridge line that
 * can slide along the building (an excited mechanism the static solve refuses). The static solve
 * has a gate for this (solver-service.ts excitedMechanism3D + the rank check in instability.explain);
 * the buckling handler has none, and nothing filters eigenvalues at round-off level.
 */
describe('buckling on mechanisms (D6)', () => {
  it('D6: a truss ridge line free to slide: buckling refuses, as the static solve does', () => {
    ridgeRoof({ braced: false, ridgeFx: 2, ridgeFz: -10 });
    const st = staticSolve();
    expect(typeof st).toBe('string');                    // static: "The structure is a mechanism…"
    const b = attempt(() => solveBuckling3D(input3D()!));
    // Before the fix: λ = [1.8e-12, 25.9, 78.3, 270] with no refusal.
    expect(b.ok && b.value.modes[0].loadFactor < 1e-6).toBe(false);
  });
  it('D6 (sweep): no λ1 ≈ 0 and no "Eigenvalue decomposition failed" from buckling', () => {
    const all = [...LOGS.values()].flatMap((l) => l.bucklingMechanism);
    expect(report(all)).toBe('');
  });
});

/*
 * DEFECT D8 (fixed; kept as a regression test). It was: modal fails on any frame model with a node that only truss bars meet.
 *
 * An L-shaped frame (fixed column + beam) with one tie bar from the beam tip down to a pinned
 * support — or a truss roof on frame columns — solves statically, and its P-Δ and buckling run,
 * but solveModal3D (handleModal3D, ToolbarAdvanced.svelte:407) throws "Eigenvalue decomposition
 * failed". The node met only by bars has three rotations with no mass and (after
 * stabiliseOrphanRotations3D, orphan-rotations-3d.ts) only a 1e-10 stiffness; stiffening those
 * springs to 1e3 does not help, so it is the massless rotations that break the sparse Lanczos
 * (engine/src/solver/modal.rs:358, lanczos_generalized_eigen_sparse). A pure truss model works
 * (3 DOF/node); a frame model where every bar ends on a frame node works. JS-side remedy that
 * does not touch the engine: for the modal wire, restrain (rrx/rry/rrz = true) the rotations
 * stabiliseOrphanRotations3D already identifies as carrying nothing.
 */
describe('modal with truss-only nodes (D8)', () => {
  it('D8: an L-frame with a tie to a pinned support has natural frequencies', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const P = addPalette();
      const b = modelStore.addNode(0, 0, 0), t = modelStore.addNode(0, 0, 3), e = modelStore.addNode(3, 0, 3), g = modelStore.addNode(3, 0, 0);
      frame(b, t, P.ipn); frame(t, e, P.ipn); truss(e, g, P.bar);
      support(b, 'fixed3d'); support(g, 'pinned3d');
      modelStore.addNodalLoad3D(e, 0, 0, -1, 0, 0, 0);
    });
    expect(typeof staticSolve()).toBe('object');
    const m = solveModal3D(input3D()!, densities());
    expect(m.modes[0].frequency).toBeGreaterThan(0);
  });
  it('D8: a braced truss roof on frame columns has natural frequencies', () => {
    ridgeRoof({ braced: true });
    expect(typeof staticSolve()).toBe('object');
    expect(solveModal3D(input3D()!, densities()).modes.length).toBeGreaterThan(0);
  });
  it('D8 (sweep): modal runs on every frame model with truss-only nodes that solves', () => {
    const all = [...LOGS.values()].flatMap((l) => l.modalTrussOnlyNode.filter((x) => x.includes('static solved')));
    expect(report(all)).toBe('');
  });
});

/*
 * DEFECT D9 (fixed; kept as a regression test). It was: P-Δ and buckling report a safe structure for a mechanism held only by tension.
 *
 * Portal frames with a truss roof whose ridge line has no diagonal: the ridge can slide along
 * X. Under wind uplift on the ridge (fz > 0) and a small longitudinal push, the static solve
 * refuses it ("The structure is a mechanism…"). solvePDelta3D on the same input returns
 * converged = true, isStable = true, B2 = 2.9e-12 — its linear pass is 3.4e10 m, and the tensioned
 * roof bars' geometric stiffness then "holds" the mode — and handlePDelta3D toasts success and
 * publishes the results. solveBuckling3D returns λ1 = 1.5e4. The handlers (ToolbarAdvanced.svelte
 * 386-452) call the engine on buildSolverInput3D directly and never apply the static solve's
 * mechanism gate (excitedMechanism3D on p.linearResults, or the rank check) to what comes back.
 */
describe('P-Δ on a mechanism held by tension (D9)', () => {
  it('D9: P-Δ does not call an uplifted, unbraced ridge "converged and stable"', () => {
    ridgeRoof({ braced: false, ridgeFx: 0.5, ridgeFz: 10 });
    const st = staticSolve();
    expect(typeof st).toBe('string');
    // P-Δ refuses the mechanism with the static solve's own message.
    const p = attempt(() => solvePDelta3D(input3D()!));
    expect(p.ok).toBe(false);
    expect((p as { msg: string }).msg).toBe(st);
  });
  it('D9: buckling does not give a finite safety factor for the same mechanism', () => {
    ridgeRoof({ braced: false, ridgeFx: 0.5, ridgeFz: 10 });
    const b = attempt(() => solveBuckling3D(input3D()!));
    expect(b.ok).toBe(false);
  });
});

/*
 * DEFECT D7 (fixed; kept as a regression test). It was: a nodal moment on a node only truss bars meet vanishes without a word.
 *
 * Such a node cannot carry a moment. In a frame model its rotations get the vanishing spring of
 * stabiliseOrphanRotations3D (orphan-rotations-3d.ts), the moment goes into that spring, the
 * static solve returns rotations of ~1e5 rad as a result, and the spring's reaction is stripped
 * (stripStabilisedReactions, wasm-solver.ts:485) — so ΣM of reactions + loads is off by the moment.
 * In a pure truss model the moment is dropped. Either way the user is shown a solved model whose
 * reactions do not balance the loads. Expected: a refusal naming the node, like the other
 * load-on-nothing checks in prepareSolve3D, or at least a warning.
 */
describe('moment on a truss-only node (D7)', () => {
  it('D7: frame model — the solve refuses, or its reactions balance the moment', () => {
    ridgeRoof({ braced: true, ridgeMx: 3 });
    const r = staticSolve();
    if (typeof r === 'string') return;
    const eq = equilibriumError(input3D()!, r as AnalysisResults3D);
    expect(eq.moment).toBeLessThan(EQ_TOL);
    expect(Math.max(...(r as AnalysisResults3D).displacements.map((d) => Math.abs(d.rx)))).toBeLessThan(1);
  });
  it('D7: pure truss — the solve refuses, or its reactions balance the moment', () => {
    buildRandom('space-truss', 1);
    modelStore.addNodalLoad3D([...modelStore.nodes.keys()][5], 0, 0, 0, 3, 0, 0);
    const r = staticSolve();
    if (typeof r === 'string') return;
    expect(equilibriumError(input3D()!, r as AnalysisResults3D).moment).toBeLessThan(EQ_TOL);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. Closed forms
// ═════════════════════════════════════════════════════════════════

const E = 200_000; // MPa (default steel)

/** A vertical column along Z, n elements, with its own section. */
function column(n: number, L: number, iy: number, iz: number, bottom: 'pinned' | 'fixed', top: 'guided' | 'free', P = 100) {
  resetModel3D();
  modelStore.bulkMutate(() => {
    const sec = modelStore.addSection({ name: 'col', a: 0.01, iy, iz, j: 1e-4 });
    const ids: number[] = [];
    for (let i = 0; i <= n; i++) ids.push(modelStore.addNode(0, 0, (L * i) / n));
    for (let i = 0; i < n; i++) frame(ids[i], ids[i + 1], sec);
    if (bottom === 'pinned') support(ids[0], 'custom3d', DOF('xyzZ')); // pinned, twist held
    else support(ids[0], 'fixed3d');
    if (top === 'guided') support(ids[n], 'custom3d', DOF('xy'));
    modelStore.addNodalLoad3D(ids[n], 0, 0, -P, 0, 0, 0);
  });
  return input3D()!;
}

describe('closed forms: Euler columns (buckling 3D)', () => {
  const L = 5, iy = 8e-5, iz = 2e-5, P = 100;
  const Imin = Math.min(iy, iz);
  const pcr = (K: number) => (Math.PI ** 2 * E * 1000 * Imin) / (K * L) ** 2; // kN

  it.each([
    ['pinned-pinned', 'pinned', 'guided', 1, 8],
    ['fixed-free', 'fixed', 'free', 2, 8],
    ['fixed-guided (K=0.7 pinned top)', 'fixed', 'guided', 0.699, 12],
  ] as const)('%s, %i elements: λ1·P = π²EI/(KL)² within 1%', (_n, bot, top, K, n) => {
    const b = solveBuckling3D(column(n, L, iy, iz, bot, top, P));
    const pc = b.modes[0].loadFactor * P;
    expect(Math.abs(pc / pcr(K) - 1)).toBeLessThan(0.01);
    // The weak axis governs, and the strong-axis mode is there too.
    const strong = b.modes.map((m: { loadFactor: number }) => m.loadFactor * P).find((x: number) => Math.abs(x / (pcr(K) * iy / iz) - 1) < 0.02);
    expect(strong).toBeDefined();
  });

  it('mesh effect: one cubic element overestimates the pinned-pinned load by ≈ 21.6 % (12/π²), two by < 1 %', () => {
    const one = solveBuckling3D(column(1, L, iy, iz, 'pinned', 'guided', P)).modes[0].loadFactor * P;
    const two = solveBuckling3D(column(2, L, iy, iz, 'pinned', 'guided', P)).modes[0].loadFactor * P;
    // A single consistent-geometric-stiffness element gives 12EI/L² for pinned-pinned.
    expect(one / pcr(1)).toBeGreaterThan(1.1);
    expect(one / pcr(1)).toBeLessThan(1.25);
    expect(Math.abs(two / pcr(1) - 1)).toBeLessThan(0.01);
  });

  it('fixed-free with one element is within 1 % already (mesh effect small for the cantilever)', () => {
    const one = solveBuckling3D(column(1, L, iy, iz, 'fixed', 'free', P)).modes[0].loadFactor * P;
    expect(Math.abs(one / pcr(2) - 1)).toBeLessThan(0.01);
  });

  it('P-Δ of the fixed-free column with a small lateral load: B2 ≈ 1/(1 − P/Pcr)', () => {
    for (const frac of [0.2, 0.5, 0.7]) {
      const Pa = frac * pcr(2);
      resetModel3D();
      modelStore.bulkMutate(() => {
        const sec = modelStore.addSection({ name: 'col', a: 0.01, iy, iz, j: 1e-4 });
        const ids: number[] = [];
        for (let i = 0; i <= 8; i++) ids.push(modelStore.addNode(0, 0, (L * i) / 8));
        for (let i = 0; i < 8; i++) frame(ids[i], ids[i + 1], sec);
        support(ids[0], 'fixed3d');
        // Lateral load along the weak direction. Column local z = global X (local-axes-3d.ts),
        // so bending in the XZ plane uses Iy... put it in both and let B2 pick the governing one.
        modelStore.addNodalLoad3D(ids[8], 0.001 * Pa, 0.001 * Pa, -Pa, 0, 0, 0);
      });
      const p = solvePDelta3D(input3D()!, 50, 1e-8);
      expect(p.converged).toBe(true);
      expect(p.isStable).toBe(true);
      expect(Math.abs(p.b2Factor * (1 - frac) - 1)).toBeLessThan(0.05);
    }
  });

  it('P-Δ past the critical load reports instability (not a converged stable result)', () => {
    const p = solvePDelta3D(column(8, L, iy, iz, 'fixed', 'free', 1.3 * pcr(2)));
    expect(p.converged && p.isStable).toBe(false);
  });
});

describe('closed forms: cantilever frequencies (modal 3D)', () => {
  const L = 4, a = 0.01, iy = 8e-5, iz = 2e-5, rho = 78.5;
  const m = (rho * 1000 / 9.81) * a; // kg/m
  const f1 = (I: number) => (3.516 / (2 * Math.PI)) * Math.sqrt((E * 1e6 * I) / (m * L ** 4));

  function cantilever(n: number, eFactor = 1) {
    resetModel3D();
    modelStore.bulkMutate(() => {
      modelStore.updateMaterial(1, { e: E * eFactor });
      const sec = modelStore.addSection({ name: 'c', a, iy, iz, j: 1e-4 });
      const ids: number[] = [];
      for (let i = 0; i <= n; i++) ids.push(modelStore.addNode((L * i) / n, 0, 2));
      for (let i = 0; i < n; i++) frame(ids[i], ids[i + 1], sec);
      support(ids[0], 'fixed3d');
      modelStore.addNodalLoad3D(ids[n], 0, 0, -1, 0, 0, 0);
    });
    return input3D()!;
  }

  it('10 elements: first two modes are the weak- and strong-axis bending, each within 2 %', () => {
    const r = solveModal3D(cantilever(10), densities());
    const f = r.modes.map((x: { frequency: number }) => x.frequency);
    expect(Math.abs(f[0] / f1(iz) - 1)).toBeLessThan(0.02);
    expect(f.some((x: number) => Math.abs(x / f1(iy) - 1) < 0.02)).toBe(true);
  });

  it('E × 4 → every frequency × 2', () => {
    const a1 = solveModal3D(cantilever(6), densities()).modes.map((x: { frequency: number }) => x.frequency);
    const a4 = solveModal3D(cantilever(6, 4), densities()).modes.map((x: { frequency: number }) => x.frequency);
    a1.forEach((x: number, i: number) => expect(a4[i] / x).toBeCloseTo(2, 6));
  });

  it('E × 4 → f × 2 on random space frames too', () => {
    for (let seed = 1; seed <= 10; seed++) {
      buildRandom(seed % 2 ? 'skew-frame' : 'pitched-nave', seed);
      const f = solveModal3D(input3D()!, densities()).modes.map((x: { frequency: number }) => x.frequency);
      for (const mat of [...modelStore.materials.values()]) modelStore.updateMaterial(mat.id, { e: mat.e * 4 });
      const g = solveModal3D(input3D()!, densities()).modes.map((x: { frequency: number }) => x.frequency);
      f.forEach((x: number, i: number) => expect(g[i] / x).toBeCloseTo(2, 5));
    }
  });
});

describe('closed forms: B2 on sway frames against the buckling factor', () => {
  /** A space frame with gravity at the column tops scaled so that λ1 = target, plus a small lateral load. */
  function swayFrame(seed: number, target: number) {
    const build = (P: number) => {
      resetModel3D();
      const r = new Rng(seed);
      modelStore.bulkMutate(() => {
        const bx = r.int(1, 3), by = r.int(1, 2), ns = r.int(1, 3), s = r.uni(4, 6), h = r.uni(3, 4);
        const col = modelStore.addSection({ name: 'col', a: 0.006, iy: r.uni(2e-5, 6e-5), iz: r.uni(2e-5, 6e-5), j: 1e-6 });
        const bm = modelStore.addSection({ name: 'bm', a: 0.008, iy: 2e-4, iz: 5e-5, j: 1e-6 });
        const ids: number[] = [];
        const at = (i: number, j: number, k: number) => ids[(k * (by + 1) + j) * (bx + 1) + i];
        for (let k = 0; k <= ns; k++) for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) ids.push(modelStore.addNode(i * s, j * s, k * h));
        for (let k = 1; k <= ns; k++) for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) {
          frame(at(i, j, k - 1), at(i, j, k), col);
          if (i < bx) frame(at(i, j, k), at(i + 1, j, k), bm);
          if (j < by) frame(at(i, j, k), at(i, j + 1, k), bm);
          modelStore.addNodalLoad3D(at(i, j, k), 0.002 * P, 0.001 * P, -P, 0, 0, 0);
        }
        const base = r.chance(0.5) ? 'fixed3d' : 'pinned3d';
        for (let j = 0; j <= by; j++) for (let i = 0; i <= bx; i++) support(at(i, j, 0), base);
      });
    };
    build(100);
    const l100 = solveBuckling3D(input3D()!).modes[0].loadFactor;
    build((100 * l100) / target);
    return input3D()!;
  }

  it.each([1.6, 2, 3, 5, 10])('λ1 = %s: B2 within 25 % of 1/(1 − 1/λ1) on 12 sway frames', (target) => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const input = swayFrame(seed, target);
      const l1 = solveBuckling3D(input).modes[0].loadFactor;
      const p = solvePDelta3D(input, 50, 1e-7);
      const theory = 1 / (1 - 1 / l1);
      if (!p.converged || !p.isStable || Math.abs(p.b2Factor / theory - 1) > 0.25 || p.b2Factor < 1) bad.push(`seed ${seed}: λ1=${l1.toFixed(3)} B2=${p.b2Factor.toFixed(3)} theory=${theory.toFixed(3)} conv=${p.converged}`);
    }
    expect(bad).toEqual([]);
  });

  it('λ1 = 0.8: P-Δ reports instability on every one of 12 sway frames', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const p = solvePDelta3D(swayFrame(seed, 0.8));
      if (p.converged && p.isStable) bad.push(`seed ${seed}: stable, B2=${p.b2Factor}`);
    }
    expect(bad).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. Section stress: the sign a student checks first
// ═════════════════════════════════════════════════════════════════

describe('section stress 3D: the sign a student checks first', () => {
  const RECT = { name: 'r', shape: 'rect' as const, a: 0.2 * 0.4, iy: (0.2 * 0.4 ** 3) / 12, iz: (0.4 * 0.2 ** 3) / 12, j: 0.002, b: 0.2, h: 0.4 };
  function beam(kind: 'ss-x' | 'ss-y' | 'cant', dir: [number, number], opts: { roll?: number; qY?: number; qZ?: number } = {}) {
    resetModel3D();
    const L = 6;
    let el = 0;
    modelStore.bulkMutate(() => {
      const sec = modelStore.addSection(RECT);
      const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(dir[0] * L, dir[1] * L, 3);
      el = frame(a, b, sec);
      if (opts.roll) modelStore.updateElement(el, { rollAngle: opts.roll });
      if (kind === 'ss-x') { support(a, 'custom3d', DOF('xyzX')); support(b, 'custom3d', DOF('yz')); }
      else if (kind === 'ss-y') { support(a, 'custom3d', DOF('xyzY')); support(b, 'custom3d', DOF('xz')); }
      else support(a, 'fixed3d');
      // Local z is up for a horizontal member (local-axes-3d.ts): qZ < 0 is gravity.
      modelStore.addDistributedLoad3D(el, opts.qY ?? 0, opts.qY ?? 0, opts.qZ ?? -10, opts.qZ ?? -10);
    });
    const res = staticSolve();
    if (typeof res === 'string' || !res) throw new Error(String(res));
    const ef = res.elementForces.find((f) => f.elementId === el)!;
    const sec = modelStore.sections.get(modelStore.elements.get(el)!.sectionId)!;
    return { ef, sec, L, q: 10 };
  }

  it.each([['along X', 'ss-x', [1, 0]], ['along Y', 'ss-y', [0, 1]]] as const)(
    'simply supported %s under gravity: |M| = qL²/8 at midspan, bottom fibre in tension', (_n, kind, dir) => {
      const { ef, sec, L, q } = beam(kind, dir as unknown as [number, number]);
      const s = (y: number) => analyzeSectionStress3D(ef, sec, 250, 0.5, y, 0);
      const M = (q * L * L) / 8;
      expect(Math.abs(s(0).My)).toBeCloseTo(M, 3);
      expect(s(-0.2).sigmaAtFiber).toBeGreaterThan(0);
      expect(s(0.2).sigmaAtFiber).toBeLessThan(0);
      expect(s(-0.2).sigmaAtFiber).toBeCloseTo((M * 0.2) / sec.iy! / 1000, 3);
    });

  it.each([['X', [1, 0]], ['Y', [0, 1]], ['plan diagonal', [Math.SQRT1_2, Math.SQRT1_2]], ['plan 120°', [-0.5, Math.sqrt(3) / 2]]] as const)(
    'cantilever along %s under gravity: top fibre in tension at the root, |M| = qL²/2', (_n, dir) => {
      const { ef, sec, L, q } = beam('cant', dir as unknown as [number, number]);
      const s = (y: number) => analyzeSectionStress3D(ef, sec, 250, 0, y, 0);
      expect(Math.abs(s(0).My)).toBeCloseTo((q * L * L) / 2, 3);
      expect(s(0.2).sigmaAtFiber).toBeGreaterThan(0);
      expect(s(-0.2).sigmaAtFiber).toBeLessThan(0);
    });

  it('roll 90°: gravity (now along local y) bends the weak axis, and σ at the width fibre is Mz·z/Iz', () => {
    // After a 90° roll the global vertical is local ±y; load it there.
    const { ef, sec, L, q } = beam('cant', [1, 0], { roll: 90, qY: -10, qZ: 0 });
    const s = analyzeSectionStress3D(ef, sec, 250, 0, 0, 0.1);
    const M = (q * L * L) / 2;
    expect(Math.abs(s.Mz)).toBeCloseTo(M, 3);
    expect(Math.abs(s.sigmaAtFiber)).toBeCloseTo((M * 0.1) / sec.iz / 1000, 3);
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. What-if (Explore) in 3D: linearity of the sliders
// ═════════════════════════════════════════════════════════════════

describe('what-if 3D', () => {
  afterEach(() => { vi.useRealTimers(); });

  const flush = () => vi.advanceTimersByTime(200);
  const solved = (): AnalysisResults3D => {
    const r = staticSolve();
    if (typeof r === 'string' || !r) throw new Error(String(r));
    return r;
  };
  function ratioMismatch(a: AnalysisResults3D, b: AnalysisResults3D, k: number): number {
    const ua = maxAbsU(a), ub = maxAbsU(b);
    const ra = Math.max(...a.reactions.map((x) => Math.hypot(x.fx, x.fy, x.fz)));
    const rb = Math.max(...b.reactions.map((x) => Math.hypot(x.fx, x.fy, x.fz)));
    return Math.max(Math.abs(ub / (k * ua) - 1), Math.abs(rb / (k * ra) - 1));
  }
  async function session<T>(fn: () => T): Promise<T> {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    uiStore.liveCalc = true; // so close() restores without scheduling a live solve
    whatIf.open();
    try { return fn(); } finally { await whatIf.close(); vi.useRealTimers(); }
  }

  const FAMS = ['space-frame', 'skew-frame', 'grillage', 'tower', 'cantilever-torsion', 'mixed-frame-truss', 'pitched-nave', 'space-truss'];

  it('every load × k → displacements and reactions × k; E × k → displacements ÷ k; close() restores (nodal + distributed loads)', async () => {
    const bad: string[] = [];
    for (const fam of FAMS) for (let seed = 1; seed <= 4; seed++) {
      buildRandom(fam, seed);
      // Keep only nodal and distributed loads here; point loads on members are D2 below.
      modelStore.model.loads = modelStore.model.loads.filter((l) => l.type !== 'pointOnElement3d');
      const b0 = staticSolve();
      if (typeof b0 === 'string' || !b0) continue;
      const base = b0;
      await session(() => {
        whatIf.loadFactors.forEach((_, i) => whatIf.setLoadFactor(i, 2.5)); flush();
        const e1 = ratioMismatch(base, solved(), 2.5);
        if (e1 > 1e-6) bad.push(`${fam}#${seed}: loads×2.5 → ratio off by ${e1.toExponential(2)}`);
        whatIf.loadFactors.forEach((_, i) => whatIf.setLoadFactor(i, 1));
        whatIf.setAll('e', 2); flush();
        const ub = maxAbsU(solved());
        if (Math.abs((2 * ub) / maxAbsU(base) - 1) > 1e-6) bad.push(`${fam}#${seed}: E×2 → max|u| ratio ${(ub / maxAbsU(base)).toFixed(6)}`);
      });
      const after = solved();
      if (Math.abs(maxAbsU(after) / maxAbsU(base) - 1) > 1e-9) bad.push(`${fam}#${seed}: model not restored by close()`);
    }
    expect(bad).toEqual([]);
  });

  it('moving the same slider twice does not compound the factor', async () => {
    buildRandom('space-frame', 3);
    modelStore.model.loads = modelStore.model.loads.filter((l) => l.type !== 'pointOnElement3d');
    const base = solved();
    await session(() => {
      whatIf.loadFactors.forEach((_, i) => whatIf.setLoadFactor(i, 2)); flush();
      whatIf.loadFactors.forEach((_, i) => whatIf.setLoadFactor(i, 2)); flush();
      whatIf.setAll('a', 1.5); flush();
      whatIf.setAll('a', 1); flush();
      expect(ratioMismatch(base, solved(), 2)).toBeLessThan(1e-6);
    });
  });

  /*
   * DEFECT D2 (fixed; kept as a regression test). It was: the what-if load slider does nothing to a point load on a member in 3D.
   *
   * WhatIfPanel lists one slider per load, including `pointOnElement3d`, but
   * `scaleLoads` (src/lib/store/whatif.svelte.ts:57-80) has cases for nodal3d and
   * distributed3d only; a 3D point load on a member keeps its baseline value whatever the
   * slider says. The 2D point load (`pointOnElement`) is scaled. Missing case:
   *   case 'pointOnElement3d': d.py = base.py * f; d.pz = base.pz * f; break;
   */
  it('D2: a point load on a member scales with its slider', async () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
      const e = frame(a, b, 1);
      support(a, 'fixed3d');
      modelStore.addPointLoadOnElement3D(e, 3, 0, -10);
    });
    const base = solved();
    await session(() => {
      whatIf.setLoadFactor(0, 2); flush();
      expect(maxAbsU(solved()) / maxAbsU(base)).toBeCloseTo(2, 6);
    });
  });

  it('Iy × 2 on a catalogue (geometry-backed) beam halves the vertical deflection', async () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
      frame(a, b, 1); // IPN 300, geometry-backed
      support(a, 'fixed3d');
      modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
    });
    const base = solved();
    await session(() => {
      whatIf.setAll('iy', 2); flush();
      const uz = (r: AnalysisResults3D) => Math.max(...r.displacements.map((d) => Math.abs(d.uz)));
      expect(uz(solved()) / uz(base)).toBeCloseTo(0.5, 4);
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. Edge cases
// ═════════════════════════════════════════════════════════════════

/** Everything the Advanced panel runs, on the model as it is; returns what each said. */
function everything() {
  const input = input3D();
  const st = attempt(() => staticSolve());
  if (!input) return { input, st, kin: null, pd: null, bk: null, md: null };
  return {
    input, st,
    kin: attempt(() => analyzeKinematics3D(input)),
    pd: attempt(() => solvePDelta3D(input)),
    bk: attempt(() => solveBuckling3D(input)),
    md: attempt(() => solveModal3D(input, densities())),
  };
}

/** Outcome is either a clear refusal or a value whose numbers are finite. */
function sane(o: Outcome<unknown> | null): void {
  if (!o) return;
  if (!o.ok) { expect(isClearMessage(o.msg), o.msg).toBe(true); return; }
  if (typeof o.value === 'string') { expect(isClearMessage(o.value), o.value).toBe(true); return; }
  const v = o.value as Record<string, unknown>;
  expect(allFinite([v.displacements, v.reactions, (v as { modes?: Array<{ frequency?: number; loadFactor?: number }> }).modes?.map((m) => [m.frequency ?? 0, m.loadFactor ?? 0])])).toBe(true);
}

describe('edge cases', () => {
  it('mechanism (portal on pins with every beam end hinged): static refuses clearly, kinematic names it, nothing crashes', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(5, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3),
        modelStore.addNode(0, 4, 0), modelStore.addNode(5, 4, 0), modelStore.addNode(0, 4, 3), modelStore.addNode(5, 4, 3)];
      const cols = [[0, 2], [1, 3], [4, 6], [5, 7]].map(([a, b]) => frame(n[a], n[b], 1));
      for (const [a, b] of [[2, 3], [6, 7], [2, 6], [3, 7]]) {
        const e = frame(n[a], n[b], 1);
        modelStore.updateElement(e, { releaseI: { my: true, mz: true, t: false }, releaseJ: { my: true, mz: true, t: false } });
      }
      void cols;
      for (const b of [n[0], n[1], n[4], n[5]]) support(b, 'pinned3d');
      modelStore.addNodalLoad3D(n[2], 10, 0, -10, 0, 0, 0);
    });
    const r = everything();
    expect(r.st.ok).toBe(true);
    expect(typeof (r.st as { value: unknown }).value).toBe('string');
    expect(isMechanismMsg((r.st as { value: string }).value)).toBe(true);
    expect(r.kin!.ok && (r.kin as { value: { mechanismModes: number } }).value.mechanismModes).toBeGreaterThan(0);
    sane(r.pd); sane(r.bk); sane(r.md);
    if (r.pd!.ok) expect((r.pd as { value: { converged: boolean; isStable: boolean } }).value.converged && (r.pd as { value: { isStable: boolean } }).value.isStable).toBe(false);
  });

  /*
   * DEFECT D3 (fixed; kept as a regression test). It was: modal answers a sway mechanism with rigid-body "modes" and a success toast.
   *
   * The portal above (pinned bases, every beam end hinged: a sway mechanism the load excites) is
   * refused by the static solve, by P-Δ and by buckling ("Singular stiffness matrix — structure
   * is a mechanism"). solveModal3D returns two modes at ≈ 2e-6 Hz and nothing else, and
   * handleModal3D (ToolbarAdvanced.svelte:407-428) shows them as a successful analysis. A zero
   * frequency is the mechanism, not a vibration; the modal handler should refuse the same way
   * (e.g. analyzeKinematics3D first, as instability.explain does).
   */
  it('D3: modal refuses the sway mechanism the other analyses refuse', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(5, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3),
        modelStore.addNode(0, 4, 0), modelStore.addNode(5, 4, 0), modelStore.addNode(0, 4, 3), modelStore.addNode(5, 4, 3)];
      for (const [a, b] of [[0, 2], [1, 3], [4, 6], [5, 7]]) frame(n[a], n[b], 1);
      for (const [a, b] of [[2, 3], [6, 7], [2, 6], [3, 7]]) {
        const e = frame(n[a], n[b], 1);
        modelStore.updateElement(e, { releaseI: { my: true, mz: true, t: false }, releaseJ: { my: true, mz: true, t: false } });
      }
      for (const b of [n[0], n[1], n[4], n[5]]) support(b, 'pinned3d');
      modelStore.addNodalLoad3D(n[2], 10, 0, -10, 0, 0, 0);
    });
    const r = everything();
    expect(typeof (r.st as { value: unknown }).value).toBe('string');
    expect(r.pd!.ok).toBe(false);
    expect(r.bk!.ok).toBe(false);
    // Before the fix: modes at 1.9e-6 and 2.4e-6 Hz, reported as a result.
    expect(r.md!.ok && (r.md as { value: { modes: Array<{ frequency: number }> } }).value.modes[0].frequency < 1e-3).toBe(false);
  });

  /*
   * DEFECT D10 (fixed; kept as a regression test). It was: P-Δ, buckling and modal do not run the static solve's model checks.
   *
   * With one stray node (drawn and never connected), the static solve says "Node 3 is not
   * connected to any member. Remove it or connect it." (prepareSolve3D, solver-service.ts:1719).
   * handlePDelta3D / handleBuckling3D / handleModal3D (ToolbarAdvanced.svelte:386-452) build the
   * input with buildSolverInput3D, which skips prepareSolve3D, so the same model gets "Singular
   * stiffness matrix — structure is a mechanism" from P-Δ and buckling, and "Eigenvalue
   * decomposition failed" from modal. The user is sent looking for a mechanism that is not there.
   */
  it('D10: a loaded stray node gets the same refusal from the static solve, P-Δ, buckling and modal', () => {
    // An unloaded stray node is left out of every solve (`solvableModel`); a loaded one is refused.
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(2, 2, 2);
      frame(a, b, 1); support(a, 'fixed3d');
      modelStore.addNodalLoad3D(b, 1, 0, -10, 0, 0, 0);
      modelStore.addNodalLoad3D(c, 0, 0, -1, 0, 0, 0);
    });
    const r = everything();
    const st = (r.st as { value: unknown }).value;
    expect(typeof st).toBe('string');
    // Refused as not connected, not as a mechanism: that is what sends the user to the stray node.
    expect(st).toMatch(/not connected|no está conectado/i);
    for (const o of [r.pd, r.bk, r.md]) {
      expect(o!.ok).toBe(false);
      expect((o as { msg: string }).msg).toBe(st);
    }
  });

  it('a planar frame drawn in 3D (XZ plane, fixed bases, in-plane loads) runs everything', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(6, 0, 0), modelStore.addNode(0, 0, 4), modelStore.addNode(6, 0, 4)];
      frame(n[0], n[2], 1); frame(n[1], n[3], 1); const b = frame(n[2], n[3], 1);
      support(n[0], 'fixed3d'); support(n[1], 'fixed3d');
      modelStore.addNodalLoad3D(n[2], 10, 0, -50, 0, 0, 0);
      modelStore.addDistributedLoad3D(b, 0, 0, -8, -8);
    });
    const r = everything();
    expect(r.st.ok && typeof (r.st as { value: unknown }).value).toBe('object');
    const res = (r.st as { value: AnalysisResults3D }).value;
    const eq = equilibriumError(r.input!, res);
    expect(eq.force).toBeLessThan(EQ_TOL); expect(eq.moment).toBeLessThan(EQ_TOL);
    // Nothing out of plane.
    expect(Math.max(...res.displacements.map((d) => Math.abs(d.uy)))).toBeLessThan(1e-12);
    expect((r.pd as { value: { converged: boolean } }).value.converged).toBe(true);
    expect((r.bk as { value: { modes: Array<{ loadFactor: number }> } }).value.modes[0].loadFactor).toBeGreaterThan(1);
    expect((r.md as { value: { modes: Array<{ frequency: number }> } }).value.modes[0].frequency).toBeGreaterThan(0);
  });

  it('a planar portal on pins drawn in 3D (out-of-plane sway mechanism the in-plane loads do not excite): consistent answers', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(6, 0, 0), modelStore.addNode(0, 0, 4), modelStore.addNode(6, 0, 4)];
      frame(n[0], n[2], 1); frame(n[1], n[3], 1); frame(n[2], n[3], 1);
      support(n[0], 'pinned3d'); support(n[1], 'pinned3d');
      modelStore.addNodalLoad3D(n[2], 10, 0, -50, 0, 0, 0);
    });
    const r = everything();
    sane(r.st); sane(r.pd); sane(r.bk); sane(r.md);
    const k = (r.kin as { value: { mechanismModes: number } }).value;
    expect(k.mechanismModes).toBeGreaterThan(0);
    // If static returns results for a structure the kinematic analysis calls a mechanism,
    // they must at least be the in-plane answer (finite, balanced, nothing out of plane).
    if (r.st.ok && typeof r.st.value === 'object' && r.st.value) {
      const res = r.st.value as AnalysisResults3D;
      const eq = equilibriumError(r.input!, res);
      expect(eq.force).toBeLessThan(1e-5);
      expect(Math.max(...res.displacements.map((d) => Math.abs(d.uy)))).toBeLessThan(1e-6);
    }
  });

  it('a single member (cantilever) runs everything, and the tip deflection is PL³/3EI', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
      frame(a, b, 1);
      support(a, 'fixed3d');
      modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
    });
    const r = everything();
    const res = (r.st as { value: AnalysisResults3D }).value;
    const iy = r.input!.sections.get(1)!.iy;
    expect(Math.max(...res.displacements.map((d) => Math.abs(d.uz)))).toBeCloseTo((10 * 27) / (3 * E * 1000 * iy), 6);
    sane(r.pd); sane(r.md);
    // A cantilever under a transverse load has no compressed member.
    expect(!r.bk!.ok && /no compressed/i.test((r.bk as { msg: string }).msg)).toBe(true);
  });

  it('no loads at all: static and P-Δ give zero, buckling says "no compressed elements", modal still works', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 0, 0)];
      frame(n[0], n[1], 1); frame(n[1], n[2], 1); frame(n[2], n[3], 1);
      support(n[0], 'fixed3d'); support(n[3], 'fixed3d');
    });
    const r = everything();
    sane(r.st); sane(r.pd); sane(r.bk);
    if (r.st.ok && typeof r.st.value === 'object' && r.st.value) expect(maxAbsU(r.st.value as AnalysisResults3D)).toBe(0);
    if (r.pd!.ok) expect(allFinite((r.pd as { value: unknown }).value)).toBe(true);
    if (!r.bk!.ok) expect((r.bk as { msg: string }).msg).toMatch(/no compressed/i);
    const md = (r.md as { ok: boolean; value: { modes: Array<{ frequency: number }> } });
    expect(md.ok).toBe(true);
    expect(md.value.modes[0].frequency).toBeGreaterThan(0);
  });

  it('torsion only: a cantilever under a pure torque twists by TL/GJ, P-Δ B2 = 1, no buckling', () => {
    resetModel3D();
    const L = 3, T = 5;
    modelStore.bulkMutate(() => {
      const sec = modelStore.addSection({ name: 't', a: 0.01, iy: 8e-5, iz: 2e-5, j: 3e-5 });
      const a = modelStore.addNode(0, 0, 1), b = modelStore.addNode(L, 0, 1);
      frame(a, b, sec);
      support(a, 'fixed3d');
      modelStore.addNodalLoad3D(b, 0, 0, 0, T, 0, 0);
    });
    const r = everything();
    const res = (r.st as { value: AnalysisResults3D }).value;
    const G = (E * 1000) / (2 * 1.3);
    expect(Math.max(...res.displacements.map((d) => Math.abs(d.rx)))).toBeCloseTo((T * L) / (G * 3e-5), 6);
    expect(Math.abs(res.elementForces[0].mxStart)).toBeCloseTo(T, 6);
    const pd = (r.pd as { value: { converged: boolean; isStable: boolean; b2Factor: number } }).value;
    expect(pd.converged && pd.isStable).toBe(true);
    expect(pd.b2Factor).toBeCloseTo(1, 6);
    expect(!r.bk!.ok && /no compressed/i.test((r.bk as { msg: string }).msg)).toBe(true);
    sane(r.md);
  });

  it('a truss mechanism in one direction (plane truss drawn in 3D, free out of plane): refused or balanced, never garbage', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const b = [0, 1, 2, 3].map((i) => modelStore.addNode(i * 2, 0, 0));
      const t = [0, 1, 2].map((i) => modelStore.addNode(i * 2 + 1, 0, 1.5));
      for (let i = 0; i < 3; i++) { truss(b[i], b[i + 1], 1); truss(b[i], t[i], 1); truss(t[i], b[i + 1], 1); if (i < 2) truss(t[i], t[i + 1], 1); }
      support(b[0], 'pinned3d'); support(b[3], 'pinned3d');
      modelStore.addNodalLoad3D(t[1], 0, 0, -10, 0, 0, 0);
    });
    const r = everything();
    const k = (r.kin as { value: { mechanismModes: number } }).value;
    expect(k.mechanismModes).toBeGreaterThan(0);
    sane(r.st); sane(r.pd); sane(r.bk); sane(r.md);
    if (r.st.ok && typeof r.st.value === 'object' && r.st.value) {
      const res = r.st.value as AnalysisResults3D;
      expect(equilibriumError(r.input!, res).force).toBeLessThan(1e-5);
      expect(Math.max(...res.displacements.map((d) => Math.abs(d.uy)))).toBeLessThan(1e-6);
    }
  });

  it('the same truss with an out-of-plane load: static refuses it as a mechanism, kinematic agrees', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const b = [0, 1, 2, 3].map((i) => modelStore.addNode(i * 2, 0, 0));
      const t = [0, 1, 2].map((i) => modelStore.addNode(i * 2 + 1, 0, 1.5));
      for (let i = 0; i < 3; i++) { truss(b[i], b[i + 1], 1); truss(b[i], t[i], 1); truss(t[i], b[i + 1], 1); if (i < 2) truss(t[i], t[i + 1], 1); }
      support(b[0], 'pinned3d'); support(b[3], 'pinned3d');
      modelStore.addNodalLoad3D(t[1], 0, 2, -10, 0, 0, 0);
    });
    const r = everything();
    expect(r.st.ok && typeof r.st.value === 'string' && isMechanismMsg(r.st.value)).toBe(true);
    expect((r.kin as { value: { mechanismModes: number } }).value.mechanismModes).toBeGreaterThan(0);
    sane(r.pd); sane(r.bk); sane(r.md);
  });

});

// ═════════════════════════════════════════════════════════════════
// 6. Kinematic reading in 3D
// ═════════════════════════════════════════════════════════════════

describe('kinematic 3D', () => {
  /*
   * DEFECT D4 (fixed; kept as a regression test). It was: the 3D degree of indeterminacy counts a Basic 3D hinge as three releases.
   *
   * A Basic 3D hinge (toggleHinge3D, PropertyPanel) releases My and Mz, not torsion: two
   * conditions. compute_static_degree_3d (engine/src/solver/kinematic.rs:434-445, mirrored in
   * src/lib/engine/kinematic-3d.ts:108-121) adds 3 per hinged end. A two-span continuous beam
   * fixed at both ends with one hinge in the middle is 6·2 + 12 − 18 − 2 = 4 times
   * indeterminate; the engine says 3. The rank check is unaffected (the structure is correctly
   * solvable) — the number and the "hyperstatic/isostatic" word shown can be wrong: a
   * degree-1 frame can be labelled isostatic.
   */
  it('D4: two-span fixed beam with a My+Mz hinge at midspan is 4 times indeterminate', () => {
    resetModel3D();
    modelStore.bulkMutate(() => {
      const a = modelStore.addNode(0, 0, 0), m = modelStore.addNode(4, 0, 0), b = modelStore.addNode(8, 0, 0);
      const e1 = frame(a, m, 1); frame(m, b, 1);
      modelStore.updateElement(e1, { releaseJ: { my: true, mz: true, t: false } });
      support(a, 'fixed3d'); support(b, 'fixed3d');
      modelStore.addNodalLoad3D(m, 0, 0, -10, 0, 0, 0);
    });
    const k = analyzeKinematics3D(input3D()!);
    expect(k.isSolvable).toBe(true);
    expect(k.degree).toBe(4);
  });

  /*
   * DEFECT D5 (fixed; kept as a regression test). It was: the Kinematic panel, when it opens in 3D, analyses the plane projection.
   *
   * The Advanced button is disabled in 3D, but the panel still opens there through the `?kin=1`
   * deep link (App.svelte:503-505) and the tour; KinematicPanel.recompute
   * (src/components/KinematicPanel.svelte:47-61) always calls `modelStore.buildSolverInput(false)`
   * — the 2D wire, which drops z. A space frame then reports the plane model's count (vertical
   * columns become zero-length bars in the XY plane) instead of analyzeKinematics3D's.
   */
  it('D5: the report the Kinematic panel builds in 3D describes the space structure', () => {
    buildRandom('space-frame', 2);
    const k3 = analyzeKinematics3D(input3D()!);
    // KinematicPanel.recompute3D: the 3D wire, as the solve builds it, into the 3D report.
    const rep = generateKinematicReport3D(input3D()!);
    expect(rep).not.toBeNull();
    expect(rep!.degree).toBe(k3.degree);
  });
});
