/**
 * Battens and connectors on a built-up member — CIRSOC 301 §E.6.
 *
 * ── Why this module exists, and what it refuses to draw ─────────────
 *
 * `built-up-section.ts` composes the SECTION: how many profiles, where they sit, and what the
 * assembly's A, I and J are. It says nothing about what holds the parts together, and the
 * comment about a "battened box column" in its header is the only mention anywhere in this
 * codebase. So a compound section could be chosen, composed, drawn and analysed with nothing
 * recorded about the batten plates that make it act as one member.
 *
 * The brief's instruction is the right one and this module follows it literally: **audit the
 * shipped code first, model what it defines with provenance, and declare the rest unavailable
 * rather than inventing it.** The audit found more than expected.
 *
 * ── What CIRSOC 301-2018 §E.6 actually defines ─────────────────────
 *
 * §E.6.1 classifies built-up members into five groups, and the groups are what decide which
 * rules apply:
 *
 *   · **Grupo I** — chords in continuous contact, joined discontinuously by bolts or welds.
 *   · **Grupo II** — chords joined by thin discontinuous fillers (`forros`).
 *   · **Grupo III** — continuous perforated cover plates.
 *   · **Grupo IV** — flat lacing (`celosías`).
 *   · **Grupo V** — «Los cordones están unidos por presillas (placas de unión) a intervalos
 *     regulares.» This is the battened column.
 *
 * And it gives rules that are genuinely computable:
 *
 *   · **Grupo I, §E.6.2.2(a)(3)**: «La distancia a entre uniones será tal que la relación de
 *     esbeltez a/ri de cada uno de los elementos resultantes entre uniones, sea menor o igual
 *     que 3/4 de la relación de esbeltez gobernante de la barra armada», with `ri` the chord's
 *     MINIMUM radius of gyration. That is a maximum spacing, and it is arithmetic.
 *   · **Grupo I, §E.6.2.2(a)(5)**: where a component is an external plate, `a ≤ 335·t/√Fy` or
 *     `a ≤ 30 cm` in line; `a ≤ 500·t/√Fy` or `a ≤ 45 cm` staggered. Also arithmetic.
 *   · **Grupo II, §E.6.2.2(b)(2)**: «Se dispondrán como mínimo dos forros intermedios
 *     igualmente distanciados entre puntos fijos para desplazamiento lateral.»
 *   · **Grupo V, §E.6.3.2(b)(2)**: «Se colocarán presillas intermedias para dividir la longitud
 *     de la pieza, como mínimo en tres tramos», and «Las presillas intermedias serán iguales y
 *     estarán uniformemente espaciadas a lo largo de la pieza.»
 *   · **Grupo V, §E.6.3.2(b)(1)**: battens at the ends, as close to them as possible.
 *   · **Grupo V, §E.6.3.2(b)(3)**: «Cuando se dispongan planos paralelos de presillas, las
 *     presillas de cada plano se colocarán enfrentadas.»
 *
 * ── What it does NOT define, and therefore what this module will not produce ──
 *
 * **No batten dimension appears anywhere.** Not a thickness, not a width, not a depth. The only
 * property of a batten the clause names is `Ip`, «el momento de inercia de una presilla en su
 * plano», and it appears exclusively inside a CONDITION — E.6.19, `np·Ip/h ≥ 10·I1/a` — never
 * as something to be computed from a size. Sizing is deferred: «La verificación de las presillas
 * se realizará de acuerdo con el Capítulo F y el dimensionamiento de las uniones se realizará
 * según el Capítulo J.»
 *
 * So a batten's geometry is `GEOMETRY_UNAVAILABLE`, and the condition it must satisfy is quoted
 * instead. Drawing a plate of invented thickness would be exactly the fiction the brief forbids.
 *
 * ── The other thing missing, and it is not the code's fault ────────
 *
 * Spacing needs the MEMBER LENGTH, and a section does not have one. `a = L/n` is only an answer
 * once the section is assigned to a member. This module therefore takes the length as an
 * optional input and reports the spacing rule without a number when it is absent — which is the
 * state the section selector is always in.
 */

import type { BuiltUpArrangement } from './profile-spec';

