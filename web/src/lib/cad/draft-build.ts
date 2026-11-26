// Draft build orchestration (PR [14] Layers 2 & 3).
//
// The single entrypoint the wizard uses. It wraps the untouched, deterministic
// generateRcDraft with two opt-in capabilities, keeping every inferred action
// honest and visible in the provenance/warnings:
//
//   Layer 2 — real-DXF inference (opt-in): prune annotation strokes off beam
//     layers, infer slab panels from the beam grid, snap inferred corners to
//     columns, and prune generated members that float free of the structure.
//
//   Layer 3 — per-floor plans: assign cropped plans to floor ranges and
//     compose one model whose geometry differs by floor. Columns that do not
//     continue between adjacent plans become hanging members and are pruned
//     (and reported), so the composed model stays a connected structure.
//
// Single-plan, no-inference calls pass straight through to generateRcDraft —
// identical output, zero behavior change for the existing path.

import type { ArchPlan, CadPt, RcDraftAssumptions, RcDraftResult, DraftWarning } from './types';
import { generateRcDraft, isReplicatedPlanAssumption, type DraftSource } from './draft';
import { t, tp } from '../i18n';
import { draftPreviewStats } from './draft-preview';
import {
  panelsFromBeamGrid, snapPanelCornersToColumns,
  pruneBeamsDisconnectedFromColumns, pruneFloating,
} from './infer';
import { dyadicInteger } from '../engine/accounting-math';
import { pointInPolygon, pointOnSegment } from './geometry';
import { PLATE_EDGE_TOL } from '../model/physical/plate-analysis';
import type { ModelSnapshot } from '../store/history.svelte';

export interface InferenceOptions {
  /** Drop beam-layer fragments not connected to any column (leaders/annotation). */
  pruneDisconnectedBeams?: boolean;
  /** Infer slab panels from the beam/column grid (INVENTS slabs — user-confirmed). */
  inferSlabPanels?: boolean;
  /** Snap inferred panel corners to the nearest column axis. */
  snapPanelsToColumns?: boolean;
  /** After generation, drop members not reachable from a support. */
  pruneFloatingMembers?: boolean;
}

/** A cropped/parsed plan assigned to a 1-based inclusive floor range. */
export interface FloorPlanSpec {
  plan: ArchPlan;
  fromFloor: number;
  toFloor: number;
  /** Human label (source file / region) for the provenance plan-to-floor map. */
  label?: string;
}

export interface BuildDraftInput {
  /** Single-plan mode (replicated across all floors) — the simple default. */
  plan?: ArchPlan;
  /** Per-floor-range plans — overrides `plan` when present with >0 entries. */
  floorPlans?: FloorPlanSpec[];
  assumptions: RcDraftAssumptions;
  source: DraftSource;
  inference?: InferenceOptions;
  /** Multi-floor only: allow floors not covered by any plan (they are skipped).
   *  When false (default) an uncovered floor is an error, not a silent gap. */
  allowFloorGaps?: boolean;
}

export interface FloorRangeIssue { severity: 'error' | 'warn'; message: string; }

/**
 * Validate per-floor plan ranges BEFORE composing a multi-floor draft. Silent
 * duplication (overlap) or silent whole-block pruning (gaps) are the failure
 * modes this guards. Overlaps and out-of-range floors are always errors; an
 * uncovered floor is an error unless `allowGaps` (then a warning).
 */
