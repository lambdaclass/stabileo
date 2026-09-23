/**
 * Which loads are mass, and how much of each.
 *
 * ── The question this answers ──────────────────────────────────────
 *
 * The dynamic analyses built their mass from material density alone. A slab carrying its
 * finishes and partitions as a dead load, and its imposed load as a live one, vibrated as if
 * it carried neither: the building came out lighter than the one the seismic weight is written
 * for — Wi = Di + f1·Li + f2·Si, CIRSOC 103 [3.15] — and its periods came out short.
 *
 * A mass source names a factor per load case. Self-weight always counts once, through the
 * density; each case adds its gravity loads × its factor. A project that states none gets
 * self-weight alone — what the analyses always did — and can name a code's rule instead
 * (`mass-presets.ts`) or write its own table.
 *
 * ── How the mass reaches the engine ────────────────────────────────
 *
 * The engine takes mass as a density per material and nothing else — no nodal or lumped
 * masses. So a member that carries load gets its own copy of its material, identical in
 * stiffness, with the density raised by exactly the load's mass per unit volume:
 *
 *   line load, W kN over a member of length L and area A:  Δρ = W·1000 / (g·L·A)
 *   surface load, W kN over a shell of area S and thickness t:  Δρ = W·1000 / (g·S·t)
 *
 * The mass is spread uniformly over the member or shell, which is exact for a uniform load and
 * an approximation for a partial or a concentrated one.
 *
 * NODAL loads have no such carrier, and spreading them onto the adjacent members would move half
 * their mass to the far ends. They are left out and COUNTED, so the report says how much weight
 * did not become mass rather than letting a total look complete.
 *
 * ── Why the loads come from the model and not from the analysis input ──
 *
 * The analysis input already carries the self-weight as loads when that switch is on, and the
 * density carries it again as mass. Reading mass from those loads would count self-weight
 * twice. The caller hands in each case's own loads, converted with the same function the solve
 * uses, so the local axes they are written in are the engine's.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { SolverInput3D, SolverLoad3D, SolverMaterial } from '../types-3d';
import { computeLocalAxes3D } from '../local-axes-3d';
import { G } from './requests';
import { massPresetById, presetParams, type MassPresetParamValue } from './mass-presets';

export interface MassSourceFactor { caseId: number; factor: number }

/**
 * What the project states. Absent means it states nothing, and the mass is self-weight alone —
 * the density — with no load case counted.
 *
 * `preset` names a code's rule from `mass-presets.ts` and its parameters; the factors are derived
 * from the load cases each time, so a case added later is covered. An id this build does not
 * know is kept as it came, so a file written by a build with more codes survives the round trip.
 *
 * `custom` is a table the user wrote, case by case.
 */
export type MassSource =
  | { kind: 'preset'; presetId: string; params: Record<string, MassPresetParamValue> }
  | { kind: 'custom'; factors: MassSourceFactor[] };

export type FactorBasis =
  /** Nothing stated: self-weight only. */
  | 'selfWeightOnly'
  /** From the code the project names. */
  | 'preset'
  /** The code names this case type as not mass. */
  | 'notMass'
  /** From the table the user wrote. */
  | 'stated'
  /** The user wrote a table and this case is not in it — a case added after. */
  | 'unlisted'
  /** The project names a code this build does not know. */
  | 'unknownPreset';

export interface ResolvedFactor {
  caseId: number;
  name: string;
  type: string;
  factor: number;
  basis: FactorBasis;
}

export function resolveMassFactors(
  cases: ReadonlyArray<{ id: number; name: string; type: string }>,
  source?: MassSource | null,
): ResolvedFactor[] {
  const row = (c: { id: number; name: string; type: string }, factor: number, basis: FactorBasis): ResolvedFactor =>
    ({ caseId: c.id, name: c.name, type: c.type, factor, basis });
  if (!source) return cases.map((c) => row(c, 0, 'selfWeightOnly'));
  if (source.kind === 'custom') {
    const byCase = new Map(source.factors.map((f) => [f.caseId, f.factor]));
    return cases.map((c) => {
      const f = byCase.get(c.id);
      return f !== undefined ? row(c, f, 'stated') : row(c, 0, 'unlisted');
    });
  }
  const preset = massPresetById(source.presetId);
  if (!preset) return cases.map((c) => row(c, 0, 'unknownPreset'));
  const params = presetParams(preset, source.params);
  return cases.map((c) => {
    const f = preset.factorFor(c.type, params);
    return f === null ? row(c, 0, 'notMass') : row(c, f, 'preset');
  });
}

/**
 * A stored mass source in its current shape, or undefined.
 *
 * Reads the first shape this field had on this branch — `{ factors }` with no `kind` — as a
 * custom table. Anything else unrecognisable is dropped rather than guessed at.
 */
