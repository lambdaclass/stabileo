/**
 * Recognising the physical elements as a proposal a person reviews, then applies.
 *
 * It used to apply at once: every element that was not declared was deleted and added back under
 * a new id, even when the result was identical, so whatever named the old id (a floor load on a
 * slab, a tendon layout, a phase, a joist system) was left pointing at nothing. Now:
 *
 *  - each proposed element is matched to the existing inferred or generator element it shares
 *    the most bars and shells with, of the same kind, and KEEPS that element's id and name;
 *  - an existing element that no proposal keeps hands its references to the proposal that took
 *    most of its members (`group-references.ts`), or, when nothing took them, stays as it is;
 *  - a run that changes nothing writes nothing: no undo step, no invalidation;
 *  - the person accepts the proposals by kind and makes exceptions one by one; a rejected
 *    proposal leaves the elements it would have replaced as they are;
 *  - the whole application is one undo step, on the design channel (the solve survives) unless a
 *    reference the analysis reads had to move, which makes it a structural step.
 *
 * Declared elements are never touched, as before.
 */
import { modelStore } from './model.svelte';
import { t as tr } from '../i18n';
import { GENERATED_KIND } from './generated-structures';
import { physicalGroups } from './physical';
import {
  DECISION_PLACES, EXTENT_PLACES, groupReferences, remapGroupReferences,
  type DroppedValue, type GroupRefPlace, type GroupReference,
} from './group-references';
import { PHYSICAL_GROUP_KIND, recognizePhysical, type PhysicalDraft, type PhysicalKind } from '../model/physical';

export type ProposalStatus = 'same' | 'changed' | 'new';

/** What a person should look at before accepting a proposal. */
export type RecognitionFlag =
  /** A bar between 5° and 80° from the horizontal, read as a brace: may be a sloped beam. */
  | 'inclined'
  /** A column that runs through more than one storey as one element. */
  | 'multiStorey'
  /** Bars of different sections in one element. */
  | 'mixedSections'
  /** A slab or wall that is neither horizontal nor vertical. */
  | 'skewShell'
  /** The proposal takes members from more than one existing element (they merge). */
  | 'merges'
  /** An existing element's members are split between several proposals. */
  | 'splits'
  /** A design decision stored for an element would change what it applies to: see `conflicts`. */
  | 'conflict';

/**
 * A design decision (a slab system, a tendon layout, masonry, a phase, a joist system) stored for
 * an existing element whose members this proposal changes. It cannot follow by itself: merged, two
 * decisions meet and one would win; split, it applies to only one of the parts; grown or shrunk,
 * it applies to members it was not made for. Shown before applying, and the proposal is left out
 * unless the person accepts it.
 */
export interface RecognitionConflict {
  place: GroupRefPlace;
  fromId: number;
  fromName: string;
  kind: 'merge' | 'split' | 'extent';
}

export interface RecognitionProposal {
  key: string;
  draft: PhysicalDraft;
  kind: PhysicalKind;
  status: ProposalStatus;
  /** The existing element whose id (and name) it keeps. */
  keepId?: number;
  name: string;
  flags: RecognitionFlag[];
  conflicts: RecognitionConflict[];
}

export interface RecognitionRemoval {
  id: number;
  name: string;
  kind: PhysicalKind;
  /** The proposal its references go to; absent when no proposal took its members. */
  successorKey?: string;
  /** With no proposal: the declared element that now holds most of its members, if any. */
  successorId?: number;
  references: GroupReference[];
}

/**
 * An existing element whose member set changes and that loads, masses, a footing or a deflection
 * rule name. Those keep exactly the members they had: they move to a plain group with those
 * members («V3 · before»), so a floor load covers the same area and the self-weight the same bars.
 */
export interface RecognitionFreeze { fromId: number; fromName: string; places: GroupRefPlace[] }

export interface RecognitionPlan {
  proposals: RecognitionProposal[];
  removals: RecognitionRemoval[];
  freezes: RecognitionFreeze[];
  /** Declared elements, left alone. */
  declared: number;
  /** Whether applying everything would change the model at all. */
  changes: boolean;
}

