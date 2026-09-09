/**
 * A bolted joint, designed — CIRSOC 301-2018 §J.3.
 *
 * ── Why this is not `bolt-geometry.ts` ──────────────────────────────
 *
 * That module reports the ENVELOPE a layout must sit inside: `s ≥ 3d`, the edge distances, the
 * hole size. An envelope is not a connection. It has no bolt count, no plate, no demand, and
 * treating it as a design would be exactly the thing the brief forbids — «no usar una envolvente
 * mínima como si fuera una unión diseñada».
 *
 * This module takes a CHOSEN layout — a diameter, a grade, a count, rows and gauges — plus the
 * plate it passes through and the demand it carries, and evaluates the limit states the shipped
 * text gives:
 *
 *   · **§J.3.6** — `Rn = φ Fn Ab (10⁻¹)`, tension or shear, per bolt. `Fnt` and `Fnv` from
 *     Tabla J.3.2, `φ = 0,75`. The `10⁻¹` is the unit conversion: MPa·cm² → kN.
 *   · **§J.3.7** — combined tension and shear, which reduces the available tension rather than
 *     checking the two independently.
 *   · **§J.3.10** — plate bearing at the holes, `Rn = 1,2 Lc t Fu (10⁻¹) ≤ 2,4 d t Fu (10⁻¹)`
 *     where deformation is a design consideration, and the 1,5/3,0 pair where it is not.
 *   · **§J.3.3, J.3.4, J.3.5** — the geometric rules, delegated to `bolt-geometry.ts` so there
 *     is one place that knows them.
 *
 * And the sentence that decides how the group is summed, quoted because it is easy to get
 * wrong: «La resistencia efectiva de un bulón será la MENOR entre la resistencia al corte …
 * o la resistencia al aplastamiento … Para la unión, la resistencia efectiva del grupo será
 * tomada como la SUMA de las resistencias efectivas de los bulones individuales.» Per bolt the
 * minimum; across the group the sum. Not the minimum of the two group totals, which would be a
 * different and unconservative number whenever bearing governs some bolts and shear others.
 *
 * ── What it refuses ─────────────────────────────────────────────────
 *
 * No plate thickness, no plate `Fu`, no demand, no chosen diameter → no design. Each absence is
 * named. Nothing is defaulted: a 10 mm plate assumed because most plates are 10 mm is a
 * fabricated dimension with a plausible value, which is the worst kind.
 */

import {
  boltLayoutEnvelope, type BoltLayoutEnvelope, type EdgeFinish, type Exposure,
} from './bolt-geometry';

/** The bolt grades Tabla J.3.2 tabulates. */
export const BOLT_GRADES = ['A307', 'A325', 'A490'] as const;
export type BoltGrade = (typeof BOLT_GRADES)[number];

/** Whether the threads lie in a shear plane, which changes `Fnv` by 20–25 %. */
export type ThreadCondition = 'included' | 'excluded';

/**
 * Tabla J.3.2 — nominal strengths, MPa.
 *
 * `A307` has one shear value: the table gives no threads-excluded column for it, and inventing
 * one by analogy with A325 would be reading a row the code does not have.
 */
const NOMINAL: Record<BoltGrade, { fnt: number; fnvIncluded: number; fnvExcluded: number | null }> =
  Object.freeze({
    A307: { fnt: 260, fnvIncluded: 140, fnvExcluded: null },
    A325: { fnt: 620, fnvIncluded: 330, fnvExcluded: 415 },
    A490: { fnt: 778, fnvIncluded: 414, fnvExcluded: 517 },
  });

/** φ for both tension and shear — Tabla J.3.2 — and for bearing — §J.3.10. */
const PHI = 0.75;

export interface BoltLayoutChoice {
  /** Nominal diameter, mm. */
  diameterMm: number;
  grade: BoltGrade;
  threads: ThreadCondition;
  /** How many bolts in the group. */
  count: number;
  /** Rows across the force direction; `count / rows` gives the bolts per row. */
  rows: number;
  /** Centre-to-centre spacing along the force, mm. */
  spacingMm: number;
  /** Centre of the end hole to the edge, along the force, mm. */
  edgeDistanceMm: number;
  edgeFinish?: EdgeFinish;
  exposure?: Exposure;
  /** Shear planes per bolt. One for a lap splice, two for a double-shear detail. */
  shearPlanes?: 1 | 2;
  /** Whether deformation around the hole at service load is a design consideration — §J.3.10. */
  deformationConsidered?: boolean;
}

