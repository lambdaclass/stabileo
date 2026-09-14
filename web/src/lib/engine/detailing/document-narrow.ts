/**
 * A document narrowed to the members the user chose to document.
 *
 * ── Why this is a projection and not a second build ────────────────
 *
 * The alternative was to filter the ASSEMBLIES and call `buildDocumentModel` on the subset. It is
 * the obvious shape and it is wrong in a way that matters: `documentReadiness` would then be
 * measured over the subset, so narrowing a set down to one clean beam would produce FOR_REVIEW
 * out of a project whose columns are in conflict — and `Issue for construction` would open.
 * Selecting fewer elements would have become the way to escape a blocker.
 *
 * So the document is built ONCE, over everything, and this narrows the built object. Which gives
 * the property to hold on to:
 *
 *   **a narrowed document never claims more than the set it came from.**
 *
 * `readiness`, `openConflicts`, `maturity`, `refs` and `scope` are those of the WHOLE set and are
 * carried through untouched. The conflicts are the reason the set is a draft, and a subset of a
 * draft is a draft. `assemblies`, their bars, marks, laps and certificates are narrowed, because
 * those are the CONTENT — what the sheets draw and the schedule counts — and content that
 * described members the reader cannot see is content nobody can check.
 *
 * ── What follows a member, and what a member cannot cut ────────────
 *
 * A bar is included when ANY of its owners is selected. A bar continuous over a support belongs
 * to the beam it was designed for and to the column it passes through, and a document selection
 * cannot saw it in half: the piece is fabricated whole or it is not fabricated. The unselected
 * owners are reported in `DocumentSelection.sharedWith` so the steel on the page always has a
 * named owner.
 *
 * A mark keeps its LABEL and loses the bars that left. Re-running `assignMarks` over the kept
 * bars was the other option and it renumbers: two exports of the same project with different
 * selections would then use `B3` for different bars, on paper, in a workshop. So the label is
 * preserved and the quantity and mass are recomputed through `markMassKg` — the same function
 * that minted them, not a copy of its arithmetic.
 *
 * A lap needs both of its bars. It is a relation between two pieces, and a splice to a bar that
 * is not in the document is not a splice; it is a length nobody can verify.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import { markMassKg, type BarMark, type DetailingAssembly } from './assembly';
import type { DocumentAssembly, DocumentModel, DocumentSelection } from './document-model';
import { DESIGN_FAMILIES, type DesignFamily } from '../design/design-families';

/** The bars a member selection reaches: any bar with a selected owner. */
function keptBars(bars: readonly BarPath[], keep: ReadonlySet<number>): BarPath[] {
  return bars.filter((b) => b.ownerElementIds.some((id) => keep.has(id)));
}

/**
 * The marks of the kept bars, with their labels and their arithmetic intact.
 *
 * A mark with no bar left produces no row: a schedule line of quantity zero reads as "we
 * fabricate none of these", which is a statement about the works rather than about this document.
 */
function narrowMarks(marks: readonly BarMark[], kept: readonly BarPath[]): BarMark[] {
  const byId = new Map(kept.map((b) => [b.id, b]));
  const out: BarMark[] = [];
  for (const m of marks) {
    const ids = m.barIds.filter((id) => byId.has(id));
    if (ids.length === 0) continue;
    const bars = ids.map((id) => byId.get(id)!);
    out.push({
      ...m,
      barIds: [...ids].sort(),
      quantity: ids.length,
      massKg: markMassKg(m.diameterMm, m.cuttingLength, ids.length),
      ownerElementIds: [...new Set(bars.flatMap((b) => b.ownerElementIds))]
        .sort((a, b) => a - b),
      zoneIds: [...new Set(bars.map((b) => b.zoneId).filter((z): z is string => !!z))].sort(),
    });
  }
  return out;
}

