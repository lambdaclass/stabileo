/**
 * The demands at a joint, across every combination, with the one that governs named.
 *
 * ── What this adds to `getJointForces` ──────────────────────────────
 *
 * `connection-design.ts` already extracts element-end forces at a node — for ONE result set.
 * That is enough to show a number and not enough to design anything: a bolt group is sized for
 * the worst case across the combinations, and «worst» has to say which combination, which
 * member, and which end, or the number cannot be checked by a reader.
 *
 * So this walks every combination the analysis produced and reports, per component, the
 * governing value **with its provenance**. Nothing is averaged and nothing is enveloped into an
 * anonymous maximum: an envelope that cannot say where it came from is a number nobody can
 * argue with, which is the opposite of useful in a design document.
 *
 * ── What it does not do ─────────────────────────────────────────────
 *
 * It does not combine components. The resultant shear `√(Vy² + Vz²)` is computed per element per
 * combination — which is legitimate, both act at the same instant — but `N` and `V` from
 * DIFFERENT combinations are never paired, because they do not occur together. Pairing them
 * would be inventing a load case the analysis never ran.
 *
 * And it reads the solver's output. Nothing here re-derives a force.
 */

/** A component of the demand, kept separate because each sizes a different check. */
export type DemandComponent = 'axial' | 'shear' | 'moment';

export interface GoverningDemand {
  component: DemandComponent;
  /** Magnitude, kN for forces and kN·m for moments. Always ≥ 0 — this is a demand, not a sign. */
  value: number;
  /** Which combination produced it. Null when the analysis ran a single unnamed case. */
  comboId: number | null;
  comboName: string | null;
  /** Which member, and which of its ends, meets the joint here. */
  elementId: number;
  end: 'I' | 'J';
}

export interface JointDemands {
  nodeId: number;
  /** One entry per component, or null when nothing was found for it. */
  axial: GoverningDemand | null;
  shear: GoverningDemand | null;
  moment: GoverningDemand | null;
  /** How many combinations were walked. Zero means the model was never solved. */
  combinationsConsidered: number;
  /** Members that meet here and had no forces in any result. */
  membersWithoutForces: number[];
  /**
   * What the bolts carry at the same instant: axial and resultant shear of ONE member end in ONE
   * combination, for the members the joint connects. A member that runs straight through the
   * node (a continuous column) is left out, since its axial force passes the node without
   * reaching the bolts; when every member runs through (a splice) all of them count. Which line
   * runs through is `throughMembers`' rule: the column, and none at a column head.
   *
   * The J.3.7 interaction reads these pairs. It read the governing axial and the governing shear,
   * which could come from different members and different combinations, so a column's pass-
   * through N was paired with a beam's V from another combination.
   */
  boltPairs: BoltPair[];
}

export interface BoltPair {
  elementId: number;
  end: 'I' | 'J';
  comboId: number | null;
  comboName: string | null;
  tensionKN: number;
  shearKN: number;
}

interface NodeXYZ { x: number; y: number; z?: number }

/**
 * The members whose force passes the node without reaching the bolts.
 *
 * Two collinear members on opposite sides of the node form a LINE that could run through it. The
 * analysis model cannot say which line is continuous in the steel — every member ends at a node —
 * so the rule is the one a detailer applies:
 *
 *   · Where several lines cross (an interior joint: column below and above, beams both sides),
 *     the column runs through and the beams are bolted to it. «The column» is the steepest line,
 *     with Z vertical as `classifyElement` reads it. Treating every collinear pair as through left
 *     no member to bolt, and the fallback then counted the column's 800 kN pass-through axial as
 *     bolt tension.
 *   · Where one line meets a steeper member that ends at the node — a column head with beams from
 *     both sides — the model holds two details at once. A beam continuous over a cap plate puts
 *     the column's reaction through the bolts, and that reaction is the sum of the beams' end
 *     shears; beams framing into a column that stops at their level put each beam's own end shear
 *     through its own bolts. Dropping the beams (the old rule) kept only the first, so the beams'
 *     shear reached the bolts as the column's axial and never as shear. Both details are checked:
 *     the line's members are not through, and the worst pair governs. The price is that a beam
 *     that really is continuous over a cap has its axial counted as bolt tension — conservative,
 *     and named here so it is not mistaken for the bug above.
 *   · Where the steeper member is axial-only — a truss member, or a frame end released in both
 *     bending axes — it is a web member on a continuous chord, the gusset detail: the chord runs
 *     through and only the web is bolted.
 *
 * When every member at the node is on the through line (a splice) the caller counts them all.
 */