export interface PlateInput {
  /** Thickness of the critical connected part, mm. */
  thicknessMm?: number;
  /** Minimum specified tensile strength of the PLATE steel, MPa. Not the bolt's. */
  fuMPa?: number;
}

export interface JointDemandInput {
  /** Required shear across the faying surface, kN. */
  shearKN?: number;
  /** Required tension, kN. */
  tensionKN?: number;
}

export type CheckState =
  /** Evaluated, and the demand is within the design strength. */
  | 'adequate'
  /** Evaluated, and it is not. */
  | 'exceeded'
  /** An input the clause needs is missing. Never a pass and never a failure. */
  | 'unavailable';

export interface Check {
  id: 'boltShear' | 'boltTension' | 'combined' | 'bearing' | 'spacing' | 'edgeDistance';
  state: CheckState;
  clause: string;
  /** Design strength, kN. Null when unavailable. */
  capacityKN: number | null;
  /** Required, kN. Null when there is no demand for it. */
  demandKN: number | null;
  /** `demand / capacity`. Null when either is missing. */
  ratio: number | null;
  /** i18n keys for what is missing, or for what qualifies the result. */
  noteKeys: readonly string[];
}

/**
 * Where a joint's design stands.
 *
 * Five states, and the two that are easy to confuse are `incomplete` and `notVerifiable`:
 *
 *   · **`incomplete`** — a datum the USER can supply is missing. A plate thickness, an `Fu`, a
 *     demand. Actionable.
 *   · **`notVerifiable`** — every user input is present and a CLAUSE still cannot be evaluated.
 *     `Fnv` for an A307 with threads excluded is the live case: Tabla J.3.2 has no such row, and
 *     no amount of user input creates one. Not actionable by the user.
 *
 * `verified` is in the union and is **never returned**. It exists so a surface can name the
 * state without inventing a word for it, and a test asserts nothing produces it —
 * `steelCountsAsVerified()` returns the literal `false`, and a joint is not verified by having
 * passed the checks this app can run.
 */
export type JointDesignState =
  /** Nothing has been chosen. */
  | 'notDesigned'
  /** A layout exists and an input the USER can supply does not. */
  | 'incomplete'
  /** Every evaluable check ran and every one is adequate. Still not a certification. */
  | 'designed'
  /** Every evaluable check ran and at least one is exceeded. */
  | 'exceeded'
  /** Inputs are complete and a clause cannot be evaluated from the shipped text. */
  | 'notVerifiable'
  /** Never returned. Reserved for an authority that does not exist. */
  | 'verified';

export interface BoltedJointDesign {
  state: JointDesignState;
  checks: Check[];
  /** The geometric envelope, so a surface can show the rule beside the chosen value. */
  envelope: BoltLayoutEnvelope;
  /** Everything the design needs and does not have, as i18n keys. */
  missingKeys: readonly string[];
  /** The area of one bolt, cm². Null without a diameter. */
  boltAreaCm2: number | null;
}

const none = (id: Check['id'], clause: string, keys: string[]): Check =>
  ({ id, state: 'unavailable', clause, capacityKN: null, demandKN: null, ratio: null, noteKeys: keys });

/** Nominal bolt area, cm². `Ab` in J.3.1 is the nominal body area. */
export function boltAreaCm2(diameterMm: number): number {
  const rCm = diameterMm / 20;
  return Math.PI * rCm * rCm;
}

/**
 * `Fnv` for a grade and thread condition, or null.
 *
 * Null for A307 with threads excluded: Tabla J.3.2 has no such row, and interpolating one from
 * the A325 ratio would be reading a value the code does not publish.
 */
export function nominalShearMPa(grade: BoltGrade, threads: ThreadCondition): number | null {
  const row = NOMINAL[grade];
  return threads === 'excluded' ? row.fnvExcluded : row.fnvIncluded;
}

/** `Fnt` for a grade — Tabla J.3.2. Present for all three. */
export function nominalTensionMPa(grade: BoltGrade): number {
  return NOMINAL[grade].fnt;
}

/**
 * The clear distance `Lc` for the END bolt, cm — §J.3.10.
 *
 * «la distancia libre, en la dirección de la fuerza, entre el borde del agujero y el borde del
 * agujero adyacente o el borde del material». For the end bolt that is the edge distance less
 * half a hole; the interior bolts get the spacing less a whole hole, which is larger whenever
 * the spacing rule is met, so the end bolt governs and is what this returns.
 */
export function clearDistanceCm(edgeDistanceMm: number, holeDiameterMm: number): number {
  return Math.max(0, (edgeDistanceMm - holeDiameterMm / 2) / 10);
}