export interface RecognitionOutcome {
  applied: number;
  kept: number;
  created: number;
  removed: number;
  /** References moved to a surviving element's id. */
  remapped: number;
  /** Undo channel the application went on; 'none' when it changed nothing. */
  channel: 'none' | 'design' | 'structural';
  /** Plain groups created to keep loads and rules on exactly their members (`RecognitionFreeze`). */
  frozen: number;
  /** Conflicting proposals the person accepted, as they were applied. */
  conflicts: RecognitionConflict[];
  /** Decisions that could not move because the target held a different one (kept the target's). */
  dropped: DroppedValue[];
}

/** The roles generators recorded for the bars they made. */
function generatorRoles(): Map<number, string> {
  const out = new Map<number, string>();
  for (const g of modelStore.model.groups.values()) {
    if (g.kind !== GENERATED_KIND || !g.data) continue;
    const els = (g.data as { elements?: Array<{ id: number; role?: string } | null> }).elements ?? [];
    for (const e of els) if (e?.role) out.set(e.id, e.role);
  }
  return out;
}

const keysOf = (m: { elements?: readonly number[]; plates?: readonly number[]; quads?: readonly number[] }) => new Set([
  ...(m.elements ?? []).map((id) => `e${id}`), ...(m.plates ?? []).map((id) => `p${id}`), ...(m.quads ?? []).map((id) => `q${id}`),
]);

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((k) => b.has(k));

/** The data a recognised element stores (what `addGroup` receives), without its members. */
function dataOf(d: PhysicalDraft): Record<string, unknown> {
  const { name: _n, elements: _e, plates: _p, quads: _q, ...data } = d;
  return data as unknown as Record<string, unknown>;
}

const sameData = (a: unknown, b: Record<string, unknown>) => {
  const x = a as Record<string, unknown> | undefined;
  return !!x && ['kind', 'typology', 'levelFrom', 'levelTo', 'provenance'].every((k) => (x[k] ?? null) === (b[k] ?? null));
};

function flagsOf(d: PhysicalDraft, levelCount: (from?: string, to?: string) => number): RecognitionFlag[] {
  const out: RecognitionFlag[] = [];
  if (d.kind === 'brace') out.push('inclined');
  if (d.kind === 'column' && levelCount(d.levelFrom, d.levelTo) > 1) out.push('multiStorey');
  const secs = new Set(d.elements.map((id) => modelStore.elements.get(id)?.sectionId));
  if (secs.size > 1) out.push('mixedSections');
  if ((d.kind === 'slab' || d.kind === 'wall') && d.quads.length + d.plates.length > 0) {
    const ids = [...d.quads.map((id) => modelStore.quads.get(id)?.nodes), ...d.plates.map((id) => modelStore.plates.get(id)?.nodes)];
    const n = ids[0];
    if (n && n.length >= 3) {
      const p = n.map((k) => modelStore.nodes.get(k)!).filter(Boolean);
      if (p.length >= 3) {
        const u = [p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y, (p[1]!.z ?? 0) - (p[0]!.z ?? 0)];
        const v = [p[2]!.x - p[0]!.x, p[2]!.y - p[0]!.y, (p[2]!.z ?? 0) - (p[0]!.z ?? 0)];
        const nz = u[0]! * v[1]! - u[1]! * v[0]!;
        const nl = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, nz) || 1;
        const c = Math.abs(nz / nl);
        if (c > 0.15 && c < 0.996) out.push('skewShell');
      }
    }
  }
  return out;
}