export function validateFloorRanges(
  specs: FloorPlanSpec[], nFloors: number, allowGaps = false,
): FloorRangeIssue[] {
  const issues: FloorRangeIssue[] = [];
  const sorted = [...specs].sort((a, b) => a.fromFloor - b.fromFloor);
  for (const s of sorted) {
    if (!Number.isInteger(s.fromFloor) || !Number.isInteger(s.toFloor) ||
        s.fromFloor < 1 || s.toFloor > nFloors || s.fromFloor > s.toFloor) {
      issues.push({ severity: 'error', message: `floorRangeInvalid:${tp('cad.range.invalidDetail', { label: s.label ?? t('cad.range.planFallback'), from: s.fromFloor, to: s.toFloor, n: nFloors })}` });
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].fromFloor <= sorted[i - 1].toFloor) {
      issues.push({ severity: 'error', message: `floorRangeOverlap:${tp('cad.range.overlapDetail', { a: sorted[i - 1].label ?? t('cad.range.planFallback'), b: sorted[i].label ?? t('cad.range.planFallback'), floor: sorted[i].fromFloor })}` });
    }
  }
  const missing: number[] = [];
  for (let f = 1; f <= nFloors; f++) {
    if (!sorted.some((s) => f >= s.fromFloor && f <= s.toFloor)) missing.push(f);
  }
  if (missing.length) {
    issues.push({ severity: allowGaps ? 'warn' : 'error', message: `floorRangeGap:${tp('cad.range.gapDetail', { floors: missing.join(', ') })}` });
  }
  return issues;
}

interface InferenceReport {
  prunedBeams: number;
  inferredPanels: number;
  droppedCells: number;
  snappedCorners: number;
  gridX: number;
  gridY: number;
}

const emptyReport = (): InferenceReport => ({
  prunedBeams: 0, inferredPanels: 0, droppedCells: 0, snappedCorners: 0, gridX: 0, gridY: 0,
});

/** Deep-clone the mutable geometry of a plan so inference never touches the
 *  caller's ArchPlan. */
function clonePlan(plan: ArchPlan): ArchPlan {
  return {
    ...plan,
    mappings: plan.mappings.map((m) => ({ ...m })),
    columns: plan.columns.map((c) => ({ ...c, at: { ...c.at } })),
    beams: plan.beams.map((b) => ({ ...b, a: { ...b.a }, b: { ...b.b } })),
    walls: plan.walls.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } })),
    slabs: plan.slabs.map((s) => ({ ...s, outline: s.outline.map((p) => ({ ...p })) })),
    openings: plan.openings.map((o) => ({ outline: o.outline.map((p) => ({ ...p })) })),
    roomLabels: plan.roomLabels.map((r) => ({ ...r, at: { ...r.at } })),
    schedules: plan.schedules.map((s) => ({ ...s })),
    gridLines: plan.gridLines.map((g) => ({ a: { ...g.a }, b: { ...g.b } })),
    warnings: [...plan.warnings],
    skipped: plan.skipped.map((s) => ({ ...s })),
  };
}

/** Apply the opt-in inference steps to a CLONE of the plan; returns the clone
 *  plus a report of what was inferred (for provenance/warnings). */
export function applyInference(
  plan: ArchPlan, inf: InferenceOptions | undefined, snapTol: number,
): { plan: ArchPlan; report: InferenceReport } {
  const report = emptyReport();
  if (!inf) return { plan, report };
  const clone = clonePlan(plan);

  if (inf.pruneDisconnectedBeams) {
    report.prunedBeams = pruneBeamsDisconnectedFromColumns(clone, Math.max(snapTol, 0.05));
  }

  if (inf.inferSlabPanels) {
    const { slabs, xs, ys, dropped } = panelsFromBeamGrid(clone.beams, clone.columns);
    if (inf.snapPanelsToColumns) report.snappedCorners = snapPanelCornersToColumns(slabs, clone.columns);
    // Never invent a panel where a slab was actually drawn — keep drawn slabs,
    // add only inferred panels whose centroid is not inside an existing slab.
    const drawn = clone.slabs.slice();
    const centroid = (pts: CadPt[]): CadPt => {
      let x = 0, y = 0;
      for (const p of pts) { x += p.x; y += p.y; }
      return { x: x / pts.length, y: y / pts.length };
    };
    const fresh = slabs.filter((s) => !drawn.some((d) => pointInPolygon(centroid(s.outline), d.outline)));
    for (const s of fresh) { s.inferred = true; s.srcLayer = '(inferred grid)'; }
    clone.slabs.push(...fresh);
    report.inferredPanels = fresh.length;
    report.droppedCells = dropped;
    report.gridX = xs.length;
    report.gridY = ys.length;
  }

  return { plan: clone, report };
}

