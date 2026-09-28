/**
 * What a member or a support does beyond the linear, stored on it and honoured by every solve.
 *
 * ── Members ───────────────────────────────────────────────────────
 *
 *   · inactive: left out of the analysis, with its loads. Nodes nothing else holds go too.
 *   · tension only / compression only: solved by the engine's contact solver, which drops the
 *     member when it would carry the other sign and solves again until nothing changes.
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
import type { AnalysisResults3D, SolverInput3D } from './types-3d';
import { solve3D, solveContact3D, solveSSI3D } from './wasm-solver';

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

export interface NonlinearReport {
  converged: boolean;
  iterations: number;
  /** Supports whose node lifted off. */
  lifted: number[];
  /** One-way members that ended up carrying nothing. */
  slack: number[];
}

const MAX_ITER = 30;

/** Solve one load set with member behaviours and lifting supports. */
export function solveNonlinear3D(model: ModelData, input: SolverInput3D): { results: AnalysisResults3D; report: NonlinearReport } {
  const behaviours: Record<string, string> = {};
  for (const e of model.elements.values()) {
    const b = (e as El).behaviour;
    if (b === 'tensionOnly') behaviours[String(e.id)] = 'tension_only';
    if (b === 'compressionOnly') behaviours[String(e.id)] = 'compression_only';
  }
  const hasMembers = Object.keys(behaviours).length > 0;
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
  if (hasMembers && soilSprings.length) throw new Error('multilinear springs and one-way members cannot be solved together');
  const upliftNodes = [...model.supports.values()].filter((s) => (s as { uplift?: boolean }).uplift).map((s) => s.nodeId);
  const lifted = new Set<number>();
  const maxIterations = Math.max(MAX_ITER, 2 * upliftNodes.length);

  for (let it = 1; it <= maxIterations; it++) {
    const supports = new Map(input.supports);
    for (const [n, c] of curved) {
      const s = supports.get(n);
      if (!s) continue;
      const next = { ...s } as Record<string, unknown>;
      for (const d of ['x', 'y', 'z'] as const) if (c[d]?.length) { next[FREE[d]] = false; next[SPRING[d]] = undefined; }
      supports.set(n, next as never);
    }
    for (const n of lifted) {
      const s = supports.get(n);
      if (s) supports.set(n, { ...s, rz: false, kz: undefined, dz: undefined });
    }
    const trial: SolverInput3D = { ...input, supports };
    let results: AnalysisResults3D, slack: number[] = [], memberConverged = true;
    if (hasMembers) {
      const r = solveContact3D({ solver: trial, elementBehaviors: behaviours });
      if (r.converged !== true) throw new Error('One-way member analysis did not converge');
      results = r.results as AnalysisResults3D;
      memberConverged = r.converged !== false;
      slack = ((r.elementStatus ?? []) as Array<{ elementId: number; status: string }>).filter((x) => x.status === 'inactive').map((x) => x.elementId);
    } else if (soilSprings.length) {
      const live = soilSprings.filter((x) => !(lifted.has(x.nodeId) && x.direction === 2));
      const r = solveSSI3D({ solver: trial, soilSprings: live });
      if (r.converged !== true) throw new Error('Multilinear spring analysis did not converge');
      // SSI returns spring forces separately and omits all support reactions. Recover the
      // complete result with its converged secant stiffnesses, including ordinary supports.
      // The uplift iteration below also needs those reactions to release pulling restraints.
      const settled = new Map(supports);
      for (const s of r.springResults as Array<{ nodeId: number; direction: number; secantStiffness: number }>) {
        const support = settled.get(s.nodeId);
        const key = (['kx', 'ky', 'kz'] as const)[s.direction];
        if (!support || !key || !Number.isFinite(s.secantStiffness) || s.secantStiffness < 0) {
          throw new Error('Invalid converged spring stiffness');
        }
        settled.set(s.nodeId, { ...support, [key]: s.secantStiffness });
      }
      const complete = solve3D({ ...trial, supports: settled });
      if (typeof complete === 'string') throw new Error(complete);
      results = complete;
      memberConverged = r.converged !== false;
    } else {
      const r = solve3D(trial);
      if (typeof r === 'string') throw new Error(r);
      results = r;
    }

    const reaction = new Map(results.reactions.map((r) => [r.nodeId, r.fz]));
    const disp = new Map(results.displacements.map((d) => [d.nodeId, d.uz]));
    const scale = Math.max(1e-9, ...results.reactions.map((r) => Math.abs(r.fz)));
    // Pivot one restraint at a time. Releasing every pulling support together can remove
    // more restraints than necessary and turn a stable contact problem into a mechanism.
    // Restore the deepest penetration first; otherwise release the largest tensile reaction.
    let restore: number | undefined, release: number | undefined;
    let penetration = -1e-9, pulling = -1e-6 * scale;
    for (const n of upliftNodes) {
      if (lifted.has(n)) {
        const u = disp.get(n) ?? 0;
        if (u < penetration) { penetration = u; restore = n; }
      } else {
        const r = reaction.get(n) ?? 0;
        if (r < pulling) { pulling = r; release = n; }
      }
    }
    if (restore !== undefined) lifted.delete(restore);
    else if (release !== undefined) lifted.add(release);
    else {
      return { results, report: { converged: memberConverged, iterations: it, lifted: [...lifted], slack } };
    }
  }
  throw new Error(`Lifting support analysis did not converge after ${maxIterations} iterations`);
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
