/**
 * One joint's design — the single entity the panel, the 3-D view and a document all read.
 *
 * ── Why one entity and not three ────────────────────────────────────
 *
 * The brief is explicit: «una única entidad compartida con el visor 3D y futura documentación»,
 * and «no crear una segunda representación sólo para el visor». The reason is not tidiness.
 * Two representations of one joint are two things that can disagree, and the one on screen would
 * be the one nobody checked — a plate drawn 12 mm thick while the bearing check ran on 10 is a
 * defect no test catches unless the two are the same object.
 *
 * So `JointDesign` is produced once, from the model, and everything downstream reads it. The
 * 3-D view extrudes `plate.holesM`; the panel lists `bolts.checks`; a take-off reads
 * `plateMassKg`. None of them recomputes anything.
 *
 * ── What it composes ────────────────────────────────────────────────
 *
 * The five modules audited against the shipped text, each answering for its own clauses:
 *
 *   · `joint-demands` — the governing demand per component, with its combination;
 *   · `bolted-joint` — §J.3.6, §J.3.7, §J.3.10 and the geometric rules;
 *   · `plate-geometry` — the plate, derived from the layout;
 *   · `fillet-weld` — §J.2.2 and §J.2.4;
 *   · `batten-geometry` — §E.6, for a built-up member.
 *
 * It computes nothing itself. A joint's state is a summary of theirs, and the summary rule is
 * the conservative one: the joint is only as designed as its least-designed part.
 */

import { jointDemands, boltShearDemandKN, boltTensionDemandKN, type ComboResults, type JointDemands } from './joint-demands';
import { designBoltedJoint, type BoltLayoutChoice, type BoltedJointDesign, type JointDesignState } from './bolted-joint';
import { plateForLayout, type PlateResult } from './plate-geometry';
import { designFilletWeld, type WeldInput, type WeldDesign } from './fillet-weld';
import { battenLayout, type BattenInput, type BattenResult } from './batten-geometry';

export interface JointDesignInput {
  nodeId: number;
  /** Members meeting here — the list `detectJoints` produces. */
  elementIds: readonly number[];
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number }>;
  combos: readonly ComboResults[];
  /** Where the joint is, metres. */
  originM?: { x: number; y: number; z: number };
  /** What the user chose. Absent means nothing has been designed yet. */
  bolts?: BoltLayoutChoice | null;
  plate?: { thicknessMm?: number; fuMPa?: number };
  weld?: WeldInput | null;
  battens?: BattenInput | null;
}

export interface JointDesign {
  nodeId: number;
  demands: JointDemands;
  bolts: BoltedJointDesign;
  plate: PlateResult;
  /** Null when no weld was specified — an absent weld is not an incomplete one. */
  weld: WeldDesign | null;
  /** Null when the member is not a built-up one. */
  battens: BattenResult | null;
  /**
   * The joint's overall state.
   *
   * A summary of the parts, taken conservatively: a joint is only as designed as its
   * least-designed part. `verified` is in the union and is never produced.
   */
  state: JointDesignState;
}

/**
 * The order of severity, worst first.
 *
 * `exceeded` outranks everything: a joint with one failing check is not «incomplete» because
 * another part is missing an input — the failure is the fact worth surfacing. Then the two
 * blocked states, and only a joint whose every part is `designed` is designed.
 */
const SEVERITY: readonly JointDesignState[] = [
  'exceeded', 'notDesigned', 'incomplete', 'notVerifiable', 'designed',
];

function worst(states: readonly JointDesignState[]): JointDesignState {
  for (const s of SEVERITY) if (states.includes(s)) return s;
  return 'notDesigned';
}

export function designJoint(input: JointDesignInput): JointDesign {
  const demands = jointDemands(input.nodeId, input.elementIds, input.elements, input.combos);

  const bolts = designBoltedJoint(
    input.bolts ?? null,
    input.plate ?? {},
    {
      // The demands the analysis produced, not numbers a user typed. J.3.6 checks shear and
      // tension separately, and `joint-demands` names which component feeds which.
      shearKN: boltShearDemandKN(demands) ?? undefined,
      tensionKN: boltTensionDemandKN(demands) ?? undefined,
    },
  );

  const plate = plateForLayout({
    layout: input.bolts ?? null,
    thicknessMm: input.plate?.thicknessMm,
    holeDiameterMm: bolts.envelope.standardHoleDiameter.valueMm,
    originM: input.originM,
  });

  /*
   * A weld is optional. An absent one is NOT an incomplete one: most bolted joints have no weld,
   * and reporting «weld incomplete» on every one of them would make the state meaningless.
   */
  const weld = input.weld
    ? designFilletWeld({
        ...input.weld,
        demandKN: input.weld.demandKN ?? boltShearDemandKN(demands) ?? undefined,
      })
    : null;

  const battens = input.battens ? battenLayout(input.battens) : null;

  const parts: JointDesignState[] = [bolts.state];
  if (weld) parts.push(weld.state);
  /*
   * The plate does not get a state of its own in the summary. It is derived entirely from the
   * bolt layout, so a plate that could not be built means the layout could not either — and
   * `bolts.state` already says so. Counting it twice would make one missing input look like two.
   */
  return { nodeId: input.nodeId, demands, bolts, plate, weld, battens, state: worst(parts) };
}

/** Whether anything is drawable in 3-D for this joint. */
export function hasDrawableGeometry(d: JointDesign): boolean {
  return d.plate.state === 'available';
}

/**
 * i18n key for a state, so no surface prints a raw enum — and so `verified` has a name it can
 * show without any code path being able to produce it.
 */
export const jointStateKey = (s: JointDesignState): string => `joint.state.${s}`;