/** Recompute the counts that pruneFloating invalidates, from the snapshot. */
function recountAfterPrune(result: RcDraftResult): void {
  const s = draftPreviewStats(result.snapshot);
  const c = result.counts;
  c.nodes = s.nodes;
  c.columns = s.columns;
  c.beams = s.beams;
  c.slabQuads = s.slabQuads;
  c.slabTriangles = s.slabTriangles;
  c.wallQuads = s.wallQuads;
  c.supports = result.snapshot.supports.length;
  c.loads = result.snapshot.loads.length;
  // Prune may drop offset-carrying elements, and mergeRanges never sums this
  // count across ranges — recompute it from the final snapshot so the review
  // table doesn't report 0 offset beams on a model that has them.
  c.beamsWithOffsets = result.snapshot.elements.filter(([, e]) => (e as { offset?: unknown }).offset != null).length;
}

function pushInferenceProvenance(result: RcDraftResult, report: InferenceReport, inf: InferenceOptions): void {
  const a = result.provenance.assumptions; // same object as snapshot.provenance
  if (inf.pruneDisconnectedBeams && report.prunedBeams > 0) {
    a.push(tp('cad.assume.prunedBeams', { n: report.prunedBeams }));
    result.warnings.push({ severity: 'warning', message: `prunedDisconnectedBeams:${report.prunedBeams}` });
  }
  if (inf.inferSlabPanels && report.inferredPanels > 0) {
    a.push(tp('cad.assume.inferredPanels', {
      gx: report.gridX, gy: report.gridY, n: report.inferredPanels, dropped: report.droppedCells,
      snapped: report.snappedCorners > 0 ? tp('cad.assume.inferredSnapped', { n: report.snappedCorners }) : '',
    }));
    result.warnings.push({ severity: 'warning', message: `inferredSlabPanels:${report.inferredPanels}` });
  }
}

/** Single-plan build (with optional inference + floating prune). */
function buildSinglePlan(input: BuildDraftInput): RcDraftResult {
  const inf = input.inference;
  const { plan, report } = applyInference(input.plan!, inf, input.assumptions.snapTolerance);
  const result = generateRcDraft(plan, input.assumptions, input.source);
  if (inf) pushInferenceProvenance(result, report, inf);
  if (inf?.pruneFloatingMembers) {
    const removed = pruneFloating(result.snapshot);
    const removedShells = removed.quads + removed.plates;
    if (removed.elements > 0 || removed.nodes > 0 || removedShells > 0) {
      recountAfterPrune(result);
      result.provenance.assumptions.push(tp('cad.assume.prunedFloating', { members: removed.elements, shells: removedShells, nodes: removed.nodes }));
      result.warnings.push({ severity: 'warning', message: `prunedFloatingMembers:${removed.elements + removedShells}` });
    }
  }
  return result;
}

// ── Multi-floor composition (Layer 3) ─────────────────────────────

interface RangeBuild { result: RcDraftResult; zShift: number; localTop: number; spec: FloorPlanSpec }

function cumulativeHeights(heights: number[]): number[] {
  const out = [0];
  for (const h of heights) out.push(out[out.length - 1] + h);
  return out;
}