/** The persisted assembly, narrowed in step with the document one so `source` cannot drift. */
function narrowSource(
  a: DetailingAssembly, keep: ReadonlySet<number>, kept: readonly BarPath[],
): DetailingAssembly {
  return {
    ...a,
    elementIds: a.elementIds.filter((id) => keep.has(id)),
    bars: [...kept],
    marks: narrowMarks(a.marks, kept),
    joints: a.joints
      .filter((j) => j.elementIds.some((id) => keep.has(id)))
      .map((j) => ({
        ...j,
        // The joint keeps its identity and its kind — how many beams frame into a node is a
        // property of the structure, not of what somebody chose to print. Only the per-member
        // layer allocation and the unresolved conflicts follow the selection.
        beamLayers: j.beamLayers.filter((l) => keep.has(l.elementId)),
        unresolved: j.unresolved.filter((c) => c.elementIds.some((id) => keep.has(id))),
      })),
    conflicts: a.conflicts.filter((c) => c.elementIds.some((id) => keep.has(id))),
    /*
     * An unsupported condition with no member named is kept.
     *
     * `scope.elementIds` is optional and empty on the conditions that apply to the assembly as a
     * whole — a check this app does not implement for this KIND of assembly. Filtering those out
     * because they name nobody would drop exactly the limitations that apply to everything on the
     * page, which is the reverse of the intent.
     */
    unsupported: a.unsupported.filter((u) =>
      !u.scope.elementIds?.length || u.scope.elementIds.some((id) => keep.has(id))),
    provisionalMembers: a.provisionalMembers?.filter((id) => keep.has(id)),
    torsionUnevaluatedMembers: a.torsionUnevaluatedMembers?.filter((id) => keep.has(id)),
    families: a.families?.filter((r) => r.ownerElementIds.some((id) => keep.has(id))),
  };
}

/** One assembly's projection, narrowed. Null when nothing of it was selected. */
function narrowAssembly(
  a: DocumentAssembly, keep: ReadonlySet<number>,
): DocumentAssembly | null {
  const elementIds = a.elementIds.filter((id) => keep.has(id));
  if (elementIds.length === 0) return null;
  const kept = keptBars(a.bars, keep);
  const barIds = new Set(kept.map((b) => b.id));
  return {
    ...a,
    elementIds,
    bars: kept,
    layers: [...new Set(kept.map((b) => b.layerId).filter((l): l is string => !!l))].sort(),
    // Both ends, for the reason the header states: a splice to a bar that is not here is a
    // length nobody can verify.
    laps: a.laps.filter((l) => barIds.has(l.fromBarId) && barIds.has(l.toBarId)),
    fusions: a.fusions.filter((f) => barIds.has(f.barId)),
    conflicts: a.conflicts.filter((c) => c.elementIds.some((id) => keep.has(id))),
    families: a.families.filter((r) => r.ownerElementIds.some((id) => keep.has(id))),
    familyCertificates: a.familyCertificates
      .filter((c) => c.ownerElementIds.some((id) => keep.has(id))),
    /*
     * `state`, `maturity`, `constructibility` and `assumptions` are the WHOLE assembly's.
     *
     * The verdict was measured over the coordinated set, and re-presenting it over a subset in
     * either direction is a claim nobody made: carrying a PASS is safe, because a clean set
     * cannot contain a dirty part, and carrying a FAIL is pessimistic, which is the direction a
     * document is allowed to err in. Recomputing would be the third option and it is the one
     * `detailing-convergence.md` was written about — a gate measured over the subset that was
     * drawn.
     */
    source: narrowSource(a.source, keep, kept),
  };
}

/**
 * Narrow a document to the members selected for documentation.
 *
 * `keep` is expected to be a subset of the document's own members — `resolveDocumentScope` is
 * what guarantees that, and an id this document does not contain simply matches nothing here
 * rather than being reported twice.
 *
 * `families` is SUPPLIED, not derived. A frame assembly records no family split — `beam` and
 * `column` live on the `MemberContext`, which this module cannot and should not read — so
 * deriving them here would mean guessing for the frame and answering for the floor, out of the
 * same function. The caller already resolved them against the design scope; it passes the answer
 * in, and this intersects with the document's own scope so the result cannot widen whatever it is
 * handed.
 */
export function narrowDocument(
  doc: DocumentModel,
  keep: readonly number[],
  families: readonly DesignFamily[],
): DocumentModel {
  const keepSet = new Set(keep);
  const assemblies = doc.assemblies
    .map((a) => narrowAssembly(a, keepSet))
    .filter((a): a is DocumentAssembly => a !== null);

  const elements = [...new Set(assemblies.flatMap((a) => a.elementIds))]
    .sort((a, b) => a - b);
  const ofBase = new Set(doc.assemblies.flatMap((a) => a.elementIds)).size;

  /** Owners of kept steel that were not selected. See `DocumentSelection.sharedWith`. */
  const sharedWith = [...new Set(assemblies
    .flatMap((a) => a.bars.flatMap((b) => b.ownerElementIds))
    .filter((id) => !keepSet.has(id)))].sort((a, b) => a - b);

  const selection: DocumentSelection = {
    elements,
    ofBase,
    families: DESIGN_FAMILIES.filter((f) => families.includes(f) && doc.scope.includes(f)),
    sharedWith,
  };

  return {
    ...doc,
    assemblies,
    certificates: doc.certificates.filter((c) => keepSet.has(c.elementId)),
    selection,
  };
}
