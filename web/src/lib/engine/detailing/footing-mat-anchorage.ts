/**
 * Anchorage of the physical bottom mat — §13.2.8 into Chapter 25.
 *
 * ── What this can claim that the design could not ──────────────
 *
 * `footing-flexure.ts` reports `developmentLength` for the selected bar and makes no anchorage
 * claim, and its header says exactly why: "whether the physical bar ACHIEVES it — the available
 * length from the §13.2.7.1 critical section, hooks, the §13.2.8.4 cases — is a question about
 * geometry that does not exist yet". The geometry now exists, so the question is answerable.
 *
 * It is answered from the GENERATED endpoints, not from the design's dimensions. Those two
 * agree today — a straight mat bar ends one cover in from the formwork — and measuring the bar
 * that exists is what makes this a verification rather than a restatement. If a future change
 * shortens a bar, this reports the shortfall instead of continuing to describe the footing.
 *
 * ── The clause chain ───────────────────────────────────────────
 *
 * §13.2.8.1  anchorage of footing reinforcement shall comply with Chapter 25.
 * §13.2.8.3  the critical sections for anchorage are at the §13.2.7.1 locations — for M_u,
 *            the FACE of the column or pedestal. That is the section available length is
 *            measured from, and it is why the measurement is not "half the footing".
 * §25.4.2.1  l_d shall not be less than 300 mm.
 * §25.4.2.3  Table 25.4.2.3, through `deriveDevelopment` — the project's one anchorage
 *            authority. No length is computed here.
 *
 * ── Which row of Table 25.4.2.3, and why the longer one ────────
 *
 * The table has a favourable row, conditioned on clear spacing and cover, and an "other cases"
 * row about 50 % longer. `deriveDevelopment` takes `favourableSpacing` as a REQUIRED boolean
 * and its own doc says why: "assuming the favourable row silently shortens every anchorage in
 * the model by a third, and the caller is the only party that knows the bar layout".
 *
 * This caller knows the layout — and it still passes `false`. The condition attached to the
 * favourable row is not implemented anywhere in this repository, in any edition, for any
 * member: nothing here encodes what clear spacing and what cover satisfy it. Selecting that
 * row would mean writing a criterion from memory and attributing it to the enacted table,
 * which is the one thing this module must not do, and it would SHORTEN real steel. So the
 * conservative row is taken, every caller in the project takes the same one, and the measured
 * clear spacing and clear cover are reported beside the result so a reviewer evaluating the
 * favourable row has the two numbers it turns on without re-deriving them.
 *
 * Being wrong in this direction over-states l_d and can only report a shortfall that the code
 * might not require. That is a footing the engineer will look at; the opposite error is a
 * footing nobody looks at.
 *
 * ── What is NOT done ───────────────────────────────────────────
 *
 * No hook is invented. §25.4.3.1 hooked development exists in `anchorage.ts` and the dowel
 * generator uses it, because a dowel is a bar whose bend is part of its design. A mat bar that
 * does not develop straight is a footing that is too small or a diameter that is too large, and
 * turning its ends up would change a design nobody approved. The shortfall is reported and
 * issuance is blocked.
 *
 * Pure: no store, no runes. Lengths m.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../../codes/regulation';
import { msg, type EngineMessage } from '../../codes/message';
import { deriveDevelopment } from '../../codes/cirsoc201/anchorage';
import { columnOffsetFromCentroid } from './footing-actions';
import type { FootingDirectionDesign, FootingMatAxis, FootingMatDesign }
  from './footing-flexure';
import type { FootingMatGeometry, FootingMatPlacement } from './footing-mat-geometry';

const R_ANCHORAGE = clause('cirsoc-201', '2025', '13.2.8.1',
  'el anclaje de la armadura debe cumplir con el Capítulo 25');
const R_CRITICAL_ANCHOR = clause('cirsoc-201', '2025', '13.2.8.3',
  'secciones críticas para el anclaje en las ubicaciones del artículo 13.2.7.1');

export type FootingAnchorageOutcome = 'VERIFIED' | 'FAILED' | 'NOT_EVALUATED';

/** One side of one direction: a column face and the bar end beyond it. */
export interface FootingAnchorageSide {
  side: 'low' | 'high';
  /** Distance from the §13.2.7.1 critical section to the physical bar end, m. */
  available: number;
  /** Position of that column face from the centroid, m. */
  faceOffset: number;
  /** Position of the bar end from the centroid, m. */
  endOffset: number;
}