/** The five groups of §E.6.1. `none` when the section is a single profile. */
export type BuiltUpGroup = 'none' | 'I' | 'II' | 'III' | 'IV' | 'V';

/** A quantity this module produces, with the clause it came from. */
export interface BattenQuantity {
  value: number | null;
  unit: 'm' | 'count' | 'cm';
  /** Dotted CIRSOC clause, e.g. `E.6.3.2(b)(2)`. Never absent. */
  clause: string;
  /** i18n key explaining the value, or explaining its absence. */
  noteKey: string;
}

/** Why a batten dimension is not given. There is exactly one reason and it is normative. */
export interface BattenGeometryGap {
  state: 'GEOMETRY_UNAVAILABLE';
  /** What is missing, as i18n keys. */
  missingKeys: readonly string[];
  /** The condition the missing dimension must satisfy, quoted from the code. */
  conditionKey: string;
  conditionClause: string;
}

export interface BattenPlan {
  group: BuiltUpGroup;
  /** True when §E.6 has anything to say about this arrangement at all. */
  inScope: boolean;
  /** Minimum number of segments the member must be divided into. */
  minSegments: BattenQuantity;
  /** Number of intermediate connectors, when the segment count is known. */
  intermediateCount: BattenQuantity;
  /** Uniform spacing `a` between connector axes, metres. Null without a member length. */
  spacing: BattenQuantity;
  /**
   * Maximum spacing from the slenderness rule, metres. Null without the chord's `ri` and the
   * assembly's governing slenderness.
   */
  maxSpacingFromSlenderness: BattenQuantity;
  /** Number of batten planes, `np`. */
  planes: BattenQuantity;
  /** The dimensions the code does not give. */
  geometry: BattenGeometryGap;
  /** Everything a surface must say about this plan, as i18n keys. */
  ruleKeys: readonly string[];
}

export interface BattenInput {
  arrangement: BuiltUpArrangement;
  /** Gap between the chords, mm. Zero means continuous contact, which changes the group. */
  gapMm: number;
  /**
   * Member length, metres. Absent in the section selector, present once a section is on a
   * member — which is why spacing is reported without a number in the first case rather than
   * guessed.
   */
  lengthM?: number;
  /** Chord minimum radius of gyration, metres. From the single profile. */
  chordRiM?: number;
  /** Governing slenderness of the built-up member, dimensionless. */
  governingSlenderness?: number;
}

/** How many profiles an arrangement holds. Kept local so this module imports no placement table. */
function partsIn(a: BuiltUpArrangement): 1 | 2 | 4 {
  if (a === 'single') return 1;
  return a === 'quadBack' || a === 'quadBox' ? 4 : 2;
}

const q = (
  value: number | null, unit: BattenQuantity['unit'], clause: string, noteKey: string,
): BattenQuantity => ({ value, unit, clause, noteKey });

/**
 * Which §E.6 group an arrangement belongs to.
 *
 * Read off the arrangement's own geometry rather than asked of the user, because the groups are
 * defined by HOW the chords are joined and the arrangement already says that: parts touching is
 * Group I, parts separated by a gap need something spanning it, which is a batten.
 *
 * `doubleX` is deliberately `none`: two profiles crossed at ninety degrees is not one of the
 * five figures, and calling it Group V would apply a batten rule to a shape the clause never
 * drew.
 */
export function builtUpGroup(arrangement: BuiltUpArrangement, gapMm: number): BuiltUpGroup {
  if (arrangement === 'single') return 'none';
  if (arrangement === 'doubleX') return 'none';
  /*
   * Zero gap means the chords touch — «en contacto continuo», the words §E.6.2.2(a) and the
   * `ki = 0,50` note in §E.6.2.1 both use. That is Group I, and its rule is a maximum spacing
   * rather than a minimum count.
   */
  if (gapMm <= 0) return 'I';
  return 'V';
}

/**
 * The batten or connector plan for one built-up section.
 *
 * Every number carries its clause. Everything the code does not define comes back as
 * `GEOMETRY_UNAVAILABLE` with the condition it would have to satisfy, never as a dimension.
 */
export function battenPlan(input: BattenInput): BattenPlan {
  return planFor(builtUpGroup(input.arrangement, input.gapMm), input);
}