/** Read the physical elements off the model, as a proposal against what is there. Writes nothing. */
export function planRecognition(): RecognitionPlan {
  const all = physicalGroups();
  const declared = all.filter((g) => g.physical.provenance === 'declared');
  const existing = all.filter((g) => g.physical.provenance !== 'declared');
  const taken = {
    elements: new Set(declared.flatMap((g) => g.members.elements ?? [])),
    plates: new Set(declared.flatMap((g) => g.members.plates ?? [])),
    quads: new Set(declared.flatMap((g) => g.members.quads ?? [])),
  };
  const levels = modelStore.grid?.levels ?? [];
  const drafts = recognizePhysical({
    nodes: modelStore.model.nodes as never,
    elements: modelStore.model.elements as never,
    plates: modelStore.model.plates as never,
    quads: modelStore.model.quads as never,
    levels,
    generatorRoles: generatorRoles(),
    taken,
  });
  const zOf = (id?: string) => levels.find((l) => l.id === id)?.z ?? (id?.startsWith('z:') ? Number(id.slice(2)) : NaN);
  const levelCount = (from?: string, to?: string) => {
    const a = zOf(from), b = zOf(to);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
    const inside = levels.filter((l) => l.z > a + 1e-6 && l.z < b - 1e-6).length;
    return b > a + 1e-6 ? inside + 1 : 1;
  };

  // Overlaps between proposals and existing elements, matched one to one: same kind first, then most shared.
  const dKeys = drafts.map((d) => keysOf(d));
  const eKeys = existing.map((g) => keysOf(g.members));
  const pairs: Array<{ d: number; e: number; shared: number; sameKind: boolean }> = [];
  drafts.forEach((d, di) => existing.forEach((g, ei) => {
    let shared = 0;
    for (const k of dKeys[di]!) if (eKeys[ei]!.has(k)) shared++;
    if (shared > 0) pairs.push({ d: di, e: ei, shared, sameKind: g.physical.kind === d.kind });
  }));
  pairs.sort((a, b) => Number(b.sameKind) - Number(a.sameKind) || b.shared - a.shared || a.e - b.e);
  const dMatch = new Map<number, number>(), eMatch = new Map<number, number>();
  for (const p of pairs) {
    if (!p.sameKind || dMatch.has(p.d) || eMatch.has(p.e)) continue;
    dMatch.set(p.d, p.e); eMatch.set(p.e, p.d);
  }

  /*
   * Where each existing element goes, and whether its member set changes on the way: a match
   * with other members, or a successor that is not exactly it. Only then do references need care.
   */
  const destOf = (ei: number): number | null => eMatch.get(ei) ?? pairs.filter((p) => p.e === ei).sort((a, b) => b.shared - a.shared)[0]?.d ?? null;
  const extentChanges = (ei: number): boolean => {
    const d = destOf(ei);
    return d !== null && !sameSet(dKeys[d]!, eKeys[ei]!);
  };
  const refsOf = existing.map((g) => groupReferences(g.id));
  const conflictsOf = (di: number): RecognitionConflict[] => {
    const into = existing.map((_, ei) => ei).filter((ei) => destOf(ei) === di && extentChanges(ei));
    const merging = existing.map((_, ei) => ei).filter((ei) => destOf(ei) === di).length > 1;
    return into.flatMap((ei) => refsOf[ei]!.filter((r) => DECISION_PLACES.has(r.place)).map((r) => ({
      place: r.place, fromId: existing[ei]!.id, fromName: existing[ei]!.name,
      kind: merging ? 'merge' as const : pairs.filter((p) => p.e === ei).length > 1 ? 'split' as const : 'extent' as const,
    })));
  };
  const freezes: RecognitionFreeze[] = existing.flatMap((g, ei) => {
    if (!extentChanges(ei)) return [];
    const places = [...new Set(refsOf[ei]!.filter((r) => EXTENT_PLACES.has(r.place)).map((r) => r.place))];
    return places.length ? [{ fromId: g.id, fromName: g.name, places }] : [];
  });

  // Names: a kept element keeps its own; a new one gets the next free number of its prefix.
  const used = new Set(modelStore.model.groups.size ? [...modelStore.model.groups.values()].map((g) => g.name) : []);
  const proposals: RecognitionProposal[] = drafts.map((d, di) => {
    const ei = dMatch.get(di);
    const g = ei !== undefined ? existing[ei]! : undefined;
    const data = dataOf(d);
    const touches = new Set(pairs.filter((p) => p.d === di).map((p) => p.e));
    const flags = flagsOf(d, levelCount);
    if (touches.size > 1) flags.push('merges');
    if (g && pairs.filter((p) => p.e === ei).length > 1) flags.push('splits');
    let status: ProposalStatus = 'new';
    if (g) status = sameSet(dKeys[di]!, eKeys[ei!]!) && sameData(g.data, data) ? 'same' : 'changed';
    let name = g?.name ?? d.name;
    if (!g && used.has(name)) {
      const prefix = name.replace(/\d+$/, '');
      let n = 1;
      while (used.has(`${prefix}${n}`)) n++;
      name = `${prefix}${n}`;
    }
    if (!g) used.add(name);
    const conflicts = conflictsOf(di);
    if (conflicts.length) flags.push('conflict');
    return { key: `p${di}`, draft: d, kind: d.kind, status, ...(g ? { keepId: g.id } : {}), name, flags, conflicts };
  });

  // Existing elements no proposal keeps: their successor is the proposal holding most of their members.
  const removals: RecognitionRemoval[] = existing.flatMap((g, ei) => {
    if (eMatch.has(ei)) return [];
    const best = pairs.filter((p) => p.e === ei).sort((a, b) => b.shared - a.shared)[0];
    let successorId: number | undefined;
    if (!best) {
      let most = 0;
      for (const dg of declared) {
        const k = keysOf(dg.members);
        let shared = 0;
        for (const x of eKeys[ei]!) if (k.has(x)) shared++;
        if (shared > most) { most = shared; successorId = dg.id; }
      }
    }
    return [{
      id: g.id, name: g.name, kind: g.physical.kind,
      ...(best ? { successorKey: `p${best.d}` } : {}),
      ...(successorId !== undefined ? { successorId } : {}),
      references: refsOf[ei]!,
    }];
  });

  const changes = proposals.some((p) => p.status !== 'same') || removals.length > 0;
  return { proposals, removals, freezes, declared: declared.length, changes };
}