function throughMembers(nodeId: number, elementIds: readonly number[], elements: ReadonlyMap<number, ElemData>, nodes?: ReadonlyMap<number, NodeXYZ>): Set<number> {
  const at = nodes?.get(nodeId);
  if (!at) return new Set();
  const dir = (id: number): number[] | null => {
    const e = elements.get(id); if (!e) return null;
    const far = nodes!.get(e.nodeI === nodeId ? e.nodeJ : e.nodeI); if (!far) return null;
    const d = [far.x - at.x, far.y - at.y, (far.z ?? 0) - (at.z ?? 0)];
    const L = Math.hypot(d[0]!, d[1]!, d[2]!);
    return L > 0 ? d.map((v) => v / L) : null;
  };
  const dirs = new Map<number, number[]>();
  for (const id of elementIds) { const d = dir(id); if (d) dirs.set(id, d); }
  const steepness = (id: number) => Math.abs(dirs.get(id)?.[2] ?? 0);

  const lines: Array<[number, number]> = [];
  for (let i = 0; i < elementIds.length; i++) {
    for (let j = i + 1; j < elementIds.length; j++) {
      const a = dirs.get(elementIds[i]!), b = dirs.get(elementIds[j]!);
      if (a && b && a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! < -0.9999) lines.push([elementIds[i]!, elementIds[j]!]);
    }
  }
  if (lines.length === 0) return new Set();
  // The steepest line is the column; on a tie (two crossing beams of a grillage) the first.
  let line = lines[0]!;
  for (const l of lines) if (steepness(l[0]) > steepness(line[0]) + 1e-9) line = l;

  const axialOnly = (id: number): boolean => {
    const e = elements.get(id);
    if (!e) return false;
    if (e.type === 'truss') return true;
    const r = e.nodeI === nodeId ? e.releaseI : e.releaseJ;
    return !!r?.my && !!r?.mz;
  };
  const columnEndsHere = elementIds.some((id) =>
    !line.includes(id) && steepness(id) > steepness(line[0]) + 1e-9 && !axialOnly(id));
  return columnEndsHere ? new Set() : new Set(line);
}

/** One combination's results, as much of them as this module reads. */
export interface ComboResults {
  id: number | null;
  name: string | null;
  elementForces: ReadonlyArray<Record<string, unknown>>;
}

