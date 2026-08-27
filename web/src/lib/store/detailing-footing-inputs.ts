/**
 * What the footing and slab-column passes read.
 *
 * The largest of the three, and the one with the most engineering in it: `collectSlabColumns`
 * reconstructs a joint's delivered shear and unbalanced moment from the column legs meeting
 * at a node, which is the input punching cannot be checked without.
 */

/*
 * ── Why these left the store ─────────────────────────────────────────
 *
 * `detailing.svelte.ts` was 1566 lines against an 800-line ceiling, and 772 of them were
 * readings: functions that hold no state, own no user intent, and answer one question each.
 * The store's job is state and routing; a reading of the model is neither.
 *
 * They are not pure in the strict sense — they read `modelStore`, `resultsStore`,
 * `verificationStore` and `regulationsStore` rather than taking them as arguments — and that
 * is unchanged by the move, deliberately: rewriting twenty signatures to thread four stores
 * through would be a behaviour-shaped change wearing a refactor's clothes.
 *
 * Split three ways rather than one, because one file would have been 820 lines and the
 * problem would only have changed address. The three groups are the three questions the
 * detailing run asks: what the project states, what the floor holds, what lands on a footing.
 *
 * Nothing was rewritten. The bodies are the ones that were in the store, moved verbatim.
 */

import { modelStore, type ProvidedReinforcement } from './model.svelte';
import { verificationStore } from './verification.svelte';
import { resultsStore } from './results.svelte';
// The app's own member classifier, shared with `member-context.ts`. Punching applicability
// must not depend on the design run having populated `verificationStore.contexts`.
import { classifyElement } from '../engine/codes/argentina/cirsoc201';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
// A store is a locale boundary, and these readings cross it where the store did.
import { t } from '../i18n';
import type { ElementForces3D } from '../engine/types-3d';
import type { SlabColumnJoint, SlabJointForce } from '../engine/detailing/slab-punching';
import type {
  CaseReaction, CombinationReaction, FootingColumn, NodeReactions,
} from '../engine/detailing/run-footing-design';


/**
 * Support reactions per footing node — per combination, and per case for the service sum.
 *
 * A footing's demand is a REACTION, not a shell stress, so this is a different collector
 * from `collectStresses` with a different result source: `perCombo3D` for the strength
 * combinations and `perCase3D` for the unit-factor service sum.
 *
 * Only nodes that actually carry a footing are collected. Building the map for every
 * support would walk every combination's whole reaction list for nodes nobody asked about.
 */
export function collectFootingReactions(): Map<number, NodeReactions> {
  const out = new Map<number, NodeReactions>();
  const wanted = new Set([...modelStore.model.footings.values()].map((f) => f.nodeId));
  if (wanted.size === 0) return out;

  const caseTypeOf = new Map(modelStore.model.loadCases.map((c) => [c.id, c.type ?? 'D']));
  const comboNameOf = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));

  const factored = new Map<number, CombinationReaction[]>();
  for (const [comboId, res] of resultsStore.perCombo3D) {
    for (const r of res.reactions ?? []) {
      if (!wanted.has(r.nodeId)) continue;
      const list = factored.get(r.nodeId) ?? [];
      list.push({
        combinationId: comboId,
        combinationName: comboNameOf.get(comboId) ?? `Combinación ${comboId}`,
        fz: r.fz, mx: r.mx, my: r.my,
      });
      factored.set(r.nodeId, list);
    }
  }

  const cases = new Map<number, CaseReaction[]>();
  for (const [caseId, res] of resultsStore.perCase3D) {
    for (const r of res.reactions ?? []) {
      if (!wanted.has(r.nodeId)) continue;
      const list = cases.get(r.nodeId) ?? [];
      list.push({
        caseId,
        caseType: caseTypeOf.get(caseId) ?? 'D',
        fz: r.fz, mx: r.mx, my: r.my,
      });
      cases.set(r.nodeId, list);
    }
  }

  // With no combinations solved, the single active result set is the only reaction there is.
  // It is offered as ONE combination named for what it is, rather than silently treated as a
  // factored envelope it may not be.
  if (factored.size === 0) {
    for (const r of resultsStore.results3D?.reactions ?? []) {
      if (!wanted.has(r.nodeId)) continue;
      factored.set(r.nodeId, [{
        combinationId: 0,
        combinationName: t('detailing.footingRun.activeResultSet'),
        fz: r.fz, mx: r.mx, my: r.my,
      }]);
    }
  }

  for (const nodeId of wanted) {
    const f = factored.get(nodeId);
    if (!f || f.length === 0) continue;
    // Sorted so the governing pick and the reported name cannot depend on Map order.
    const sorted = [...f].sort((a, b) => a.combinationId - b.combinationId);
    const c = cases.get(nodeId);
    out.set(nodeId, {
      factored: sorted,
      ...(c && c.length > 0
        ? { cases: [...c].sort((a, b) => a.caseId - b.caseId) }
        : {}),
    });
  }
  return out;
}


