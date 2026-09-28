/**
 * Does the structure balance?
 *
 * Σ(applied loads) + Σ(reactions) = 0, in all six components, for every load case. The
 * solver satisfies this by construction — it is the equation it solves — so a residual
 * here does not mean the solver is wrong. It means the two sides are not describing the
 * same thing: a load that never reached the solver, a support that was not counted, a
 * member removed along with the weight it was carrying.
 *
 * That last one is why this exists. Removing a column from a solved frame drops ΣFz by
 * the column's own weight, which reads at first glance as a violation of equilibrium and
 * is not one. Anyone who has chased that residual by hand has spent an afternoon on a
 * question this table answers in a line.
 *
 * ── Why the applied side is recomputed here and not taken from the solve ───
 *
 * An independent sum is the whole value of the check. Reading the load vector the solver
 * assembled would compare the solver against itself and always agree, including when the
 * model says something the assembly quietly dropped.
 *
 * ── What is NOT summed, and why that is reported rather than hidden ───
 *
 * Thermal actions produce no net external force, so they are excluded by definition, not
 * by omission. Anything else the sum does not recognise is named in `uncovered`, because a
 * check that under-reports silently is worse than no check: it converts an unexplained
 * residual into a clean bill of health.
 *
 * Surface loads and the self-weight of shells are distributed to their nodes exactly as the
 * solve distributes them (each quad corner its consistent share of q·A or ρ·t·A, a third to each
 * corner of a triangle), so the moment side agrees with the solve.
 */
import type { ModelData } from './solver-service';
import { distributedGlobalEnds, trapezoidPieces, memberFrame3D } from './member-loads';
import { selfWeightFor, selfWeightScope } from './self-weight';
import { activeModel } from './member-behaviour';
import { quadCornerShares } from './solver-shells';
import type {
  NodalLoad3D, DistributedLoad3D, PointLoadOnElement3D, SurfaceLoad3D, Load,
} from '../store/model.svelte';

type P3 = { x: number; y: number; z?: number };
function triArea(a: P3, b: P3, c: P3): number {
  const u = [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)];
  const v = [c.x - a.x, c.y - a.y, (c.z ?? 0) - (a.z ?? 0)];
  return 0.5 * Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!);
}

/** Force and moment resultant about the global origin. kN and kN·m. */
export interface Resultant6 {
  fx: number; fy: number; fz: number;
  mx: number; my: number; mz: number;
}

export interface StaticsCheckRow {
  /** The load case, or null for a solve with no cases of its own. */
  caseId: number | null;
  caseName: string;
  /** Applied loads, self-weight included when the model is solved with it. */
  applied: Resultant6;
  /** Support reactions as the solver reported them. */
  reactions: Resultant6;
  /** applied + reactions. Zero when the structure balances. */
  difference: Resultant6;
  /**
   * The largest component of `difference` relative to the same component's scale.
   * Dimensionless, so forces and moments can be compared on one number.
   */
  worstRelative: number;
  /** Load kinds present in this case that `applied` does not account for. */
  uncovered: string[];
  /** Self-weight was added to `applied` because the solve included it. */
  selfWeightIncluded: boolean;
}

const ZERO: Resultant6 = { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };

function addForceAt(acc: Resultant6, F: [number, number, number], p: [number, number, number]): void {
  acc.fx += F[0]; acc.fy += F[1]; acc.fz += F[2];
  // M = r × F about the origin.
  acc.mx += p[1] * F[2] - p[2] * F[1];
  acc.my += p[2] * F[0] - p[0] * F[2];
  acc.mz += p[0] * F[1] - p[1] * F[0];
}

function addMoment(acc: Resultant6, M: [number, number, number]): void {
  acc.mx += M[0]; acc.my += M[1]; acc.mz += M[2];
}