/** Compose per-floor-range plans into one connected model. */
function buildMultiFloor(input: BuildDraftInput, gapWarnings: FloorRangeIssue[] = []): RcDraftResult {
  const N = input.assumptions.nFloors;
  const heights = input.assumptions.storyHeights.length === N
    ? input.assumptions.storyHeights
    : Array.from({ length: N }, () => input.assumptions.storyHeights[0] ?? 3);
  const cum = cumulativeHeights(heights);
  const specs = [...input.floorPlans!].sort((p, q) => p.fromFloor - q.fromFloor);
  const topFloor = Math.max(...specs.map((s) => s.toFloor));
  const rangeIssues: FloorRangeIssue[] = [...gapWarnings];

  const builds: RangeBuild[] = [];
  for (const spec of specs) {
    const size = spec.toFloor - spec.fromFloor + 1;
    if (size < 1) continue;
    const rangeAssumptions: RcDraftAssumptions = {
      ...input.assumptions,
      nFloors: size,
      storyHeights: heights.slice(spec.fromFloor - 1, spec.toFloor),
      // Only the top range's roof carries Lr; lower ranges get L everywhere.
      roofLiveLoad: spec.toFloor === topFloor ? input.assumptions.roofLiveLoad : undefined,
      // Schedules are authored as BUILDING floors; generateRcDraft resolves them
      // against this range's LOCAL 1-based floors (draft.ts uses k+1). Rebase each
      // row into range-local coordinates and drop rows outside [1..size], or the
      // schedule would silently mis-apply (or miss) sections in any range that
      // doesn't start at building floor 1. (CAD-embedded plan.schedules stay per
      // plan and are not rebased here.)
      schedules: (input.assumptions.schedules ?? [])
        .map((s) => ({ ...s, fromFloor: s.fromFloor - spec.fromFloor + 1, toFloor: s.toFloor - spec.fromFloor + 1 }))
        .filter((s) => s.toFloor >= 1 && s.fromFloor <= size),
    };
    const { plan, report } = applyInference(spec.plan, input.inference, input.assumptions.snapTolerance);
    const result = generateRcDraft(plan, rangeAssumptions, input.source);
    if (input.inference) pushInferenceProvenance(result, report, input.inference);
    // A plan that contributes no structure is a real defect (empty crop / all
    // pruned): surface it at error severity rather than silently building fewer
    // floors than the provenance implies.
    if ((result.counts.columns + result.counts.beams) === 0) {
      rangeIssues.push({ severity: 'error', message: `emptyFloorRange:${tp('cad.range.emptyDetail', { label: spec.label ?? t('cad.range.planFallback'), from: spec.fromFloor, to: spec.toFloor })}` });
    }
    const localTop = rangeAssumptions.storyHeights.reduce((sum, height) => sum + height, 0);
    builds.push({ result, zShift: cum[spec.fromFloor - 1], localTop, spec });
  }

  const { result: merged, rangeElemIds, rangeQuadIds, rangePlateIds } = mergeRanges(builds, input.assumptions);
  // Hanging members (columns that don't continue between adjacent plans) →
  // prune to keep a connected model, always for multi-floor (reported).
  const removed = pruneFloating(merged.snapshot);

  // A whole floor range can be silently deleted here: a mid-height gap leaves an
  // upper block disconnected from any support, so pruneFloating removes all of
  // it (the largest SUPPORTED component wins). That range contributed members
  // yet none survive — surface it as an error rather than a lone provenance line.
  const survElem = new Set(merged.snapshot.elements.map(([id]) => id));
  const survQuad = new Set((merged.snapshot.quads ?? []).map(([id]) => id));
  const survPlate = new Set((merged.snapshot.plates ?? []).map(([id]) => id));
  const prunedAway = builds.filter((_, i) => {
    const els = rangeElemIds[i] ?? [], qs = rangeQuadIds[i] ?? [];
    const ps = rangePlateIds[i] ?? [];
    if (els.length + qs.length + ps.length === 0) return false; // 0-member range → emptyFloorRange already
    return !els.some((id) => survElem.has(id)) && !qs.some((id) => survQuad.has(id)) && !ps.some(id => survPlate.has(id));
  });
  if (prunedAway.length > 0) {
    rangeIssues.push({ severity: 'error', message: `floorRangePruned:${prunedAway.map((b) => b.spec.label ?? t('cad.range.planFallback')).join(', ')}` });
  }

  // Provenance: replace the misleading "replicated across all floors" line.
  const planMap = specs
    .map((s) => tp('cad.assume.planMapItem', { label: s.label ?? t('cad.range.planFallback'), from: s.fromFloor, to: s.toFloor }))
    .join('; ');
  const assumptions = merged.snapshot.provenance!.assumptions
    .filter((line) => !isReplicatedPlanAssumption(line));
  assumptions.unshift(tp('cad.assume.perFloorPlans', { map: planMap, members: removed.elements, shells: removed.quads + removed.plates, nodes: removed.nodes }));
  merged.snapshot.provenance!.assumptions = assumptions;
  merged.provenance.assumptions = assumptions;
  merged.warnings.push({ severity: 'info', message: `perFloorPlans:${specs.length}` });
  // Surface gap warnings (allowFloorGaps) and per-range 0-member defects on the
  // built draft so the wizard and diagnostics see them without re-validating.
  for (const iss of rangeIssues) {
    merged.warnings.push({ severity: iss.severity === 'warn' ? 'warning' : 'error', message: iss.message });
  }
  recountAfterPrune(merged);
  return merged;
}

