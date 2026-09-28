/**
 * What a member or a support does beyond the linear, stored on it and honoured by every solve.
 *
 * ── Members ───────────────────────────────────────────────────────
 *
 *   · inactive: left out of the analysis, with its loads. Nodes nothing else holds go too.
 *   · tension only / compression only: axial members in an active-set loop over the linear
 *     solve, dropped when they would carry the other sign and solved again until nothing changes.
 *   · stiffness modifiers: factors on A, Iy, Iz and J, applied through a section made for the
 *     solve only, so design and reports still read the member's real section. The presets are
 *     CIRSOC 201-2025 Tabla 6.6.3.1.1(a).
 *
 * ── Supports that lift ────────────────────────────────────────────
 *
 * A support marked `uplift` holds the node down, never up. It is solved by the usual active
 * set: solve, release the vertical restraint (or spring) where the reaction pulls, restore it
 * where a released node goes down into the support, and solve again until no support changes.
 * Around a linear solve, or around the contact solve when there are one-way members too.
 *
 * ── Why combinations are solved one by one ────────────────────────
 *
 * None of this is linear, so a combination is not the sum of its cases: each one is solved
 * with its own factored loads. Each case is solved on its own too, for the per-case results.
 */
import type { ModelData } from './solver-service';
import type { AnalysisResults3D, SolverInput3D, ElementForces3D, NonlinearReport } from './types-3d';
import { solve3D, solveSSI3D } from './wasm-solver';
import { computeLocalAxes3D } from './local-axes-3d';
import { transverseToNodes, type MemberRef } from './member-loads';
import { stabiliseOrphanRotations3D } from './orphan-rotations-3d';
import { stripStabilisedReactions } from './stabilised-reactions';

export type MemberBehaviour = 'tensionOnly' | 'compressionOnly' | 'inactive';

export type StiffnessPreset = 'column' | 'wallUncracked' | 'wallCracked' | 'beam' | 'slab';

export interface StiffnessModifiers { a?: number; iy?: number; iz?: number; j?: number; preset?: StiffnessPreset }

/** CIRSOC 201-2025 Tabla 6.6.3.1.1(a): moment of inertia factors for elastic analysis under factored loads; area 1,0 Ag. */
export const CIRSOC201_STIFFNESS: Record<StiffnessPreset, number> = {
  column: 0.70, wallUncracked: 0.70, wallCracked: 0.35, beam: 0.35, slab: 0.25,
};

export function presetModifiers(p: StiffnessPreset): StiffnessModifiers {
  const f = CIRSOC201_STIFFNESS[p];
  return { preset: p, a: 1, iy: f, iz: f };
}

type El = { id: number; nodeI: number; nodeJ: number; behaviour?: MemberBehaviour };

/** The model without its inactive members, their loads, and the nodes only they held. */
export function activeModel<M extends ModelData>(model: M): M {
  const inactive = new Set<number>();
  for (const e of model.elements.values()) if ((e as El).behaviour === 'inactive') inactive.add(e.id);
  if (inactive.size === 0) return model;
  const elements = new Map([...model.elements].filter(([id]) => !inactive.has(id)));
  const used = new Set<number>();
  for (const e of elements.values()) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const q of model.quads?.values() ?? []) q.nodes.forEach((n) => used.add(n));
  for (const p of model.plates?.values() ?? []) p.nodes.forEach((n) => used.add(n));
  for (const c of model.connectors?.values() ?? []) { used.add(c.nodeI); used.add(c.nodeJ); }
  for (const c of model.constraints ?? []) for (const v of Object.values(c as unknown as Record<string, unknown>)) {
    if (typeof v === 'number') used.add(v);
    if (Array.isArray(v)) for (const x of v) if (typeof x === 'number') used.add(x);
  }
  const keepNode = (id: number) => used.has(id);
  const loads = model.loads.filter((l) => {
    const d = l.data as { elementId?: number; nodeId?: number };
    if (d.elementId !== undefined && inactive.has(d.elementId)) return false;
    if (d.nodeId !== undefined && !keepNode(d.nodeId)) return false;
    return true;
  });
  return {
    ...model,
    elements,
    nodes: new Map([...model.nodes].filter(([id]) => keepNode(id))),
    supports: new Map([...model.supports].filter(([, s]) => keepNode(s.nodeId))),
    loads,
  };
}

