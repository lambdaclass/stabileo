/**
 * Honest, geometry-derived member grouping.
 *
 * The model carries NO storeys, floors, grid lines or user groups — only node
 * coordinates (Z is up) and connectivity. Everything here is therefore DERIVED, and
 * the UI labels it as such ("Elevation band L3 +10.20 m", not "Storey 3"). Where the
 * geometry cannot support a grouping honestly the group is refused with a reason
 * rather than guessed.
 *
 * Persisted user groups are explicitly deferred (they would need a new schema in
 * ModelSnapshot, .ded I/O, share links and tab capture).
 *
 * Pure: no store access, no side effects.
 */

import { classifyElement } from '../codes/argentina/cirsoc201';
import { buildStructuralGraph, type StructuralGraph } from '../structural-graph';
import type { ContextModelData } from './member-context';

export const GROUP_TOL = {
  /** Elevation clustering band half-width (m). */
  z: 0.15,
  /** Max deviation from a fitted plane (m). */
  planeOffset: 0.10,
  /** Max lateral deviation from a fitted line (m). */
  collinear: 0.05,
  /** Axis-dominance ratio, matching structural-graph.ts. */
  axisRatio: 3,
  /** cos of the max slope angle counted as horizontal/vertical (~10°). */
  slopeCos: 0.985,
} as const;

/** A grouping is refused rather than guessed when the model isn't level-structured. */
export const GROUPING_GUARDS = {
  maxBands: 40,
  /** A single band holding more than this share means the model isn't level-structured. */
  maxBandShare: 0.6,
  /** Minimum clusters on an axis before plane grouping is offered. */
  minPlaneClusters: 3,
  /** Minimum share of nodes inside a cluster before an axis counts as grid-like. */
  minPlaneCoverage: 0.7,
} as const;

export type MemberKind = 'beam' | 'column' | 'wall';

export interface ElevationBand {
  index: number;
  /** Mean elevation of the band (m). */
  elevation: number;
  /** Derived label, e.g. "L3 +10.20 m". */
  label: string;
  /** Beams whose lower end sits in this band. */
  beamIds: number[];
  /** Columns rising from this band. */
  columnsRisingIds: number[];
  /** Columns arriving at this band from below. */
  columnsBelowIds: number[];
  /** Beams flagged as sloped — included, never silently absorbed. */
  slopedBeamIds: number[];
}

export interface ElevationGrouping {
  available: boolean;
  /** i18n key explaining a refusal. */
  refusedKey?: string;
  bands: ElevationBand[];
}

export interface PlaneGroup {
  axis: 'X' | 'Y' | 'Z';
  /** Coordinate of the plane (m). */
  coordinate: number;
  label: string;
  elementIds: number[];
}

export interface PlaneGrouping {
  available: boolean;
  refusedKey?: string;
  planes: PlaneGroup[];
}

export interface FrameLineGroup {
  id: string;
  direction: 'horizontal' | 'vertical';
  axis?: 'X' | 'Y' | 'other';
  label: string;
  elementIds: number[];
  /** True when >2 same-axis candidates met at a node, so the chain is arbitrary. */
  ambiguous: boolean;
  /** Chains split because a node deviated beyond the collinearity tolerance. */
  splitCount: number;
}

export interface FrameLineGrouping {
  available: boolean;
  refusedKey?: string;
  lines: FrameLineGroup[];
  /** Total chains split by the collinearity gate — surfaced in the picker. */
  totalSplits: number;
  /** Chains flagged ambiguous. */
  ambiguousCount: number;
}

function elevationOf(n: { z?: number }): number { return n.z ?? 0; }

function kindOf(model: ContextModelData, id: number): MemberKind | null {
  const el = model.elements.get(id);
  if (!el) return null;
  const a = model.nodes.get(el.nodeI);
  const b = model.nodes.get(el.nodeJ);
  if (!a || !b) return null;
  const sec = model.sections.get(el.sectionId);
  return classifyElement(a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0, sec?.b, sec?.h);
}

/** Single-linkage 1-D clustering: a gap > 2·tol opens a new cluster. */
export function clusterCoordinates(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const centres: number[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i] - sorted[i - 1] > 2 * tol) {
      const slice = sorted.slice(start, i);
      centres.push(slice.reduce((s, v) => s + v, 0) / slice.length);
      start = i;
    }
  }
  return centres;
}

