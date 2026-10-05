/**
 * Robustness audit of every advanced function of Basic mode in 2D, on a few
 * hundred generated models and on hand-built edge cases.
 *
 * The example audit (advanced-examples-audit.test.ts) runs each analysis on the
 * menu's examples; this one looks for the structure a user draws on their own:
 * a beam drawn right to left, a spring at the last support, a gable with an
 * apex hinge, a Warren truss on an inclined roller, a king-post beam.
 *
 * For each model and each function it asserts (a) no unhandled throw — a
 * refusal must be a readable message; (b) every number finite; and (c) the
 * physical invariant that function owes the user:
 *
 *   kinematic   classification agrees with the static solve; the degree agrees
 *               with an independent count g = 3·m_frame + m_truss + r − DOFs
 *   free body   each member, as the despiece shows it, is in equilibrium with
 *               its own loads, and each node with its loads and reaction
 *   section     σ at the extreme fibres is N/A ± M·c/I of the member forces, with
 *               the analysis' A and I; the canonical and the legacy paths agree
 *   P-Δ         converges when λ₁ > 1.5, B₂ ≈ 1/(1 − 1/λ₁); unstable when λ₁ < 1
 *   buckling    λ > 0, ascending; "no compressed elements" iff none is
 *   modal       f > 0 ascending, mass ratios in [0,1], Σ ≤ 1; f ∝ √E, f ∝ 1/√ρ
 *   plastic     λc finite > 0, ≥ first yield, = first yield when isostatic
 *   influence   Müller-Breslau: the ordinate at x is the static value under a
 *               unit load at x; a reaction's line is 1 at its support, 0 at others
 *   moving load each position's result is the static solve of the train there,
 *               alone: no model load, no settlement (as the 3D sweep)
 *   what-if     loads × k → response × k; E × k (and A, I × k) → displacements / k
 *
 * Findings are collected per check and asserted in one `it` each, so a run
 * lists every broken invariant at once. SWEEP_DUMP=<file> writes them all as
 * JSON; SWEEP_SHOW_FAILS=1 turns every known-defect `it.fails` into a plain `it`
 * so the assertion it breaks is printed. Checks that expose a known defect are
 * split: the part matching the defect is an `it.fails` naming it (so the suite
 * turns red the day it is fixed and the split can go), the rest must pass.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { modelStore, resultsStore, historyStore, uiStore } from '../../store';
import type { Load } from '../../store/model.svelte';
import { solve as wasmSolve, solvePDelta, solveBuckling, solveModal, isSolverReady } from '../wasm-solver';
import { solveMovingLoads, getPredefinedTrains, type LoadTrain, type MovingLoadEnvelope } from '../moving-loads';
import { computeInfluenceLine } from '../influence-service';
import { withoutSettlement } from '../settlement-case';
import { runPlasticCollapse } from '../../actions/plastic';
import { generateKinematicReport } from '../kinematic-report';
import { inspectMember, inspectNode, computeDespieceVectors } from '../../canvas/draw-despiece';
import { analyzeSectionStress } from '../section-stress';
import { canonicalPanelResult, stationForces2D } from '../../section/panel';
import { canonicalStressState } from '../../section/stress-state';
import { supportsDetailedAnalysis } from '../../section/drawing';
import { computeDiagramValueAt } from '../diagrams';
import { validateAndSolve2D } from '../solver-service';
import { analyzeKinematics as analyzeKinematics2D } from '../kinematic-2d';
import { transverseSign, resultsToDrawnAxes } from '../transverse-sign-2d';
import { whatIf } from '../../store/whatif.svelte';
import { t } from '../../i18n';
import type { AnalysisResults, ElementForces, SolverInput, SolverLoad } from '../types';
import { generate, FAMILIES, rng, type GenMeta, type Family } from './helpers/random-models-2d';

// ── Size of the sweep ────────────────────────────────────────────────
const SEEDS_PER_FAMILY = 50;
/** One model in this many also gets the scaled modal runs and the what-if session. */
const SAMPLE_EVERY = 3;

// ── Findings ─────────────────────────────────────────────────────────

const findings = new Map<string, string[]>();
const runs = new Map<string, number>();
function fail(check: string, msg: string) {
  const l = findings.get(check) ?? [];
  l.push(msg);
  findings.set(check, l);
}
function ran(check: string) { runs.set(check, (runs.get(check) ?? 0) + 1); }
const got = (check: string) => findings.get(check) ?? [];

// ── Small utilities ──────────────────────────────────────────────────

const errMsg = (e: unknown): string =>
  typeof e === 'string' ? e : String((e as { message?: unknown })?.message ?? e);