export function hasNonlinearBehaviour(model: ModelData): boolean {
  for (const e of model.elements.values()) {
    const b = (e as El).behaviour;
    if (b === 'tensionOnly' || b === 'compressionOnly') return true;
  }
  for (const s of model.supports.values()) if ((s as { uplift?: boolean }).uplift || hasCurves(s)) return true;
  return false;
}

type Curves = Partial<Record<'x' | 'y' | 'z', Array<[number, number]>>>;
const hasCurves = (s: { curves?: Curves }) => !!s.curves && Object.values(s.curves).some((c) => (c?.length ?? 0) > 0);
const DIRS = { x: 0, y: 1, z: 2 } as const;
const FREE = { x: 'rx', y: 'ry', z: 'rz' } as const;
const SPRING = { x: 'kx', y: 'ky', z: 'kz' } as const;

export type { NonlinearReport } from './types-3d';

const MAX_ITER = 30;

/** Local axes of an input member, from the input's own nodes (offsets already expanded). */
function inputRef(input: SolverInput3D, id: number): MemberRef | null {
  const e = input.elements.get(id);
  if (!e) return null;
  const a = input.nodes.get(e.nodeI), b = input.nodes.get(e.nodeJ);
  if (!a || !b) return null;
  const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  try {
    const ax = computeLocalAxes3D(a, b, localY, e.rollAngle, input.leftHand);
    return { elementId: id, nodeI: e.nodeI, nodeJ: e.nodeJ, axes: { ex: ax.ex, ey: ax.ey, ez: ax.ez, L: ax.L } };
  } catch { return null; }
}

/** The input without `off`: members out, the nodes only they held out, with their loads. */
function withoutMembers(input: SolverInput3D, off: ReadonlySet<number>): SolverInput3D {
  if (off.size === 0) return { ...input, supports: new Map(input.supports) };
  const elements = new Map([...input.elements].filter(([id]) => !off.has(id)));
  const used = new Set<number>();
  for (const e of elements.values()) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const q of input.quads?.values() ?? []) q.nodes.forEach((n: number) => used.add(n));
  for (const p of input.plates?.values() ?? []) p.nodes.forEach((n: number) => used.add(n));
  for (const c of (input.connectors?.values() ?? []) as Iterable<{ nodeI: number; nodeJ: number }>) { used.add(c.nodeI); used.add(c.nodeJ); }
  for (const c of input.constraints ?? []) for (const v of Object.values(c as unknown as Record<string, unknown>)) {
    if (typeof v === 'number') used.add(v);
    if (Array.isArray(v)) for (const x of v) if (typeof x === 'number') used.add(x);
  }
  const loads = input.loads.filter((l) => {
    const d = l.data as { elementId?: number; nodeId?: number };
    if (d.elementId !== undefined && off.has(d.elementId)) return false;
    return d.nodeId === undefined || used.has(d.nodeId);
  });
  return {
    ...input,
    elements,
    nodes: new Map([...input.nodes].filter(([id]) => used.has(id))),
    supports: new Map([...input.supports].filter(([, s]) => used.has(s.nodeId))),
    loads,
  };
}

/** A member's force row with every value exactly zero. */
function zeroRow(template: ElementForces3D | undefined, elementId: number, length: number): ElementForces3D {
  const row: Record<string, unknown> = {};
  if (template) for (const [k, v] of Object.entries(template)) row[k] = typeof v === 'number' ? 0 : Array.isArray(v) ? [] : typeof v === 'boolean' ? false : v;
  return { ...(row as unknown as ElementForces3D), elementId, length };
}

/** Rows of exact zeros for members that are in the model and out of the solve. */
export function withZeroRows(results: AnalysisResults3D, members: Iterable<{ id: number; length: number }>): AnalysisResults3D {
  const have = new Set(results.elementForces.map((f) => f.elementId));
  const extra = [...members].filter((m) => !have.has(m.id)).map((m) => zeroRow(results.elementForces[0], m.id, m.length));
  return extra.length ? { ...results, elementForces: [...results.elementForces, ...extra] } : results;
}

/**
 * Solve one load set with one-way members and lifting supports: the active-set loop.
 *
 * One-way members go in as trusses, since a member that works one way carries axial force only,
 * and their transverse loads go to their end nodes as simply supported reactions, once. Each
 * pass solves the linear structure with the members and supports that are active; a
 * tension-only member in compression goes out, and one that is out comes back when its ends
 * move apart (together, for compression-only). A lifting support lets go where its reaction
 * pulls and takes hold again where its node goes down into it. The loop ends when nothing
 * changes, stops at a state it has already been in (reported as oscillating, not converged),
 * or at 30 passes. Members that are out carry exact zeros, and the results keep their
 * reactions.
 */