function planFor(group: BuiltUpGroup, input: BattenInput): BattenPlan {
  const { lengthM, chordRiM, governingSlenderness } = input;

  const geometry: BattenGeometryGap = {
    state: 'GEOMETRY_UNAVAILABLE',
    /*
     * Thickness, width and depth, all three. Not one of them appears in §E.6 — the only batten
     * property the clause names is `Ip`, and only inside E.6.19's inequality.
     */
    missingKeys: [
      'battens.missing.thickness',
      'battens.missing.width',
      'battens.missing.depth',
    ],
    conditionKey: 'battens.condition.stiffness',
    conditionClause: 'E.6.19',
  };

  if (group === 'none') {
    return {
      group, inScope: false,
      minSegments: q(null, 'count', 'E.6.1', 'battens.notBuiltUp'),
      intermediateCount: q(null, 'count', 'E.6.1', 'battens.notBuiltUp'),
      spacing: q(null, 'm', 'E.6.1', 'battens.notBuiltUp'),
      maxSpacingFromSlenderness: q(null, 'm', 'E.6.1', 'battens.notBuiltUp'),
      planes: q(null, 'count', 'E.6.1', 'battens.notBuiltUp'),
      geometry,
      ruleKeys: [],
    };
  }

  /*
   * The minimum segment count, and it differs by group because the code says two different
   * things: Group V divides the member into at least THREE segments, Group II places at least
   * TWO intermediate fillers. Collapsing them to one number would misquote one of the two.
   */
  const minSeg = group === 'V' ? 3 : group === 'II' ? 3 : null;
  const minSegClause = group === 'V' ? 'E.6.3.2(b)(2)' : 'E.6.2.2(b)(2)';

  /*
   * Maximum spacing from the slenderness rule — Group I's, and it is real arithmetic:
   * `a/ri ≤ (3/4)·λ` gives `a ≤ 0,75·λ·ri`.
   */
  const maxA = chordRiM != null && chordRiM > 0 && governingSlenderness != null && governingSlenderness > 0
    ? 0.75 * governingSlenderness * chordRiM
    : null;

  /*
   * The uniform spacing. Requires the member length, which a SECTION does not have — a section
   * is a cross-section and can sit on members of any length. Reported as null with the rule
   * named, rather than as `L/3` on an assumed length.
   */
  const a = lengthM != null && lengthM > 0 && minSeg != null ? lengthM / minSeg : null;

  const ruleKeys = group === 'V'
    ? [
        'battens.rule.endsAsCloseAsPossible',   // E.6.3.2(b)(1)
        'battens.rule.minThreeSegments',        // E.6.3.2(b)(2)
        'battens.rule.equalAndUniform',         // E.6.3.2(b)(2)
        'battens.rule.facedAcrossPlanes',       // E.6.3.2(b)(3)
        'battens.rule.chordUnbracedLengthIsA',  // E.6.3.1(b)(1)
      ]
    : [
        'battens.rule.slendernessThreeQuarters', // E.6.2.2(a)(3)
        'battens.rule.idealShear',               // E.6.2.2(a)(2)
      ];

  return {
    group,
    inScope: true,
    minSegments: q(minSeg, 'count', minSegClause,
      minSeg != null ? 'battens.minSegments.stated' : 'battens.minSegments.notStated'),
    intermediateCount: q(minSeg != null ? minSeg - 1 : null, 'count', minSegClause,
      'battens.intermediate.derived'),
    spacing: q(a, 'm', minSegClause,
      a != null ? 'battens.spacing.uniform' : 'battens.spacing.needsMemberLength'),
    maxSpacingFromSlenderness: q(maxA, 'm', 'E.6.2.2(a)(3)',
      maxA != null ? 'battens.maxSpacing.fromSlenderness' : 'battens.maxSpacing.needsChordRi'),
    /*
     * `np`, the number of batten planes.
     *
     * Two for a two-chord assembly — one plane on each free face, which is what Figura E.6.7
     * draws — and four for a four-chord one, two per direction. Derived from the arrangement's
     * own part count rather than asked for, since that is the fact it encodes.
     */
    planes: q(partsIn(input.arrangement) === 4 ? 4 : 2, 'count', 'E.6.3.1(b)',
      'battens.planes.fromArrangement'),
    geometry,
    ruleKeys,
  };
}