/** A refusal a user can read: not empty, not a JS or WASM internal. */
const unreadable = (m: string) =>
  !m || !m.trim() || /undefined|NaN|\[object|RuntimeError|unreachable|panicked|is not a function|Cannot read|null pointer/i.test(m);

/** Paths of non-finite numbers in a result tree (at most a few). */
function nonFinite(v: unknown, path = 'r', out: string[] = [], allow: Set<string> = new Set()): string[] {
  if (out.length >= 4) return out;
  if (typeof v === 'number') { if (!Number.isFinite(v) && !allow.has(path.split('.').pop()!)) out.push(`${path}=${v}`); return out; }
  if (Array.isArray(v)) { v.forEach((x, i) => nonFinite(x, `${path}[${i}]`, out, allow)); return out; }
  if (v instanceof Map) { for (const [k, x] of v) nonFinite(x, `${path}.${k}`, out, allow); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) nonFinite(x, `${path}.${k}`, out, allow);
  return out;
}

const maxAbs = (xs: number[]) => xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

function signOf(id: number): 1 | -1 {
  const e = modelStore.elements.get(id);
  const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
  return a && b ? transverseSign(b.x - a.x, b.y - a.y) : 1;
}

function geom(input: SolverInput, id: number) {
  const e = input.elements.get(id)!;
  const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  return { e, a, b, L, c: (b.x - a.x) / L, s: (b.z - a.z) / L };
}

/** The static solve of the model with these loads instead of its own, settlements removed. */
function staticWith(loads: Load[]): AnalysisResults | string {
  const m = modelStore.model;
  const supports = new Map([...m.supports].map(([id, s]) => {
    const { dx, dy, dz, drx, dry, drz, ...rest } = s as typeof s & Record<string, unknown>;
    void dx; void dy; void dz; void drx; void dry; void drz;
    return [id, rest as typeof s];
  }));
  const r = validateAndSolve2D({ ...m, loads, supports } as never, false);
  return r ?? 'null';
}

function unitDownAt(elementId: number, a: number): Load {
  return { type: 'pointOnElement', data: { id: 900001, elementId, a, p: -1, isGlobal: true } } as Load;
}

/**
 * A unit downward load at distance `a` along a member, as the static solve must see it.
 * On a truss bar the load reaches the structure through the bar's two nodes, in the
 * proportions of the lever rule — how a deck on a truss is loaded, and the only way a
 * bar that carries no bending can take it.
 */
function unitLoadsAt(elementId: number, a: number): Load[] {
  const el = modelStore.elements.get(elementId)!;
  if (el.type !== 'truss') return [unitDownAt(elementId, a)];
  const ni = modelStore.nodes.get(el.nodeI)!, nj = modelStore.nodes.get(el.nodeJ)!;
  const t = a / Math.hypot(nj.x - ni.x, nj.y - ni.y);
  return [
    { type: 'nodal', data: { id: 900002, nodeId: el.nodeI, fx: 0, fz: -(1 - t), my: 0 } } as Load,
    { type: 'nodal', data: { id: 900003, nodeId: el.nodeJ, fx: 0, fz: -t, my: 0 } } as Load,
  ];
}

// ── Kinematic: an independent count ─────────────────────────────────

/**
 * g = 3·m_frame + m_truss + r − DOFs, counted on degrees of freedom rather
 * than on equations. A node has two translations, and a rotation if some
 * frame end meets it without a hinge; a hinged frame end has a rotation of its
 * own. A rotational restraint counts only where a rotation exists. For a stable
 * structure this is exactly the redundancy.
 */
function independentDegree(input: SolverInput): number {
  const rigid = new Set<number>();
  let dofs = 0, mF = 0, mT = 0;
  for (const e of input.elements.values()) {
    if (e.type === 'frame') {
      mF++;
      if (e.hingeStart) dofs++; else rigid.add(e.nodeI);
      if (e.hingeEnd) dofs++; else rigid.add(e.nodeJ);
    } else mT++;
  }
  for (const n of input.nodes.keys()) dofs += 2 + (rigid.has(n) ? 1 : 0);
  let r = 0;
  for (const s of input.supports.values()) {
    const rot = rigid.has(s.nodeId) ? 1 : 0;
    if (s.type === 'fixed') r += 2 + rot;
    else if (s.type === 'pinned') r += 2;
    else if (s.type === 'rollerX' || s.type === 'rollerZ' || s.type === 'inclinedRoller') r += 1;
    else if (s.type === 'spring') r += (s.kx ? 1 : 0) + (s.ky ? 1 : 0) + (s.kz && rot ? 1 : 0);
  }
  return 3 * mF + mT + r - dofs;
}

/** Nodes met only by truss bars in a model that also has frames. */
function trussOnlyNodes(input: SolverInput): number {
  const frameNodes = new Set<number>();
  let frames = 0;
  for (const e of input.elements.values()) if (e.type === 'frame') { frames++; frameNodes.add(e.nodeI); frameNodes.add(e.nodeJ); }
  if (frames === 0) return 0;
  return [...input.nodes.keys()].filter((n) => !frameNodes.has(n)).length;
}

/** Fixed (or rotational-spring) supports under a node whose only frame ends are hinged. */
function hingedAtRotationalSupport(input: SolverInput): number {
  const rigid = new Set<number>();
  const hinged = new Set<number>();
  for (const e of input.elements.values()) {
    if (e.type !== 'frame') continue;
    (e.hingeStart ? hinged : rigid).add(e.nodeI);
    (e.hingeEnd ? hinged : rigid).add(e.nodeJ);
  }
  let k = 0;
  for (const s of input.supports.values()) {
    const rotSup = s.type === 'fixed' || (s.type === 'spring' && !!s.kz);
    if (rotSup && hinged.has(s.nodeId) && !rigid.has(s.nodeId)) k++;
  }
  return k;
}

function checkKinematic(label: string, input: SolverInput, solved: boolean): number | null {
  ran('kinematic');
  let rep;
  try { rep = generateKinematicReport(input, []); } catch (e) { fail('kinematic', `${label}: report threw ${errMsg(e)}`); return null; }
  if (!rep) { fail('kinematic', `${label}: no report`); return null; }
  if (!rep.rankChecked) fail('kinematic', `${label}: rank check did not run`);
  const stable = rep.classification !== 'hypostatic';
  const tn = trussOnlyNodes(input) > 0 ? '[truss-only nodes] ' : '';
  if (stable !== solved) fail('kinematic', `${tn}${label}: classified ${rep.classification} (g=${rep.degree}, modes=${rep.mechanismModes}) but the static solve ${solved ? 'succeeded' : 'refused'}`);
  if (rep.isSolvable !== solved) fail('kinematic', `${tn}${label}: isSolvable=${rep.isSolvable} but the static solve ${solved ? 'succeeded' : 'refused'}`);
  if (solved) {
    ran('kinematic-degree');
    const g = independentDegree(input);
    if (g !== rep.degree) {
      const tag = trussOnlyNodes(input) > 0 ? '[truss-only nodes]' : hingedAtRotationalSupport(input) > 0 ? '[hinge at fixed support]' : '[other]';
      fail('kinematic-degree', `${tag} ${label}: reported g=${rep.degree}, independent count g=${g} (${rep.substitution})`);
    }
    return g;
  }
  return null;
}

// ── Free body (despiece) ─────────────────────────────────────────────

interface MemberLoads { fx: number; fz: number; m: number; scale: number }

/** Resultant (global) and moment about node I of the loads the solver applies ON a member. */
function memberLoads(input: SolverInput, id: number): MemberLoads {
  const { L, c, s } = geom(input, id);
  let fx = 0, fz = 0, m = 0, scale = 0;
  for (const l of input.loads) {
    if (l.type === 'distributed' && l.data.elementId === id) {
      const a = l.data.a ?? 0, b = l.data.b ?? L, qI = l.data.qI, qJ = l.data.qJ;
      const total = ((qI + qJ) / 2) * (b - a);
      const first = ((b - a) * (qI * (2 * a + b) + qJ * (a + 2 * b))) / 6; // ∫ q(x)·x dx
      fx += -s * total; fz += c * total; m += first; scale = Math.max(scale, Math.abs(total));
    } else if (l.type === 'pointOnElement' && l.data.elementId === id) {
      const p = l.data.p ?? 0, px = l.data.px ?? 0, my = l.data.my ?? 0;
      fx += -s * p + c * px; fz += c * p + s * px; m += p * l.data.a + my;
      scale = Math.max(scale, Math.abs(p), Math.abs(px), Math.abs(my) / Math.max(L, 1e-9));
    }
  }
  return { fx, fz, m, scale };
}

type ForcesOf = (id: number) => ElementForces | undefined;

function despieceArgs(forces: ForcesOf) {
  return {
    elements: [...modelStore.elements.values()].map((e) => ({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ })),
    getNode: (id: number) => { const n = modelStore.nodes.get(id); return n ? { x: n.x, y: n.y } : undefined; },
    getElementForces: forces,
    basis: 'global' as const,
  };
}

const comp = (a: { components: Array<{ label: string; value: number }> }, k: string) => a.components.find((c) => c.label === k)?.value ?? 0;

/**
 * Each member as the despiece shows it: the two end actions it draws, the
 * member's own loads, ΣFx = ΣFz = 0 and ΣM = 0. The moment glyph is CCW when
 * zs·m·towardJ > 0 (draw-despiece.ts `endMomentCcw`, zs = transverseSign of the
 * member), so the CCW end actions it draws are zs·mStart at I and −zs·mEnd at J.
 * Forces and moments are checked separately: they are different defects.
 */
function despieceMemberEquilibrium(label: string, input: SolverInput, forces: ForcesOf) {
  const args = despieceArgs(forces);
  let fDone = false, mDone = false;
  for (const id of input.elements.keys()) {
    const ins = inspectMember(args, id);
    if (!ins || ins.ends.length !== 2) { fail('despiece-forces', `${label} e${id}: no inspection`); continue; }
    const [I, J] = ins.ends;
    const { L, c, s } = geom(input, id);
    const ld = memberLoads(input, id);
    const fIx = comp(I, 'Fx'), fIz = comp(I, 'Fz'), fJx = comp(J, 'Fx'), fJz = comp(J, 'Fz');
    const zs = signOf(id);
    const mI = zs * comp(I, 'M'), mJ = -zs * comp(J, 'M');
    const sx = fIx + fJx + ld.fx, sz = fIz + fJz + ld.fz;
    const fs = Math.max(1, maxAbs([fIx, fIz, fJx, fJz, ld.scale]));
    const tag = signOf(id) < 0 ? '[drawn opposite to the solver axis]' : '[drawn along the solver axis]';
    if (!fDone && (Math.abs(sx) > 1e-6 * fs || Math.abs(sz) > 1e-6 * fs)) {
      fail('despiece-forces', `${tag} ${label} e${id}: ΣFx=${sx.toExponential(2)} ΣFz=${sz.toExponential(2)} (scale ${fs.toFixed(1)} kN)`);
      fDone = true;
    }
    // The moment balance is only meaningful once the forces balance.
    if (!mDone && Math.abs(sx) <= 1e-6 * fs && Math.abs(sz) <= 1e-6 * fs) {
      const sm = mI + mJ + L * (c * fJz - s * fJx) + ld.m;
      const ms = Math.max(1, fs * L, maxAbs([mI, mJ]));
      if (Math.abs(sm) > 1e-6 * ms) {
        fail('despiece-moments', `${tag} ${label} e${id}: drawn CCW end moments ${mI.toFixed(3)} (I) / ${mJ.toFixed(3)} (J) leave ΣM=${sm.toExponential(2)}; with the opposite sense ΣM=${(-mI - mJ + L * (c * fJz - s * fJx) + ld.m).toExponential(2)}`);
        mDone = true;
      }
    }
    if (fDone && mDone) return;
  }
}

/**
 * The engine's own member forces, in its own axes, balance the member's loads.
 * Its convention, measured: the node acts on the member with −N·x̂ + V·ŷ and
 * +M (CCW) at I, +N·x̂ − V·ŷ and −M at J (ŷ = x̂ turned 90° CCW) — a fixed-fixed
 * beam under gravity reports M > 0 at both ends and V = +wL/2, −wL/2.
 */
function engineMemberEquilibrium(label: string, input: SolverInput, res: AnalysisResults) {
  for (const ef of res.elementForces) {
    const { L, c, s } = geom(input, ef.elementId);
    const ld = memberLoads(input, ef.elementId);
    const FI = [-ef.nStart * c + ef.vStart * -s, -ef.nStart * s + ef.vStart * c];
    const FJ = [ef.nEnd * c - ef.vEnd * -s, ef.nEnd * s - ef.vEnd * c];
    const sx = FI[0] + FJ[0] + ld.fx, sz = FI[1] + FJ[1] + ld.fz;
    const sm = ef.mStart - ef.mEnd + L * (c * FJ[1] - s * FJ[0]) + ld.m;
    const fs = Math.max(1, maxAbs([ef.nStart, ef.nEnd, ef.vStart, ef.vEnd, ld.scale]));
    const ms = Math.max(1, fs * L, maxAbs([ef.mStart, ef.mEnd]));
    if (Math.abs(sx) > 1e-6 * fs || Math.abs(sz) > 1e-6 * fs || Math.abs(sm) > 1e-6 * ms) {
      fail('engine-member-equilibrium', `${label} e${ef.elementId}: ΣFx=${sx.toExponential(2)} ΣFz=${sz.toExponential(2)} ΣM=${sm.toExponential(2)}`);
      return;
    }
  }
}

/** Each node: Σ member end actions (member side) = nodal loads + reaction. */
function nodeEquilibrium(check: string, label: string, input: SolverInput, res: AnalysisResults, forces: ForcesOf) {
  const args = despieceArgs(forces);
  const reac = new Map(res.reactions.map((r) => [r.nodeId, r]));
  for (const n of input.nodes.keys()) {
    const acts = inspectNode(args, n).actions;
    let fx = 0, fz = 0, mm = 0, scale = 1;
    for (const a of acts) {
      fx += comp(a, 'Fx'); fz += comp(a, 'Fz');
      // CCW moment on the member: zs·M at I, −zs·M at J (draw-despiece.ts endMomentCcw).
      mm += (a.end === 'I' ? 1 : -1) * signOf(a.elementId) * comp(a, 'M');
      scale = Math.max(scale, Math.abs(comp(a, 'Fx')), Math.abs(comp(a, 'Fz')), Math.abs(comp(a, 'M')));
    }
    for (const l of input.loads) if (l.type === 'nodal' && l.data.nodeId === n) { fx -= l.data.fx; fz -= l.data.fz; mm -= l.data.my; scale = Math.max(scale, Math.abs(l.data.fx), Math.abs(l.data.fz), Math.abs(l.data.my)); }
    const rev = acts.some((a) => signOf(a.elementId) < 0) ? '[a member drawn opposite to the solver axis] ' : '[all members along the solver axis] ';
    const r = reac.get(n);
    if (r) { fx -= r.rx; fz -= r.rz; mm -= r.my; scale = Math.max(scale, Math.abs(r.rx), Math.abs(r.rz), Math.abs(r.my)); }
    if (Math.abs(fx) > 1e-6 * scale || Math.abs(fz) > 1e-6 * scale) {
      fail(`${check}-forces`, `${rev}${label} node ${n}: ΣFx=${fx.toExponential(2)} ΣFz=${fz.toExponential(2)} (scale ${scale.toFixed(1)})`);
      return;
    }
    if (Math.abs(mm) > 1e-6 * scale) {
      fail(`${check}-moments`, `${rev}${label} node ${n}: ΣM=${mm.toExponential(2)} (scale ${scale.toFixed(1)})`);
      return;
    }
  }
}

// ── Section analysis ─────────────────────────────────────────────────

function checkSection(label: string, input: SolverInput, r: ReturnType<typeof rng>) {
  const frames = [...modelStore.elements.values()].filter((e) => e.type === 'frame');
  for (let k = 0; k < Math.min(3, frames.length); k++) {
    const el = r.pick(frames);
    const ef = resultsStore.getElementForces(el.id)!;
    const sec = modelStore.sections.get(el.sectionId)!;
    const mat = modelStore.materials.get(el.materialId)!;
    const solverSec = input.sections.get(el.sectionId)!;
    for (const t of [0, 0.37, 1]) {
      ran('section');
      let base;
      try { base = analyzeSectionStress(ef, sec, mat.fy, t); } catch (e) { fail('section', `${label} e${el.id} t=${t}: threw ${errMsg(e)}`); continue; }
      const rs = base.resolved;
      const N = computeDiagramValueAt('axial', t, ef), M = computeDiagramValueAt('moment', t, ef);
      if (Math.abs(base.N - N) > 1e-6 * Math.max(1, Math.abs(N)) || Math.abs(base.M - M) > 1e-6 * Math.max(1, Math.abs(M))) {
        fail('section', `${label} e${el.id} t=${t}: panel N,M = ${base.N}, ${base.M}; member forces ${N}, ${M}`);
      }
      ran('section-props');
      // 1 %: the catalogue's rounded A and I against the outline's own (IPN 300: 0.15 %) is noise.
      if (Math.abs(rs.a - solverSec.a) > 1e-2 * solverSec.a || Math.abs(rs.iy - solverSec.iz) > 1e-2 * solverSec.iz) {
        fail('section-props', `${label} ${sec.name}: panel A=${rs.a.toExponential(4)} I=${rs.iy.toExponential(4)}; analysis A=${solverSec.a.toExponential(4)} I=${solverSec.iz.toExponential(4)}`);
      }
      const top = analyzeSectionStress(ef, sec, mat.fy, t, rs.yMax).sigmaAtY;
      const bot = analyzeSectionStress(ef, sec, mat.fy, t, rs.yMin).sigmaAtY;
      const eTop = (N / rs.a + (M * rs.yMax) / rs.iy) / 1000, eBot = (N / rs.a + (M * rs.yMin) / rs.iy) / 1000;
      const scale = (Math.abs(N / rs.a) + Math.abs((M * rs.yMax) / rs.iy)) / 1000 + 1e-9;
      if (!Number.isFinite(top) || !Number.isFinite(bot) || Math.abs(top - eTop) > 1e-6 * scale + 1e-9 || Math.abs(bot - eBot) > 1e-6 * scale + 1e-9) {
        fail('section', `${label} e${el.id} t=${t}: σtop=${top} (N/A+M·c/I=${eTop}), σbot=${bot} (${eBot})`);
      }
      if (supportsDetailedAnalysis(sec) && scale > 1e-3) {
        // What the panel shows for a section with geometry: canonicalStressState at the
        // picked fibre (default: top, mid-width), from the same bending solve it plots.
        ran('section-canonical');
        const f = stationForces2D(ef, t);
        const p = canonicalPanelResult(sec, f);
        if (!p.ok) { fail('section-canonical', `${label} ${sec.name}: refused ${JSON.stringify(p.refusal).slice(0, 80)}`); continue; }
        const [yMin, zMin, yMax, zMax] = p.geometry.bbox;
        const at = (z: number) => {
          const st = canonicalStressState(sec, { n: f.n, my: f.my, mz: f.mz }, [(yMin + yMax) / 2, z], mat.fy, { bending: p.bending });
          return st.ok ? st.state.sigma : NaN;
        };
        const cTop = at(zMax), cBot = at(zMin);
        // Same fibre, same stress: 2 % for the canonical outline against the catalogue's properties.
        if (!(Math.abs(cTop - top) <= 0.02 * scale + 1e-6) || !(Math.abs(cBot - bot) <= 0.02 * scale + 1e-6)) {
          fail('section-canonical', `${label} ${sec.name} e${el.id} t=${t}: canonical σ top/bottom = ${cTop.toFixed(3)}/${cBot.toFixed(3)} MPa, legacy = ${top.toFixed(3)}/${bot.toFixed(3)} MPa (N=${N.toFixed(2)}, M=${M.toFixed(2)})`);
        }
      }
    }
  }
}

// ── Buckling, P-Δ, modal ─────────────────────────────────────────────

type Buck = { lambda1: number } | { none: 'noCompression' | 'failed' };

function checkBuckling(label: string, input: SolverInput, res: AnalysisResults): Buck {
  ran('buckling');
  const nScale = Math.max(1e-9, ...res.elementForces.map((f) => Math.max(Math.abs(f.nStart), Math.abs(f.nEnd))));
  const compressed = res.elementForces.filter((f) => Math.min(f.nStart, f.nEnd) < -1e-6 * nScale && Math.min(f.nStart, f.nEnd) < -1e-9);
  let bk;
  try { bk = solveBuckling(input); } catch (e) {
    const m = errMsg(e);
    if (/no compressed elements/i.test(m)) {
      if (compressed.length) fail('buckling', `${label}: "no compressed elements" but e${compressed[0].elementId} has N=${compressed[0].nStart.toFixed(3)} → ${compressed[0].nEnd.toFixed(3)} kN`);
      return { none: 'noCompression' };
    }
    fail('buckling', `${label}: threw "${m.slice(0, 120)}"${trussOnlyNodes(input) ? ' [truss-only nodes]' : ''}`);
    return { none: 'failed' };
  }
  const bad = nonFinite(bk.modes.map((m: { loadFactor: number }) => m.loadFactor));
  if (bad.length) fail('buckling', `${label}: non-finite λ ${bad}`);
  if (!bk.modes.length) { fail('buckling', `${label}: no modes`); return { none: 'failed' }; }
  const lf = bk.modes.map((m: { loadFactor: number }) => m.loadFactor);
  if (lf.some((x: number) => !(x > 0))) fail('buckling', `${label}: non-positive λ ${lf.map((x: number) => x.toPrecision(4))}`);
  for (let k = 1; k < lf.length; k++) if (lf[k] < lf[k - 1] * (1 - 1e-9)) { fail('buckling', `${label}: modes not ascending ${lf.map((x: number) => x.toPrecision(4))}`); break; }
  if (!compressed.length) fail('buckling', `${label}: modes found (λ1=${lf[0]}) with no compressed member`);
  return { lambda1: lf[0] };
}

function checkPDelta(label: string, input: SolverInput, bk: Buck, hasLoads: boolean) {
  ran('pdelta');
  let pd;
  try { pd = solvePDelta(input); } catch (e) {
    const m = errMsg(e);
    fail('pdelta', `${label}: threw "${m.slice(0, 120)}"`);
    return;
  }
  const bad = nonFinite(pd.results);
  if (bad.length) fail('pdelta', `${label}: non-finite ${bad.join(', ')}`);
  if (!hasLoads) {
    if (!pd.converged || !pd.isStable) fail('pdelta-noloads', `${label}: model without loads → converged=${pd.converged} stable=${pd.isStable} B2=${pd.b2Factor}`);
    return;
  }
  if ('none' in bk) {
    if (bk.none === 'failed') return; // reported under buckling
    if (!pd.converged || !pd.isStable) fail('pdelta', `${label}: no compression, yet converged=${pd.converged} stable=${pd.isStable}`);
    if (pd.b2Factor > 1 + 1e-3) fail('pdelta', `${label}: no compression, yet B2=${pd.b2Factor}`);
    return;
  }
  const lambda1 = bk.lambda1;
  if (lambda1 > 1.5) {
    ran('pdelta-b2');
    if (!pd.converged || !pd.isStable) { fail('pdelta', `${label}: λ1=${lambda1.toFixed(2)} but converged=${pd.converged} stable=${pd.isStable}`); return; }
    const exp = 1 / (1 - 1 / lambda1);
    if (!(pd.b2Factor >= 0.9) || Math.abs(pd.b2Factor - exp) > 0.25 * exp) {
      fail('pdelta-b2', `${label}: λ1=${lambda1.toFixed(3)} → 1/(1−1/λ1)=${exp.toFixed(3)}, B2=${pd.b2Factor.toFixed(3)}`);
    }
  } else if (lambda1 < 0.95 && pd.isStable) {
    fail('pdelta', `${label}: λ1=${lambda1.toFixed(3)} < 1 (loads above the critical load) but P-Δ reports stable, B2=${pd.b2Factor}`);
  }
}

const densities = () => new Map([...modelStore.materials].map(([id, m]) => [id, (m.rho * 1000) / 9.81]));

function checkModal(label: string, input: SolverInput, scaled: boolean, meta: GenMeta) {
  ran('modal');
  let md;
  try { md = solveModal(input, densities()); } catch (e) {
    // Every DOF restrained (a fixed-fixed beam of one member): nothing can vibrate, and the
    // refusal says so and what to do. That is the answer, not a failure.
    if (errMsg(e) === t('advanced.noFreeDofsModal')) return;
    fail('modal', `${label}: threw "${errMsg(e).slice(0, 120)}"${trussOnlyNodes(input) ? ' [truss-only nodes]' : ''}`);
    return;
  }
  const bad = nonFinite(md);
  if (bad.length) fail('modal', `${label}: non-finite ${bad.join(', ')}`);
  const fs: number[] = md.modes.map((m: { frequency: number }) => m.frequency);
  if (!fs.length) { fail('modal', `${label}: no modes`); return; }
  if (fs.some((f) => !(f > 0))) fail('modal', `${label}: non-positive frequency ${fs.map((f) => f.toPrecision(4))}`);
  for (let k = 1; k < fs.length; k++) if (fs[k] < fs[k - 1] * (1 - 1e-9)) { fail('modal', `${label}: not ascending ${fs.map((f) => f.toPrecision(4))}`); break; }
  let sx = 0, sy = 0;
  for (const m of md.modes) {
    for (const r of [m.massRatioX, m.massRatioY]) if (!(r >= -1e-12 && r <= 1 + 1e-9)) fail('modal', `${label}: mass ratio ${r}`);
    sx += m.massRatioX; sy += m.massRatioY;
  }
  if (sx > 1 + 1e-6 || sy > 1 + 1e-6) fail('modal', `${label}: Σ mass ratios X=${sx} Z=${sy}`);
  if (Math.abs(sx - md.cumulativeMassRatioX) > 1e-6 || Math.abs(sy - md.cumulativeMassRatioY) > 1e-6) {
    fail('modal', `${label}: cumulative ${md.cumulativeMassRatioX}/${md.cumulativeMassRatioY} ≠ Σ ${sx}/${sy}`);
  }
  // A spring support does not stiffen with E: f ∝ √E only without one.
  if (!scaled || meta.springs) return;
  ran('modal-scaling');
  const stiff = { ...input, materials: new Map([...input.materials].map(([id, m]) => [id, { ...m, e: m.e * 4 }])) };
  const heavy = new Map([...densities()].map(([id, d]) => [id, d * 4]));
  try {
    const f2 = solveModal(stiff, densities()).modes.map((m: { frequency: number }) => m.frequency);
    const f3 = solveModal(input, heavy).modes.map((m: { frequency: number }) => m.frequency);
    for (let k = 0; k < Math.min(3, fs.length); k++) {
      if (Math.abs(f2[k] / fs[k] - 2) > 1e-4) { fail('modal-scaling', `${label}: E×4 gives f${k + 1} ×${(f2[k] / fs[k]).toFixed(5)}, expected ×2`); break; }
      if (Math.abs(f3[k] / fs[k] - 0.5) > 1e-4) { fail('modal-scaling', `${label}: ρ×4 gives f${k + 1} ×${(f3[k] / fs[k]).toFixed(5)}, expected ×0.5`); break; }
    }
  } catch (e) { fail('modal-scaling', `${label}: threw ${errMsg(e)}`); }
}

// ── Plastic collapse ─────────────────────────────────────────────────

/** Load factor at which the first section yields, from the elastic solution. */
function firstYield(input: SolverInput, res: AnalysisResults, mpOf: Map<number, number>): { lambda: number; where: string } {
  let lambda = Infinity, where = '';
  for (const ef of res.elementForces) {
    const e = input.elements.get(ef.elementId)!;
    const mat = modelStore.materials.get(e.materialId)!;
    const np = (mat.fy || 250) * 1000 * input.sections.get(e.sectionId)!.a;
    const ts = new Set<number>(Array.from({ length: 401 }, (_, k) => k / 400));
    for (const p of ef.pointLoads ?? []) if (ef.length > 0) { ts.add(Math.min(1, p.a / ef.length)); }
    let mMax = 0, nMax = 0;
    for (const t of ts) {
      nMax = Math.max(nMax, Math.abs(computeDiagramValueAt('axial', t, ef)));
      if (e.type === 'frame') mMax = Math.max(mMax, Math.abs(computeDiagramValueAt('moment', t, ef)));
    }
    const mp = mpOf.get(e.sectionId) ?? Infinity;
    if (e.type === 'frame' && mMax > 1e-9 && mp / mMax < lambda) { lambda = mp / mMax; where = `e${e.id} bending`; }
    if (nMax > 1e-9 && np / nMax < lambda) { lambda = np / nMax; where = `e${e.id} axial`; }
  }
  return { lambda, where };
}

function checkPlastic(label: string, meta: GenMeta, input: SolverInput, res: AnalysisResults, degree: number | null) {
  ran('plastic');
  let run;
  try { run = runPlasticCollapse(); } catch (e) { fail('plastic', `${label}: threw ${errMsg(e).slice(0, 150)}`); return; }
  if (!run) { fail('plastic', `${label}: no run`); return; }
  const r = run.result;
  if (!Number.isFinite(r.collapseFactor) || !(r.collapseFactor > 0)) { fail('plastic', `${label}: λc=${r.collapseFactor} mechanism=${r.isMechanism}`); return; }
  const fy = firstYield(input, res, new Map(run.mps.map((m) => [m.sectionId, m.mp])));
  if (!r.isMechanism) {
    // A structure under forces collapses at some factor; only self-equilibrated actions cannot.
    fail('plastic', `${label}: no mechanism (λ=${r.collapseFactor}, ${r.hinges.length} hinges, first yield at ${fy.lambda.toFixed(3)} in ${fy.where})${meta.thermal || meta.settlement ? ' [has thermal/settlement]' : ''}`);
    return;
  }
  ran('plastic-bounds');
  if (r.collapseFactor < fy.lambda * (1 - 2e-3)) {
    fail('plastic-bounds', `${label}: λc=${r.collapseFactor.toFixed(4)} below first yield ${fy.lambda.toFixed(4)} (${fy.where})`);
  } else if (degree === 0 && Math.abs(r.collapseFactor - fy.lambda) > 5e-3 * fy.lambda) {
    fail('plastic-bounds', `${label}: isostatic, λc=${r.collapseFactor.toFixed(4)} ≠ first yield ${fy.lambda.toFixed(4)} (${fy.where})`);
  }
}

/** A model without loads has nothing to collapse under: it must say so, not return λ = 0. */
function checkNoLoadsPlastic(label: string) {
  ran('plastic-noloads');
  let run;
  try { run = runPlasticCollapse(); } catch (e) {
    if (unreadable(errMsg(e))) fail('plastic-noloads', `${label}: threw ${errMsg(e)}`);
    return;
  }
  if (run && !(run.result.collapseFactor > 0) && !run.result.isMechanism) {
    fail('plastic-noloads', `${label}: no loads → λc=${run.result.collapseFactor}, mechanism=${run.result.isMechanism}, ${run.result.hinges.length} hinges (no message)`);
  }
}

// ── Influence lines ─────────────────────────────────────────────────

type Q = 'Rz' | 'Rx' | 'My' | 'M' | 'V';

function ilValueFromStatic(q: Q, res: AnalysisResults, node?: number, elem?: number): number {
  if (q === 'Rz' || q === 'Rx' || q === 'My') {
    const rc = res.reactions.find((x) => x.nodeId === node);
    return rc ? (q === 'Rz' ? rc.rz : q === 'Rx' ? rc.rx : rc.my) : 0;
  }
  const drawn = resultsToDrawnAxes(res, signOf);
  const ef = drawn.elementForces.find((f) => f.elementId === elem)!;
  return computeDiagramValueAt(q === 'M' ? 'moment' : 'shear', 0.5, ef);
}

const rigidVertical = (s: { type: string; angle?: number }) => (s.type === 'fixed' || s.type === 'pinned' || s.type === 'rollerX') && !s.angle;

function checkInfluence(label: string, meta: GenMeta, r: ReturnType<typeof rng>) {
  const sups = [...modelStore.supports.values()];
  const targets: Array<{ q: Q; node?: number; elem?: number }> = [];
  const vs = sups.filter((s) => rigidVertical(s) || s.type === 'spring' || s.angle);
  if (vs.length) targets.push({ q: 'Rz', node: r.pick(vs).nodeId });
  const fixed = sups.find((s) => s.type === 'fixed');
  if (fixed) targets.push({ q: r.pick(['My', 'Rx'] as const), node: fixed.nodeId });
  const frames = [...modelStore.elements.values()].filter((e) => e.type === 'frame');
  if (frames.length) targets.push({ q: r.pick(['M', 'V'] as const), elem: r.pick(frames).id });
  for (const tg of targets) {
    ran('influence');
    let il;
    try { il = computeInfluenceLine(modelStore.model as never, tg.q as never, tg.node, tg.elem, 0.5); } catch (e) { fail('influence', `${label} ${tg.q}: threw ${errMsg(e)}`); continue; }
    if (typeof il === 'string') { fail('influence', `${label} ${tg.q}: refused "${il}"`); continue; }
    resultsStore.setInfluenceLine(il);
    const ui = resultsStore.influenceLine!;
    const bad = nonFinite(ui.points.map((p) => p.value));
    if (bad.length) { fail('influence', `${label} ${tg.q}: non-finite ${bad}`); continue; }
    const scale = Math.max(1, maxAbs(ui.points.map((p) => p.value)));
    // A reaction's line: 1 at its own support, 0 at every other rigid one.
    if (tg.q === 'Rz') {
      const own = sups.find((s) => s.nodeId === tg.node)!;
      for (const s of sups) {
        if (!rigidVertical(s) || (s.nodeId !== tg.node && !rigidVertical(own))) continue;
        const n = modelStore.nodes.get(s.nodeId)!;
        const at = ui.points.filter((p) => Math.abs(p.x - n.x) < 1e-9 && Math.abs(p.y - n.y) < 1e-9);
        const want = s.nodeId === tg.node ? 1 : 0;
        ran('influence-support');
        for (const p of at) if (Math.abs(p.value - want) > 1e-6) {
          const onTruss = modelStore.elements.get(p.elementId)?.type === 'truss' ? ' [on a truss member]' : '';
          fail('influence-support', `${label} Rz@${tg.node}: ordinate at support node ${s.nodeId} (e${p.elementId}, t=${p.t}) is ${p.value.toFixed(6)}, expected ${want}${meta.settlement ? ' [model has a settlement]' : onTruss}`);
          break;
        }
      }
    }
    // Müller-Breslau: the ordinate is the static answer to a unit load there.
    const cand = ui.points.filter((p) => !(tg.elem !== undefined && p.elementId === tg.elem && Math.abs(p.t - 0.5) < 0.06));
    for (let k = 0; k < 3 && cand.length; k++) {
      ran('influence-mb');
      const p = r.pick(cand);
      const L = geom(modelStore.buildSolverInput(false)!, p.elementId).L;
      const st = staticWith(unitLoadsAt(p.elementId, p.t * L));
      if (typeof st === 'string') { fail('influence-mb', `${label}: unit-load solve refused ${st}`); break; }
      const v = ilValueFromStatic(tg.q, st, tg.node, tg.elem);
      const d = Math.abs(v - p.value);
      if (d > 1e-6 * scale) {
        const tags = [meta.settlement && 'settlement', modelStore.elements.get(p.elementId)?.type === 'truss' && 'on a truss member', meta.inclinedSupport && 'inclined support', meta.springs && 'springs'].filter(Boolean).join(', ');
        const msg = `[${tags || 'plain'}] ${label} ${tg.q}${tg.node !== undefined ? `@n${tg.node}` : `@e${tg.elem}`}: unit load on e${p.elementId} t=${p.t.toFixed(2)} → IL ${p.value.toFixed(5)}, static ${v.toFixed(5)} (${((100 * d) / scale).toFixed(3)} % of the line's peak)`;
        // Below 1 % the two differ only by the section properties the line is built with (see D7).
        fail(d > 1e-2 * scale ? 'influence-mb' : 'influence-mb-props', msg);
        break;
      }
    }
  }
}

// ── Moving load ─────────────────────────────────────────────────────

function reversed(train: LoadTrain): LoadTrain {
  const mo = Math.max(...train.axles.map((a) => a.offset));
  return { name: train.name, axles: train.axles.map((a) => ({ offset: mo - a.offset, weight: a.weight })) };
}

/** The axles at `refPos`, placed on the member each falls on, measured from that member's own node I. */
function trainLoads(input: SolverInput, env: MovingLoadEnvelope, train: LoadTrain, refPos: number): SolverLoad[] {
  const path = env.path;
  const total = path[path.length - 1].cumStart + path[path.length - 1].length;
  const out: SolverLoad[] = [];
  for (const ax of train.axles) {
    const pos = refPos + ax.offset;
    if (pos < 0 || pos > total) continue;
    const seg = path.find((s) => pos >= s.cumStart && pos <= s.cumStart + s.length);
    if (!seg) continue;
    const from = input.nodes.get(seg.nodeI)!;
    const f = (pos - seg.cumStart) / seg.length;
    const px = from.x + f * seg.dx, pz = from.z + f * seg.dy;
    const g = geom(input, seg.elementId);
    const a = Math.hypot(px - g.a.x, pz - g.a.z);
    const t = a / g.L;
    if (g.e.type === 'truss') {
      // A bar carries no bending: the axle reaches its two nodes by the lever rule.
      out.push({ type: 'nodal', data: { nodeId: g.e.nodeI, fx: 0, fz: -ax.weight * (1 - t), my: 0 } });
      out.push({ type: 'nodal', data: { nodeId: g.e.nodeJ, fx: 0, fz: -ax.weight * t, my: 0 } });
      continue;
    }
    out.push({ type: 'pointOnElement', data: { elementId: seg.elementId, a, p: -ax.weight * g.c } });
    const pa = -ax.weight * g.s;
    if (Math.abs(pa) > 1e-10) {
      out.push({ type: 'nodal', data: { nodeId: g.e.nodeI, fx: pa * (1 - t) * g.c, fz: pa * (1 - t) * g.s, my: 0 } });
      out.push({ type: 'nodal', data: { nodeId: g.e.nodeJ, fx: pa * t * g.c, fz: pa * t * g.s, my: 0 } });
    }
  }
  return out;
}

function checkMoving(label: string, input: SolverInput, r: ReturnType<typeof rng>) {
  ran('moving');
  const train = r.pick(getPredefinedTrains());
  let env;
  try { env = solveMovingLoads(input, { train, step: 0.5 }); } catch (e) { fail('moving', `${label}: threw ${errMsg(e)}`); return; }
  if (typeof env === 'string') { fail('moving', `${label}: refused "${env}"`); return; }
  const bad = nonFinite(env.fullEnvelope);
  if (bad.length) fail('moving', `${label}: non-finite envelope ${bad}`);
  const total = env.path[env.path.length - 1].cumStart + env.path[env.path.length - 1].length;
  const maxOff = Math.max(...train.axles.map((a) => a.offset));
  let nForward = 0;
  for (let p = -maxOff; p <= total; p += 0.5) nForward++;
  const W = train.axles.reduce((s, a) => s + a.weight, 0);
  const againstPath = env.path.some((s) => input.elements.get(s.elementId)!.nodeI !== s.nodeI);
  const trussOnPath = env.path.some((s) => input.elements.get(s.elementId)!.type === 'truss');
  const pathTag = `${againstPath ? '[member drawn against the path]' : '[members along the path]'}${trussOnPath ? '[truss member on the path]' : ''}`;
  for (let k = 0; k < 3; k++) {
    ran('moving-position');
    const i = r.int(0, env.positions.length - 1);
    const pos = env.positions[i];
    const tr = i < nForward ? train : reversed(train);
    const mine = wasmSolve({ ...input, supports: withoutSettlement(input.supports), loads: trainLoads(input, env, tr, pos.refPosition) });
    const theirs = new Map(pos.results.reactions.map((x) => [x.nodeId, x]));
    let worst = 0;
    for (const m of mine.reactions) {
      const o = theirs.get(m.nodeId);
      if (!o) continue;
      worst = Math.max(worst, Math.abs(m.rx - o.rx), Math.abs(m.rz - o.rz), Math.abs(m.my - o.my) / Math.max(1, total));
    }
    if (worst > 1e-6 * W) {
      fail('moving-position', `${pathTag} ${label} ${train.name} ref=${pos.refPosition}: reactions differ by ${worst.toFixed(3)} kN from the static solve of the train at that position`);
      break;
    }
  }
  // The envelope covers the static response at a position between its steps.
  ran('moving-envelope');
  const ref = -maxOff + r.next() * (total + maxOff);
  const mine = wasmSolve({ ...input, supports: withoutSettlement(input.supports), loads: trainLoads(input, env, train, ref) });
  const gmax = env.fullEnvelope!.moment.globalMax;
  for (const e of env.fullEnvelope!.moment.elements) {
    const ef = mine.elementForces.find((f) => f.elementId === e.elementId)!;
    for (let j = 0; j < e.tPositions.length; j++) {
      const m = computeDiagramValueAt('moment', e.tPositions[j], ef);
      if (m > e.posValues[j] + 0.1 * gmax + 1e-6 || m < e.negValues[j] - 0.1 * gmax - 1e-6) {
        fail('moving-envelope', `${pathTag} ${label}: M=${m.toFixed(2)} at e${e.elementId} t=${e.tPositions[j]} (ref ${ref.toFixed(2)}) outside envelope [${e.negValues[j].toFixed(2)}, ${e.posValues[j].toFixed(2)}]`);
        return;
      }
    }
  }
}

// ── What-if ─────────────────────────────────────────────────────────

function compareScaled(check: string, label: string, base: AnalysisResults, got2: AnalysisResults | string | null, kd: number, kf: number, why: string) {
  if (!got2 || typeof got2 === 'string') { fail(check, `${label} ${why}: solve refused ${got2}`); return; }
  const dScale = Math.max(1e-12, ...base.displacements.map((d) => Math.max(Math.abs(d.ux), Math.abs(d.uz))));
  const rScale = Math.max(1e-9, ...base.displacements.map((d) => Math.abs(d.ry)));
  const fScale = Math.max(1e-9, ...base.elementForces.map((f) => maxAbs([f.nStart, f.nEnd, f.vStart, f.vEnd, f.mStart, f.mEnd])));
  const bd = new Map(base.displacements.map((d) => [d.nodeId, d]));
  for (const d of got2.displacements) {
    const b = bd.get(d.nodeId);
    if (!b) continue;
    if (Math.abs(d.ux - kd * b.ux) > 1e-6 * kd * dScale || Math.abs(d.uz - kd * b.uz) > 1e-6 * kd * dScale || Math.abs(d.ry - kd * b.ry) > 1e-6 * kd * rScale) {
      fail(check, `${label} ${why}: node ${d.nodeId} u=(${d.ux.toExponential(3)}, ${d.uz.toExponential(3)}), expected ${kd}×(${b.ux.toExponential(3)}, ${b.uz.toExponential(3)})`);
      return;
    }
  }
  const bf = new Map(base.elementForces.map((f) => [f.elementId, f]));
  for (const f of got2.elementForces) {
    const b = bf.get(f.elementId);
    if (!b) continue;
    const diff = maxAbs([f.nStart - kf * b.nStart, f.nEnd - kf * b.nEnd, f.vStart - kf * b.vStart, f.vEnd - kf * b.vEnd, f.mStart - kf * b.mStart, f.mEnd - kf * b.mEnd]);
    if (diff > 1e-6 * kf * fScale) { fail(check, `${label} ${why}: e${f.elementId} forces off by ${diff.toFixed(4)} (scale ${fScale.toFixed(1)})`); return; }
  }
}

function loadKinds(): string {
  const ks = new Set<string>();
  for (const l of modelStore.model.loads) {
    const d = l.data as unknown as Record<string, unknown>;
    ks.add(l.type === 'pointOnElement' && d.my ? 'pointMoment' : l.type);
  }
  return [...ks].sort().join('+');
}

function checkWhatIf(label: string, meta: GenMeta, base: AnalysisResults) {
  const k = 2.5;
  vi.useFakeTimers();
  try {
    whatIf.open();
    const n = modelStore.model.loads.length;
    if (!meta.settlement) {
      ran('whatif-loads');
      for (let i = 0; i < n; i++) whatIf.setLoadFactor(i, k);
      vi.advanceTimersByTime(200);
      const before = got('whatif-loads').length;
      compareScaled('whatif-loads', label, base, modelStore.solve(), k, k, `all loads ×${k}`);
      if (got('whatif-loads').length > before) {
        const l = findings.get('whatif-loads')!;
        l[l.length - 1] = `[loads: ${loadKinds()}] ${l[l.length - 1]}`;
      }
      whatIf.reset();
      vi.advanceTimersByTime(200);
    }
    // Springs do not stiffen with E, and a temperature or a settlement imposes a strain, not a force.
    if (!meta.thermal && !meta.settlement && !meta.springs) {
      ran('whatif-stiffness');
      whatIf.setAll('e', 4);
      vi.advanceTimersByTime(200);
      compareScaled('whatif-stiffness', label, base, modelStore.solve(), 1 / 4, 1, 'E ×4');
      whatIf.setAll('e', 1);
      whatIf.setAll('a', 3);
      whatIf.setAll('iy', 3);
      vi.advanceTimersByTime(200);
      compareScaled('whatif-stiffness', label, base, modelStore.solve(), 1 / 3, 1, 'A and I ×3');
    }
  } finally {
    whatIf.abandon();
    vi.useRealTimers();
  }
}

// ── The per-model audit ─────────────────────────────────────────────

function auditModel(meta: GenMeta) {
  const label = meta.label;
  const r = rng(meta.seed * 7 + 13);
  const input = modelStore.buildSolverInput(false);
  if (!input) { fail('static', `${label}: no solver input`); return; }
  ran('static');
  const res = modelStore.solve();
  const solved = !!res && typeof res !== 'string';
  const degree = checkKinematic(label, input, solved);
  if (!solved) { fail('static', `${label}: generated model refused: ${res}`); return; }
  const bad = nonFinite(res);
  if (bad.length) fail('static', `${label}: non-finite ${bad.join(', ')}`);

  // What the despiece and the section panel read: the published (drawn-axes) forces.
  resultsStore.setResults(res);
  ran('despiece');
  despieceMemberEquilibrium(label, input, (id) => resultsStore.getElementForces(id));
  nodeEquilibrium('despiece-nodes', label, input, res, (id) => resultsStore.getElementForces(id));
  // The solver's own forces, in its own convention: tells a JS-side sign from the engine.
  ran('engine-member-equilibrium');
  engineMemberEquilibrium(label, input, res);
  checkSection(label, input, r);

  const bk = checkBuckling(label, input, res);
  checkPDelta(label, input, bk, modelStore.model.loads.length > 0);
  const sample = meta.seed % SAMPLE_EVERY === 0;
  checkModal(label, input, sample, meta);
  if (modelStore.model.loads.length > 0) checkPlastic(label, meta, input, res, degree);
  else checkNoLoadsPlastic(label);
  checkInfluence(label, meta, r);
  checkMoving(label, input, r);
  if (sample) checkWhatIf(label, meta, res);
}

// ── Known defects, by the findings they produce ─────────────────────
//
// Each entry is a defect this audit found that is still open; the numbering
// matches the report (D1…). The findings it matches are asserted in an
// `it.fails`, so the suite stays green while the defect exists and turns red
// the day it is fixed. D1–D9, D11 and D18 (both sides) are fixed: their
// findings no longer occur and the plain check covers them. What remains is in
// the engine (Rust), out of reach of the JS layer; each entry names the line.

/**
 * `it.fails` for a known defect. SWEEP_SHOW_FAILS=1 runs them as plain `it`, so the
 * assertion each defect breaks is printed in full.
 */
const itFails = process.env.SWEEP_SHOW_FAILS ? it : it.fails;
const KNOWN: Array<{ check: string; defect: string; match: (m: string) => boolean }> = [
  // D10 — engine/src/solver/pdelta.rs:228 b2_factor: the largest per-DOF ratio u_PΔ/u_lin
  //       over the translations it selects, not the amplification of the first mode.
  //       (a) On an arch a DOF whose linear value is small but above the 5 % cut reports
  //       B2 = 1.35 at λ1 = 15.9 (1/(1 − 1/λ1) = 1.07; max |u| grows 3 %). (b) On mixed#50
  //       the load barely excites mode 1 (λ1 = 1.86), so no DOF is amplified by
  //       1/(1 − 1/λ1) = 2.16 and B2 = 1.09: the per-DOF ratio is right for that load, but
  //       it is not the B2 the check (and AISC's B2) means. Both need the engine.
  { check: 'pdelta-b2', defect: 'ENGINE D10 (pdelta.rs:228): B2 is a per-DOF ratio, not the first-mode amplification', match: (m) => m.startsWith('arch#') || m.startsWith('mixed#50:') },
  // D12 — engine/src/solver/buckling.rs:64 and geometric_stiffness.rs:254 take one axial
  //       force per member, the mean of its two ends: a member compressed over part of its
  //       length (axial point load) reads as "no compressed elements", and a model whose
  //       only compression is small next to a tension ends in buckling.rs:144 "No positive
  //       buckling load factors found" instead of a (large) factor.
  { check: 'buckling', defect: 'ENGINE D12 (buckling.rs:64, geometric_stiffness.rs:254): one mean N per member misses partial or small compression', match: (m) => /no compressed elements" but|No positive buckling/.test(m) },
];

// ── Suite ────────────────────────────────────────────────────────────

const quiet: Array<ReturnType<typeof vi.spyOn>> = [];
beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(isSolverReady()).toBe(true);
  uiStore.analysisMode = '2d';
  for (const k of ['log', 'warn', 'error', 'info'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}));
});
afterAll(() => { quiet.forEach((s) => s.mockRestore()); });