export function solveNonlinear3D(model: ModelData, input: SolverInput3D): { results: AnalysisResults3D; report: NonlinearReport } {
  const oneWay = new Map<number, 'tension' | 'compression'>();
  for (const e of model.elements.values()) {
    if (!input.elements.has(e.id)) continue;
    const b = (e as El).behaviour;
    if (b === 'tensionOnly') oneWay.set(e.id, 'tension');
    if (b === 'compressionOnly') oneWay.set(e.id, 'compression');
  }
  // Multilinear springs: the direction they act in is left free and the engine's soil-structure
  // iteration supplies the curve's secant stiffness.
  const soilSprings: Array<{ nodeId: number; direction: number; curve: { type: 'custom'; points: Array<[number, number]> }; tributaryLength: number }> = [];
  const curved = new Map<number, Curves>();
  for (const s of model.supports.values()) {
    const c = (s as { curves?: Curves }).curves;
    if (!c || !hasCurves(s as never)) continue;
    curved.set(s.nodeId, c);
    for (const d of ['x', 'y', 'z'] as const) {
      const pts = c[d];
      if (pts && pts.length) soilSprings.push({ nodeId: s.nodeId, direction: DIRS[d], curve: { type: 'custom', points: [...pts].sort((a, b) => a[0] - b[0]) }, tributaryLength: 1 });
    }
  }
  if (oneWay.size && soilSprings.length) throw new Error('multilinear springs and one-way members cannot be solved together');

  // One-way members as trusses, their transverse loads at their end nodes.
  const refs = new Map<number, MemberRef>();
  for (const id of oneWay.keys()) { const r = inputRef(input, id); if (r) refs.set(id, r); }
  const base: SolverInput3D = oneWay.size === 0 ? input : {
    ...input,
    elements: new Map([...input.elements].map(([id, e]) => [id, oneWay.has(id) ? { ...e, type: 'truss' as const } : e])),
    loads: transverseToNodes(input.loads, (id) => refs.get(id) ?? null),
  };

  const upliftNodes = [...model.supports.values()].filter((s) => (s as { uplift?: boolean }).uplift).map((s) => s.nodeId);
  const lifted = new Set<number>();
  const off = new Set<number>();
  const seen = new Map<string, number>();
  const stateKey = () => `${[...off].sort((a, b) => a - b).join(',')}|${[...lifted].sort((a, b) => a - b).join(',')}`;
  let last: AnalysisResults3D | null = null;
  let prevKey = '';

  for (let it = 1; it <= MAX_ITER; it++) {
    const trial = withoutMembers(base, off);
    for (const [n, c] of curved) {
      for (const [sid, s] of trial.supports) {
        if (s.nodeId !== n) continue;
        const next = { ...s } as Record<string, unknown>;
        for (const d of ['x', 'y', 'z'] as const) if (c[d]?.length) { next[FREE[d]] = false; next[SPRING[d]] = undefined; }
        trial.supports.set(sid, next as never);
      }
    }
    for (const [sid, s] of trial.supports) if (lifted.has(s.nodeId)) trial.supports.set(sid, { ...s, rz: false, kz: undefined, dz: undefined });
    // A node that only one-way members held in rotation needs the same vanishing spring the
    // input builder gives any orphan rotation.
    if (oneWay.size) stabiliseOrphanRotations3D(trial);

    let results: AnalysisResults3D;
    if (soilSprings.length) {
      const live = soilSprings.filter((x) => !(lifted.has(x.nodeId) && x.direction === 2));
      results = solveSSI3D({ solver: trial, soilSprings: live }).results as AnalysisResults3D;
    } else {
      results = solve3D(trial);
    }
    results = stripStabilisedReactions(results, trial);
    last = results;

    let changed = false;
    // Members: out when they carry the wrong sign, back when their ends move the right way.
    const force = new Map(results.elementForces.map((f) => [f.elementId, (f.nStart + f.nEnd) / 2]));
    const nMax = Math.max(1e-9, ...[...force.values()].map((v) => Math.abs(v)));
    const disp = new Map(results.displacements.map((d) => [d.nodeId, d]));
    for (const [id, kind] of oneWay) {
      if (!off.has(id)) {
        const n = force.get(id) ?? 0;
        if ((kind === 'tension' && n < -1e-9 * nMax) || (kind === 'compression' && n > 1e-9 * nMax)) { off.add(id); changed = true; }
      } else {
        const r = refs.get(id);
        const a = r && disp.get(r.nodeI), b = r && disp.get(r.nodeJ);
        if (!r || !a || !b) continue;
        const stretch = (b.ux - a.ux) * r.axes.ex[0] + (b.uy - a.uy) * r.axes.ex[1] + (b.uz - a.uz) * r.axes.ex[2];
        const scaleU = Math.max(1e-12, ...results.displacements.map((d) => Math.hypot(d.ux, d.uy, d.uz)));
        if ((kind === 'tension' && stretch > 1e-9 * scaleU) || (kind === 'compression' && stretch < -1e-9 * scaleU)) { off.delete(id); changed = true; }
      }
    }
    // Supports that lift.
    const reaction = new Map(results.reactions.map((r) => [r.nodeId, r.fz]));
    const uz = new Map(results.displacements.map((d) => [d.nodeId, d.uz]));
    const scale = Math.max(1e-9, ...results.reactions.map((r) => Math.abs(r.fz)));
    for (const n of upliftNodes) {
      if (!lifted.has(n)) {
        // A multilinear vertical spring pulls when its node goes up; any other support when its
        // reaction is downward.
        const pulls = curved.get(n)?.z?.length ? (uz.get(n) ?? 0) > 1e-9 : (reaction.get(n) ?? 0) < -1e-6 * scale;
        if (pulls) { lifted.add(n); changed = true; }
      } else if ((uz.get(n) ?? 0) < -1e-9) { lifted.delete(n); changed = true; }
    }

    const lengths = [...off].map((id) => ({ id, length: refs.get(id)?.axes.L ?? 0 }));
    if (!changed) {
      return { results: withZeroRows(results, lengths), report: { converged: true, iterations: it, lifted: [...lifted], slack: [...off] } };
    }
    const key = stateKey();
    if (seen.has(key)) {
      // Back to a state already solved: it will cycle. What differs between the two states
      // that alternate is what will not settle.
      const a = new Set(key.split('|').flatMap((p) => p.split(',').filter(Boolean)));
      const b = new Set(prevKey.split('|').flatMap((p) => p.split(',').filter(Boolean)));
      const oscillating = [...new Set([...a, ...b])].filter((x) => !(a.has(x) && b.has(x))).map(Number);
      return { results: withZeroRows(results, lengths), report: { converged: false, iterations: it, lifted: [...lifted], slack: [...off], oscillating } };
    }
    seen.set(key, it);
    prevKey = key;
  }
  const lengths = [...off].map((id) => ({ id, length: refs.get(id)?.axes.L ?? 0 }));
  return { results: withZeroRows(last!, lengths), report: { converged: false, iterations: MAX_ITER, lifted: [...lifted], slack: [...off] } };
}