/**
 * The line a member's loads act along, and the frame they are stated in — as the solve builds
 * them.
 *
 * Two conventions of the solve are matched here, because a check that differs from it on either
 * reports a residual that is its own arithmetic:
 *
 *   · The frame composes the member's roll with its SECTION's rotation. Offsets and
 *     analysis use right-handed axes; the displayed convention only changes local load Y.
 *   · A member with end offsets is solved as the flexible segment between the offset points
 *     (`member-offsets.ts`): its ends are node + offset, so the segment can tilt away from the
 *     node-to-node line, and its local loads are stated in the TILTED segment's frame and measured
 *     along its length. The node-to-node frame put a 0.42 kN residual on a 4 m member offset by
 *     10 cm.
 */
const memberLine = (model: ModelData, el: Parameters<typeof memberFrame3D>[1]) => memberFrame3D(model, el);

export interface StaticsCheckInput {
  model: ModelData;
  /** Reactions per case, as the solver reported them. Key null = the single solve. */
  reactionsByCase: Map<number | null, ReadonlyArray<{
    nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number;
  }>>;
  /** The solve added self-weight, so the applied side must add it too. */
  includeSelfWeight: boolean;
  /**
   * Each case's type. The solve adds self-weight to the permanent (`D`) cases only, so with
   * this given the applied side does the same; without it, every row gets self-weight, which
   * is right only for a single solve.
   */
  caseTypes?: Map<number, string>;
  /** Names for the report. */
  caseNames?: Map<number, string>;
  /** Local member loads are entered along the displayed left-handed Y axis. */
  leftHand?: boolean;
}

/**
 * Sum what the model applies, sum what the supports return, and report the difference.
 *
 * One row per load case present in `reactionsByCase`, so the table follows the solve
 * rather than the model: a case that was not solved has nothing to check.
 */