export function normalizeMassSource(raw: unknown): MassSource | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const factors = Array.isArray(r.factors)
    ? (r.factors as unknown[]).flatMap((f) => {
        const x = f as Record<string, unknown>;
        return typeof x?.caseId === 'number' && typeof x?.factor === 'number' && Number.isFinite(x.factor)
          ? [{ caseId: x.caseId, factor: x.factor }] : [];
      })
    : null;
  if (r.kind === 'preset' && typeof r.presetId === 'string') {
    const params: Record<string, MassPresetParamValue> = {};
    for (const [k, v] of Object.entries((r.params ?? {}) as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') params[k] = v;
    }
    return { kind: 'preset', presetId: r.presetId, params };
  }
  if ((r.kind === 'custom' || r.kind === undefined) && factors) return { kind: 'custom', factors };
  return undefined;
}

/** One case's contribution, as the caller converted it. */
export interface CaseMassLoads {
  caseId: number;
  factor: number;
  /** Element and nodal loads, in the analysis input's own frames. */
  loads: SolverLoad3D[];
  /** Surface loads, kN/m², positive downward. */
  surface: ReadonlyArray<{ quadId: number; q: number }>;
}

export interface MassSourceReport {
  /** Mass the densities carry: self-weight. t. */
  selfWeightT: number;
  /** Mass each case added, factor applied. t. */
  addedT: Map<number, number>;
  /** Weight in nodal loads, factor applied, that could not become mass. kN. */
  excludedNodalKN: number;
  /** Weight on members or shells that pointed upward overall, factor applied. kN. */
  excludedUpwardKN: number;
  totalT: number;
}

type Vec3 = [number, number, number];

function nodeOf(input: SolverInput3D, id: number) {
  const n = input.nodes.get(id);
  if (!n) throw new Error(`mass source: node ${id} is not in the analysis input`);
  return n;
}

function memberGeometry(input: SolverInput3D, elementId: number): { L: number; A: number; ey: Vec3; ez: Vec3 } | null {
  const e = input.elements.get(elementId);
  if (!e) return null;
  const ni = nodeOf(input, e.nodeI), nj = nodeOf(input, e.nodeJ);
  const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined
    ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  const axes = computeLocalAxes3D(ni, nj, localY, e.rollAngle ?? 0, input.leftHand ?? false);
  const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z);
  const A = input.sections.get(e.sectionId)?.a ?? 0;
  return { L, A, ey: axes.ey as Vec3, ez: axes.ez as Vec3 };
}

/** Area of a planar-enough quad, as two triangles. */
function quadArea(input: SolverInput3D, nodes: readonly number[]): number {
  const p = nodes.map((id) => nodeOf(input, id));
  const tri = (a: typeof p[0], b: typeof p[0], c: typeof p[0]) => {
    const u = [b.x - a.x, b.y - a.y, b.z - a.z], v = [c.x - a.x, c.y - a.y, c.z - a.z];
    return 0.5 * Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!);
  };
  return tri(p[0]!, p[1]!, p[2]!) + tri(p[0]!, p[2]!, p[3]!);
}

function triArea(input: SolverInput3D, nodes: readonly number[]): number {
  const [a, b, c] = nodes.map((id) => nodeOf(input, id));
  const u = [b!.x - a!.x, b!.y - a!.y, b!.z - a!.z], v = [c!.x - a!.x, c!.y - a!.y, c!.z - a!.z];
  return 0.5 * Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!);
}

/** Self-weight mass the densities carry, t. Densities in kg/m³. */
export function densityMassT(input: SolverInput3D, densities: Map<number, number>): number {
  let m = 0;
  for (const e of input.elements.values()) {
    const g = memberGeometry(input, e.id);
    if (g) m += (densities.get(e.materialId) ?? 0) / 1000 * g.A * g.L;
  }
  for (const q of input.quads?.values() ?? []) m += (densities.get(q.materialId) ?? 0) / 1000 * q.thickness * quadArea(input, q.nodes);
  for (const p of input.plates?.values() ?? []) m += (densities.get(p.materialId) ?? 0) / 1000 * p.thickness * triArea(input, p.nodes);
  for (const c of input.curvedShells?.values() ?? []) m += (densities.get(c.materialId) ?? 0) / 1000 * c.thickness * quadArea(input, c.nodes);
  return m;
}

/**
 * The analysis input with each case's gravity loads turned into mass.
 *
 * Returns a new input — the one given is not touched — and the densities for it.
 */