const familyCounts: Record<string, number> = {};

describe('advanced 2D functions on generated models', () => {
  beforeAll(() => {
    for (const fam of FAMILIES) {
      for (let seed = 1; seed <= SEEDS_PER_FAMILY; seed++) {
        historyStore.clear();
        const meta = generate(fam as Family, seed);
        familyCounts[fam] = (familyCounts[fam] ?? 0) + 1;
        try { auditModel(meta); } catch (e) { fail('unhandled', `${meta.label}: ${String((e as Error)?.stack ?? e).slice(0, 400)}`); }
      }
    }
  }, 300_000);

  it('writes the findings to $SWEEP_DUMP when it is set', async () => {
    if (!process.env.SWEEP_DUMP) return;
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.SWEEP_DUMP, JSON.stringify({ runs: Object.fromEntries(runs), findings: Object.fromEntries(findings) }, null, 1));
  });

  it('built every family', () => {
    for (const f of FAMILIES) expect(familyCounts[f]).toBe(SEEDS_PER_FAMILY);
    // eslint-disable-next-line no-console
    process.stdout.write(`\n[advanced-sweep-2d] runs per check: ${JSON.stringify(Object.fromEntries(runs))}\n`);
    process.stdout.write(`[advanced-sweep-2d] findings per check: ${JSON.stringify(Object.fromEntries([...findings].map(([k, v]) => [k, v.length])))}\n`);
  });

  /*
   * Each check, with the findings that belong to a known defect split off into
   * an `it.fails` that names it. When a defect is fixed its `it.fails` starts
   * failing: delete the entry and the check is whole again.
   */
  const CHECKS: Array<[string, string]> = [
    ['unhandled', 'no function throws an unhandled error'],
    ['static', 'every generated model solves, with finite results'],
    ['kinematic', 'kinematic: classification agrees with the static solve'],
    ['kinematic-degree', 'kinematic: degree agrees with an independent count'],
    ['despiece-forces', 'free body: each member of the despiece balances its forces'],
    ['despiece-moments', 'free body: each member of the despiece balances its moments'],
    ['despiece-nodes-forces', 'free body: each node of the despiece balances its forces'],
    ['despiece-nodes-moments', 'free body: each node of the despiece balances its moments'],
    ['engine-member-equilibrium', 'engine: member end forces balance the member loads'],
    ['section', 'section: σ = N/A ± M·c/I of the member forces'],
    ['section-props', 'section: the panel uses the analysis section properties (1 %)'],
    ['section-canonical', 'section: canonical and legacy stresses agree'],
    ['buckling', 'buckling: λ > 0, ascending, "no compression" only without compression'],
    ['pdelta', 'P-Δ: converges, finite, stable/unstable as λ1 says'],
    ['pdelta-noloads', 'P-Δ: a model without loads converges'],
    ['pdelta-b2', 'P-Δ: B2 ≈ 1/(1 − 1/λ1) within 25 %'],
    ['modal', 'modal: frequencies and mass ratios'],
    ['modal-scaling', 'modal: f ∝ √E and f ∝ 1/√ρ'],
    ['plastic', 'plastic: a finite collapse factor and a mechanism'],
    ['plastic-noloads', 'plastic: a model without loads says so'],
    ['plastic-bounds', 'plastic: λc ≥ first yield, = first yield when isostatic'],
    ['influence', 'influence line: computed and finite'],
    ['influence-support', 'influence line: a reaction is 1 at its support and 0 at the others'],
    ['influence-mb', 'influence line: Müller-Breslau against the static solve (1 %)'],
    ['influence-mb-props', 'influence line: Müller-Breslau against the static solve (1e-6)'],
    ['moving', 'moving load: computed and finite'],
    ['moving-position', 'moving load: each position is the static solve of the train there'],
    ['moving-envelope', 'moving load: the envelope covers positions between its steps'],
    ['whatif-loads', 'what-if: loads × k → response × k'],
    ['whatif-stiffness', 'what-if: E × k and (A, I) × k → displacements / k'],
  ];
  for (const [check, title] of CHECKS) {
    const known = KNOWN.filter((k) => k.check === check);
    it(title, () => {
      const rest = got(check).filter((m) => !known.some((k) => k.match(m)));
      expect(rest.slice(0, 30)).toEqual([]);
    });
    for (const k of known) {
      itFails(`${title} — ${k.defect}`, () => {
        expect(got(check).filter((m) => k.match(m)).slice(0, 10)).toEqual([]);
      });
    }
  }
});

