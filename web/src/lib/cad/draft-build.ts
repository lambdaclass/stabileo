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
import { generateRcDraft, type DraftSource } from './draft';
import { draftPreviewStats } from './draft-preview';
import {
  panelsFromBeamGrid, snapPanelCornersToColumns,
  pruneBeamsDisconnectedFromColumns, pruneFloating,
} from './infer';
import { pointInPolygon } from './geometry';
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
      issues.push({ severity: 'error', message: `floorRangeInvalid:${s.label ?? 'plan'} (${s.fromFloor}-${s.toFloor}; building has ${nFloors} floor(s))` });
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].fromFloor <= sorted[i - 1].toFloor) {
      issues.push({ severity: 'error', message: `floorRangeOverlap:${sorted[i - 1].label ?? 'plan'} & ${sorted[i].label ?? 'plan'} both cover floor ${sorted[i].fromFloor}` });
    }
  }
  const missing: number[] = [];
  for (let f = 1; f <= nFloors; f++) {
    if (!sorted.some((s) => f >= s.fromFloor && f <= s.toFloor)) missing.push(f);
  }
  if (missing.length) {
    issues.push({ severity: allowGaps ? 'warn' : 'error', message: `floorRangeGap:floor(s) ${missing.join(', ')} not covered by any plan` });
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
  c.wallQuads = s.wallQuads;
  c.supports = result.snapshot.supports.length;
  c.loads = result.snapshot.loads.length;
}

function pushInferenceProvenance(result: RcDraftResult, report: InferenceReport, inf: InferenceOptions): void {
  const a = result.provenance.assumptions; // same object as snapshot.provenance
  if (inf.pruneDisconnectedBeams && report.prunedBeams > 0) {
    a.push(`${report.prunedBeams} beam-layer fragment(s) not connected to any column (annotation strokes / leader lines) were dropped before generation (inference, opt-in).`);
    result.warnings.push({ severity: 'warning', message: `prunedDisconnectedBeams:${report.prunedBeams}` });
  }
  if (inf.inferSlabPanels && report.inferredPanels > 0) {
    a.push(`Slab panels were INFERRED from the beam grid (${report.gridX} x-lines × ${report.gridY} y-lines): ${report.inferredPanels} panel(s) added where ≥2 of 4 cell edges are beam-covered; ${report.droppedCells} cells dropped${report.snappedCorners > 0 ? `; ${report.snappedCorners} corner(s) snapped to the nearest column axis` : ''}. These slabs are NOT drawn in the DXF — verify against the architectural plan (inference, opt-in).`);
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
    if (removed.elements > 0 || removed.nodes > 0 || removed.quads > 0) {
      recountAfterPrune(result);
      result.provenance.assumptions.push(`${removed.elements} member(s) and ${removed.quads} shell(s) (${removed.nodes} node(s)) that floated free of the supported structure were pruned after generation, so the draft is a single connected model (inference, opt-in).`);
      result.warnings.push({ severity: 'warning', message: `prunedFloatingMembers:${removed.elements + removed.quads}` });
    }
  }
  return result;
}

// ── Multi-floor composition (Layer 3) ─────────────────────────────

interface RangeBuild { result: RcDraftResult; zShift: number; spec: FloorPlanSpec }

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
    };
    const { plan, report } = applyInference(spec.plan, input.inference, input.assumptions.snapTolerance);
    const result = generateRcDraft(plan, rangeAssumptions, input.source);
    if (input.inference) pushInferenceProvenance(result, report, input.inference);
    // A plan that contributes no structure is a real defect (empty crop / all
    // pruned): surface it at error severity rather than silently building fewer
    // floors than the provenance implies.
    if ((result.counts.columns + result.counts.beams) === 0) {
      rangeIssues.push({ severity: 'error', message: `emptyFloorRange:${spec.label ?? 'plan'} (floors ${spec.fromFloor}-${spec.toFloor}) contributed 0 members` });
    }
    builds.push({ result, zShift: cum[spec.fromFloor - 1], spec });
  }

  const merged = mergeRanges(builds, input.assumptions);
  // Hanging members (columns that don't continue between adjacent plans) →
  // prune to keep a connected model, always for multi-floor (reported).
  const removed = pruneFloating(merged.snapshot);

  // Provenance: replace the misleading "replicated across all floors" line.
  const planMap = specs
    .map((s) => `${s.label ?? 'plan'} → floors ${s.fromFloor}–${s.toFloor}`)
    .join('; ');
  const assumptions = merged.snapshot.provenance!.assumptions
    .filter((line) => !/replicated across all/i.test(line));
  assumptions.unshift(`Per-floor plans (geometry differs by floor): ${planMap}. Columns/members that do not continue between adjacent plans are hanging and were pruned after composition (${removed.elements} member(s), ${removed.quads} shell(s), ${removed.nodes} node(s)).`);
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