/**
 * The starter set a column's accepted reinforcement calls for.
 *
 * A column may be stored in either of two shapes: the structured `column` form (corner and
 * face bars per edge) or the legacy grouped `longitudinal`. Both are read, because a project
 * verified before the structured form existed still has columns to found.
 *
 * A single representative diameter is returned with the total count, because `DowelInput`
 * takes one `{ count, diameterMm }` pair. When corner and face diameters differ the LARGER
 * is used: it sets the longer development length, and a starter shorter than the bar it laps
 * with is the failure that matters.
 */
export function columnBarSet(
  accepted: ProvidedReinforcement | undefined,
): { count: number; diameterMm: number } | undefined {
  const c = accepted?.column;
  if (c) {
    const count = 4 + c.nBottom + c.nTop + c.nLeft + c.nRight;
    const diameterMm = Math.max(c.cornerDia, c.faceDia);
    return count > 0 && diameterMm > 0 ? { count, diameterMm } : undefined;
  }
  const l = accepted?.longitudinal;
  if (l && l.count > 0 && l.diameter > 0) {
    return { count: l.count, diameterMm: l.diameter };
  }
  return undefined;
}


/**
 * Column geometry for each footing that names one.
 *
 * The section's `b`/`h` give the punching perimeter; the reinforcement the verifier already
 * chose for that column gives the dowels, so the starters match the bars they lap with
 * rather than a nominal set invented here.
 */
export function collectFootingColumns(): Map<number, FootingColumn> {
  const out = new Map<number, FootingColumn>();
  for (const f of modelStore.model.footings.values()) {
    if (f.columnElementId === undefined || out.has(f.columnElementId)) continue;
    const el = modelStore.model.elements.get(f.columnElementId);
    if (!el) continue;
    const sec = modelStore.model.sections.get(el.sectionId);
    if (!sec?.b || !sec?.h) continue;
    // The starters must lap with the bars the verifier ACCEPTED for that column, so they are
    // read from the design outcome rather than invented here. `accepted` is present only for
    // a VERIFIED outcome, which is the right gate: starters lapping into steel that was
    // never accepted would be detailing a column that does not exist yet.
    const accepted = verificationStore.outcomeFor(f.columnElementId)?.accepted;
    const bars = columnBarSet(accepted);
    const tie = accepted?.stirrups?.diameter;
    out.set(f.columnElementId, {
      elementId: f.columnElementId,
      b: sec.b, h: sec.h,
      ...(bars ? { bars } : {}),
      ...(tie ? { tieDiaMm: tie } : {}),
    });
  }
  return out;
}