// ── Hand-built cases ─────────────────────────────────────────────────

function build(fn: () => void) {
  historyStore.clear();
  modelStore.clear();
  modelStore.batch(fn);
}
const N = (x: number, y: number) => modelStore.addNode(x, y);
const E = (a: number, b: number, t: 'frame' | 'truss' = 'frame') => modelStore.addElement(a, b, t);
/** A 10 × 20 cm rectangle on every member: Zp = b·h²/4 = 1e-3 m³, Mp = 250 kN·m at fy = 250. */
function rectEverywhere(b = 0.1, h = 0.2): number {
  const id = modelStore.addSection({ name: `R ${b}x${h}`, a: b * h, iy: (b * h ** 3) / 12, iz: (h * b ** 3) / 12, b, h, shape: 'rect' } as never);
  for (const e of [...modelStore.elements.keys()]) modelStore.updateElement(e, { sectionId: id });
  return id;
}
function solved(): AnalysisResults {
  const r = modelStore.solve();
  if (!r || typeof r === 'string') throw new Error(`static solve refused: ${r}`);
  return r;
}
const inputNow = () => modelStore.buildSolverInput(false)!;
const readable = (m: string) => expect(unreadable(m), `unreadable message: "${m}"`).toBe(false);

describe('hand-built: kinematic counts', () => {
  const cases: Array<[string, () => void, number]> = [
    ['simply supported beam', () => { const a = N(0, 0), b = N(6, 0); E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); }, 0],
    ['fixed-fixed beam', () => { const a = N(0, 0), b = N(3, 0), c = N(6, 0); E(a, b); E(b, c); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'fixed'); }, 3],
    ['propped cantilever', () => { const a = N(0, 0), b = N(6, 0); E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX'); }, 1],
    ['fixed-base portal', () => { const n = [N(0, 0), N(0, 4), N(6, 4), N(6, 0)]; E(n[0], n[1]); E(n[1], n[2]); E(n[2], n[3]); modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[3], 'fixed'); }, 3],
    ['pinned-base portal', () => { const n = [N(0, 0), N(0, 4), N(6, 4), N(6, 0)]; E(n[0], n[1]); E(n[1], n[2]); E(n[2], n[3]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[3], 'pinned'); }, 1],
    ['three-hinged gable', () => { const n = [N(0, 0), N(0, 4), N(5, 6), N(10, 4), N(10, 0)]; E(n[0], n[1]); const r = E(n[1], n[2]); E(n[2], n[3]); E(n[3], n[4]); modelStore.toggleHinge(r, 'end'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[4], 'pinned'); }, 0],
    ['Gerber beam', () => { const n = [N(0, 0), N(4, 0), N(6, 0), N(10, 0)]; E(n[0], n[1]); const g = E(n[1], n[2]); E(n[2], n[3]); modelStore.toggleHinge(g, 'end'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[3], 'rollerX'); }, 0],
    ['Pratt truss', () => { const b = [0, 3, 6, 9].map((x) => N(x, 0)), t = [N(3, 3), N(6, 3)]; for (let i = 0; i < 3; i++) E(b[i], b[i + 1], 'truss'); E(t[0], t[1], 'truss'); E(b[0], t[0], 'truss'); E(t[1], b[3], 'truss'); E(b[1], t[0], 'truss'); E(b[2], t[1], 'truss'); E(t[0], b[2], 'truss'); modelStore.addSupport(b[0], 'pinned'); modelStore.addSupport(b[3], 'rollerX'); }, 0],
    ['braced portal (frame + truss diagonal)', () => { const n = [N(0, 0), N(0, 4), N(6, 4), N(6, 0)]; E(n[0], n[1]); E(n[1], n[2]); E(n[2], n[3]); E(n[0], n[2], 'truss'); modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[3], 'fixed'); }, 4],
  ];
  it.each(cases.map(([name, fn, g]) => ({ name, fn, g })))('$name: g = $g, classified and solved consistently', ({ fn, g }) => {
    build(fn);
    const rep = generateKinematicReport(inputNow(), [])!;
    expect(rep.degree).toBe(g);
    expect(independentDegree(inputNow())).toBe(g);
    expect(rep.classification).toBe(g === 0 ? 'isostatic' : 'hyperstatic');
    expect(typeof modelStore.solve()).toBe('object');
  });

  // D1, fixed, kept as a regression check. It was: a king-post beam is once indeterminate — two beam members, the post and two
  // ties on four nodes, one of them met only by truss bars. The report says g = 0.
  it('king-post beam: g = 1 (D1)', () => {
    build(() => { const a = N(0, 0), m = N(4, 0), b = N(8, 0), d = N(4, -1); E(a, m); E(m, b); E(m, d, 'truss'); E(a, d, 'truss'); E(d, b, 'truss'); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); });
    expect(independentDegree(inputNow())).toBe(1);
    expect(generateKinematicReport(inputNow(), [])!.degree).toBe(1);
  });
  // D1, fixed, kept as a regression check. It was: with two posts the report goes to g = −1 and calls a structure that solves hypostatic.
  it('queen-post beam: classified hyperstatic and solvable (D1)', () => {
    build(() => { const a = N(0, 0), m1 = N(3, 0), m2 = N(6, 0), b = N(9, 0), d1 = N(3, -1), d2 = N(6, -1); E(a, m1); E(m1, m2); E(m2, b); E(m1, d1, 'truss'); E(m2, d2, 'truss'); E(a, d1, 'truss'); E(d1, d2, 'truss'); E(d2, b, 'truss'); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addDistributedLoad(1, -10); });
    expect(typeof modelStore.solve()).toBe('object');
    expect(generateKinematicReport(inputNow(), [])!.classification).not.toBe('hypostatic');
  });
  // D13, fixed, kept as a regression check. It was: kinematic-2d.ts computeStaticDegree takes `k ≤ 1 → c = 0` before looking at the
  // support, so a member hinged at a fixed support (a pin) is counted as clamped: g = 0, not −1.
  it('cantilever hinged at its fixed support: g = −1 (D13)', () => {
    build(() => { const a = N(0, 0), b = N(4, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.toggleHinge(e, 'start'); modelStore.addNodalLoad(b, 0, -10); });
    const rep = generateKinematicReport(inputNow(), [])!;
    expect(rep.classification).toBe('hypostatic');
    expect(rep.degree).toBe(-1);
  });
  it('cantilever hinged at its fixed support is still refused as a mechanism', () => {
    build(() => { const a = N(0, 0), b = N(4, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.toggleHinge(e, 'start'); modelStore.addNodalLoad(b, 0, -10); });
    expect(generateKinematicReport(inputNow(), [])!.classification).toBe('hypostatic');
    expect(typeof modelStore.solve()).toBe('string');
  });
});