type RangeNode = ModelSnapshot['nodes'][number][1];

type InterfaceNode = RangeNode & { physical: boolean };
type InterfacePair = { from: number; to: number; distance: bigint; physical: number };

function interfaceNodes(snapshot: ModelSnapshot, z: number): InterfaceNode[] {
  const nodes = new Map(snapshot.nodes);
  const level = (id: number) => nodes.get(id)?.z ?? 0;
  const physical = new Set(snapshot.elements.flatMap(([, member]) =>
    level(member.nodeI) !== level(member.nodeJ) ? [member.nodeI, member.nodeJ] : []));
  const neighbours = new Map<number, Set<number>>();
  for (const [, wall] of snapshot.quads ?? []) {
    const stations = wall.nodes.filter(id => level(id) === z);
    if (stations.length !== 2) continue;
    const [a, b] = stations as [number, number];
    for (const [id, other] of [[a, b], [b, a]] as const) {
      const adjacent = neighbours.get(id) ?? new Set<number>();
      adjacent.add(other);
      neighbours.set(id, adjacent);
    }
  }
  for (const [id, adjacent] of neighbours) {
    const [a, b] = adjacent;
    if (adjacent.size !== 2 || pointOnSegment(nodes.get(id)!, nodes.get(a!)!, nodes.get(b!)!, PLATE_EDGE_TOL, 0) === null) {
      physical.add(id);
    }
  }
  return snapshot.nodes.flatMap(([, node]) => (node.z ?? 0) === z
    ? [{ ...node, physical: physical.has(node.id) }] : []);
}

function matchInterfaceComponent(fromIds: readonly number[], pairs: ReadonlyMap<number, InterfacePair[]>): Map<number, InterfacePair> {
  const matches = new Map<number, InterfacePair>(), reverse = new Map<number, InterfacePair>();
  type Route = { physical: number; distance: bigint; pair?: InterfacePair };
  const better = (a: Route, b?: Route) => !b || a.physical < b.physical || (a.physical === b.physical && a.distance < b.distance);
  while (matches.size < fromIds.length) {
    const routes = new Map<number, Route>(), arrivals = new Map<number, Route>();
    const queue: number[] = [];
    for (const id of fromIds) if (!matches.has(id)) {
      routes.set(id, { physical: 0, distance: 0n });
      queue.push(id);
    }
    const queued = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i]!, route = routes.get(from)!;
      queued.delete(from);
      for (const pair of pairs.get(from) ?? []) {
        if (matches.get(from) === pair) continue;
        const next = { physical: route.physical - pair.physical, distance: route.distance + pair.distance, pair };
        if (!better(next, arrivals.get(pair.to))) continue;
        arrivals.set(pair.to, next);
        const taken = reverse.get(pair.to);
        if (!taken) continue;
        const swap = { physical: next.physical + taken.physical, distance: next.distance + taken.distance };
        if (!better(swap, routes.get(taken.from))) continue;
        routes.set(taken.from, swap);
        if (!queued.has(taken.from)) {
          queued.add(taken.from);
          queue.push(taken.from);
        }
      }
    }
    let best: Route | undefined;
    for (const [to, route] of arrivals) if (!reverse.has(to) && better(route, best)) best = route;
    if (!best?.pair || best.physical > 0) break;
    let pair: InterfacePair | undefined = best.pair;
    while (pair) {
      const previous = matches.get(pair.from);
      matches.set(pair.from, pair);
      reverse.set(pair.to, pair);
      pair = previous && arrivals.get(previous.to)?.pair;
    }
  }
  return matches;
}