/**
 * Every slab–column joint in the model, with the per-combination forces at it.
 *
 * ── What used to be missing ─────────────────────────────────────
 *
 * This collector used to stop at APPLICABILITY: whether a column stands at a slab node, which
 * decides whether punching applies, and nothing more. So every column-supported panel reported
 * its governing check as unverified for want of forces the solver had already produced. This is
 * the rest of it.
 *
 * ── Which end of which column ───────────────────────────────────
 *
 * A column below the joint meets it at its TOP node; a column above meets it at its BOTTOM
 * node. Which node is `nodeI` and which is `nodeJ` is a modelling accident, so the two are told
 * apart by ELEVATION — the column's higher-z node — and the axial force is read from the end
 * that is actually at the joint. Reading the far end instead would report the force at the
 * other floor, and with self-weight in the model those differ by the column's own weight.
 *
 * Compression is positive here and `ElementForces3D` reports axial with tension positive, so
 * every reading is negated once, at the point it is read.
 *
 * ── The third force ─────────────────────────────────────────────
 *
 * Beams framing into the joint deliver load to the column WITHOUT crossing the slab's critical
 * perimeter, and so does any load applied at the joint node. Both are collected, because the
 * punching demand is the part of the axial step that does cross the perimeter, and calling the
 * whole step "punching" would fail an ordinary beam-and-slab floor on a mechanism that is not
 * carrying it. `slab-punching.ts` states the free body they enter.
 */