/** Every advanced function on a model the static solve refuses: a readable refusal or an explicit "unstable", never a quiet number. */
function refusesEverywhere(): string[] {
  const out: string[] = [];
  const input = inputNow();
  const tryMsg = (name: string, f: () => unknown, ok: (r: any) => boolean) => {
    try {
      const r = f();
      if (typeof r === 'string') { if (unreadable(r)) out.push(`${name}: unreadable "${r}"`); return; }
      if (!ok(r)) out.push(`${name}: returned a result for a mechanism ${JSON.stringify(r)?.slice(0, 100)}`);
    } catch (e) { if (unreadable(errMsg(e))) out.push(`${name}: unreadable throw "${errMsg(e)}"`); }
  };
  tryMsg('P-Δ', () => solvePDelta(input), (r) => !r.isStable);
  tryMsg('buckling', () => solveBuckling(input), () => false);
  tryMsg('modal', () => solveModal(input, densities()), () => false);
  tryMsg('plastic', () => runPlasticCollapse(), () => false);
  const sup = [...modelStore.supports.values()][0];
  tryMsg('influence', () => computeInfluenceLine(modelStore.model as never, 'Rz' as never, sup.nodeId), () => false);
  tryMsg('moving', () => solveMovingLoads(input, { train: getPredefinedTrains()[0], step: 0.5 }), () => false);
  return out;
}

