/**
 * Batten geometry for a built-up member — what §E.6 determines, and what it leaves open.
 *
 * ── The difference from `section/battens.ts` ────────────────────────
 *
 * That module answers about a SECTION: which §E.6 group an arrangement belongs to, and the rules
 * that follow. It reports the spacing as absent, and correctly — a section has no length, so
 * `a = L/n` has no value there.
 *
 * A MEMBER does have a length. So this module produces the thing the section could not: the
 * actual positions, along the actual member, for the actual number of battens the code requires.
 * Everything below is a consequence of the length plus a rule that was quoted, not chosen.
 *
 * ── What §E.6 determines, and what it does not ──────────────────────
 *
 * **Determined**, and therefore produced here:
 *
 *   · «Se colocarán presillas intermedias para dividir la longitud de la pieza, como mínimo en
 *     TRES tramos» — §E.6.3.2(b)(2). So `n ≥ 3` and the intermediate count is `n − 1`.
 *   · «Las presillas intermedias serán iguales y estarán uniformemente espaciadas» — same
 *     clause. So `a = L / n`, and every intermediate batten is the same.
 *   · «En los extremos de la barra armada se dispondrán presillas lo más próximas posibles a
 *     dichos extremos» — §E.6.3.2(b)(1). Two more, at the ends.
 *   · «Cuando se dispongan planos paralelos de presillas, las presillas de cada plano se
 *     colocarán enfrentadas» — §E.6.3.2(b)(3). The planes share one set of stations.
 *   · The chord is checked over `a` with `k = 1` — §E.6.3.1(b)(1).
 *
 * **Not determined**, and therefore never produced: the batten's own thickness, width and depth.
 * §E.6 names no dimension of a batten anywhere. The only property it gives is `Ip`, and only
 * inside the stiffness condition `np·Ip/h ≥ 10·I1/a` (E.6.19); the sizing is deferred to Chapter
 * F for the plate and Chapter J for its connections.
 *
 * So this returns POSITIONS and a `GEOMETRY_UNAVAILABLE` for the plate itself. Drawing a batten
 * of invented thickness at a correct position would be the fiction the brief forbids, dressed in
 * a right answer.
 */

import type { BuiltUpArrangement } from '../section/profile-spec';
import { builtUpGroup } from '../section/battens';

export interface BattenStation {
  /** Distance from the member's I end, metres. */
  atM: number;
  /** Why there is a batten here. */
  kind: 'end' | 'intermediate';
  /** The clause that puts it there. */
  clause: string;
}

/** The plate dimensions §E.6 does not give. */
export interface BattenPlateGap {
  state: 'GEOMETRY_UNAVAILABLE';
  missingKeys: readonly string[];
  /** The condition the missing dimension must satisfy — E.6.19. */
  conditionKey: string;
  conditionClause: string;
}

export interface BattenLayout {
  /** Stations along the member, I end to J end. */
  stations: readonly BattenStation[];
  /** Segments the member is divided into. */
  segments: number;
  /** Uniform spacing `a`, metres — §E.6.3.2(b)(2). */
  spacingM: number;
  /**
   * The chord's unbraced length for its own check, metres.
   *
   * Equal to `a`, with `k = 1` — §E.6.3.1(b)(1). Carried explicitly because it is the one
   * consequence of the batten layout that changes a MEMBER check, and leaving a consumer to
   * infer «unbraced length = spacing» is how the two drift apart.
   */
  chordUnbracedLengthM: number;
  /** Batten planes, `np`. Facing each other across the planes — §E.6.3.2(b)(3). */
  planes: number;
  /** Distance between chord axes, metres. Null when the arrangement does not give one. */
  chordSeparationM: number | null;
  plate: BattenPlateGap;
}

export interface BattenUnavailable {
  state: 'UNAVAILABLE';
  missingKeys: readonly string[];
}

export type BattenResult = { state: 'available'; layout: BattenLayout } | BattenUnavailable;