// ─── The solve-only sections for stiffness modifiers ──────────────

type SolverSection = SolverInput3D['sections'] extends Map<number, infer S> ? S : never;

/**
 * Give every member with stiffness modifiers a section of its own, scaled, in the solver input.
 * The model's sections are untouched.
 */
export function applyStiffnessModifiers(input: SolverInput3D, model: ModelData): void {
  let next = Math.max(0, ...input.sections.keys()) + 1;
  const made = new Map<string, number>();
  for (const [id, el] of input.elements) {
    const m = (model.elements.get(id) as { stiffness?: StiffnessModifiers } | undefined)?.stiffness;
    if (!m) continue;
    const f = { a: m.a ?? 1, iy: m.iy ?? 1, iz: m.iz ?? 1, j: m.j ?? 1 };
    if (f.a === 1 && f.iy === 1 && f.iz === 1 && f.j === 1) continue;
    const key = `${el.sectionId}|${f.a}|${f.iy}|${f.iz}|${f.j}`;
    let sid = made.get(key);
    if (sid === undefined) {
      const base = input.sections.get(el.sectionId);
      if (!base) continue;
      sid = next++;
      const scaled: SolverSection = { ...base, id: sid, a: base.a * f.a, iy: base.iy * f.iy, iz: base.iz * f.iz, j: base.j * f.j };
      input.sections.set(sid, scaled);
      made.set(key, sid);
    }
    input.elements.set(id, { ...el, sectionId: sid });
  }
}
