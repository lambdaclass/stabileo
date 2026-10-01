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
import { solve3D, solveSSI3D, solveCable3D, type SolverInputCable3D } from './wasm-solver';
import { computeLocalAxes3D } from './local-axes-3d';
import { transverseToNodes, type MemberRef } from './member-loads';
import { stabiliseOrphanRotations3D } from './orphan-rotations-3d';
import { stripStabilisedReactions } from './stabilised-reactions';

/**
 * `cable`: tension only, and softened by its own weight (Ernst's equivalent modulus), solved by the
 * engine's cable analysis; it reports tension, thrust, sag and that modulus. Every other analysis
 * takes a cable as a truss. There is no pretension: the unstretched length is the chord.
 */
export type MemberBehaviour = 'tensionOnly' | 'compressionOnly' | 'inactive' | 'cable';

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
    if (b === 'tensionOnly' || b === 'compressionOnly' || b === 'cable') return true;
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

/**
 * The input without `off`: members out, and the free nodes only they held out, with their loads.
 *
 * A supported node stays even when every member at it is out. The loads that slack members carry
 * are at their end nodes already (`transverseToNodes`), and at an anchor whose guys all went slack
 * that share is the support's to take: dropping the node would drop the load from the solve.
 */
function withoutMembers(input: SolverInput3D, off: ReadonlySet<number>): SolverInput3D {
  if (off.size === 0) return { ...input, supports: new Map(input.supports) };
  const elements = new Map([...input.elements].filter(([id]) => !off.has(id)));
  const used = new Set<number>();
  for (const s of input.supports.values()) used.add(s.nodeId);
  for (const e of elements.values()) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const q of input.quads?.values() ?? []) q.nodes.forEach((n: number) => used.add(n));
  for (const p of input.plates?.values() ?? []) p.nodes.forEach((n: number) => used.add(n));
  for (const c of (input.connectors?.values() ?? []) as Iterable<{ nodeI: number; nodeJ: number }>) { used.add(c.nodeI); used.add(c.nodeJ); }
  for (const c of input.constraints ?? []) for (const v of Object.values(c as unknown as Record<string, unknown>)) {
    if (typeof v === 'number') used.add(v);
    if (Array.isArray(v)) for (const x of v) if (typeof x === 'number') used.add(x);
  }
  // Dropping a loaded free node would turn a mechanism into a false equilibrium.
  const orphanLoads = new Map<number, number[]>();
  for (const load of input.loads) {
    if (load.type !== 'nodal' || used.has(load.data.nodeId)) continue;
    const d = load.data;
    const sum = orphanLoads.get(d.nodeId) ?? [0, 0, 0, 0, 0, 0];
    [d.fx, d.fy, d.fz, d.mx, d.my, d.mz].forEach((v, i) => { sum[i] += v; });
    orphanLoads.set(d.nodeId, sum);
  }
  for (const [id, force] of orphanLoads) {
    if (force.some(v => Math.abs(v) > 1e-12)) throw new Error(`Unstable active set: loaded node ${id} is held only by slack members`);
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
    const active: Curves = {};
    for (const d of ['x', 'y', 'z'] as const) {
      const pts = c[d];
      // A stored curve is dormant while its DOF is fixed, just like a linear spring.
      // Keep it in the model so freeing the DOF restores the user's curve.
      if (pts?.length && input.supports.get(s.nodeId)?.[FREE[d]] === false) {
        active[d] = pts;
        soilSprings.push({ nodeId: s.nodeId, direction: DIRS[d], curve: { type: 'custom', points: [...pts].sort((a, b) => a[0] - b[0]) }, tributaryLength: 1 });
      }
    }
    if (Object.keys(active).length) curved.set(s.nodeId, active);
  }
  if (oneWay.size && soilSprings.length) throw new Error('multilinear springs and one-way members cannot be solved together');
  // Cables go to the engine's cable solve, which lets them go slack itself.
  const cables = new Set<number>();
  for (const e of model.elements.values()) if (input.elements.has(e.id) && (e as El).behaviour === 'cable') cables.add(e.id);
  if (cables.size && soilSprings.length) throw new Error('multilinear springs and cables cannot be solved together');
  // Their own weight sets their sag and softens them, from the density in kg/m³. It is not a load
  // to the engine: the self-weight already in the loads carries it.
  const densities: Record<string, number> = {};
  for (const id of cables) {
    const m = model.materials.get(input.elements.get(id)!.materialId) as { rho?: number } | undefined;
    if (m?.rho) densities[String(input.elements.get(id)!.materialId)] = (m.rho * 1000) / 9.80665;
  }

  // One-way members and cables as trusses, their transverse loads at their end nodes.
  const refs = new Map<number, MemberRef>();
  for (const id of [...oneWay.keys(), ...cables]) { const r = inputRef(input, id); if (r) refs.set(id, r); }
  const base: SolverInput3D = oneWay.size === 0 && cables.size === 0 ? input : {
    ...input,
    elements: new Map([...input.elements].map(([id, e]) => [id, oneWay.has(id) || cables.has(id) ? { ...e, type: 'truss' as const } : e])),
    loads: transverseToNodes(input.loads, (id) => refs.get(id) ?? null),
  };
  let cableForces: NonlinearReport['cables'];
  // Whether the engine's cable iteration settled on the last solve. It need not: a cable that
  // shares its load with a stiffer member and carries little tension for its weight makes the
  // equivalent-modulus iteration oscillate, and more iterations do not help. That is reported,
  // with the last iteration's results, as the active-set loop reports its own; it does not abort
  // the whole analysis.
  let cablesConverged = true;
  const linearSolve = (trial: SolverInput3D): AnalysisResults3D => {
    if (cables.size === 0) return solve3D(trial);
    const typed: SolverInputCable3D = { ...trial, elements: new Map([...trial.elements].map(([id, e]) => [id, cables.has(id) ? { ...e, type: 'cable' as const } : e])) };
    const r = solveCable3D(typed, 50, 1e-8, densities);
    cablesConverged = r.converged;
    cableForces = r.cableForces.map((c) => ({ elementId: c.elementId, tension: c.tension, horizontalThrust: c.horizontalThrust, sag: c.sag, ernstModulus: c.ernstModulus }));
    return r.results;
  };

  const cableReport = () => ({ ...(cableForces ? { cables: cableForces } : {}), ...(cablesConverged ? {} : { cablesConverged: false as const }) });

  const upliftNodes = [...model.supports.values()].filter((s) => (s as { uplift?: boolean }).uplift).map((s) => s.nodeId);
  const normals = new Map<number, [number, number, number]>();
  for (const n of upliftNodes) {
    const s = input.supports.get(n);
    if (!s?.isInclined) { normals.set(n, [0, 0, 1]); continue; }
    const v = [s.normalX ?? 0, s.normalY ?? 0, s.normalZ ?? 0];
    const length = Math.hypot(...v);
    // Uplift chooses the side above the support plane. A vertical plane has no such side.
    if (!v.every(Number.isFinite) || length < 1e-12 || Math.abs(v[2]!) / length < 1e-9) {
      throw new Error('Lifting inclined supports need a normal with a vertical component');
    }
    // The normal reaction must be isolated from other translational restraints at this node.
    if (s.rx || s.ry || s.rz || s.kx || s.ky || s.kz || curved.has(n)) {
      throw new Error('Lifting inclined supports cannot also have translational restraints or springs');
    }
    const sign = Math.sign(v[2]!);
    normals.set(n, v.map((x) => sign * x / length) as [number, number, number]);
  }
  const lifted = new Set<number>();
  const off = new Set<number>();
  const seen = new Map<string, number>();
  const stateKey = () => `${[...off].sort((a, b) => a - b).join(',')}|${[...lifted].sort((a, b) => a - b).join(',')}`;
  let last: AnalysisResults3D | null = null;
  let prevKey = '';
  const maxIterations = Math.max(MAX_ITER, 2 * upliftNodes.length);

  for (let it = 1; it <= maxIterations; it++) {
    const trial = withoutMembers(base, off);
    for (const [n, c] of curved) {
      for (const [sid, s] of trial.supports) {
        if (s.nodeId !== n) continue;
        const next = { ...s } as Record<string, unknown>;
        for (const d of ['x', 'y', 'z'] as const) if (c[d]?.length) { next[FREE[d]] = false; next[SPRING[d]] = undefined; }
        trial.supports.set(sid, next as never);
      }
    }
    for (const [sid, s] of trial.supports) if (lifted.has(s.nodeId)) trial.supports.set(sid, s.isInclined ? { ...s, isInclined: false } : { ...s, rz: false, kz: undefined, dz: undefined });
    // A node that only one-way members held in rotation needs the same vanishing spring the
    // input builder gives any orphan rotation.
    if (oneWay.size || cables.size) stabiliseOrphanRotations3D(trial);

    let results: AnalysisResults3D;
    if (soilSprings.length) {
      const live = soilSprings.filter((x) => !(lifted.has(x.nodeId) && x.direction === 2));
      const r = solveSSI3D({ solver: trial, soilSprings: live });
      if (r.converged !== true) throw new Error('Multilinear spring analysis did not converge');
      const supports = new Map(trial.supports);
      for (const spring of r.springResults as Array<{ nodeId: number; direction: number; secantStiffness: number }>) {
        const support = supports.get(spring.nodeId);
        const key = (['kx', 'ky', 'kz'] as const)[spring.direction];
        if (!support || !key || !Number.isFinite(spring.secantStiffness) || spring.secantStiffness < 0) throw new Error('Invalid converged spring stiffness');
        supports.set(spring.nodeId, { ...support, [key]: spring.secantStiffness });
      }
      results = solve3D({ ...trial, supports });
    } else {
      results = linearSolve(trial);
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
    // Pivot one lifting restraint at a time, in the support's own normal direction.
    const project = (id: number, x: number, y: number, z: number) => {
      const n = normals.get(id) ?? [0, 0, 1];
      return n[0] * x + n[1] * y + n[2] * z;
    };
    const reaction = new Map(results.reactions.map(r => [r.nodeId, project(r.nodeId, r.fx, r.fy, r.fz)]));
    const normalU = new Map(results.displacements.map(d => [d.nodeId, project(d.nodeId, d.ux, d.uy, d.uz)]));
    const scale = Math.max(1e-9, ...[...reaction.values()].map(Math.abs));
    let restore: number | undefined, release: number | undefined;
    let penetration = -1e-9, pulling = -1e-6 * scale;
    for (const n of upliftNodes) {
      if (lifted.has(n)) {
        const u = normalU.get(n) ?? 0;
        if (u < penetration) { penetration = u; restore = n; }
      } else {
        const r = reaction.get(n) ?? 0;
        if (r < pulling) { pulling = r; release = n; }
      }
    }
    if (restore !== undefined) { lifted.delete(restore); changed = true; }
    else if (release !== undefined) { lifted.add(release); changed = true; }

    const lengths = [...off].map((id) => ({ id, length: refs.get(id)?.axes.L ?? 0 }));
    if (!changed) {
      return { results: withZeroRows(results, lengths), report: { converged: cablesConverged, iterations: it, lifted: [...lifted], slack: [...off], ...cableReport() } };
    }
    const key = stateKey();
    if (seen.has(key)) {
      // Back to a state already solved: it will cycle. What differs between the two states
      // that alternate is what will not settle.
      const a = new Set(key.split('|').flatMap((p) => p.split(',').filter(Boolean)));
      const b = new Set(prevKey.split('|').flatMap((p) => p.split(',').filter(Boolean)));
      const oscillating = [...new Set([...a, ...b])].filter((x) => !(a.has(x) && b.has(x))).map(Number);
      return { results: withZeroRows(results, lengths), report: { converged: false, iterations: it, lifted: [...lifted], slack: [...off], oscillating, ...cableReport() } };
    }
    seen.set(key, it);
    prevKey = key;
  }
  const lengths = [...off].map((id) => ({ id, length: refs.get(id)?.axes.L ?? 0 }));
  return { results: withZeroRows(last!, lengths), report: { converged: false, iterations: maxIterations, lifted: [...lifted], slack: [...off], ...cableReport() } };
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

/**
 * A per-section payload (plastic moments, fiber sections) extended to the solve-only sections
 * `applyStiffnessModifiers` made: each one gets its model section's entry. A modifier changes a
 * member's stiffness, not its strength, and an engine that looks a member's section up by id
 * found nothing for them — the pushover took their Mp as infinite and never hinged them.
 */
export function withSolveSections<T>(bySection: Record<string, T>, input: SolverInput3D, modelElements: Map<number, { sectionId: number }>): Record<string, T> {
  const out = { ...bySection };
  for (const [id, el] of input.elements) {
    const own = modelElements.get(id)?.sectionId;
    if (own === undefined || own === el.sectionId || String(el.sectionId) in out) continue;
    const entry = bySection[String(own)];
    if (entry !== undefined) out[String(el.sectionId)] = entry;
  }
  return out;
}