export function designBoltedJoint(
  layout: BoltLayoutChoice | null,
  plate: PlateInput,
  demand: JointDemandInput,
): BoltedJointDesign {
  const envelope = boltLayoutEnvelope({
    diameterMm: layout?.diameterMm,
    plateThicknessMm: plate.thicknessMm,
    edgeFinish: layout?.edgeFinish,
    exposure: layout?.exposure,
  });

  if (!layout || !(layout.diameterMm > 0) || !(layout.count > 0)) {
    return {
      state: 'notDesigned',
      checks: [],
      envelope,
      missingKeys: ['bolted.missing.layout'],
      boltAreaCm2: null,
    };
  }

  const missing: string[] = [];
  if (!(plate.thicknessMm && plate.thicknessMm > 0)) missing.push('bolted.missing.plateThickness');
  if (!(plate.fuMPa && plate.fuMPa > 0)) missing.push('bolted.missing.plateFu');
  if (demand.shearKN === undefined && demand.tensionKN === undefined) {
    missing.push('bolted.missing.demand');
  }

  const ab = boltAreaCm2(layout.diameterMm);
  const planes = layout.shearPlanes ?? 1;
  const checks: Check[] = [];

  // ── §J.3.6 shear ────────────────────────────────────────────────
  const fnv = nominalShearMPa(layout.grade, layout.threads);
  if (fnv === null) {
    checks.push(none('boltShear', 'J.3.6', ['bolted.missing.fnvNotTabulated']));
  } else if (demand.shearKN === undefined) {
    checks.push(none('boltShear', 'J.3.6', ['bolted.missing.shearDemand']));
  } else {
    // Rn = φ Fn Ab (10⁻¹) per shear plane, summed over the group.
    const cap = PHI * fnv * ab * 0.1 * planes * layout.count;
    checks.push({
      id: 'boltShear', state: demand.shearKN <= cap ? 'adequate' : 'exceeded',
      clause: 'J.3.6', capacityKN: cap, demandKN: demand.shearKN,
      ratio: cap > 0 ? demand.shearKN / cap : null,
      noteKeys: [`bolted.threads.${layout.threads}`],
    });
  }

  // ── §J.3.6 tension ──────────────────────────────────────────────
  if (demand.tensionKN === undefined) {
    checks.push(none('boltTension', 'J.3.6', ['bolted.missing.tensionDemand']));
  } else {
    const cap = PHI * nominalTensionMPa(layout.grade) * ab * 0.1 * layout.count;
    checks.push({
      id: 'boltTension', state: demand.tensionKN <= cap ? 'adequate' : 'exceeded',
      clause: 'J.3.6', capacityKN: cap, demandKN: demand.tensionKN,
      ratio: cap > 0 ? demand.tensionKN / cap : null,
      /*
       * Prying is NOT included. §J.3.6 says the applied force is the factored force «y de
       * cualquier tracción resultante del efecto de la acción de palanca» — and prying depends
       * on the plate's flexibility and the bolt's distance to the web, neither of which this
       * model records. Naming it is the honest half of not computing it.
       */
      noteKeys: ['bolted.note.pryingNotIncluded'],
    });
  }

  // ── §J.3.7 combined ─────────────────────────────────────────────
  if (fnv !== null && demand.shearKN !== undefined && demand.tensionKN !== undefined) {
    const fnt = nominalTensionMPa(layout.grade);
    const frv = demand.shearKN / (PHI * ab * 0.1 * planes * layout.count);
    /*
     * `F'nt = 1,3 Fnt − (Fnt / φ Fnv) frv ≤ Fnt` — the reduced tension strength. Both the
     * expression and the cap come from §J.3.7; the cap matters, because at low shear the
     * expression exceeds `Fnt` and using it would report more tension capacity than the bolt has.
     */
    const fntPrime = Math.min(fnt, 1.3 * fnt - (fnt / (PHI * fnv)) * frv);
    const cap = PHI * Math.max(0, fntPrime) * ab * 0.1 * layout.count;
    checks.push({
      id: 'combined', state: demand.tensionKN <= cap ? 'adequate' : 'exceeded',
      clause: 'J.3.7', capacityKN: cap, demandKN: demand.tensionKN,
      ratio: cap > 0 ? demand.tensionKN / cap : null,
      noteKeys: ['bolted.note.combinedReducesTension'],
    });
  } else {
    /*
     * Why it could not run, specifically.
     *
     * Reporting «both demands missing» here was wrong whenever the demands were present and
     * `Fnv` was not — an A307 with threads excluded, where Tabla J.3.2 has no row. The state
     * derivation reads these keys to tell "waiting for the user" from "the code has no answer",
     * so a wrong key put the joint in the wrong state. Caught by the test that distinguishes
     * them.
     */
    const why = fnv === null
      ? ['bolted.missing.fnvNotTabulated']
      : ['bolted.missing.bothDemands'];
    checks.push(none('combined', 'J.3.7', why));
  }

  // ── §J.3.10 bearing ─────────────────────────────────────────────
  const hole = envelope.standardHoleDiameter.valueMm;
  if (!plate.thicknessMm || !plate.fuMPa || hole === null) {
    checks.push(none('bearing', 'J.3.10', [
      ...(!plate.thicknessMm ? ['bolted.missing.plateThickness'] : []),
      ...(!plate.fuMPa ? ['bolted.missing.plateFu'] : []),
      ...(hole === null ? ['bolt.hole.notTabulated'] : []),
    ]));
  } else if (demand.shearKN === undefined) {
    checks.push(none('bearing', 'J.3.10', ['bolted.missing.shearDemand']));
  } else {
    const tCm = plate.thicknessMm / 10;
    const dCm = layout.diameterMm / 10;
    const lc = clearDistanceCm(layout.edgeDistanceMm, hole);
    const deformed = layout.deformationConsidered ?? true;
    const [a, b] = deformed ? [1.2, 2.4] : [1.5, 3.0];
    const perBolt = Math.min(a * lc * tCm * plate.fuMPa * 0.1, b * dCm * tCm * plate.fuMPa * 0.1);
    const cap = PHI * perBolt * layout.count;
    checks.push({
      id: 'bearing', state: demand.shearKN <= cap ? 'adequate' : 'exceeded',
      clause: 'J.3.10', capacityKN: cap, demandKN: demand.shearKN,
      ratio: cap > 0 ? demand.shearKN / cap : null,
      noteKeys: [deformed ? 'bolted.note.deformationConsidered' : 'bolted.note.deformationAllowed'],
    });
  }

  // ── §J.3.3 and §J.3.4, against the chosen layout ────────────────
  const minS = envelope.minSpacing.valueMm;
  checks.push(minS === null
    ? none('spacing', 'J.3.3', ['bolt.needsDiameter'])
    : {
        id: 'spacing', state: layout.spacingMm >= minS ? 'adequate' : 'exceeded',
        clause: 'J.3.3', capacityKN: null, demandKN: null,
        ratio: minS > 0 ? layout.spacingMm / minS : null,
        noteKeys: ['bolted.note.spacingIsGeometric'],
      });

  const minE = envelope.minEdgeDistance.valueMm;
  checks.push(minE === null
    ? none('edgeDistance', 'J.3.4', [envelope.minEdgeDistance.noteKey])
    : {
        id: 'edgeDistance', state: layout.edgeDistanceMm >= minE ? 'adequate' : 'exceeded',
        clause: 'J.3.4', capacityKN: null, demandKN: null,
        ratio: minE > 0 ? layout.edgeDistanceMm / minE : null,
        noteKeys: ['bolted.note.edgeIsGeometric'],
      });

  /*
   * The two kinds of "cannot evaluate", told apart by WHY.
   *
   * A check blocked on `bolted.missing.*` is waiting for the user; one blocked on a clause —
   * `Fnv` not tabulated, a hole size the table does not carry — is waiting for nothing, because
   * the shipped text has no answer. Collapsing them into one state would tell a user to supply
   * something that would not help.
   */
  const CLAUSE_BLOCKED = new Set(['bolted.missing.fnvNotTabulated', 'bolt.hole.notTabulated',
    'bolt.minEdge.notTabulated']);
  const blockedByClause = checks.some(
    (c) => c.state === 'unavailable' && c.noteKeys.some((k) => CLAUSE_BLOCKED.has(k)),
  );
  const blockedByInput = missing.length > 0 || checks.some(
    (c) => c.state === 'unavailable' && !c.noteKeys.some((k) => CLAUSE_BLOCKED.has(k)),
  );
  const anyExceeded = checks.some((c) => c.state === 'exceeded');

  const state: JointDesignState =
    anyExceeded ? 'exceeded'
      : blockedByInput ? 'incomplete'
        : blockedByClause ? 'notVerifiable'
          /*
           * Every evaluable check ran and passed. `designed`, never `verified`: passing the
           * checks this app can run is not the same as a metallic authority having certified
           * them, and `steelCountsAsVerified()` still returns the literal `false`.
           */
          : 'designed';

  return { state, checks, envelope, missingKeys: missing, boltAreaCm2: ab };
}
