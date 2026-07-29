/**
 * Lap splices where collinear members meet, per CIRSOC 201 §25.5.
 *
 * ── The rule the search was missing ────────────────────────────────
 *
 * The coordination search treated two collinear beams as compatible only if their layouts
 * were identical (one continuous bar) or fully separated in plan (two bars side by side).
 * Fifty of the fifty-nine remaining stranded members failed on that rule, and it is not the
 * rule the code states.
 *
 * §25.5.1.2 permits a CONTACT lap splice: the two bars touch. What the article requires is
 * that the contact pair keeps §25.2.1 clear spacing from *adjacent* bars and splices — not
 * from its own partner. So two 8-bar beams meeting over a support do not need sixteen
 * positions across the section; they need eight, each holding a lapped pair.
 *
 * Demanding sixteen is why the pair was declared impossible. It was never a congestion
 * problem; it was a missing arrangement.
 *
 * ── What is implemented ────────────────────────────────────────────
 *
 * §25.5.1.2   contact laps, spacing measured to ADJACENT bars
 * §25.5.1.3   non-contact laps: transverse pitch ≤ min(lst/5, 150 mm)
 * §25.5.2.1   Table 25.5.2.1 — Class A when As,provided/As,required ≥ 2 AND ≤ 50 % spliced
 *             in one lap length; Class B otherwise. Class A = max(1,0 ld, 300); B = 1,3 ld
 * §25.4.2.1   the ld both classes are built on, floored at 300 mm
 *
 * Staggering is modelled as what the code makes it: the way to qualify for Class A, not a
 * geometric necessity. A splice group spliced at one section beyond 50 % takes the longer
 * Class B lap; splitting the bars into groups at different stations keeps each section
 * under 50 % and earns the shorter one.
 *
 * Pure: no store, no runes, no i18n.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import { msg, round, type EngineMessage } from '../../codes/message';
import { MIN_LAP_MM, type DevelopmentResult } from '../../codes/cirsoc201/anchorage';

/** §25.5.1.3 — maximum transverse pitch of a NON-contact lap pair. */
export const MAX_NONCONTACT_PITCH_MM = 150;

/** §25.5.2.1 — the ratio above which Class A becomes available. */
export const CLASS_A_AREA_RATIO = 2.0;

/** §25.5.2.1 — the fraction spliced at one section that Class A permits. */
export const CLASS_A_MAX_FRACTION = 0.5;

export type SpliceClass = 'A' | 'B';

export type TransitionKind =
  /** Same bars carry through; no splice at all. Always preferred. */
  | 'continuous'
  /** Bars lap in contact — same transverse position, touching. §25.5.1.2. */
  | 'contactLap'
  /** Bars lap apart, within the §25.5.1.3 transverse limit. */
  | 'nonContactLap';

export interface SplicePair {
  /** Transverse position of the incoming bar, m. */
  fromAcross: number;
  /** Transverse position of the outgoing bar, m. */
  toAcross: number;
  /** Centre-to-centre transverse offset, m. Zero for a contact lap. */
  offset: number;
  /** Longitudinal interval over which BOTH bars physically exist, m from the joint. */
  overlapFrom: number;
  overlapTo: number;
  /** Which stagger group this pair belongs to. */
  group: number;
}

export interface SpliceSchedule {
  kind: TransitionKind;
  spliceClass: SpliceClass;
  /** Lap length, m. */
  lapLength: number;
  pairs: SplicePair[];
  /** Number of stagger groups; 1 means every bar splices at the same station. */
  groups: number;
  /** Largest fraction of bars spliced at any one section. */
  maxFractionAtSection: number;
  refs: ClauseRef[];
  derivation: EngineMessage;
}

export type SpliceRejection =
  | 'noLegalTransversePairing'
  | 'nonContactPitchExceeded'
  | 'insufficientLength'
  | 'highDemandRegion'
  | 'withinJointExclusion';

export interface SpliceAttempt {
  ok: boolean;
  schedule?: SpliceSchedule;
  rejection?: SpliceRejection;
  /** What exactly was short, so the message is specific. */
  detail?: EngineMessage;
}