function rangeInterfaceMatches(
  below: InterfaceNode[], above: InterfaceNode[], tolerance: number,
): Map<number, number> {
  const key = (x: number, y: number) => `${x}|${y}`;
  const index = new Map<string, InterfaceNode[]>();
  for (const node of below) {
    const cell = key(Math.floor(node.x / tolerance), Math.floor(node.y / tolerance));
    const entries = index.get(cell);
    if (entries) entries.push(node);
    else index.set(cell, [node]);
  }
  const pairs = new Map<number, InterfacePair[]>(), sources = new Map<number, number[]>();
  for (const node of above) {
    const x = Math.floor(node.x / tolerance), y = Math.floor(node.y / tolerance);
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      for (const target of index.get(key(x + dx, y + dy)) ?? []) {
        const distance = Math.hypot(target.x - node.x, target.y - node.y);
        if (distance < tolerance) {
          const pair = { from: node.id, to: target.id, distance: dyadicInteger(distance), physical: Number(node.physical && target.physical) };
          (pairs.get(node.id) ?? pairs.set(node.id, []).get(node.id)!).push(pair);
          (sources.get(target.id) ?? sources.set(target.id, []).get(target.id)!).push(node.id);
        }
      }
    }
  }
  const matches = new Map<number, number>();
  const remaining = new Set(pairs.keys());
  for (const first of remaining) {
    const component = [first], seenTargets = new Set<number>();
    remaining.delete(first);
    for (const from of component) for (const { to } of pairs.get(from)!) {
      if (seenTargets.has(to)) continue;
      seenTargets.add(to);
      for (const next of sources.get(to)!) if (remaining.delete(next)) component.push(next);
    }
    for (const [from, pair] of matchInterfaceComponent(component, pairs)) matches.set(from, pair.to);
  }
  return matches;
}

/** Merge per-range RcDraftResults into one snapshot (weld by coordinate,
 *  renumber ids, dedup sections, regenerate base supports). Also returns, per
 *  range (aligned with `builds`), the global element/quad ids it contributed —
 *  so the caller can tell whether a range's structure survived the prune. */