export function staticsCheck(input: StaticsCheckInput): StaticsCheckRow[] {
  const { reactionsByCase, includeSelfWeight, caseNames, caseTypes, leftHand = false } = input;
  // The structure the solve had: inactive members out, and their loads with them.
  const model = activeModel(input.model);
  const rows: StaticsCheckRow[] = [];

  for (const [caseId, reactions] of reactionsByCase) {
    const applied: Resultant6 = { ...ZERO };
    const uncovered = new Set<string>();

    const inCase = (l: Load): boolean => {
      const c = (l.data as { caseId?: number }).caseId;
      // Match per-case solving: legacy loads belong to case 1; a single solve takes all.
      return caseId === null || (c ?? 1) === caseId;
    };

    for (const l of model.loads ?? []) {
      if (!inCase(l)) continue;

      if (l.type === 'nodal3d') {
        const d = l.data as NodalLoad3D;
        const n = model.nodes.get(d.nodeId);
        if (!n) continue;
        addForceAt(applied, [d.fx, d.fy, d.fz], [n.x, n.y, n.z ?? 0]);
        addMoment(applied, [d.mx, d.my, d.mz]);
      } else if (l.type === 'distributed3d' || l.type === 'pointOnElement3d') {
        const d = l.data as DistributedLoad3D | PointLoadOnElement3D;
        const el = model.elements.get(d.elementId);
        if (!el) continue;
        const ends = memberLine(model, el);
        if (!ends) continue;
        const { ni, ax } = ends;
        const at = (s: number): [number, number, number] => [
          ni[0] + ax.ex[0] * s, ni[1] + ax.ex[1] * s, ni[2] + ax.ex[2] * s,
        ];
        const push = (py: number, pz: number, s: number): void => {
          if (leftHand) py = -py;
          addForceAt(applied, [
            ax.ey[0] * py + ax.ez[0] * pz,
            ax.ey[1] * py + ax.ez[1] * pz,
            ax.ey[2] * py + ax.ez[2] * pz,
          ], at(s));
        };
        if (l.type === 'pointOnElement3d') {
          const p = d as PointLoadOnElement3D;
          push(p.py, p.pz, p.a);
        } else {
          // The solve's own reading of the load, whatever its frame (`member-loads.ts`).
          const q = d as DistributedLoad3D;
          const g = distributedGlobalEnds(q, ax as never, leftHand);
          for (const p of trapezoidPieces(g.gI, g.gJ, g.a, g.b)) addForceAt(applied, p.force, at(p.s));
        }
      } else if (l.type === 'surface3d') {
        // q downward on the quad, each corner its consistent share — the solve's own split.
        const d = l.data as SurfaceLoad3D;
        const q = model.quads?.get(d.quadId);
        const ps = q?.nodes.map((id) => model.nodes.get(id));
        if (!q || !ps || ps.some((n) => !n)) { uncovered.add('surface3d'); continue; }
        const shares = quadCornerShares(ps as never);
        (ps as P3[]).forEach((n, i) => addForceAt(applied, [0, 0, -d.q * shares[i]!], [n.x, n.y, n.z ?? 0]));
      } else if (l.type === 'thermal' || l.type === 'thermalQuad3d') {
        // No net external force by definition. Not a gap.
      } else {
        uncovered.add(l.type);
      }
    }

    // The case's self-weight loads, read by the same rule the solve reads (`self-weight.ts`).
    // Without case types every row is taken as a dead-load one, which is right for a single solve.
    const caseRef = caseId === null ? null : { id: caseId, type: caseTypes ? caseTypes.get(caseId) : 'D' };
    const weights = selfWeightFor(model, caseRef, includeSelfWeight);
    const selfWeightHere = weights.length > 0;
    for (const sw of weights) {
      const dir: [number, number, number] = sw.direction === 'X' ? [1, 0, 0] : sw.direction === 'Y' ? [0, 1, 0] : [0, 0, 1];
      const scope = selfWeightScope(model, sw);
      for (const el of model.elements.values()) {
        if (scope.members && !scope.members.has(el.id)) continue;
        const mat = model.materials.get(el.materialId);
        const sec = model.sections.get(el.sectionId);
        const line = memberLine(model, el);
        if (!mat || !sec || !line) continue;
        // ρ·A·L at midspan: the resultant of the uniform member load the solve applies.
        const W = mat.rho * sec.a * line.ax.L * sw.factor;
        const mid: [number, number, number] = [line.ni[0] + line.ax.ex[0] * line.ax.L / 2, line.ni[1] + line.ax.ex[1] * line.ax.L / 2, line.ni[2] + line.ax.ex[2] * line.ax.L / 2];
        addForceAt(applied, [dir[0] * W, dir[1] * W, dir[2] * W], mid);
      }
      for (const q of model.quads?.values() ?? []) {
        if (scope.quads && !scope.quads.has(q.id)) continue;
        const mat = model.materials.get(q.materialId);
        const ps = q.nodes.map((id) => model.nodes.get(id));
        if (!mat || ps.some((n) => !n)) continue;
        const shares = quadCornerShares(ps as never);
        (ps as P3[]).forEach((n, i) => {
          const w = mat.rho * q.thickness * shares[i]! * sw.factor;
          addForceAt(applied, [dir[0] * w, dir[1] * w, dir[2] * w], [n.x, n.y, n.z ?? 0]);
        });
      }
      for (const pl of model.plates?.values() ?? []) {
        if (scope.plates && !scope.plates.has(pl.id)) continue;
        const mat = model.materials.get(pl.materialId);
        const ps = pl.nodes.map((id) => model.nodes.get(id));
        if (!mat || ps.some((n) => !n)) continue;
        const [a, b, c] = ps as P3[];
        const w = mat.rho * pl.thickness * triArea(a!, b!, c!) / 3 * sw.factor;
        for (const n of ps as P3[]) addForceAt(applied, [dir[0] * w, dir[1] * w, dir[2] * w], [n.x, n.y, n.z ?? 0]);
      }
    }

    rows.push({
      ...closeRow(applied, reactionResultant(model.nodes, reactions)),
      caseId,
      caseName: caseId === null ? '' : (caseNames?.get(caseId) ?? `Case ${caseId}`),
      uncovered: [...uncovered].sort(),
      selfWeightIncluded: selfWeightHere,
    });
  }

  return rows;
}

