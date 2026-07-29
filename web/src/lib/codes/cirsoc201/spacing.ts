/**
 * Minimum clear spacing between reinforcing bars — CIRSOC 201, both editions.
 *
 * One authority for a rule that was previously written out by hand in four places
 * (`station-design-forces.ts` twice, `candidate-enumerate-beam.ts`, and the adapter's
 * `detailingLimits`). Having four copies is how the column rule drifted: it read
 * `max(d_b, 25 mm, 40 mm)`, which silently drops the `1.5 d_b` term and under-reports the
 * requirement for Ø32 and larger, where 1.5 d_b = 48 mm governs over the 40 mm floor.
 *
 * ── The rules, verbatim ────────────────────────────────────────
 *
 * CIRSOC 201-2025 §25.2.1 — non-prestressed parallel bars in one horizontal layer:
 *   clear distance ≥ max(25 mm, d_b, (4/3)·d_agg)
 *
 * CIRSOC 201-2025 §25.2.2 — two or more layers: bars in upper layers directly above
 *   those below, clear distance between layers ≥ 25 mm.
 *
 * CIRSOC 201-2025 §25.2.3 — longitudinal bars in columns, pedestals, struts and wall
 *   boundary elements:
 *   clear distance ≥ max(40 mm, 1.5·d_b, (4/3)·d_agg)
 *
 * CIRSOC 201-2005 §7.6.1 / §7.6.3 — the corresponding 2005 rules, WITHOUT the aggregate
 *   term in the spacing expression itself (2005 handled aggregate size separately, in
 *   the concrete-technology requirements, rather than inside the spacing rule):
 *   beams  clear distance ≥ max(25 mm, d_b)
 *   columns clear distance ≥ max(40 mm, 1.5·d_b)
 *
 * The editions are deliberately NOT unified. Under 2005 the aggregate term is absent
 * from the spacing clause, and adding it there would be applying a 2025 rule to a
 * project the user asked to be designed to 2005.
 *
 * All lengths in metres unless the name says `Mm`. Pure: no store, no runes.
 */

import { clause, type ClauseRef, type RegulationEdition } from '../regulation';

export interface SpacingInputs {
  /** Largest bar diameter in the layer, in mm. */
  barDiameterMm: number;
  /**
   * Maximum nominal coarse-aggregate size in mm. Ignored under the 2005 edition, which
   * does not carry the term in its spacing clause.
   */
  maxAggregateSizeMm: number;
}

export interface SpacingRequirement {
  /** Required minimum clear distance, in metres. */
  minClear: number;
  /** Which term produced the governing value — shown in the calculation memo. */
  governedBy: 'absoluteFloor' | 'barDiameter' | 'aggregate';
  refs: ClauseRef[];
  /** The individual terms, in mm, for the memo. Terms absent under the edition are null. */
  terms: { floorMm: number; barTermMm: number; aggregateTermMm: number | null };
}

function resolve(
  floorMm: number,
  barTermMm: number,
  aggregateTermMm: number | null,
  refs: ClauseRef[],
): SpacingRequirement {
  let governedBy: SpacingRequirement['governedBy'] = 'absoluteFloor';
  let best = floorMm;
  if (barTermMm > best) { best = barTermMm; governedBy = 'barDiameter'; }
  if (aggregateTermMm !== null && aggregateTermMm > best) { best = aggregateTermMm; governedBy = 'aggregate'; }
  return {
    minClear: best / 1000,
    governedBy,
    refs,
    terms: { floorMm, barTermMm, aggregateTermMm },
  };
}

/**
 * Minimum clear spacing between parallel bars in one horizontal layer — beams, slabs,
 * and any non-column member.
 */
export function minClearSpacingInLayer(
  edition: RegulationEdition,
  inputs: SpacingInputs,
): SpacingRequirement {
  const db = inputs.barDiameterMm;
  if (edition === '2005') {
    return resolve(25, db, null, [clause('cirsoc-201', '2005', '7.6.1',
      'separación libre mínima entre barras paralelas')]);
  }
  return resolve(25, db, (4 / 3) * inputs.maxAggregateSizeMm, [
    clause('cirsoc-201', '2025', '25.2.1', 'separación libre mínima entre barras paralelas'),
  ]);
}

/**
 * Minimum clear spacing between longitudinal bars in columns, pedestals, struts and
 * wall boundary elements.
 */
export function minClearSpacingColumn(
  edition: RegulationEdition,
  inputs: SpacingInputs,
): SpacingRequirement {
  const db = inputs.barDiameterMm;
  if (edition === '2005') {
    return resolve(40, 1.5 * db, null, [clause('cirsoc-201', '2005', '7.6.3',
      'separación libre mínima entre barras longitudinales de columnas')]);
  }
  return resolve(40, 1.5 * db, (4 / 3) * inputs.maxAggregateSizeMm, [
    clause('cirsoc-201', '2025', '25.2.3',
      'separación libre mínima entre barras longitudinales de columnas'),
  ]);
}

/** Minimum clear distance between horizontal layers. Same in both editions: 25 mm. */
export function minClearBetweenLayers(edition: RegulationEdition): SpacingRequirement {
  const ref = edition === '2005'
    ? clause('cirsoc-201', '2005', '7.6.2', 'separación libre entre capas')
    : clause('cirsoc-201', '2025', '25.2.2', 'separación libre entre capas');
  return {
    minClear: 0.025,
    governedBy: 'absoluteFloor',
    refs: [ref],
    terms: { floorMm: 25, barTermMm: 0, aggregateTermMm: null },
  };
}

/** Dispatch on member type, so callers do not re-implement the column special case. */
export function minClearSpacingFor(
  edition: RegulationEdition,
  memberType: 'beam' | 'column' | 'wall' | 'slab',
  inputs: SpacingInputs,
): SpacingRequirement {
  return memberType === 'column'
    ? minClearSpacingColumn(edition, inputs)
    : minClearSpacingInLayer(edition, inputs);
}

/**
 * Largest bar count that physically fits in one row.
 *
 * Kept here, next to the spacing rule it depends on, so a change to the rule cannot
 * leave the generator producing candidates the verifier then rejects — the exact class
 * of generator/verifier disagreement that the design engine is built to avoid.
 */
export function barsPerRow(
  availableWidth: number,
  barDiameterMm: number,
  spacing: SpacingRequirement,
  maxBars: number,
): number {
  const barD = barDiameterMm / 1000;
  if (availableWidth <= barD) return 0;
  const gap = spacing.minClear;
  return Math.max(0, Math.min(maxBars, Math.floor((availableWidth + gap) / (barD + gap))));
}