function mergeRanges(builds: RangeBuild[], assumptions: RcDraftAssumptions):
  { result: RcDraftResult; rangeElemIds: number[][]; rangeQuadIds: number[][]; rangePlateIds: number[][] } {
  const cadWallSlabMesh = builds.some(({ result }) => result.provenance.cadWallSlabMesh);
  const nodes: ModelSnapshot['nodes'] = [];
  const elements: ModelSnapshot['elements'] = [];
  const quads: NonNullable<ModelSnapshot['quads']> = [];
  const plates: NonNullable<ModelSnapshot['plates']> = [];
  const sections: ModelSnapshot['sections'] = [];
  const loads: ModelSnapshot['loads'] = [];
  let nextNode = 1, nextElem = 1, nextQuad = 1, nextPlate = 1, nextLoad = 1;

  // Section dedup by name.
  const sectionByName = new Map<string, number>();
  const aggCounts: RcDraftResult['counts'] = {
    nodes: 0, columns: 0, beams: 0, slabQuads: 0, slabTriangles: 0, wallQuads: 0, supports: 0, loads: 0,
    combinations: 0, beamsSplit: 0, slabsSkipped: 0, beamsWithOffsets: 0, offsetsAmbiguous: 0,
    specSections: { schedule: 0, label: 0, geometry: 0, default: 0 },
    scheduleAssignments: 0, openingsDetected: 0, openingsCutFromSlabs: 0, openingsNotCut: 0,
    cantileverSlabs: 0, slabsIsolated: 0, liveLoadByCategory: {}, liveLoadDefaulted: 0,
  };
  const warnings: DraftWarning[] = [];
  let topProvenanceAssumptions: string[] = [];
  let topLoadCases: ModelSnapshot['loadCases'] = [];
  let topCombinations: ModelSnapshot['combinations'] = [];
  let maxTopFloor = -Infinity;
  // The global element/quad ids each range contributed, so the caller can detect
  // a range whose whole structure was pruned during composition.
  const rangeElemIds: number[][] = [];
  const rangeQuadIds: number[][] = [];
  const rangePlateIds: number[][] = [];

  let previous: { floor: number; surface: InterfaceNode[] } | undefined;
  for (const { result, zShift, localTop, spec } of builds) {
    const snap = result.snapshot;
    const myElems: number[] = [];
    const myQuads: number[] = [];
    const myPlates: number[] = [];
    const localToGlobalNode = previous?.floor === spec.fromFloor - 1
      ? rangeInterfaceMatches(previous.surface, interfaceNodes(snap, 0), assumptions.snapTolerance)
      : new Map<number, number>();
    for (const [, node] of snap.nodes) {
      if (localToGlobalNode.has(node.id)) continue;
      const id = nextNode++;
      const z = (node.z ?? 0) + zShift;
      const global = { id, x: node.x, y: node.y, ...(z !== 0 && { z }) };
      nodes.push([id, global]);
      localToGlobalNode.set(node.id, id);
    }
    previous = {
      floor: spec.toFloor,
      surface: interfaceNodes(snap, localTop).map(node => ({ ...node, id: localToGlobalNode.get(node.id)! })),
    };
    const localToGlobalSection = new Map<number, number>();
    for (const [, s] of snap.sections) {
      let gid = sectionByName.get(s.name);
      if (gid == null) {
        gid = sections.length + 1;
        sections.push([gid, { ...s, id: gid }]);
        sectionByName.set(s.name, gid);
      }
      localToGlobalSection.set(s.id, gid);
    }
    for (const [, e] of snap.elements) {
      const id = nextElem++;
      myElems.push(id);
      elements.push([id, {
        ...e, id,
        nodeI: localToGlobalNode.get(e.nodeI)!,
        nodeJ: localToGlobalNode.get(e.nodeJ)!,
        sectionId: localToGlobalSection.get(e.sectionId) ?? e.sectionId,
      }]);
    }
    const localToGlobalQuad = new Map<number, number>();
    for (const [, q] of snap.quads ?? []) {
      const id = nextQuad++;
      myQuads.push(id);
      localToGlobalQuad.set(q.id, id);
      quads.push([id, { ...q, id, nodes: q.nodes.map((n) => localToGlobalNode.get(n)!) as [number, number, number, number] }]);
    }
    const localToGlobalPlate = new Map<number, number>();
    for (const [, p] of snap.plates ?? []) {
      const id = nextPlate++;
      myPlates.push(id);
      localToGlobalPlate.set(p.id, id);
      plates.push([id, { ...p, id, nodes: p.nodes.map(n => localToGlobalNode.get(n)!) as [number, number, number] }]);
    }
    for (const l of snap.loads) {
      const d = { ...l.data } as { id?: number; quadId?: number; on?: 'plate' };
      d.id = nextLoad++;
      if (d.quadId !== undefined) {
        const shells = d.on === 'plate' ? localToGlobalPlate : localToGlobalQuad;
        d.quadId = shells.get(d.quadId) ?? d.quadId;
      }
      loads.push({ type: l.type, data: d });
    }
    // Aggregate informational counts.
    const c = result.counts;
    aggCounts.beamsSplit += c.beamsSplit;
    aggCounts.slabsSkipped += c.slabsSkipped;
    aggCounts.offsetsAmbiguous += c.offsetsAmbiguous;
    aggCounts.scheduleAssignments += c.scheduleAssignments;
    aggCounts.openingsDetected += c.openingsDetected;
    aggCounts.openingsCutFromSlabs += c.openingsCutFromSlabs;
    aggCounts.openingsNotCut += c.openingsNotCut;
    aggCounts.cantileverSlabs += c.cantileverSlabs;
    aggCounts.slabsIsolated += c.slabsIsolated;
    aggCounts.liveLoadDefaulted += c.liveLoadDefaulted;
    for (const k of ['schedule', 'label', 'geometry', 'default'] as const) aggCounts.specSections[k] += c.specSections[k];
    for (const [cat, n] of Object.entries(c.liveLoadByCategory)) aggCounts.liveLoadByCategory[cat] = (aggCounts.liveLoadByCategory[cat] ?? 0) + n;
    for (const w of result.warnings) warnings.push(w);
    // The top range owns the canonical load cases/combos (it has Lr).
    if (spec.toFloor > maxTopFloor) {
      maxTopFloor = spec.toFloor;
      topLoadCases = snap.loadCases ?? [];
      topCombinations = snap.combinations ?? [];
      topProvenanceAssumptions = [...(snap.provenance?.assumptions ?? [])];
    }
    rangeElemIds.push(myElems);
    rangeQuadIds.push(myQuads);
    rangePlateIds.push(myPlates);
  }

  // Regenerate base supports from welded ground nodes (z ≈ 0).
  const supports: ModelSnapshot['supports'] = [];
  let supId = 1;
  for (const [, n] of nodes) {
    if ((n.z ?? 0) === 0) supports.push([supId++, { id: supId - 1, nodeId: n.id, type: assumptions.baseSupport }]);
  }

  const material = builds[0]?.result.snapshot.materials ?? [];
  const provenance = {
    ...(builds[0]?.result.provenance ?? {}),
    assumptions: topProvenanceAssumptions,
    ...(cadWallSlabMesh && { cadWallSlabMesh }),
  } as RcDraftResult['provenance'];

  const snapshot: ModelSnapshot = {
    name: builds[0]?.result.snapshot.name ?? t('cad.draftNameFallback'),
    analysisMode: 'pro',
    nodes, materials: material, sections, elements, supports, loads,
    loadCases: topLoadCases, combinations: topCombinations,
    plates, quads, constraints: [], connectors: [],
    provenance,
    nextId: {
      node: nextNode, material: 2, section: sections.length + 1, element: nextElem,
      support: supId, load: nextLoad, loadCase: (topLoadCases?.length ?? 0) + 1,
      combination: (topCombinations?.length ?? 0) + 1, plate: nextPlate, quad: nextQuad, connector: 1,
    },
  };
  aggCounts.combinations = topCombinations?.length ?? 0;

  return { result: { snapshot, provenance, warnings, counts: aggCounts }, rangeElemIds, rangeQuadIds, rangePlateIds };
}

/**
 * Build a reviewable RC draft. Single-plan with no inference passes straight
 * through to generateRcDraft (identical output). Inference and per-floor plans
 * are opt-in and always recorded in the provenance/warnings.
 */
export function buildDraft(input: BuildDraftInput): RcDraftResult {
  if (input.floorPlans && input.floorPlans.length > 0) {
    const issues = validateFloorRanges(input.floorPlans, input.assumptions.nFloors, input.allowFloorGaps);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      // Refuse to silently duplicate (overlap) or drop (gap) whole floor blocks.
      throw new Error('Invalid floor ranges — ' + errors.map((e) => e.message).join('; '));
    }
    return buildMultiFloor(input, issues.filter((i) => i.severity === 'warn'));
  }
  return buildSinglePlan(input);
}
