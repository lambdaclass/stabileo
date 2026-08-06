/**
 * Which reinforcement family a physical bar belongs to, decided from authoritative identity.
 *
 * ── Why this is its own module, and why it refuses ──────────────────
 *
 * RcCadHandoffV1 scoped the transfer cage by OWNERSHIP: the steel owned by the column element
 * the footing references. That was sound while a footing produced only dowels and starter ties.
 * It stopped being sound the moment PR18 made the bottom mat physical, because a footing's bars
 * are attributed to the COLUMN element — its dowels ARE column bars — so twenty mat bars arrived
 * owned by the same element as the cage, with `role: 'longitudinal'`, and landed in the
 * `columnDowel` family. Measured on the canonical fixture: eight real dowels and twenty mat bars
 * described as twenty-eight column dowels.
 *
 * Ownership answers "which member is this steel part of". It cannot answer "what kind of steel is
 * this", and the two questions were being conflated.
 *
 * ── What "authoritative" excludes ───────────────────────────────────
 *
 * Not the bar id. `F1-matX-fw0-3` and `F1-C1:starter:crosstie1:0.3139` are naming conventions;
 * matching them would make the CAD contract depend on a string format no clause fixes and every
 * generator is free to change. Not a localized name either, for the same reason one level up.
 *
 * What the generators actually RECORD:
 *
 *   `layerId`          the mat generator writes `F1:bottom:X` / `F1:bottom:Y` — see
 *                      `footingMatLayerId`. It knows which layer it put the bar in.
 *   `enclosesBarIds`   `buildColumnTieSet` writes the bars inside the closed perimeter for a
 *                      CLOSED STIRRUP, and writes `[]` for a CROSSTIE.
 *   `restrainsBarIds`  the two bars a crosstie engages across the section.
 *   `role`             longitudinal or transverse.
 *
 * So a closed stirrup and a crosstie are distinguishable without reading either id, and so is a
 * mat bar from a dowel. That is the whole taxonomy.
 *
 * ── Refusal is the point, not a side effect ─────────────────────────
 *
 * `classifyCadFamily` returns a REASON rather than a fallback. The alternative — "anything
 * longitudinal is a dowel" — is precisely the rule that produced the twenty-eight-dowel
 * manifest, and widening it to "anything unrecognised passes through" would trade one silent
 * misdescription for another. A bar this cannot name is either new steel the handoff has never
 * carried or a bar whose identity contradicts itself, and both are conditions the exporter must
 * refuse rather than describe.
 *
 * Pure: no store, no runes.
 */

import type { BarPath } from '../codes/cirsoc201/bar-geometry';
import { isFootingMatBar } from '../engine/detailing/footing-mat-geometry';

/**
 * The families RcCadHandoffV2 declares.
 *
 * V1's union is `'columnDowel' | 'starterTie'` and is FROZEN — a V1 document may never carry a
 * value outside it, which is why this union lives here and not there.
 */
export type CadFamilyKindV2 =
  /** Column starter bars crossing the §16.3.4 footing-to-column interface. */
  | 'columnDowel'
  /** Closed perimeter ties confining the starters along their lap above the footing. */
  | 'starterTie'
  /**
   * Single-leg ties engaging two bars across the section — §10.7.6.3 lateral restraint.
   *
   * A separate family from `starterTie`, not a variant of it: it contributes one leg where a
   * closed stirrup contributes two, its two hooks differ from each other, and the count a
   * schedule reports for each is a different quantity. V1 had no crossties to name because the
   * two-face column layout it was written against needed none; the certified per-face layout
   * earns four per set.
   */
  | 'starterCrosstie'
  /** Bottom-mat bars running parallel to B, distributed across L. */
  | 'footingBottomMatX'
  /** Bottom-mat bars running parallel to L, distributed across B. */
  | 'footingBottomMatY';