export interface BattenInput {
  arrangement: BuiltUpArrangement;
  /** Gap between the chords, mm. Zero means continuous contact — a different §E.6 group. */
  gapMm: number;
  /** Member length, metres. The input a section does not have. */
  lengthM?: number;
  /**
   * Segments to divide the member into. Three is the code's minimum, and it is the default only
   * because the code states it — not because it is a plausible number.
   */
  segments?: number;
  /** Overall depth of one chord, mm, for the chord separation. */
  chordDepthMm?: number;
}

/**
 * The batten layout for a member, or the reason there is none.
 *
 * A segment count below three is refused rather than clamped: silently raising it would produce
 * a layout the user did not ask for and would still be told was theirs.
 */
export function battenLayout(input: BattenInput): BattenResult {
  const { arrangement, gapMm, lengthM, segments = 3, chordDepthMm } = input;

  /*
   * A negative gap is refused before it is classified, and this is the reason the check lives
   * here rather than being left to `builtUpGroup`.
   *
   * That function reads `gapMm <= 0` as Group I — chords in continuous contact — which is right
   * for zero and quietly wrong for −5: it would answer «they touch» for a number that describes
   * no arrangement at all, and the caller would never learn the input was nonsense. Zero and
   * negative look alike to a `<= 0`, and they are opposites here: one is a real configuration,
   * the other is a typo.
   */
  if (!Number.isFinite(gapMm) || gapMm < 0) {
    return { state: 'UNAVAILABLE', missingKeys: ['batten.gapNegative'] };
  }

  const group = builtUpGroup(arrangement, gapMm);

  if (group !== 'V') {
    /*
     * Only Group V is «cordones unidos por presillas». Group I chords touch and are joined by
     * bolts or welds; a crossed pair is none of the five figures §E.6.1 draws. Producing batten
     * positions for either would be placing a component the clause never put there.
     */
    return { state: 'UNAVAILABLE', missingKeys: ['batten.notGroupV'] };
  }
  if (!(lengthM && lengthM > 0)) {
    return { state: 'UNAVAILABLE', missingKeys: ['batten.missing.memberLength'] };
  }
  if (!Number.isInteger(segments) || segments < 3) {
    return { state: 'UNAVAILABLE', missingKeys: ['batten.segmentsBelowMinimum'] };
  }

  const a = lengthM / segments;
  const stations: BattenStation[] = [
    // «lo más próximas posibles a dichos extremos» — at the ends, which is 0 and L.
    { atM: 0, kind: 'end', clause: 'E.6.3.2(b)(1)' },
  ];
  for (let i = 1; i < segments; i++) {
    stations.push({ atM: i * a, kind: 'intermediate', clause: 'E.6.3.2(b)(2)' });
  }
  stations.push({ atM: lengthM, kind: 'end', clause: 'E.6.3.2(b)(1)' });

  const parts = arrangement === 'quadBack' || arrangement === 'quadBox' ? 4 : 2;
  return {
    state: 'available',
    layout: {
      stations,
      segments,
      spacingM: a,
      chordUnbracedLengthM: a,
      planes: parts === 4 ? 4 : 2,
      /*
       * The distance between chord axes, `h` in E.6.19. Derived from the gap and the chord
       * depth when both are known; null otherwise, because guessing it would put a number into
       * the stiffness condition that nobody supplied.
       */
      chordSeparationM: chordDepthMm && chordDepthMm > 0
        ? (chordDepthMm + gapMm) / 1000
        : null,
      plate: {
        state: 'GEOMETRY_UNAVAILABLE',
        missingKeys: ['battens.missing.thickness', 'battens.missing.width', 'battens.missing.depth'],
        conditionKey: 'battens.condition.stiffness',
        conditionClause: 'E.6.19',
      },
    },
  };
}

/**
 * Whether the stiffness condition of E.6.19 can be evaluated: `np·Ip/h ≥ 10·I1/a`.
 *
 * Reported rather than computed, because `Ip` — the batten's own in-plane inertia — depends on
 * the plate dimensions the code does not give. The moment a project supplies them this becomes
 * arithmetic, and the shape of the answer does not have to change.
 */
export function stiffnessConditionEvaluable(layout: BattenLayout, ipCm4?: number): boolean {
  return ipCm4 !== undefined && ipCm4 > 0 && layout.chordSeparationM !== null;
}