export interface SpliceInputs {
  /** Incoming member's transverse bar positions, m. */
  from: readonly number[];
  /** Outgoing member's transverse bar positions, m. */
  to: readonly number[];
  diameterMm: number;
  /** Development length for this bar, m — from `deriveDevelopment`. */
  development: DevelopmentResult;
  /** Ratio of provided to required area AT THE SPLICE. Drives the class. */
  areaRatio: number;
  /**
   * How many stagger groups to split the bars into. One means all at one station.
   * More groups keep each section under the §25.5.2.1 fraction and earn Class A.
   */
  groups?: number;
  /** Physical length available for the splice on each side of the joint, m. */
  availableLength: number;
  /** Distance from the joint face before a splice may start, m. */
  jointExclusion?: number;
  edition: RegulationEdition;
  maxAggregateSizeMm: number;
}

/**
 * §25.5.2.1 Table 25.5.2.1.
 *
 * Class B unless BOTH conditions hold. The table's default is the longer lap, and a
 * conservative default is the right one: getting this wrong shortens real steel.
 */
export function classifySplice(
  areaRatio: number, fractionAtSection: number,
): { spliceClass: SpliceClass; factor: number; refs: ClauseRef[] } {
  const qualifiesA = areaRatio >= CLASS_A_AREA_RATIO
    && fractionAtSection <= CLASS_A_MAX_FRACTION + 1e-9;
  return {
    spliceClass: qualifiesA ? 'A' : 'B',
    factor: qualifiesA ? 1.0 : 1.3,
    refs: [clause('cirsoc-201', '2025', 'Tabla 25.5.2.1',
      'longitud de empalme por yuxtaposición en tracción')],
  };
}

/**
 * Pair the incoming bars with the outgoing ones, transversely.
 *
 * ── Order-preserving, not greedy-nearest ───────────────────────────
 *
 * Both sets are sorted and matched i-th to i-th. That is optimal for one-dimensional
 * matching — it minimises the WORST offset, which is the quantity §25.5.1.3 bounds — and it
 * is also the only physically sensible answer: bars in a lap do not cross over one another
 * on their way to their partners.
 *
 * A greedy nearest-first pass looks reasonable and is neither. Taking the closest partner
 * for each bar in turn spends the central positions early and strands the outermost bar
 * with whatever is left on the far side. On the flagship's last unresolved member it paired
 * seven bars within 47 mm and then offered the eighth a partner 162 mm away, over the
 * 114 mm limit, and declared the whole transition impossible.
 */
function pairUp(
  from: readonly number[], to: readonly number[], maxPitch: number,
): Array<{ fromAcross: number; toAcross: number; offset: number }> | null {
  const sortedFrom = [...from].sort((a, b) => a - b);
  const sortedTo = [...to].sort((a, b) => a - b);
  const n = Math.min(sortedFrom.length, sortedTo.length);
  const out: Array<{ fromAcross: number; toAcross: number; offset: number }> = [];
  for (let i = 0; i < n; i++) {
    const offset = Math.abs(sortedTo[i] - sortedFrom[i]);
    if (offset > maxPitch + 1e-9) return null;
    out.push({ fromAcross: sortedFrom[i], toAcross: sortedTo[i], offset });
  }
  // Any surplus incoming bars simply terminate with legal anchorage; that is not a failure.
  return out;
}

/**
 * Build the splice schedule for one collinear transition, or say why not.
 *
 * The overlap interval is what the collision engine needs: the two bars coexist ONLY there,
 * and treating them as coexisting along the whole member is what made a legal lap look like
 * a permanent doubling of the section's bar count.
 */