export function collectSlabColumns(): Map<number, SlabColumnJoint> {
  const zOf = (nodeId: number) => modelStore.model.nodes.get(nodeId)?.z ?? 0;

  /** Columns at each node, tagged by whether the node is that column's top or bottom end. */
  type Leg = {
    elementId: number; b: number; h: number;
    /** True when the joint node is the column's TOP — so the column is BELOW the joint. */
    below: boolean;
    /** The end of the element that sits at the joint. */
    end: 'start' | 'end';
  };
  const legs = new Map<number, Leg[]>();
  /** Non-column frame members at each node, for the directly-delivered shear. */
  const others = new Map<number, Array<{ elementId: number; end: 'start' | 'end' }>>();

  for (const el of modelStore.model.elements.values()) {
    const ni = modelStore.model.nodes.get(el.nodeI);
    const nj = modelStore.model.nodes.get(el.nodeJ);
    if (!ni || !nj) continue;
    const sec0 = modelStore.model.sections.get(el.sectionId);
    /**
     * Classified by the app's OWN member classifier, not by `verificationStore.contexts`.
     *
     * `contexts` is populated by the design run, so reading the element type from it made
     * punching applicability depend on the user having pressed Compute Demands first — and a
     * user who designs a floor without it got an empty joint map and therefore no punching
     * claim at all. That is a false negative, which is worse than a stated limitation: the
     * panel looks like one that has no column rather than one whose columns were not found.
     *
     * `classifyElement` is the same pure function `member-context.ts` classifies with, so this
     * is one implementation read from two places rather than two implementations.
     */
    const kind = classifyElement(
      ni.x, ni.y, ni.z ?? 0, nj.x, nj.y, nj.z ?? 0,
      sec0?.b || undefined, sec0?.h || undefined);
    const zi = zOf(el.nodeI);
    const zj = zOf(el.nodeJ);
    if (kind === 'column') {
      // A column with no rectangular section is REGISTERED with zero plan dimensions, not
      // skipped. Skipping it would make the joint look like one that has no column, and the
      // engine's own missing-geometry refusal — which names the dimensions it did not get — is
      // the honest outcome instead.
      const topNode = zi > zj ? el.nodeI : el.nodeJ;
      for (const nodeId of [el.nodeI, el.nodeJ]) {
        const list = legs.get(nodeId) ?? [];
        list.push({
          elementId: el.id, b: sec0?.b ?? 0, h: sec0?.h ?? 0,
          below: nodeId === topNode,
          end: nodeId === el.nodeI ? 'start' : 'end',
        });
        legs.set(nodeId, list);
      }
      continue;
    }
    for (const nodeId of [el.nodeI, el.nodeJ]) {
      const list = others.get(nodeId) ?? [];
      list.push({ elementId: el.id, end: nodeId === el.nodeI ? 'start' : 'end' });
      others.set(nodeId, list);
    }
  }
  if (legs.size === 0) return new Map();

  const comboNameOf = new Map(modelStore.model.combinations.map((c) => [c.id, c.name]));

  /**
   * The combination result sets to read, as (id, name, results) triples.
   *
   * With no combinations solved the single active result set is offered as ONE combination
   * named for what it is — the same treatment `collectFootingReactions` gives a reaction, and
   * for the same reason: silently calling it a factored envelope would be a claim about
   * factors nobody applied.
   */
  const sets: Array<{ id: number; name: string; forces: ReadonlyMap<number, ElementForces3D> }> =
    [];
  const indexForces = (list: readonly ElementForces3D[]) =>
    new Map(list.map((f) => [f.elementId, f]));
  if (resultsStore.perCombo3D.size > 0) {
    for (const [comboId, res] of resultsStore.perCombo3D) {
      sets.push({
        id: comboId,
        name: comboNameOf.get(comboId) ?? `Combinación ${comboId}`,
        forces: indexForces(res.elementForces ?? []),
      });
    }
  } else if (resultsStore.results3D) {
    sets.push({
      id: 0,
      name: t('detailing.footingRun.activeResultSet'),
      forces: indexForces(resultsStore.results3D.elementForces ?? []),
    });
  }
  sets.sort((a, b) => a.id - b.id);

  /** Axial force at the joint end of a column leg, COMPRESSION POSITIVE, kN. */
  const axialAt = (leg: Leg, forces: ReadonlyMap<number, ElementForces3D>): number | null => {
    const f = forces.get(leg.elementId);
    if (!f) return null;
    const n = leg.end === 'start' ? f.nStart : f.nEnd;
    return typeof n === 'number' && Number.isFinite(n) ? -n : null;
  };

  /**
   * Vertical load delivered into the joint by everything that is not one of the two columns
   * and not the slab, kN, downward positive.
   *
   * A beam's end shears are in LOCAL axes and a beam can be rolled, so the global-Z component
   * is taken from the element's own local axes rather than from `vy` alone. Where the local
   * frame cannot be resolved the member is skipped and the omission is conservative in the
   * direction that matters: less is deducted, so V_u is larger.
   */
  const directlyDelivered = (
    nodeId: number, forces: ReadonlyMap<number, ElementForces3D>, setId: number,
  ): number => {
    let sum = 0;
    for (const o of others.get(nodeId) ?? []) {
      const f = forces.get(o.elementId);
      const el = modelStore.model.elements.get(o.elementId);
      if (!f || !el) continue;
      const ni = modelStore.model.nodes.get(el.nodeI);
      const nj = modelStore.model.nodes.get(el.nodeJ);
      if (!ni || !nj) continue;
      // Local x along the member; the global-Z components of the three local axes are what
      // project a local end force onto the vertical.
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const dz = (nj.z ?? 0) - (ni.z ?? 0);
      const L = Math.hypot(dx, dy, dz);
      if (!(L > 0)) continue;
      const exz = dz / L;
      // Local y and z: the app's default frame puts local z in the vertical plane containing
      // the member, so its global-Z component is the horizontal run over the length. A member
      // that is exactly vertical is not a beam and cannot be one of `others` and a column at
      // once, so the degenerate case does not arise here.
      const horiz = Math.hypot(dx, dy);
      const ezz = horiz / L;
      const [n, vy, vz] = o.end === 'start'
        ? [f.nStart, f.vyStart, f.vzStart]
        : [f.nEnd, f.vyEnd, f.vzEnd];
      // Force the ELEMENT exerts on the NODE, in local axes. The solver's raw
      // f_local = K·u − Fef is the force the NODE exerts on the ELEMENT, reported
      // as (n_start, vy_start, vz_start) = (−f_i_n, +f_i_vy, +f_i_vz) at I and
      // (n_end, vy_end, vz_end) = (+f_j_n, −f_j_vy, −f_j_vz) at J. Inverting:
      // element→node is (n, −vy, −vz) at the I end and (−n, vy, vz) at the J end.
      // (The inverse mapping was previously used — the node-on-element vector —
      // which inverted every beam-end shear delivered into the joint.)
      const [ln, lvy, lvz] = o.end === 'start' ? [n, -vy, -vz] : [-n, vy, vz];
      // Local y is horizontal for the default frame, so it contributes nothing vertical.
      void lvy;
      const globalZ = ln * exz + lvz * ezz;
      // Downward positive: a member pushing the node down delivers load into the column.
      sum += -globalZ;
    }
    // A load applied at the joint node itself also arrives inside the perimeter. Downward is
    // negative global Z, so it is negated to become a downward-positive delivery. The delivery
    // must carry the COMBINATION's factors: the set's element forces are factored per case,
    // so an unfactored raw load would mix magnitudes from two different worlds. The single
    // active result set (setId 0) is unfactored by construction — the raw value IS right there.
    for (const load of modelStore.model.loads) {
      if (load.type !== 'nodal' && load.type !== 'nodal3d') continue;
      const d = load.data as { nodeId: number; fz?: number; caseId?: number };
      if (d.nodeId !== nodeId) continue;
      if (setId === 0) {
        sum += -(d.fz ?? 0);
        continue;
      }
      const combo = modelStore.model.combinations.find((c) => c.id === setId);
      const factor = combo?.factors.find((fc) => fc.caseId === (d.caseId ?? 1))?.factor ?? 0;
      sum += factor * -(d.fz ?? 0);
    }
    return sum;
  };

  /** Step in the column end moments across the joint, kN·m, about global x and y. */
  const momentStep = (
    legsHere: readonly Leg[], forces: ReadonlyMap<number, ElementForces3D>,
  ): { x: number; y: number } => {
    let mx = 0;
    let my = 0;
    for (const leg of legsHere) {
      const f = forces.get(leg.elementId);
      const el = modelStore.model.elements.get(leg.elementId);
      if (!f || !el) continue;
      const ni = modelStore.model.nodes.get(el.nodeI);
      const nj = modelStore.model.nodes.get(el.nodeJ);
      if (!ni || !nj) continue;
      // Moment the ELEMENT exerts on the JOINT: the I-end fields are NOT inverted
      // (m_start = f_i), the J-end fields ARE (m_end = −f_j), so element→joint is
      // −reported at I and +reported at J. The local components must then be
      // projected to global with the element's OWN frame — a column modelled
      // top→base has ey flipped relative to the same column modelled base→top,
      // so reading local my/mz without projecting gives the moment of a
      // different building depending on how each member was drawn.
      const axes = computeLocalAxes3D(
        { id: ni.id, x: ni.x, y: ni.y, z: ni.z ?? 0 },
        { id: nj.id, x: nj.x, y: nj.y, z: nj.z ?? 0 },
      );
      const [mmx, mmy, mmz] = leg.end === 'start'
        ? [-f.mxStart, -f.myStart, -f.mzStart]
        : [f.mxEnd, f.myEnd, f.mzEnd];
      // M = mmx·ex + mmy·ey + mmz·ez — keep the two horizontal (joint-transfer)
      // components. For a vertical column ex is vertical and drops out here.
      mx += mmx * axes.ex[0] + mmy * axes.ey[0] + mmz * axes.ez[0];
      my += mmx * axes.ex[1] + mmy * axes.ey[1] + mmz * axes.ez[1];
    }
    return { x: mx, y: my };
  };

  const out = new Map<number, SlabColumnJoint>();
  for (const [nodeId, legsHere] of legs) {
    // Deterministic under any element iteration order.
    const ordered = [...legsHere].sort((a, b) => a.elementId - b.elementId);
    const below = ordered.find((l) => l.below) ?? null;
    const above = ordered.find((l) => !l.below) ?? null;
    // The perimeter is the surface the slab punches against, which is the SUPPORTING column's
    // face. A joint with only a column above uses that one, because it is the only face there
    // is.
    const perimeterLeg = below ?? above;
    if (!perimeterLeg) continue;

    const forces: SlabJointForce[] = [];
    for (const set of sets) {
      const ab = below ? axialAt(below, set.forces) : null;
      const aa = above ? axialAt(above, set.forces) : null;
      // A combination with no force for either column carries no free body, so it is omitted
      // rather than entered as a pair of zeros that would read as a measured null step.
      if (ab === null && aa === null) continue;
      const m = momentStep(ordered, set.forces);
      forces.push({
        combinationId: set.id,
        combinationName: set.name,
        axialBelow: ab,
        axialAbove: aa,
        directlyDelivered: directlyDelivered(nodeId, set.forces, set.id),
        unbalancedMomentX: m.x,
        unbalancedMomentY: m.y,
      });
    }

    const node = modelStore.model.nodes.get(nodeId);
    out.set(nodeId, {
      nodeId,
      at: { x: node?.x ?? 0, y: node?.y ?? 0 },
      columnElementId: perimeterLeg.elementId,
      b: perimeterLeg.b,
      h: perimeterLeg.h,
      elementBelow: below?.elementId ?? null,
      elementAbove: above?.elementId ?? null,
      forces,
    });
  }
  return out;
}