export interface FootingDirectionAnchorage {
  axis: FootingMatAxis;
  outcome: FootingAnchorageOutcome;
  diameterMm: number;
  /** l_d required, m — from `deriveDevelopment`, never a second formula. */
  requiredLd: number;
  /** Which Table 25.4.2.3 row was taken, and the value before the §25.4.2.1(b) floor. */
  tableRow: 'favourable' | 'other';
  computedLd: number;
  governedByMinimum: boolean;
  /** Both sides, always — the shorter one is not always the one a reader expects. */
  sides: FootingAnchorageSide[];
  /** The side with the least available length; it is what the outcome is decided on. */
  controllingSide: 'low' | 'high' | null;
  /** Available length on that side, m. */
  available: number;
  /** `available − requiredLd`, m. Negative is the shortfall. */
  margin: number;
  /**
   * The two quantities the favourable row of Table 25.4.2.3 turns on, measured.
   *
   * Reported and NOT acted on. See this module's header: the row's condition is not encoded
   * anywhere in this repository, so these are here for the reviewer who evaluates it, not as
   * an input to a decision this code makes.
   */
  measuredClearSpacing: number;
  measuredClearCover: number;
  failures: EngineMessage[];
  steps: string[];
  refs: ClauseRef[];
}

export interface FootingMatAnchorage {
  outcome: FootingAnchorageOutcome;
  x: FootingDirectionAnchorage | null;
  y: FootingDirectionAnchorage | null;
  failures: EngineMessage[];
  refs: ClauseRef[];
}

export interface FootingMatAnchorageInput {
  place: FootingMatPlacement;
  design: FootingMatDesign;
  geometry: FootingMatGeometry;
  /** Column plan dimensions, m — `columnB` along B, `columnH` along L. */
  columnB: number;
  columnH: number;
  /** Plan offset of the footing CENTROID from the node, m, local axes. */
  eccentricityB: number;
  eccentricityL: number;
  fc: number;
  fy: number;
  edition: RegulationEdition;
}