export function planSplice(input: SpliceInputs): SpliceAttempt {
  const d = input.diameterMm / 1000;
  const groups = Math.max(1, Math.floor(input.groups ?? 1));

  // §25.5.1.3: a non-contact pair may sit at most min(lst/5, 150 mm) apart. The limit
  // depends on the lap length, which depends on the class, which depends on the stagger —
  // so the pairing is attempted against the loosest bound and the result re-checked.
  const provisionalLap = Math.max(input.development.ldM * 1.3, MIN_LAP_MM / 1000);
  const maxPitch = Math.min(provisionalLap / 5, MAX_NONCONTACT_PITCH_MM / 1000);

  const paired = pairUp(input.from, input.to, maxPitch);
  if (paired === null) {
    return {
      ok: false, rejection: 'noLegalTransversePairing',
      detail: msg('detailing.splice.noPairing', {
        maxPitch: round(maxPitch * 1000, 0),
      }),
    };
  }
  if (paired.length === 0) {
    return { ok: false, rejection: 'noLegalTransversePairing',
      detail: msg('detailing.splice.noPairing', { maxPitch: round(maxPitch * 1000, 0) }) };
  }

  const fractionAtSection = 1 / groups;
  const { spliceClass, factor, refs: classRefs } =
    classifySplice(input.areaRatio, fractionAtSection);
  const lapLength = Math.max(input.development.ldM * factor, MIN_LAP_MM / 1000);

  // Re-check the non-contact limit against the ACTUAL lap length.
  const finalMaxPitch = Math.min(lapLength / 5, MAX_NONCONTACT_PITCH_MM / 1000);
  const worstOffset = Math.max(...paired.map((p) => p.offset));
  const contact = worstOffset <= d + 1e-9;
  if (!contact && worstOffset > finalMaxPitch + 1e-9) {
    return {
      ok: false, rejection: 'nonContactPitchExceeded',
      detail: msg('detailing.splice.pitchExceeded', {
        offset: round(worstOffset * 1000, 0), limit: round(finalMaxPitch * 1000, 0),
      }),
    };
  }

  // Physical room: every stagger group needs its own lap length, end to end, plus the
  // exclusion at the joint face.
  const exclusion = input.jointExclusion ?? 0;
  const needed = exclusion + lapLength * groups;
  if (needed > input.availableLength + 1e-9) {
    return {
      ok: false, rejection: 'insufficientLength',
      detail: msg('detailing.splice.tooShort', {
        needed: round(needed, 3), available: round(input.availableLength, 3),
        groups, lap: round(lapLength, 3),
      }),
    };
  }

  // Stagger the groups along the member: group k starts one lap further in.
  const pairs: SplicePair[] = paired.map((p, i) => {
    const group = groups === 1 ? 0 : i % groups;
    const start = exclusion + group * lapLength;
    return {
      ...p,
      overlapFrom: start,
      overlapTo: start + lapLength,
      group,
    };
  });

  const allContact = pairs.every((p) => p.offset <= d + 1e-9);
  const kind: TransitionKind = allContact && worstOffset < 1e-9 && groups === 1
    && input.from.length === input.to.length
    && input.from.every((f, i) => Math.abs(f - [...input.to].sort((a, b) => a - b)[i]) < 1e-9)
    ? 'continuous'
    : allContact ? 'contactLap' : 'nonContactLap';

  const spacing = minClearSpacingInLayer(input.edition, {
    barDiameterMm: input.diameterMm, maxAggregateSizeMm: input.maxAggregateSizeMm,
  });

  return {
    ok: true,
    schedule: {
      kind, spliceClass, lapLength, pairs, groups,
      maxFractionAtSection: fractionAtSection,
      refs: [
        ...classRefs,
        clause('cirsoc-201', input.edition, '25.5.1.2',
          'empalmes por yuxtaposición en contacto'),
        clause('cirsoc-201', input.edition, '25.5.1.3',
          'separación transversal de empalmes sin contacto'),
        ...spacing.refs,
        ...input.development.refs,
      ],
      derivation: msg(
        kind === 'continuous'
          ? 'detailing.splice.continuous'
          : kind === 'contactLap'
            ? 'detailing.splice.contact'
            : 'detailing.splice.nonContact',
        {
          spliceClass, lap: round(lapLength * 1000, 0), groups,
          fraction: round(fractionAtSection * 100, 0),
          offset: round(worstOffset * 1000, 0),
        },
      ),
    },
  };
}

/**
 * Do these two collinear layouts admit ANY legal transition?
 *
 * This is the question arc consistency must ask. The previous rule asked whether the two
 * layouts were identical or fully separated, which is neither of the code's two options and
 * removed candidates that had a perfectly ordinary lap available.
 */
export function transitionExists(
  from: readonly number[], to: readonly number[],
  diameterMm: number, development: DevelopmentResult,
  opts: { areaRatio?: number; availableLength?: number; edition?: RegulationEdition;
    maxAggregateSizeMm?: number } = {},
): boolean {
  // Try the cheapest schedule first: everything at one station. If the length is short,
  // fewer groups need less room, so one group is also the most likely to fit.
  const attempt = planSplice({
    from, to, diameterMm, development,
    areaRatio: opts.areaRatio ?? 1.0,
    groups: 1,
    availableLength: opts.availableLength ?? Number.POSITIVE_INFINITY,
    edition: opts.edition ?? '2025',
    maxAggregateSizeMm: opts.maxAggregateSizeMm ?? 19,
  });
  return attempt.ok;
}
