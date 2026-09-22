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
 * by omission. Surface and quad loads are not summed yet. Both are counted, and whatever
 * was left out is named in `uncovered`, because a check that under-reports silently is
 * worse than no check: it converts an unexplained residual into a clean bill of health.
 */
import type { ModelData } from './solver-service';
import { computeLocalAxes3D } from './local-axes-3d';
import type {
  NodalLoad3D, DistributedLoad3D, PointLoadOnElement3D, Load,
} from '../store/model.svelte';

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
 * Resultant of a linear load over [a, b] of a member, and where it acts.
 *
 * The trapezoid q(s) from qA at `a` to qB at `b` carries (qA + qB)·len/2, at the centroid
 * a + len·(qA + 2·qB) / (3·(qA + qB)). Both degenerate correctly: qA = qB gives the
 * midpoint, and qA = 0 gives the two-thirds point.
 */
function trapezoid(qA: number, qB: number, a: number, b: number): { P: number; s: number } {
  const len = b - a;
  const P = 0.5 * (qA + qB) * len;
  const sum = qA + qB;
  const s = Math.abs(sum) < 1e-12 ? a + len / 2 : a + (len * (qA + 2 * qB)) / (3 * sum);
  return { P, s };
}

export interface StaticsCheckInput {
  model: ModelData;
  /** Reactions per case, as the solver reported them. Key null = the single solve. */
  reactionsByCase: Map<number | null, ReadonlyArray<{
    nodeId: number; fx: number; fy: number; fz: number; mx: number; my: number; mz: number;
  }>>;
  /** The solve added self-weight, so the applied side must add it too. */
  includeSelfWeight: boolean;
  /** Names for the report. */
  caseNames?: Map<number, string>;
}

/**
 * Sum what the model applies, sum what the supports return, and report the difference.
 *
 * One row per load case present in `reactionsByCase`, so the table follows the solve
 * rather than the model: a case that was not solved has nothing to check.
 */
export function staticsCheck(input: StaticsCheckInput): StaticsCheckRow[] {
  const { model, reactionsByCase, includeSelfWeight, caseNames } = input;
  const rows: StaticsCheckRow[] = [];

  for (const [caseId, reactions] of reactionsByCase) {
    const applied: Resultant6 = { ...ZERO };
    const uncovered = new Set<string>();

    const inCase = (l: Load): boolean => {
      const c = (l.data as { caseId?: number }).caseId;
      // A load with no case belongs to every solve; a single solve takes everything.
      if (caseId === null || c === undefined) return true;
      return c === caseId;
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
        const ni = model.nodes.get(el.nodeI);
        const nj = model.nodes.get(el.nodeJ);
        if (!ni || !nj) continue;
        const ax = computeLocalAxes3D(
          { id: el.nodeI, x: ni.x, y: ni.y, z: ni.z ?? 0 },
          { id: el.nodeJ, x: nj.x, y: nj.y, z: nj.z ?? 0 },
          el.localYx !== undefined
            ? { x: el.localYx, y: el.localYy ?? 0, z: el.localYz ?? 0 }
            : undefined,
          el.rollAngle,
        );
        const at = (s: number): [number, number, number] => [
          ni.x + ax.ex[0] * s, ni.y + ax.ex[1] * s, (ni.z ?? 0) + ax.ex[2] * s,
        ];
        const push = (py: number, pz: number, s: number): void => {
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
          const q = d as DistributedLoad3D;
          const a = q.a ?? 0;
          const b = q.b ?? ax.L;
          const y = trapezoid(q.qYI, q.qYJ, a, b);
          const z = trapezoid(q.qZI, q.qZJ, a, b);
          push(y.P, 0, y.s);
          push(0, z.P, z.s);
        }
      } else if (l.type === 'thermal' || l.type === 'thermalQuad3d') {
        // No net external force by definition. Not a gap.
      } else {
        uncovered.add(l.type);
      }
    }

    if (includeSelfWeight) {
      // Matched to the assembly the solver is given: ρ·A·L lumped half at each end,
      // downward in global Z. Computing it any other way here would report a residual
      // that is this function's own arithmetic and nothing about the model.
      for (const el of model.elements.values()) {
        const mat = model.materials.get(el.materialId);
        const sec = model.sections.get(el.sectionId);
        const ni = model.nodes.get(el.nodeI);
        const nj = model.nodes.get(el.nodeJ);
        if (!mat || !sec || !ni || !nj) continue;
        const dx = nj.x - ni.x, dy = nj.y - ni.y, dz = (nj.z ?? 0) - (ni.z ?? 0);
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-10) continue;
        const half = (mat.rho * sec.a * L) / 2;
        addForceAt(applied, [0, 0, -half], [ni.x, ni.y, ni.z ?? 0]);
        addForceAt(applied, [0, 0, -half], [nj.x, nj.y, nj.z ?? 0]);
      }
      if (model.plates?.size || model.quads?.size) uncovered.add('surfaceSelfWeight');
    }

    const react: Resultant6 = { ...ZERO };
    for (const r of reactions) {
      const n = model.nodes.get(r.nodeId);
      if (!n) continue;
      addForceAt(react, [r.fx, r.fy, r.fz], [n.x, n.y, n.z ?? 0]);
      addMoment(react, [r.mx, r.my, r.mz]);
    }

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

    rows.push({
      caseId,
      caseName: caseId === null ? '' : (caseNames?.get(caseId) ?? `Case ${caseId}`),
      applied, reactions: react, difference,
      worstRelative: +worstRelative.toFixed(6),
      uncovered: [...uncovered].sort(),
      selfWeightIncluded: includeSelfWeight,
    });
  }

  return rows;
}