function checkDirection(
  input: FootingMatAnchorageInput, dir: FootingDirectionDesign,
): FootingDirectionAnchorage {
  const { place } = input;
  const alongX = dir.axis === 'X';
  const span = alongX ? place.B : place.L;
  const columnDimension = alongX ? input.columnB : input.columnH;
  const columnOffset = columnOffsetFromCentroid(
    alongX ? input.eccentricityB : input.eccentricityL);

  /**
   * Available length, from the GENERATED endpoint.
   *
   * The bar ends are read off the provenance rather than recomputed as `span/2 − cover`. They
   * are the same number for a straight mat bar, and reading the bar is what makes this a
   * measurement: a check that recomputed the endpoint would agree with a generator that had
   * placed the bar somewhere else.
   */
  const own = input.geometry.provenance.filter((p) => p.axis === dir.axis);
  const ends = own.flatMap((p) => (alongX
    ? [p.start.x - place.centroid.x, p.end.x - place.centroid.x]
    : [p.start.y - place.centroid.y, p.end.y - place.centroid.y]));
  const endLow = ends.length > 0 ? Math.max(...ends.filter((e) => e < 0)) : -span / 2;
  const endHigh = ends.length > 0 ? Math.min(...ends.filter((e) => e > 0)) : span / 2;

  const sides: FootingAnchorageSide[] = [
    {
      side: 'low',
      faceOffset: columnOffset - columnDimension / 2,
      endOffset: endLow,
      available: (columnOffset - columnDimension / 2) - endLow,
    },
    {
      side: 'high',
      faceOffset: columnOffset + columnDimension / 2,
      endOffset: endHigh,
      available: endHigh - (columnOffset + columnDimension / 2),
    },
  ];

  const development = deriveDevelopment({
    diameterMm: dir.diameterMm,
    fy: input.fy, fc: input.fc,
    // See the header. The favourable row's condition is not implemented in this repository, so
    // the longer row is the only one that can be cited honestly.
    favourableSpacing: false,
    edition: input.edition,
    // ψt = 1,0: a bottom mat is not the horizontal TOP reinforcement §25.4.2.5 penalises. It
    // is stated rather than defaulted because the factor is 1,3 for the other case and a
    // silent default is how the wrong one gets applied.
    psiT: 1.0,
  });

  const controlling = sides.reduce(
    (worst, s) => (s.available < worst.available ? s : worst), sides[0]);
  const margin = controlling.available - development.ldM;
  const failures: EngineMessage[] = [];
  if (margin < 0) {
    failures.push(msg('footing.anchorage.insufficient', {
      axis: dir.axis, diameter: dir.diameterMm,
      required: +(development.ldM * 1000).toFixed(0),
      available: +(controlling.available * 1000).toFixed(0),
      side: controlling.side,
      short: +(-margin * 1000).toFixed(0),
    }));
  }

  const measuredClearSpacing = dir.regions.length > 0
    ? Math.min(...dir.regions.map((r) => r.spacingClear))
    : 0;
  // The least clear cover the bar has anywhere: the soffit, the two plan faces it is
  // distributed between, and its own ends. All measured to the SURFACE.
  const measuredClearCover = Math.min(dir.clearCoverToSoffit, place.cover);

  return {
    axis: dir.axis,
    outcome: margin < 0 ? 'FAILED' : 'VERIFIED',
    diameterMm: dir.diameterMm,
    requiredLd: development.ldM,
    tableRow: development.tableRow,
    computedLd: development.computedM,
    governedByMinimum: development.governedByMinimum,
    sides,
    controllingSide: controlling.side,
    available: controlling.available,
    margin,
    measuredClearSpacing,
    measuredClearCover,
    failures,
    steps: [
      `Anclaje ${dir.axis} (13.2.8.1 → Capítulo 25): ld = ` +
      `${(development.ldM * 1000).toFixed(0)} mm para Ø${dir.diameterMm} ` +
      `(fila «${development.tableRow === 'other' ? 'otros casos' : 'favorable'}» de la Tabla ` +
      `25.4.2.3, valor calculado ${(development.computedM * 1000).toFixed(0)} mm` +
      `${development.governedByMinimum ? ', gobierna el mínimo de 300 mm de 25.4.2.1(b)' : ''}).`,
      `Longitud disponible desde la cara de la columna (sección crítica de 13.2.8.3 → ` +
      `13.2.7.1) hasta el extremo FÍSICO de la barra: lado bajo ` +
      `${(sides[0].available * 1000).toFixed(0)} mm, lado alto ` +
      `${(sides[1].available * 1000).toFixed(0)} mm. Gobierna el lado ` +
      `${controlling.side} con ${(controlling.available * 1000).toFixed(0)} mm ` +
      `(margen ${(margin * 1000).toFixed(0)} mm).`,
      `Se adopta la fila conservadora de la Tabla 25.4.2.3 porque la condición de ` +
      'separación y recubrimiento de la fila favorable no está implementada en este ' +
      `proyecto. Para evaluarla: separación libre mínima medida ` +
      `${(measuredClearSpacing * 1000).toFixed(1)} mm y recubrimiento libre mínimo medido ` +
      `${(measuredClearCover * 1000).toFixed(1)} mm, contra Ø${dir.diameterMm}. ` +
      'No se inventa gancho: una barra de parrilla que no ancla recta es una zapata ' +
      'insuficiente, no un remate.',
    ],
    refs: [R_ANCHORAGE, R_CRITICAL_ANCHOR, ...development.refs],
  };
}

/**
 * Verify the development of the physical mat, per direction and per side.
 *
 * NOT_EVALUATED when there is no physical mat to measure — which is a different statement from
 * FAILED and must not be collapsed into it. A footing whose mat could not be modelled has an
 * unverified anchorage; a footing whose bars are too short has a verified shortfall.
 */
export function verifyFootingMatAnchorage(
  input: FootingMatAnchorageInput,
): FootingMatAnchorage {
  if (input.geometry.status !== 'MODELED') {
    return {
      outcome: 'NOT_EVALUATED', x: null, y: null,
      failures: [msg('footing.anchorage.noGeometry', { status: input.geometry.status })],
      refs: [R_ANCHORAGE],
    };
  }
  const x = checkDirection(input, input.design.x);
  const y = checkDirection(input, input.design.y);
  const failures = [...x.failures, ...y.failures];
  return {
    outcome: failures.length > 0 ? 'FAILED' : 'VERIFIED',
    x, y, failures,
    refs: [R_ANCHORAGE, R_CRITICAL_ANCHOR],
  };
}