/**
 * Highest revision among the PERSISTED assemblies, so a regeneration increments.
 *
 * ── Why this reads the model and takes no argument ──────────────────
 *
 * It used to be called as `maxRevision(store.assemblies)`, and `store` is a `$derived`. A
 * `$derived` is lazy and memoised: it recomputes when a dependency changes AND it is read, so
 * whether it is current at the moment a command runs depends on what ELSE read it in the same
 * tick. That made the revision counter a function of unrelated parts of the UI — mounting one
 * more panel elsewhere in the tab was enough to make every regeneration report revision 1.
 *
 * This branch already found and fixed the identical class twice, a few lines away, and said so
 * in the source: the floor-assembly merge and `buildDocument` both read
 * `modelStore.model.detailing` directly because a `$derived` does not recompute inside the
 * synchronous call that wrote it. These two callers were left on the derived.
 *
 * The argument is REMOVED rather than left optional. A helper that can be handed either source
 * is a helper that will be handed the wrong one again; there is exactly one correct source for
 * "what revision is this project on", and it is the persisted model — which is also what a
 * reopened project carries.
 */
/**
 * What a footing run was made FROM, as one comparable string.
 *
 * ── The failure this exists to prevent ─────────────────────────
 *
 * `supersedeDocuments()` retires the DOCUMENT when a foundation input changes, and it leaves
 * `lastFootingRun` alone. That was harmless while the run held numbers: a superseded schedule
 * on screen next to a retired document is a visible inconsistency the user can read.
 *
 * It stops being harmless now that the run holds BARS. Change the layer-order preference and
 * the panel would go on drawing the previous mat — real bar positions, real elevations, real
 * marks — with nothing saying they belong to a design the project no longer specifies. Stale
 * geometry presented as current is the one failure the whole revision graph exists to prevent.
 *
 * So the run records its inputs and the panel compares. It does NOT re-run: regeneration stays
 * an explicit command, because a panel that silently redesigned a footing on every keystroke
 * would be making the engineer's decision for them.
 *
 * The mat preferences and every footing's own revision, and nothing else — those are exactly
 * the inputs `runFootingDesign` reads that a user can change without re-solving. A change to
 * the ANALYSIS moves the demand revision instead, and the certificate's own freshness catches
 * that on a different axis.
 */
export function footingRunFingerprint(): string {
  const prefs = modelStore.footingMatPreferences();
  const footings = [...modelStore.model.footings.values()]
    .sort((a, b) => a.id - b.id)
    .map((f) => `${f.id}:${f.revision}`);
  return JSON.stringify({ prefs, footings });
}