export function applyMassSource(
  input: SolverInput3D,
  baseDensities: Map<number, number>,
  cases: ReadonlyArray<CaseMassLoads>,
): { input: SolverInput3D; densities: Map<number, number>; report: MassSourceReport } {
  const memberW = new Map<number, number>();   // kN, downward positive
  const quadW = new Map<number, number>();
  const addedT = new Map<number, number>();
  let excludedNodalKN = 0;
  const caseMemberW = new Map<number, Map<number, number>>(); // caseId → elementId → kN
  const caseQuadW = new Map<number, Map<number, number>>();

  for (const c of cases) {
    if (!(c.factor > 0)) continue;
    const mw = new Map<number, number>();
    const qw = new Map<number, number>();
    for (const l of c.loads) {
      if (l.type === 'nodal') {
        const down = -(l.data.fz ?? 0) * c.factor;
        if (down > 0) excludedNodalKN += down;
        continue;
      }
      if (l.type !== 'distributed' && l.type !== 'pointOnElement') continue;
      const g = memberGeometry(input, l.data.elementId);
      if (!g) continue;
      let down: number;
      if (l.type === 'distributed') {
        const a = l.data.a ?? 0, b = l.data.b ?? g.L;
        const fzI = l.data.qYI * g.ey[2] + l.data.qZI * g.ez[2];
        const fzJ = l.data.qYJ * g.ey[2] + l.data.qZJ * g.ez[2];
        down = -(b - a) * (fzI + fzJ) / 2;
      } else {
        down = -(l.data.py * g.ey[2] + l.data.pz * g.ez[2]);
      }
      mw.set(l.data.elementId, (mw.get(l.data.elementId) ?? 0) + down * c.factor);
    }
    for (const s of c.surface) {
      const q = input.quads?.get(s.quadId) ?? input.curvedShells?.get(s.quadId);
      if (!q) continue;
      qw.set(s.quadId, (qw.get(s.quadId) ?? 0) + s.q * quadArea(input, q.nodes) * c.factor);
    }
    caseMemberW.set(c.caseId, mw);
    caseQuadW.set(c.caseId, qw);
    for (const [id, w] of mw) memberW.set(id, (memberW.get(id) ?? 0) + w);
    for (const [id, w] of qw) quadW.set(id, (quadW.get(id) ?? 0) + w);
  }

  // A member whose loads point upward overall carries no added mass; its weight is reported.
  let excludedUpwardKN = 0;
  for (const [id, w] of memberW) if (w <= 0) { excludedUpwardKN += -w; memberW.delete(id); }
  for (const [id, w] of quadW) if (w <= 0) { excludedUpwardKN += -w; quadW.delete(id); }

  for (const c of cases) {
    let t = 0;
    for (const [id, w] of caseMemberW.get(c.caseId) ?? []) if (memberW.has(id)) t += w / G;
    for (const [id, w] of caseQuadW.get(c.caseId) ?? []) if (quadW.has(id)) t += w / G;
    if (c.factor > 0) addedT.set(c.caseId, t);
  }

  const materials = new Map(input.materials);
  const densities = new Map(baseDensities);
  let nextMat = Math.max(0, ...materials.keys()) + 1;
  const cloneMaterial = (baseId: number, addKgM3: number): number => {
    const base = materials.get(baseId) as SolverMaterial | undefined;
    if (!base) throw new Error(`mass source: material ${baseId} is not in the analysis input`);
    const id = nextMat++;
    materials.set(id, { ...base, id });
    densities.set(id, (baseDensities.get(baseId) ?? 0) + addKgM3);
    return id;
  };

  const elements = new Map(input.elements);
  for (const [id, w] of memberW) {
    const e = elements.get(id)!;
    const g = memberGeometry(input, id)!;
    if (!(g.A > 0) || !(g.L > 0)) continue;
    elements.set(id, { ...e, materialId: cloneMaterial(e.materialId, w * 1000 / (G * g.L * g.A)) });
  }

  const quads = input.quads ? new Map(input.quads) : undefined;
  const curvedShells = input.curvedShells ? new Map(input.curvedShells) : undefined;
  for (const [id, w] of quadW) {
    const map = quads?.has(id) ? quads : curvedShells;
    const q = map!.get(id)!;
    const area = quadArea(input, q.nodes);
    if (!(area > 0) || !(q.thickness > 0)) continue;
    map!.set(id, { ...q, materialId: cloneMaterial(q.materialId, w * 1000 / (G * area * q.thickness)) });
  }

  const out: SolverInput3D = { ...input, materials, elements, ...(quads ? { quads } : {}), ...(curvedShells ? { curvedShells } : {}) };
  const selfWeightT = densityMassT(input, baseDensities);
  let added = 0;
  for (const t of addedT.values()) added += t;
  return {
    input: out,
    densities,
    report: { selfWeightT, addedT, excludedNodalKN, excludedUpwardKN, totalT: selfWeightT + added },
  };
}