function nearestIndex(centres: number[], v: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centres.length; i++) {
    const d = Math.abs(centres[i] - v);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Format a derived elevation label, e.g. "L3 +10.20 m". */
export function elevationLabel(index: number, elevation: number): string {
  const sign = elevation < 0 ? '−' : '+';
  return `L${index} ${sign}${Math.abs(elevation).toFixed(2)} m`;
}

export function groupByElevation(model: ContextModelData): ElevationGrouping {
  const beamNodeZ: number[] = [];
  for (const [id, el] of model.elements) {
    if (kindOf(model, id) !== 'beam') continue;
    const a = model.nodes.get(el.nodeI); const b = model.nodes.get(el.nodeJ);
    if (!a || !b) continue;
    beamNodeZ.push(elevationOf(a), elevationOf(b));
  }
  if (beamNodeZ.length === 0) {
    return { available: false, refusedKey: 'design.group.noBeams', bands: [] };
  }
  const centres = clusterCoordinates(beamNodeZ, GROUP_TOL.z);
  if (centres.length > GROUPING_GUARDS.maxBands) {
    return { available: false, refusedKey: 'design.group.tooManyBands', bands: [] };
  }
  // A single band holding almost everything means the model has no level structure
  // (e.g. a flat 2D projection) — refuse rather than emit a meaningless group.
  const counts = new Array(centres.length).fill(0);
  for (const z of beamNodeZ) counts[nearestIndex(centres, z)]++;
  if (centres.length > 1 && Math.max(...counts) / beamNodeZ.length > GROUPING_GUARDS.maxBandShare) {
    // Still usable, just dominated — not a refusal. Only refuse for a single band.
  }
  if (centres.length === 1) {
    return { available: false, refusedKey: 'design.group.singleLevel', bands: [] };
  }

  const bands: ElevationBand[] = centres.map((elevation, index) => ({
    index, elevation: +elevation.toFixed(4), label: elevationLabel(index, elevation),
    beamIds: [], columnsRisingIds: [], columnsBelowIds: [], slopedBeamIds: [],
  }));

  for (const [id, el] of model.elements) {
    const kind = kindOf(model, id);
    const a = model.nodes.get(el.nodeI); const b = model.nodes.get(el.nodeJ);
    if (!kind || !a || !b) continue;
    const za = elevationOf(a); const zb = elevationOf(b);
    if (kind === 'beam') {
      const lo = Math.min(za, zb);
      const bi = nearestIndex(centres, lo);
      bands[bi].beamIds.push(id);
      if (Math.abs(za - zb) > GROUP_TOL.z) bands[bi].slopedBeamIds.push(id);
    } else {
      const lo = Math.min(za, zb); const hi = Math.max(za, zb);
      bands[nearestIndex(centres, lo)].columnsRisingIds.push(id);
      bands[nearestIndex(centres, hi)].columnsBelowIds.push(id);
    }
  }
  for (const band of bands) {
    band.beamIds.sort((x, y) => x - y);
    band.columnsRisingIds.sort((x, y) => x - y);
    band.columnsBelowIds.sort((x, y) => x - y);
    band.slopedBeamIds.sort((x, y) => x - y);
  }
  return { available: true, bands };
}

/** Elements selected by a band. `columns` chooses which column set is included. */
export function bandSelection(
  band: ElevationBand,
  columns: 'rising' | 'below' | 'none' = 'rising',
): number[] {
  const ids = [...band.beamIds];
  if (columns === 'rising') ids.push(...band.columnsRisingIds);
  else if (columns === 'below') ids.push(...band.columnsBelowIds);
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Vertical (constant-X / constant-Y) and horizontal (constant-Z) structural planes. */
export function groupByPlane(model: ContextModelData): PlaneGrouping {
  const nodes = [...model.nodes.values()];
  if (nodes.length === 0) return { available: false, refusedKey: 'design.group.noNodes', planes: [] };
  const planes: PlaneGroup[] = [];

  const axisSpecs: Array<{ axis: 'X' | 'Y' | 'Z'; read: (n: { x: number; y: number; z?: number }) => number; tol: number }> = [
    { axis: 'X', read: n => n.x, tol: GROUP_TOL.planeOffset },
    { axis: 'Y', read: n => n.y, tol: GROUP_TOL.planeOffset },
    { axis: 'Z', read: n => n.z ?? 0, tol: GROUP_TOL.z },
  ];

  let anyGridLike = false;
  for (const spec of axisSpecs) {
    const vals = nodes.map(spec.read);
    const centres = clusterCoordinates(vals, spec.tol);
    if (centres.length < GROUPING_GUARDS.minPlaneClusters) continue;
    const inside = vals.filter(v => Math.abs(centres[nearestIndex(centres, v)] - v) <= spec.tol).length;
    if (inside / vals.length < GROUPING_GUARDS.minPlaneCoverage) continue;
    anyGridLike = true;
    for (const c of centres) {
      const ids: number[] = [];
      for (const [id, el] of model.elements) {
        const a = model.nodes.get(el.nodeI); const b = model.nodes.get(el.nodeJ);
        if (!a || !b) continue;
        // Both ends inside the plane → the member lies in it.
        if (Math.abs(spec.read(a) - c) <= spec.tol && Math.abs(spec.read(b) - c) <= spec.tol) ids.push(id);
      }
      if (ids.length === 0) continue;
      planes.push({
        axis: spec.axis, coordinate: +c.toFixed(4),
        label: `${spec.axis} = ${c.toFixed(2)} m`,
        elementIds: ids.sort((x, y) => x - y),
      });
    }
  }
  if (!anyGridLike) return { available: false, refusedKey: 'design.group.notGridLike', planes: [] };
  return { available: true, planes };
}

/**
 * Frame lines from the existing structural graph, with the collinearity gate the
 * tracer lacks: a chain is split where a node deviates beyond tolerance or where the
 * chain would cross an elevation band. Chains through a node with >2 same-axis
 * candidates are flagged `ambiguous` and require explicit confirmation before a
 * batch apply, because `traceChain` picks the first candidate arbitrarily.
 */
export function groupByFrameLine(model: ContextModelData): FrameLineGrouping {
  let graph: StructuralGraph;
  try {
    graph = buildStructuralGraph(
      new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, y: n.y, z: n.z ?? 0 }])),
      new Map([...model.elements].map(([id, e]) => [id, { id, nodeI: e.nodeI, nodeJ: e.nodeJ, sectionId: e.sectionId, type: e.type }])),
      new Map([...model.sections].map(([id, s]) => [id, { id, b: s.b, h: s.h }])),
      new Map([...model.supports].map(([, s], i) => [i, { nodeId: s.nodeId, type: s.type }])),
    );
  } catch {
    return { available: false, refusedKey: 'design.group.graphFailed', lines: [], totalSplits: 0, ambiguousCount: 0 };
  }

  const lines: FrameLineGroup[] = [];
  let totalSplits = 0;
  let ambiguousCount = 0;

  for (const fl of graph.frameLines) {
    const pts = fl.nodeIds.map(id => model.nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
    if (pts.length < 2) continue;
    // Split where collinearity or elevation continuity breaks.
    const segments: number[][] = [];
    let current: number[] = [fl.elementIds[0]];
    for (let i = 1; i < fl.elementIds.length; i++) {
      const prev = pts[i];
      const next = pts[i + 1];
      const ok = prev && next
        && deviationFromLine(pts[0], pts[pts.length - 1], prev) <= GROUP_TOL.collinear
        && (fl.direction === 'vertical' || Math.abs((prev.z ?? 0) - (pts[0].z ?? 0)) <= GROUP_TOL.z);
      if (ok) current.push(fl.elementIds[i]);
      else { segments.push(current); current = [fl.elementIds[i]]; totalSplits++; }
    }
    segments.push(current);

    // Ambiguity: any node on the chain with >2 same-direction candidates.
    let ambiguous = false;
    for (const nid of fl.nodeIds) {
      const conn = graph.nodes.get(nid);
      if (!conn) continue;
      const cands = fl.direction === 'horizontal' ? conn.beams : conn.columns;
      if (cands.length > 2) { ambiguous = true; break; }
    }
    if (ambiguous) ambiguousCount++;

    segments.forEach((ids, si) => {
      if (ids.length === 0) return;
      const first = model.elements.get(ids[0]);
      const a = first ? model.nodes.get(first.nodeI) : undefined;
      const coord = fl.direction === 'vertical'
        ? `X=${(a?.x ?? 0).toFixed(2)} Y=${(a?.y ?? 0).toFixed(2)}`
        : fl.axis === 'X' ? `Y=${(a?.y ?? 0).toFixed(2)} Z=${(a?.z ?? 0).toFixed(2)}`
        : `X=${(a?.x ?? 0).toFixed(2)} Z=${(a?.z ?? 0).toFixed(2)}`;
      lines.push({
        id: `${fl.direction}-${fl.axis ?? 'v'}-${ids[0]}-${si}`,
        direction: fl.direction, axis: fl.axis,
        label: `${fl.direction === 'vertical' ? 'Col' : fl.axis ?? '—'} ${coord}`,
        elementIds: [...ids].sort((x, y) => x - y),
        ambiguous, splitCount: segments.length - 1,
      });
    });
  }
  lines.sort((a, b) => a.id.localeCompare(b.id));
  return { available: lines.length > 0, lines, totalSplits, ambiguousCount };
}