/** Why a bar could not be named. One kind, one remedy. */
export type CadFamilyRefusal =
  /**
   * A transverse bar that neither encloses nor restrains anything.
   *
   * Not merely unrecognised — self-contradictory. Every transverse piece this project fabricates
   * declares one or the other, because §25.7.1.2 requires each bend to contain a longitudinal
   * bar and the generator records which. A piece declaring neither is transverse steel confining
   * nothing.
   */
  | 'TRANSVERSE_CONFINES_NOTHING'
  /**
   * A bar carrying a mat layer identity with a role a mat bar cannot have.
   *
   * A bottom-mat bar is longitudinal. A transverse bar on a mat layer is two facts that cannot
   * both be true, and guessing which one to believe is how a contract starts lying.
   */
  | 'MAT_LAYER_WITH_TRANSVERSE_ROLE'
  /**
   * A closed stirrup on a mat layer.
   *
   * Same class as above and reported separately because the remedy differs: this is a tie whose
   * layer identity was set from the wrong source, not a role mix-up.
   */
  | 'MAT_LAYER_WITH_ENCLOSURE'
  /** A role this taxonomy has no family for. New steel, and it must be declared before it ships. */
  | 'UNKNOWN_ROLE';

export type CadFamilyClassification =
  | { ok: true; kind: CadFamilyKindV2 }
  | { ok: false; reason: CadFamilyRefusal };

/** Which mat axis a bar's layer identity names, or null when it is not a mat bar. */
export function footingMatAxisOf(bar: BarPath): 'X' | 'Y' | null {
  if (!isFootingMatBar(bar)) return null;
  return bar.layerId!.endsWith(':X') ? 'X' : 'Y';
}

/**
 * Name a bar's family, or say why it cannot be named.
 *
 * The order of the tests is not a preference — every branch is mutually exclusive on the facts
 * it reads — but the contradiction checks come FIRST, so a bar whose identity disagrees with
 * itself is refused rather than silently resolved by whichever test happened to run first.
 */
export function classifyCadFamily(bar: BarPath): CadFamilyClassification {
  const matAxis = footingMatAxisOf(bar);

  if (matAxis !== null) {
    if (bar.role !== 'longitudinal') {
      return { ok: false, reason: 'MAT_LAYER_WITH_TRANSVERSE_ROLE' };
    }
    if ((bar.enclosesBarIds ?? []).length > 0) {
      return { ok: false, reason: 'MAT_LAYER_WITH_ENCLOSURE' };
    }
    return { ok: true, kind: matAxis === 'X' ? 'footingBottomMatX' : 'footingBottomMatY' };
  }

  if (bar.role === 'longitudinal') return { ok: true, kind: 'columnDowel' };

  if (bar.role === 'transverse') {
    // Closed stirrup or crosstie, from what the tie-set builder recorded. `enclosesBarIds`
    // non-empty IS a closed perimeter; `[]` with a restraint pair IS a crosstie.
    if ((bar.enclosesBarIds ?? []).length > 0) return { ok: true, kind: 'starterTie' };
    if ((bar.restrainsBarIds ?? []).length > 0) return { ok: true, kind: 'starterCrosstie' };
    return { ok: false, reason: 'TRANSVERSE_CONFINES_NOTHING' };
  }

  return { ok: false, reason: 'UNKNOWN_ROLE' };
}

/** Every family kind, in the order a manifest lists them. Deterministic, not alphabetical. */
export const CAD_FAMILY_ORDER: readonly CadFamilyKindV2[] = [
  'columnDowel', 'starterTie', 'starterCrosstie', 'footingBottomMatX', 'footingBottomMatY',
];

export interface CadFamilyPartition {
  /** Bars per family, each list in the input's own order. */
  byKind: Map<CadFamilyKindV2, BarPath[]>;
  /** Bars this taxonomy refuses to name, with the reason. Non-empty means the export refuses. */
  refused: Array<{ bar: BarPath; reason: CadFamilyRefusal }>;
}

/**
 * Partition an assembly's bars into V2 families.
 *
 * Takes the bars the caller has already scoped to the subject — ownership still decides WHICH
 * steel belongs to this footing's document, and this decides WHAT each piece is. Keeping the two
 * separate is the correction: conflating them is what let a mat bar be a column dowel.
 */
export function partitionCadFamilies(bars: readonly BarPath[]): CadFamilyPartition {
  const byKind = new Map<CadFamilyKindV2, BarPath[]>();
  const refused: Array<{ bar: BarPath; reason: CadFamilyRefusal }> = [];
  for (const bar of bars) {
    const c = classifyCadFamily(bar);
    if (!c.ok) { refused.push({ bar, reason: c.reason }); continue; }
    const list = byKind.get(c.kind);
    if (list) list.push(bar); else byKind.set(c.kind, [bar]);
  }
  return { byKind, refused };
}