/** The resultant of a set of support reactions about the origin. */
export function reactionResultant(
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>,
  reactions: ReadonlyArray<{ nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }>,
): Resultant6 {
  const react: Resultant6 = { ...ZERO };
  for (const r of reactions) {
    const n = nodes.get(r.nodeId);
    if (!n) continue;
    addForceAt(react, [r.fx, r.fy, r.fz], [n.x, n.y, n.z ?? 0]);
    addMoment(react, [r.mx, r.my, r.mz]);
  }
  return react;
}

/** Both sides, their difference, and the worst component of it relative to its own scale. */
function closeRow(applied: Resultant6, react: Resultant6): Pick<StaticsCheckRow, 'applied' | 'reactions' | 'difference' | 'worstRelative'> {
  const difference: Resultant6 = {
    fx: applied.fx + react.fx, fy: applied.fy + react.fy, fz: applied.fz + react.fz,
    mx: applied.mx + react.mx, my: applied.my + react.my, mz: applied.mz + react.mz,
  };
  /*
   * Relative to the larger of the two sides, per component, and never to the difference
   * itself. A structure with no load in a direction has nothing to be relative TO, so a
   * component whose scale is negligible contributes nothing rather than dividing by
   * almost zero and reporting an enormous error about nothing.
   */
  const scale = Math.max(
    Math.abs(applied.fx), Math.abs(applied.fy), Math.abs(applied.fz),
    Math.abs(react.fx), Math.abs(react.fy), Math.abs(react.fz), 1e-9,
  );
  const mScale = Math.max(
    Math.abs(applied.mx), Math.abs(applied.my), Math.abs(applied.mz),
    Math.abs(react.mx), Math.abs(react.my), Math.abs(react.mz), 1e-9,
  );
  const worstRelative = Math.max(
    Math.abs(difference.fx) / scale, Math.abs(difference.fy) / scale,
    Math.abs(difference.fz) / scale,
    Math.abs(difference.mx) / mScale, Math.abs(difference.my) / mScale,
    Math.abs(difference.mz) / mScale,
  );
  return { applied, reactions: react, difference, worstRelative: +worstRelative.toFixed(6) };
}

/** A statics row for a combination: which one, and what it is made of. */
export interface ComboStaticsRow extends StaticsCheckRow { comboId: number }

/**
 * The same check for each combination: the applied side is the combination of the cases'
 * applied sides with its factors, and the reactions are the combination's own. A case the
 * combination names but the solve did not check is reported as uncovered.
 */
export function combinationStatics(
  caseRows: readonly StaticsCheckRow[],
  combinations: ReadonlyArray<{ id: number; name: string; factors: ReadonlyArray<{ caseId: number; factor: number }> }>,
  reactionsByCombo: ReadonlyMap<number, ReadonlyArray<{ nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number }>>,
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>,
): ComboStaticsRow[] {
  const byCase = new Map(caseRows.map((r) => [r.caseId, r]));
  const out: ComboStaticsRow[] = [];
  for (const c of combinations) {
    const reactions = reactionsByCombo.get(c.id);
    if (!reactions) continue;
    const applied: Resultant6 = { ...ZERO };
    const uncovered = new Set<string>();
    let selfWeight = false;
    for (const f of c.factors) {
      const r = byCase.get(f.caseId);
      if (!r) { uncovered.add(`case ${f.caseId}`); continue; }
      for (const k of ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const) applied[k] += f.factor * r.applied[k];
      r.uncovered.forEach((u) => uncovered.add(u));
      selfWeight ||= r.selfWeightIncluded;
    }
    out.push({
      ...closeRow(applied, reactionResultant(nodes, reactions)),
      caseId: null, comboId: c.id, caseName: c.name,
      uncovered: [...uncovered].sort(), selfWeightIncluded: selfWeight,
    });
  }
  return out;
}