/**
 * Apply a plan, all of it or what `accept` keeps. One undo step; nothing at all when it would
 * change nothing.
 */
export function applyRecognition(
  plan: RecognitionPlan,
  /** By default a proposal with a conflict is left out: accepting it is the person's call. */
  accept: (p: RecognitionProposal) => boolean = (p) => p.conflicts.length === 0,
): RecognitionOutcome {
  const chosen = plan.proposals.filter((p) => p.status !== 'same' && accept(p));
  const chosenKeys = new Set(chosen.map((p) => p.key));
  /*
   * An element goes when the proposal that takes its members was accepted. With no proposal
   * (its members now belong to declared elements, or are gone) it goes too, its references
   * moving to the declared element that holds most of its members; when there is none and
   * something still points at it, it stays, so nothing is left pointing at nothing.
   */
  const removals = plan.removals.filter((r) => (r.successorKey !== undefined
    ? chosenKeys.has(r.successorKey)
    : r.successorId !== undefined || r.references.length === 0));
  const kept = plan.proposals.filter((p) => p.status === 'same').length;
  if (chosen.length === 0 && removals.length === 0) {
    return { applied: 0, kept, created: 0, removed: 0, remapped: 0, channel: 'none', frozen: 0, conflicts: [], dropped: [] };
  }

  const analysisRefs = removals.some((r) => r.references.some((x) => x.analysis));
  // A changed element whose members move can change a floor load targeted at it: the analysis reads that.
  const changedTargeted = chosen.some((p) => p.keepId !== undefined && groupReferences(p.keepId).some((x) => x.analysis));
  const structural = analysisRefs || changedTargeted;
  const run = structural ? (fn: () => void) => modelStore.batch(fn) : (fn: () => void) => modelStore.batchDesign(fn);

  // Only what is applied: an element whose proposal stays out keeps its members and its references.
  const removing = new Set(removals.map((r) => r.id));
  const changedKept = new Set(chosen.filter((p) => p.keepId !== undefined && p.status === 'changed').map((p) => p.keepId!));
  // An element also changes when an accepted proposal takes some of its members, even if its own stays out.
  const taking = new Set(chosen.flatMap((p) => [...keysOf(p.draft)]));
  const losing = new Set(physicalGroups().filter((g) => !changedKept.has(g.id) && [...keysOf(g.members)].some((k) => taking.has(k))).map((g) => g.id));
  const freezes = plan.freezes.filter((f) => removing.has(f.fromId) || changedKept.has(f.fromId) || losing.has(f.fromId));
  const conflicts = chosen.flatMap((p) => p.conflicts);
  let created = 0, remapped = 0, frozen = 0;
  const dropped: DroppedValue[] = [];
  run(() => {
    /*
     * First the references whose extent is a member set: onto a plain group with exactly the
     * members they had, before any member moves. Nothing the analysis reads changes extent.
     */
    for (const f of freezes) {
      const g = modelStore.model.groups.get(f.fromId);
      if (!g) continue;
      const id = modelStore.addGroup(`${g.name} · ${tr('physical.review.frozenSuffix')}`, 'selection', g.members, { origin: 'derived' });
      remapped += remapGroupReferences(new Map([[f.fromId, id]]), EXTENT_PLACES).moved;
      frozen++;
    }
    const idOf = new Map<string, number>();
    for (const p of chosen) {
      const { elements, plates, quads } = p.draft;
      const members = { ...(elements.length ? { elements } : {}), ...(plates.length ? { plates } : {}), ...(quads.length ? { quads } : {}) };
      if (p.keepId !== undefined && modelStore.model.groups.has(p.keepId)) {
        modelStore.setGroupMembers(p.keepId, members);
        modelStore.setGroupData(p.keepId, dataOf(p.draft));
        idOf.set(p.key, p.keepId);
      } else {
        idOf.set(p.key, modelStore.addGroup(p.name, PHYSICAL_GROUP_KIND, members, { origin: 'derived', data: dataOf(p.draft) }));
        created++;
      }
    }
    // Members an accepted proposal took leave any other inferred element that still lists them.
    const takenKeys = new Set(chosen.flatMap((p) => [...keysOf(p.draft)]));
    const ownIds = new Set(idOf.values());
    for (const g of physicalGroups()) {
      if (g.physical.provenance === 'declared' || ownIds.has(g.id) || removing.has(g.id)) continue;
      const left = {
        elements: (g.members.elements ?? []).filter((id) => !takenKeys.has(`e${id}`)),
        plates: (g.members.plates ?? []).filter((id) => !takenKeys.has(`p${id}`)),
        quads: (g.members.quads ?? []).filter((id) => !takenKeys.has(`q${id}`)),
      };
      if (left.elements.length + left.plates.length + left.quads.length
        === (g.members.elements?.length ?? 0) + (g.members.plates?.length ?? 0) + (g.members.quads?.length ?? 0)) continue;
      modelStore.setGroupMembers(g.id, {
        ...(left.elements.length ? { elements: left.elements } : {}),
        ...(left.plates.length ? { plates: left.plates } : {}),
        ...(left.quads.length ? { quads: left.quads } : {}),
      });
    }
    // References first, so removing the old element never finds anything still pointing at it.
    const map = new Map<number, number>();
    for (const r of removals) {
      const to = r.successorKey ? idOf.get(r.successorKey) : r.successorId;
      if (to !== undefined) map.set(r.id, to);
    }
    if (map.size > 0) {
      const r = remapGroupReferences(map);
      remapped += r.moved;
      dropped.push(...r.dropped);
    }
    for (const r of removals) modelStore.removeGroup(r.id);
  });

  return {
    applied: chosen.length, kept, created, removed: removals.length, remapped,
    channel: structural ? 'structural' : 'design', frozen, conflicts, dropped,
  };
}

/** Recognise and apply everything at once (the command without review). Returns the elements now. */
export function recognizeAndApply(): RecognitionOutcome {
  return applyRecognition(planRecognition());
}