describe('hand-built: mechanisms and degenerate models', () => {
  const beamOnRollers = () => { const a = N(0, 0), b = N(5, 0); const e = E(a, b); modelStore.addSupport(a, 'rollerX'); modelStore.addSupport(b, 'rollerX'); modelStore.addPointLoadOnElement(e, 2, -10); };
  const squareTruss = () => { const n = [N(0, 0), N(3, 0), N(3, 3), N(0, 3)]; for (let i = 0; i < 4; i++) E(n[i], n[(i + 1) % 4], 'truss'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addNodalLoad(n[3], 5, 0); };
  const collinear = () => { const n = [N(0, 0), N(2, 0), N(4, 0)]; E(n[0], n[1], 'truss'); E(n[1], n[2], 'truss'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'pinned'); modelStore.addNodalLoad(n[1], 0, -10); };
  const twoHinges = () => { const n = [0, 2, 4, 6].map((x) => N(x, 0)); const e1 = E(n[0], n[1]); E(n[1], n[2]); const e3 = E(n[2], n[3]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[3], 'rollerX'); modelStore.toggleHinge(e1, 'end'); modelStore.toggleHinge(e3, 'start'); modelStore.addNodalLoad(n[1], 0, -10); };
  const hingedAtFixed = () => { const a = N(0, 0), b = N(4, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.toggleHinge(e, 'start'); modelStore.addNodalLoad(b, 0, -10); };

  it.each([['beam on two rollers', beamOnRollers], ['square truss without a diagonal', squareTruss], ['two collinear truss bars', collinear], ['beam with two internal hinges', twoHinges], ['member hinged at its fixed support', hingedAtFixed]] as const)(
    '%s: the static solve refuses with a readable message and the kinematic report agrees', (_n, fn) => {
      build(fn);
      const r = modelStore.solve();
      expect(typeof r).toBe('string');
      readable(r as string);
      expect(generateKinematicReport(inputNow(), [])!.classification).toBe('hypostatic');
    });

  // D14, fixed, kept as a regression check. It was: influence-service.ts:57 reads `err.message`, but the WASM throws a string, so
  // every refusal reads "Error computing influence line: undefined".
  it('influence line on a mechanism: a readable refusal (D14)', () => {
    build(squareTruss);
    const r = computeInfluenceLine(modelStore.model as never, 'Rz' as never, [...modelStore.supports.values()][0].nodeId);
    expect(typeof r).toBe('string');
    readable(r as string);
  });
  // D15, fixed, kept as a regression check. It was: the advanced analyses do not run the kinematic check the static solve runs.
  // On a beam with two internal hinges (two mechanism modes) P-Δ reports converged and
  // stable with B2 = 1, the moving load returns an envelope and the influence line of the
  // member hinged at a fixed support returns ordinates. On a beam on two rollers and on a
  // square truss the modal analysis returns positive frequencies (the zero mode dropped).
  it('beam with two internal hinges: every advanced function refuses (D15)', () => {
    build(twoHinges);
    expect(refusesEverywhere()).toEqual([]);
  });
  it('beam on two rollers: every advanced function refuses (D15)', () => {
    build(beamOnRollers);
    expect(refusesEverywhere()).toEqual([]);
  });
  it('member hinged at its fixed support: every advanced function refuses (D15)', () => {
    build(hingedAtFixed);
    expect(refusesEverywhere()).toEqual([]);
  });
  it('two collinear truss bars: every advanced function except modal refuses', () => {
    build(collinear);
    expect(refusesEverywhere().filter((m) => !m.startsWith('modal') && !m.startsWith('influence'))).toEqual([]);
  });

  // D16, fixed, kept as a regression check. It was: solver-service.ts imports the RAW analyzeKinematics from wasm-solver (line 9)
  // and shows its `diagnosis`: the engine's Spanish-only sentence in its Y-up vocabulary
  // ("desplazamiento en Y", "rotación en Z"), in every locale. kinematic-2d.ts's
  // analyzeKinematics builds the same sentence localized, with the app's Z-up names.
  it('a mechanism refusal is the localized diagnosis in the app\'s axis names (D16)', () => {
    build(collinear);
    const msg = modelStore.solve() as string;
    expect(msg).toBe(analyzeKinematics2D(inputNow()).diagnosis);
  });

  // D17, fixed, kept as a regression check. It was: solver-service.ts prepareSolve2D's external-stability matrix and its
  // "only rollers X" test read a rollerX's type and ignore its angle: a beam on two rollers
  // and a 30° inclined roller is isostatic (the engine's rank check agrees) and is refused
  // as having no horizontal restraint — while P-Δ, modal and plastic run on it.
  it('three rollers, one inclined: stable, and the static solve accepts it (D17)', () => {
    build(() => { const n = [0, 4, 8].map((x) => N(x, 0)); const e1 = E(n[0], n[1]); E(n[1], n[2]); modelStore.addSupport(n[0], 'rollerX'); modelStore.addSupport(n[1], 'rollerX'); modelStore.addSupport(n[2], 'rollerX', undefined, { angle: 30 }); modelStore.addPointLoadOnElement(e1, 2, -10); });
    expect(generateKinematicReport(inputNow(), [])!.classification).toBe('isostatic');
    expect(typeof modelStore.solve()).toBe('object');
  });

  it('coincident nodes and a member on one node are refused with a readable message', () => {
    build(() => { const a = N(0, 0), b = N(5, 0), c = N(5, 0); E(a, b); E(b, c); modelStore.addSupport(a, 'fixed'); modelStore.addNodalLoad(c, 0, -10); });
    readable(modelStore.solve() as string);
    for (const f of [() => solvePDelta(inputNow()), () => solveBuckling(inputNow()), () => solveModal(inputNow(), densities()), () => runPlasticCollapse()]) {
      expect(f).toThrow();
      try { f(); } catch (e) { readable(errMsg(e)); }
    }
    build(() => { const a = N(0, 0), b = N(5, 0); E(a, b); E(b, b); modelStore.addSupport(a, 'fixed'); modelStore.addNodalLoad(b, 0, -10); });
    readable(modelStore.solve() as string);
  });

  it('a single member runs through every function', () => {
    build(() => { const a = N(0, 0), b = N(6, 0); const e = E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addPointLoadOnElement(e, 2, -30); });
    const res = solved();
    expect(nonFinite(res)).toEqual([]);
    const input = inputNow();
    expect(solvePDelta(input).converged).toBe(true);
    expect(() => solveBuckling(input)).toThrow(/no compressed/i);
    expect(solveModal(input, densities()).modes[0].frequency).toBeGreaterThan(0);
    expect(runPlasticCollapse()!.result.isMechanism).toBe(true);
    const il = computeInfluenceLine(modelStore.model as never, 'M' as never, undefined, 1, 0.5);
    expect(typeof il).toBe('object');
    const ml = solveMovingLoads(input, { train: getPredefinedTrains()[1], step: 0.5 });
    expect(typeof ml).toBe('object');
  });

  it('a model without loads: buckling says there is no compression, modal and the influence line run', () => {
    build(() => { const a = N(0, 0), b = N(5, 0); E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); });
    solved();
    const input = inputNow();
    expect(() => solveBuckling(input)).toThrow(/no compressed/i);
    expect(solveModal(input, densities()).modes.length).toBeGreaterThan(0);
    expect(typeof computeInfluenceLine(modelStore.model as never, 'Rz' as never, 1)).toBe('object');
  });
  // D9, fixed, kept as a regression check. It was: see the sweep's pdelta-noloads / plastic-noloads.
  it('a model without loads: P-Δ converges with B2 = 1 (D9)', () => {
    build(() => { const a = N(0, 0), b = N(5, 0); E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); });
    const pd = solvePDelta(inputNow());
    expect(pd.converged && pd.isStable).toBe(true);
  });
  // D11, fixed, kept as a regression check. It was: a fixed-fixed beam of one member has every DOF restrained.
  it('a fixed-fixed single member: P-Δ gives the linear result (D11)', () => {
    build(() => { const a = N(0, 0), b = N(5, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed'); modelStore.addDistributedLoad(e, -10); });
    expect(solvePDelta(inputNow()).converged).toBe(true);
  });

  it('only nodal moments: a simply supported beam with an end couple', () => {
    build(() => { const a = N(0, 0), b = N(3, 0), c = N(6, 0); E(a, b); E(b, c); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(c, 'rollerX'); modelStore.addNodalLoad(c, 0, 0, 50); rectEverywhere(); });
    const res = solved();
    const input = inputNow();
    // Reactions ±M/L, and the moment grows linearly to 50 at the loaded end.
    expect(Math.abs(res.reactions.find((r) => r.nodeId === 1)!.rz)).toBeCloseTo(50 / 6, 6);
    expect(solvePDelta(input).converged).toBe(true);
    expect(solveModal(input, densities()).modes.length).toBeGreaterThan(0);
    // Collapse when the end moment reaches Mp = 250: λ = 5.
    expect(runPlasticCollapse()!.result.collapseFactor).toBeCloseTo(5, 3);
  });

  it('only horizontal loads: a pinned-roller beam pushed axially buckles at π²EI/L²', () => {
    build(() => { const n = [0, 1, 2, 3, 4].map((x) => N(x, 0)); for (let i = 0; i < 4; i++) E(n[i], n[i + 1]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[4], 'rollerX'); modelStore.addNodalLoad(n[4], -100, 0, 0); rectEverywhere(); });
    solved();
    const EI = 200e3 * 1000 * ((0.1 * 0.2 ** 3) / 12);
    const lam = solveBuckling(inputNow()).modes[0].loadFactor;
    expect(lam / ((Math.PI ** 2 * EI) / 16 / 100)).toBeCloseTo(1, 2);
  });

  it('a column with no compression (hanging): buckling says so, P-Δ does not amplify', () => {
    build(() => { const a = N(0, 4), b = N(0, 0); E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addNodalLoad(b, 0, -10); });
    solved();
    expect(() => solveBuckling(inputNow())).toThrow(/no compressed/i);
    expect(solvePDelta(inputNow()).b2Factor).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('hand-built: textbook values', () => {
  /** Mp of the rectangle used below, as the analysis computes it. */
  const MP = 250;
  const collapse = () => { const run = runPlasticCollapse()!; expect(run.mps[0].mp).toBeCloseTo(MP, 6); return run.result; };

  it('plastic: simply supported, point load at midspan — P·L/4 = Mp', () => {
    build(() => { const a = N(0, 0), b = N(6, 0); const e = E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addPointLoadOnElement(e, 3, -100); rectEverywhere(); });
    expect(collapse().collapseFactor).toBeCloseTo((4 * MP) / (100 * 6), 3);
  });
  it('plastic: fixed-fixed, uniform load — λ·w·L² = 16·Mp', () => {
    build(() => { const a = N(0, 0), b = N(6, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'fixed'); modelStore.addDistributedLoad(e, -10); rectEverywhere(); });
    expect(collapse().collapseFactor).toBeCloseTo((16 * MP) / (10 * 36), 2);
  });
  it('plastic: propped cantilever, point load at midspan — P = 6·Mp/L', () => {
    build(() => { const a = N(0, 0), b = N(6, 0); const e = E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(b, 'rollerX'); modelStore.addPointLoadOnElement(e, 3, -100); rectEverywhere(); });
    expect(collapse().collapseFactor).toBeCloseTo((6 * MP) / (100 * 6), 3);
  });
  it('plastic: fixed-fixed, point load at midspan — P = 8·Mp/L', () => {
    build(() => { const a = N(0, 0), b = N(3, 0), c = N(6, 0); E(a, b); E(b, c); modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'fixed'); modelStore.addNodalLoad(b, 0, -100); rectEverywhere(); });
    expect(collapse().collapseFactor).toBeCloseTo((8 * MP) / (100 * 6), 3);
  });
  it('plastic: two equal continuous spans, uniform load — w·L² = 11.657·Mp', () => {
    build(() => { const a = N(0, 0), b = N(6, 0), c = N(12, 0); const e1 = E(a, b), e2 = E(b, c); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addSupport(c, 'rollerX'); modelStore.addDistributedLoad(e1, -10); modelStore.addDistributedLoad(e2, -10); rectEverywhere(); });
    expect(collapse().collapseFactor / ((2 * (3 + 2 * Math.SQRT2) * MP) / (10 * 36))).toBeCloseTo(1, 2);
  });
  it('plastic: cantilever, tip load — P·L = Mp; the member drawn backwards gives the same', () => {
    for (const rev of [false, true]) {
      build(() => { const a = N(0, 0), b = N(4, 0); rev ? E(b, a) : E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addNodalLoad(b, 0, -100); rectEverywhere(); });
      expect(collapse().collapseFactor).toBeCloseTo(MP / 400, 4);
    }
  });
  it('plastic: fixed-base portal, V = 2 at midspan and H = 1 — combined mechanism λ(H·h + V·L/2) = 6·Mp', () => {
    build(() => { const n = [N(0, 0), N(0, 4), N(4, 4), N(4, 0)]; E(n[0], n[1]); const b = E(n[1], n[2]); E(n[2], n[3]); modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[3], 'fixed'); modelStore.addPointLoadOnElement(b, 2, -2); modelStore.addNodalLoad(n[1], 1, 0, 0); rectEverywhere(); });
    expect(collapse().collapseFactor).toBeCloseTo((6 * MP) / (4 + 4), 1);
  });

  it('buckling: cantilever column π²EI/(4L²), pinned column π²EI/L²; P-Δ amplifies by ≈ 1/(1 − P/Pcr)', () => {
    const EI = 200e3 * 1000 * ((0.1 * 0.2 ** 3) / 12);
    build(() => { const n = [0, 1, 2, 3, 4].map((y) => N(0, y)); for (let i = 0; i < 4; i++) E(n[i], n[i + 1]); modelStore.addSupport(n[0], 'fixed'); modelStore.addNodalLoad(n[4], 1, -1000, 0); rectEverywhere(); });
    solved();
    const pcr = (Math.PI ** 2 * EI) / (4 * 16);
    const lam = solveBuckling(inputNow()).modes[0].loadFactor;
    expect(lam / (pcr / 1000)).toBeCloseTo(1, 2);
    const pd = solvePDelta(inputNow());
    expect(pd.converged && pd.isStable).toBe(true);
    expect(pd.b2Factor / (1 / (1 - 1000 / pcr))).toBeGreaterThan(0.9);
    expect(pd.b2Factor / (1 / (1 - 1000 / pcr))).toBeLessThan(1.1);
    build(() => { const n = [0, 1, 2, 3, 4].map((y) => N(0, y)); for (let i = 0; i < 4; i++) E(n[i], n[i + 1]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[4], 'rollerZ'); modelStore.addNodalLoad(n[4], 0, -1000, 0); rectEverywhere(); });
    solved();
    expect(solveBuckling(inputNow()).modes[0].loadFactor / ((Math.PI ** 2 * EI) / 16 / 1000)).toBeCloseTo(1, 2);
  });
  it('buckling above the critical load: P-Δ says unstable', () => {
    const EI = 200e3 * 1000 * ((0.1 * 0.2 ** 3) / 12);
    const pcr = (Math.PI ** 2 * EI) / (4 * 16);
    build(() => { const n = [0, 1, 2, 3, 4].map((y) => N(0, y)); for (let i = 0; i < 4; i++) E(n[i], n[i + 1]); modelStore.addSupport(n[0], 'fixed'); modelStore.addNodalLoad(n[4], 1, -1.5 * pcr, 0); rectEverywhere(); });
    expect(solveBuckling(inputNow()).modes[0].loadFactor).toBeLessThan(1);
    expect(solvePDelta(inputNow()).isStable).toBe(false);
  });

  it('modal: simply supported beam f1 = (π/2L²)·√(EI/m); cantilever f1 = 1.875²/(2πL²)·√(EI/m)', () => {
    const EI = 200e3 * 1e6 * ((0.1 * 0.2 ** 3) / 12); // N·m²
    const m = ((78.5 * 1000) / 9.81) * 0.02; // kg/m
    build(() => { const n = Array.from({ length: 9 }, (_, i) => N(i, 0)); for (let i = 0; i < 8; i++) E(n[i], n[i + 1]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[8], 'rollerX'); rectEverywhere(); });
    const ss = solveModal(inputNow(), densities()).modes.find((q: { massRatioY: number }) => q.massRatioY > 0.3)!;
    expect(ss.frequency / ((Math.PI / (2 * 64)) * Math.sqrt(EI / m))).toBeCloseTo(1, 2);
    build(() => { const n = Array.from({ length: 9 }, (_, i) => N(i * 0.5, 0)); for (let i = 0; i < 8; i++) E(n[i], n[i + 1]); modelStore.addSupport(n[0], 'fixed'); rectEverywhere(); });
    const cf = solveModal(inputNow(), densities()).modes[0];
    expect(cf.frequency / ((1.875104 ** 2 / (2 * Math.PI * 16)) * Math.sqrt(EI / m))).toBeCloseTo(1, 2);
  });

  it('influence line: simply supported beam, M at midspan peaks at L/4 with the sign of the static diagram; Rz is 1 − x/L', () => {
    build(() => { const n = [0, 2, 4, 6, 8, 10].map((x) => N(x, 0)); for (let i = 0; i < 5; i++) E(n[i], n[i + 1]); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[5], 'rollerX'); });
    const il = computeInfluenceLine(modelStore.model as never, 'M' as never, undefined, 3, 0.5) as { points: Array<{ x: number; value: number }> };
    const at = (x: number) => il.points.find((p) => Math.abs(p.x - x) < 1e-9)!.value;
    expect(Math.abs(at(5))).toBeCloseTo(2.5, 6);
    expect(Math.abs(at(2))).toBeCloseTo(1, 6);
    const st = staticWith([unitDownAt(3, 1)]) as AnalysisResults;
    expect(Math.sign(at(5))).toBe(Math.sign(computeDiagramValueAt('moment', 0.5, st.elementForces.find((f) => f.elementId === 3)!)));
    const rz = computeInfluenceLine(modelStore.model as never, 'Rz' as never, 1) as { points: Array<{ x: number; value: number }> };
    for (const p of rz.points) expect(p.value).toBeCloseTo(1 - p.x / 10, 6);
  });

  // D5, fixed, kept as a regression check. It was: a settlement is a support displacement; the unit-load line must not carry it.
  it('influence line of a settled two-span beam: Rz is 1 at its support, 0 at the others (D5)', () => {
    build(() => { const a = N(0, 0), b = N(5, 0), c = N(10, 0); E(a, b); E(b, c); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX', undefined, { dz: -0.01 }); modelStore.addSupport(c, 'rollerX'); });
    const il = computeInfluenceLine(modelStore.model as never, 'Rz' as never, 2) as { points: Array<{ x: number; value: number }> };
    const at = (x: number) => il.points.find((p) => Math.abs(p.x - x) < 1e-9)!.value;
    expect(at(0)).toBeCloseTo(0, 6); expect(at(5)).toBeCloseTo(1, 6); expect(at(10)).toBeCloseTo(0, 6);
  });
  // D7, fixed, kept as a regression check. It was: the influence line's own section map ignores the section's rotation (and
  // solverProperties), and its supports ignore their angle. A two-span beam with one span in
  // an IPN turned 90° (bent about its weak axis) and an inclined roller at the end.
  it('influence line uses the solve\'s section properties and support angles (D7)', () => {
    build(() => {
      const a = N(0, 0), b = N(5, 0), c = N(10, 0); E(a, b); const e2 = E(b, c);
      const { id: _id, canonical: _c, ...ipn } = modelStore.sections.get(1)! as never as Record<string, unknown>;
      void _id; void _c;
      const rot = modelStore.addSection({ ...ipn, name: 'IPN 300 90°', rotation: 90 } as never);
      modelStore.updateElement(e2, { sectionId: rot });
      modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addSupport(c, 'rollerX', undefined, { angle: 30 });
    });
    for (const [q, node] of [['Rz', 2], ['Rx', 1]] as const) {
      const il = computeInfluenceLine(modelStore.model as never, q as never, node) as { points: Array<{ x: number; value: number; elementId: number; t: number }> };
      const p = il.points.find((pt) => pt.elementId === 1 && Math.abs(pt.t - 0.5) < 1e-9)!;
      const st = staticWith([unitDownAt(1, 2.5)]) as AnalysisResults;
      expect(p.value).toBeCloseTo(ilValueFromStatic(q, st, node), 4);
    }
  });

  // D18, engine part, fixed: the engine's truss assembly took only the thermal load of a
  // truss or cable element, so a point or distributed load on a bar was dropped by the solve
  // without a word. It now takes it to the bar's two nodes by the lever rule, as the
  // influence line and the moving load already did (the regression check below).
  it('D18: a point load on a truss bar reaches the supports', () => {
    build(() => { const n = [N(0, 0), N(3, 0), N(6, 0)], t = N(3, 3); const e1 = E(n[0], n[1], 'truss'); E(n[1], n[2], 'truss'); E(n[0], t, 'truss'); E(t, n[2], 'truss'); E(n[1], t, 'truss'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'rollerX'); modelStore.addPointLoadOnElement(e1, 1, -10, { isGlobal: true }); });
    const r = solved();
    expect(r.reactions.reduce((sum, x) => sum + x.rz, 0)).toBeCloseTo(10, 6);
  });
  it('influence line of a truss: Rz is 1 − x/L along the bottom chord (D18)', () => {
    build(() => { const n = [N(0, 0), N(3, 0), N(6, 0)], t = N(3, 3); E(n[0], n[1], 'truss'); E(n[1], n[2], 'truss'); E(n[0], t, 'truss'); E(t, n[2], 'truss'); E(n[1], t, 'truss'); modelStore.addSupport(n[0], 'pinned'); modelStore.addSupport(n[2], 'rollerX'); });
    const il = computeInfluenceLine(modelStore.model as never, 'Rz' as never, 1) as { points: Array<{ x: number; y: number; value: number }> };
    for (const p of il.points.filter((q) => Math.abs(q.y) < 1e-9)) expect(p.value).toBeCloseTo(1 - p.x / 6, 6);
  });

  it('moving load: one 100 kN axle on a simply supported span — M = W·L/4, R = W', () => {
    build(() => { const a = N(0, 0), b = N(10, 0); E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); });
    const env = solveMovingLoads(inputNow(), { train: getPredefinedTrains()[0], step: 0.25 }) as MovingLoadEnvelope;
    const m = env.fullEnvelope!.moment.elements[0];
    expect(Math.max(...m.posValues.map(Math.abs), ...m.negValues.map(Math.abs))).toBeCloseTo(250, 6);
    expect(Math.max(...env.positions.map((p) => Math.abs(p.results.reactions[0].rz)))).toBeCloseTo(100, 6);
  });
  // D4, fixed, kept as a regression check. It was: the same span drawn right to left.
  it('moving load: the same span drawn right to left gives the same envelope (D4)', () => {
    build(() => { const a = N(0, 0), b = N(10, 0); E(b, a); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); });
    const env = solveMovingLoads(inputNow(), { train: getPredefinedTrains()[0], step: 0.25 }) as MovingLoadEnvelope;
    const rz = env.positions.map((p) => p.results.reactions.find((r) => r.nodeId === 1)!.rz);
    expect(Math.max(...rz)).toBeCloseTo(100, 6);
    expect(Math.min(...rz)).toBeGreaterThan(-1e-6);
  });

  it('section: a simply supported beam under gravity is in tension at the bottom fibre at midspan, drawn either way', () => {
    for (const rev of [false, true]) {
      build(() => { const a = N(0, 0), b = N(6, 0); rev ? E(b, a) : E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addDistributedLoad(1, -10); });
      resultsStore.setResults(solved());
      const ef = resultsStore.getElementForces(1)!;
      const sec = modelStore.sections.get(1)!;
      const rs = analyzeSectionStress(ef, sec, 250, 0.5).resolved;
      expect(analyzeSectionStress(ef, sec, 250, 0.5, rs.yMin).sigmaAtY).toBeGreaterThan(0);
      expect(analyzeSectionStress(ef, sec, 250, 0.5, rs.yMax).sigmaAtY).toBeLessThan(0);
      // M = wL²/8 = 45 kN·m over W = I/c of the IPN 300.
      expect(Math.abs(analyzeSectionStress(ef, sec, 250, 0.5, rs.yMax).sigmaAtY)).toBeCloseTo((45 * 0.15) / rs.iy / 1000, 3);
    }
  });

  // D3, fixed, kept as a regression check. It was: the fixed end of a cantilever under a tip load: the wall turns the member
  // counter-clockwise (the reaction glyph says so: My = +P·L, drawn CCW); the despiece draws
  // the member-side moment at that end clockwise.
  it('despiece: the member-side moment at a fixed end has the sense of the support reaction (D3)', () => {
    build(() => { const a = N(0, 0), b = N(4, 0); E(a, b); modelStore.addSupport(a, 'fixed'); modelStore.addNodalLoad(b, 0, -10); });
    const res = solved();
    resultsStore.setResults(res);
    const v = computeDespieceVectors({
      ...despieceArgs((id) => resultsStore.getElementForces(id)), reactions: new Map(res.reactions.map((r) => [r.nodeId, r])),
      sep: 1, vectorMode: 'all', basis: 'local', showReactions: true, fmt: String,
    });
    const member = v.find((x) => x.side === 'member' && x.glyph === 'moment' && x.end === 'I')!;
    const reaction = v.find((x) => x.side === 'reaction' && x.glyph === 'moment')!;
    expect(member.ccw).toBe(reaction.ccw);
  });
  // D2, fixed, kept as a regression check. It was: a beam drawn right to left under gravity: both supports push the member up.
  it('despiece: on a beam drawn right to left the end shears point up under gravity (D2)', () => {
    build(() => { const a = N(0, 0), b = N(6, 0); E(b, a); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addDistributedLoad(1, -10); });
    resultsStore.setResults(solved());
    const ends = inspectMember(despieceArgs((id) => resultsStore.getElementForces(id)), 1)!.ends;
    for (const e of ends) expect(comp(e, 'Fz')).toBeGreaterThan(0);
  });

  // D6, fixed, kept as a regression check. It was: a point moment on a member, scaled by the what-if load slider.
  it('what-if: a point moment on a member scales with its slider (D6)', () => {
    build(() => { const a = N(0, 0), b = N(6, 0); const e = E(a, b); modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'rollerX'); modelStore.addPointLoadOnElement(e, 2, 0, { my: 20 }); });
    const base = solved();
    vi.useFakeTimers();
    try {
      whatIf.open();
      whatIf.setLoadFactor(0, 2);
      vi.advanceTimersByTime(200);
      const r = solved();
      expect(r.reactions[0].rz).toBeCloseTo(2 * base.reactions[0].rz, 9);
    } finally { whatIf.abandon(); vi.useRealTimers(); }
  });
  it('what-if: leaving restores the model as it was', async () => {
    build(() => { const n = [N(0, 0), N(0, 4), N(6, 4), N(6, 0)]; E(n[0], n[1]); const b = E(n[1], n[2]); E(n[2], n[3]); modelStore.addSupport(n[0], 'fixed'); modelStore.addSupport(n[3], 'pinned'); modelStore.addDistributedLoad(b, -12); modelStore.addNodalLoad(n[1], 8, 0, 0); });
    const base = solved();
    vi.useFakeTimers();
    try {
      whatIf.open();
      whatIf.setAll('e', 3); whatIf.setLoadFactor(0, 0.5); whatIf.setSupportType(2, 'fixed');
      vi.advanceTimersByTime(200);
    } finally { vi.useRealTimers(); }
    await whatIf.close();
    const after = solved();
    for (const d of after.displacements) {
      const b = base.displacements.find((x) => x.nodeId === d.nodeId)!;
      expect(d.ux).toBeCloseTo(b.ux, 12); expect(d.uz).toBeCloseTo(b.uz, 12); expect(d.ry).toBeCloseTo(b.ry, 12);
    }
  });
});