/** Merge per-range RcDraftResults into one snapshot (weld by coordinate,
 *  renumber ids, dedup sections, regenerate base supports). */
function mergeRanges(builds: RangeBuild[], assumptions: RcDraftAssumptions): RcDraftResult {
  const tol = assumptions.snapTolerance;
  const nodes: ModelSnapshot['nodes'] = [];
  const elements: ModelSnapshot['elements'] = [];
  const quads: NonNullable<ModelSnapshot['quads']> = [];
  const sections: ModelSnapshot['sections'] = [];
  const loads: ModelSnapshot['loads'] = [];
  let nextNode = 1, nextElem = 1, nextQuad = 1, nextLoad = 1;

  // Global node weld by rounded coordinate.
  const nodeKey = (x: number, y: number, z: number) =>
    `${Math.round(x / tol)}|${Math.round(y / tol)}|${Math.round(z / tol)}`;
  const nodeAt = new Map<string, number>();
  const weldNode = (x: number, y: number, z: number): number => {
    const key = nodeKey(x, y, z);
    const found = nodeAt.get(key);
    if (found != null) return found;
    const id = nextNode++;
    const n: { id: number; x: number; y: number; z?: number } = { id, x, y };
    if (z !== 0) n.z = z;
    nodes.push([id, n]);
    nodeAt.set(key, id);
    return id;
  };

  // Section dedup by name.
  const sectionByName = new Map<string, number>();
  const aggCounts: RcDraftResult['counts'] = {
    nodes: 0, columns: 0, beams: 0, slabQuads: 0, wallQuads: 0, supports: 0, loads: 0,
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

  for (const { result, zShift, spec } of builds) {
    const snap = result.snapshot;
    const localToGlobalNode = new Map<number, number>();
    for (const [, n] of snap.nodes) {
      const gid = weldNode(n.x, n.y, (n.z ?? 0) + zShift);
      localToGlobalNode.set(n.id, gid);
    }
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
      localToGlobalQuad.set(q.id, id);
      quads.push([id, { ...q, id, nodes: q.nodes.map((n) => localToGlobalNode.get(n)!) as [number, number, number, number] }]);
    }
    for (const l of snap.loads) {
      const d = { ...l.data } as { id?: number; quadId?: number };
      d.id = nextLoad++;
      if (d.quadId !== undefined) d.quadId = localToGlobalQuad.get(d.quadId) ?? d.quadId;
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
  } as RcDraftResult['provenance'];

  const snapshot: ModelSnapshot = {
    name: builds[0]?.result.snapshot.name ?? 'CAD draft',
    analysisMode: 'pro',
    nodes, materials: material, sections, elements, supports, loads,
    loadCases: topLoadCases, combinations: topCombinations,
    plates: [], quads, constraints: [], connectors: [],
    provenance,
    nextId: {
      node: nextNode, material: 2, section: sections.length + 1, element: nextElem,
      support: supId, load: nextLoad, loadCase: (topLoadCases?.length ?? 0) + 1,
      combination: (topCombinations?.length ?? 0) + 1, plate: 1, quad: nextQuad, connector: 1,
    },
  };
  aggCounts.combinations = topCombinations?.length ?? 0;

  return { snapshot, provenance, warnings, counts: aggCounts };
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