interface ElemData {
  id: number; nodeI: number; nodeJ: number;
  /** Read to tell a web member (axial only) from a column; absent reads as a rigid frame end. */
  type?: string;
  releaseI?: { my?: boolean; mz?: boolean };
  releaseJ?: { my?: boolean; mz?: boolean };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The governing demand per component at one joint.
 *
 * `elementIds` is the caller's list of members meeting the node — the same list `detectJoints`
 * produces — so this module needs no topology of its own and cannot disagree with the panel
 * about which members are at a joint.
 */
export function jointDemands(
  nodeId: number,
  elementIds: readonly number[],
  elements: ReadonlyMap<number, ElemData>,
  combos: readonly ComboResults[],
  nodes?: ReadonlyMap<number, NodeXYZ>,
): JointDemands {
  let axial: GoverningDemand | null = null;
  let shear: GoverningDemand | null = null;
  let moment: GoverningDemand | null = null;
  const seen = new Set<number>();
  const through = throughMembers(nodeId, elementIds, elements, nodes);
  const boltMembers = new Set(elementIds.filter((id) => !through.has(id)));
  if (boltMembers.size === 0) for (const id of elementIds) boltMembers.add(id);
  const boltPairs: BoltPair[] = [];

  const better = (cur: GoverningDemand | null, next: GoverningDemand): GoverningDemand =>
    cur === null || next.value > cur.value ? next : cur;

  for (const combo of combos) {
    const byElement = new Map<number, Record<string, unknown>>();
    for (const ef of combo.elementForces) {
      const id = ef.elementId;
      if (typeof id === 'number') byElement.set(id, ef);
    }

    for (const elementId of elementIds) {
      const el = elements.get(elementId);
      const ef = byElement.get(elementId);
      if (!el || !ef) continue;
      seen.add(elementId);

      /*
       * Which end of the member is AT this node. A member whose two ends are the same node —
       * a degenerate loop — would answer `I` here, and a loop has no joint to design, so the
       * caller's `detectJoints` never produces one.
       */
      const end: 'I' | 'J' = el.nodeI === nodeId ? 'I' : 'J';
      /*
       * `ElementForces3D` names its fields `nStart`/`nEnd`, `vyStart`/`vyEnd` and so on — NOT
       * `NI`/`NJ`.
       *
       * This is worth a comment because the shipped `getJointForces` in `connection-design.ts`
       * read the `NI`/`NJ` form, and its own doc comment asserted that format. Every lookup
       * returned `undefined`, every force came back zero, and the connections panel had been
       * showing a table of zeros. Nothing caught it: no unit test covered that function, and a
       * zero force looks like an unloaded member rather than like a missing field.
       */
      const suffix = end === 'I' ? 'Start' : 'End';
      const at = (k: string) => num(ef[`${k}${suffix}`]);

      const base = { comboId: combo.id, comboName: combo.name, elementId, end };
      axial = better(axial, { component: 'axial', value: Math.abs(at('n')), ...base });
      /*
       * The resultant of the two shear components, per element per combination. Legitimate
       * because both act at the same instant; taking `Vy` from one combination and `Vz` from
       * another would be inventing a load case the analysis never ran.
       */
      shear = better(shear, {
        component: 'shear', value: Math.hypot(at('vy'), at('vz')), ...base,
      });
      moment = better(moment, {
        component: 'moment', value: Math.hypot(at('my'), at('mz')), ...base,
      });
      if (boltMembers.has(elementId)) {
        boltPairs.push({ ...base, tensionKN: Math.abs(at('n')), shearKN: Math.hypot(at('vy'), at('vz')) });
      }
    }
  }

  return {
    nodeId,
    /*
     * A component whose governing value is zero is reported as null, not as a zero.
     *
     * A truss diagonal carries no moment, and «the governing moment is 0,0 kN·m» invites a
     * reader to check a connection against nothing. Absence is the honest answer, and it is
     * what the surface renders as an em dash.
     */
    axial: axial && axial.value > 0 ? axial : null,
    shear: shear && shear.value > 0 ? shear : null,
    moment: moment && moment.value > 0 ? moment : null,
    combinationsConsidered: combos.length,
    membersWithoutForces: elementIds.filter((id) => !seen.has(id)),
    boltPairs,
  };
}

/** Whether anything can be designed from these demands. */
export function hasDemands(d: JointDemands): boolean {
  return d.axial !== null || d.shear !== null || d.moment !== null;
}

/**
 * The demand a bolt group is sized for: the resultant shear across the faying surface.
 *
 * Named rather than left as `d.shear.value`, because which component sizes which check is the
 * kind of thing that gets mixed up once and stays wrong. J.3.6 gives tension and shear
 * strengths separately; the shear one takes this.
 */
export function boltShearDemandKN(d: JointDemands): number | null {
  return d.shear?.value ?? null;
}

/** The demand a bolt group's tension check takes — J.3.6 again, the other half. */
export function boltTensionDemandKN(d: JointDemands): number | null {
  return d.axial?.value ?? null;
}