function deviationFromLine(
  p0: { x: number; y: number; z?: number },
  p1: { x: number; y: number; z?: number },
  p: { x: number; y: number; z?: number },
): number {
  const ax = p1.x - p0.x, ay = p1.y - p0.y, az = (p1.z ?? 0) - (p0.z ?? 0);
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-9) return 0;
  const bx = p.x - p0.x, by = p.y - p0.y, bz = (p.z ?? 0) - (p0.z ?? 0);
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return Math.sqrt(cx * cx + cy * cy + cz * cz) / len;
}

/** Members connected to a seed set, `hops` edges away, same kind by default. */
export function groupByConnectivity(
  model: ContextModelData,
  seed: Iterable<number>,
  hops = 1,
  sameKindOnly = true,
): number[] {
  const seedIds = [...seed];
  const kinds = new Set(seedIds.map(id => kindOf(model, id)).filter(Boolean));
  const nodeToElems = new Map<number, number[]>();
  for (const [id, el] of model.elements) {
    for (const n of [el.nodeI, el.nodeJ]) {
      const arr = nodeToElems.get(n) ?? [];
      arr.push(id); nodeToElems.set(n, arr);
    }
  }
  let frontier = new Set(seedIds);
  const out = new Set(seedIds);
  for (let h = 0; h < hops; h++) {
    const next = new Set<number>();
    for (const id of frontier) {
      const el = model.elements.get(id);
      if (!el) continue;
      for (const n of [el.nodeI, el.nodeJ]) {
        for (const cand of nodeToElems.get(n) ?? []) {
          if (out.has(cand)) continue;
          if (sameKindOnly && !kinds.has(kindOf(model, cand))) continue;
          next.add(cand); out.add(cand);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return [...out].sort((a, b) => a - b);
}

/** Attribute selectors: same section / material / kind. */
export function groupBySection(model: ContextModelData, sectionId: number): number[] {
  return [...model.elements].filter(([, e]) => e.sectionId === sectionId).map(([id]) => id).sort((a, b) => a - b);
}
export function groupByMaterial(model: ContextModelData, materialId: number): number[] {
  return [...model.elements].filter(([, e]) => e.materialId === materialId).map(([id]) => id).sort((a, b) => a - b);
}
export function groupByKind(model: ContextModelData, kind: MemberKind): number[] {
  return [...model.elements.keys()].filter(id => kindOf(model, id) === kind).sort((a, b) => a - b);
}

/** Distinct section / material options present in the model, for the pickers. */
export function sectionOptions(model: ContextModelData): Array<{ id: number; name: string; count: number }> {
  const counts = new Map<number, number>();
  for (const [, e] of model.elements) counts.set(e.sectionId, (counts.get(e.sectionId) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, name: model.sections.get(id)?.name ?? `#${id}`, count }))
    .sort((a, b) => a.id - b.id);
}
export function materialOptions(model: ContextModelData): Array<{ id: number; name: string; count: number }> {
  const counts = new Map<number, number>();
  for (const [, e] of model.elements) counts.set(e.materialId, (counts.get(e.materialId) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, name: model.materials.get(id)?.name ?? `#${id}`, count }))
    .sort((a, b) => a.id - b.id);
}

export { kindOf as memberKindOf };
