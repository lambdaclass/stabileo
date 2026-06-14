// Deterministic CAD → PRO RC draft generator.
//
// generateRcDraft(plan, assumptions) turns a confirmed ArchPlan plus the
// user's explicit engineering assumptions into a complete PRO model snapshot:
// concrete material, rectangular column/beam sections, frame columns/beams,
// MITC4 slab and wall quads, base supports, explicit D/L area loads, and
// (optionally) the two simple factored combinations 1.4D and 1.2D+1.6L.
//
// Everything is pure data — the model store is NOT touched. The wizard applies
// the returned snapshot only on explicit user confirmation.
//
// Honesty rules enforced here:
//   - one plan replicated to all floors (recorded as a provenance assumption),
//   - no self-weight, no wind/seismic/snow, no reinforcement, no foundations,
//   - non-rectilinear slabs are skipped with a warning (no fake approximation);
//     rectilinear non-quad slabs use an explicit, deterministic rectangle
//     decomposition that is reported in the warnings,
//   - openings are NOT subtracted (warned), curved entities are NOT converted.

import type {
  ArchPlan,
  CadPt,
  DraftWarning,
  RcDraftAssumptions,
  RcDraftResult,
} from './types';
import { CONCRETE_GRADES } from './types';
import {
  decomposeRectilinear, dist, pointInPolygon, pointOnSegment,
  polygonBBox, isAxisAlignedRectilinear, makeOpeningPoly,
  generateStructuredMesh, segmentsCollinearOverlap,
  type Rect,
} from './geometry';
import { resolveSection } from './specs';
import { ROOM_CATEGORY_LOADS } from './rooms';
import type { SectionScheduleEntry, SpecSource } from './types';
import type { MemberOffset } from '../model/element-3d-metadata';
import { findCoincidentNode, beamThrough } from '../engine/mesh-weld';
import { buildBilinearQuadGrid } from '../engine/shell-mesh-gen';
import type { ModelSnapshot } from '../store/history.svelte';
import type { ModelProvenance } from '../model/provenance';

const NO_RELEASE = { my: false, mz: false, t: false };

/** Saint-Venant torsion constant for a solid rectangle (b × h), matching the
 *  backend rc-frame generator so sections are consistent across the app. */
export function rectJ(b: number, h: number): number {
  const long = Math.max(b, h);
  const short = Math.min(b, h);
  const r = short / long;
  return long * short ** 3 * (1 / 3 - 0.21 * r * (1 - r ** 4 / 12));
}

interface DraftNode { id: number; x: number; y: number; z?: number }
interface DraftElement {
  id: number;
  type: 'frame';
  nodeI: number;
  nodeJ: number;
  materialId: number;
  sectionId: number;
  releaseI: typeof NO_RELEASE;
  releaseJ: typeof NO_RELEASE;
  /** PR [7] analytical member offset (eccentric framing), when detected. */
  offset?: MemberOffset;
}
interface DraftQuad { id: number; nodes: [number, number, number, number]; materialId: number; thickness: number }

class DraftBuilder {
  nodes: DraftNode[] = [];
  elements: DraftElement[] = [];
  quads: DraftQuad[] = [];
  sections: Array<Record<string, unknown> & { id: number }> = [];
  supports: Array<{ id: number; nodeId: number; type: string }> = [];
  loads: Array<{ type: string; data: Record<string, unknown> }> = [];
  nextNode = 1;
  nextElement = 1;
  nextQuad = 1;
  nextLoad = 1;
  private sectionByKey = new Map<string, number>();

  constructor(private tol: number) {}

  /** Weld-or-create a node at (x, y, z). */
  node(x: number, y: number, z: number): number {
    const existing = findCoincidentNode(this.nodes, x, y, z, this.tol);
    if (existing != null) return existing;
    const id = this.nextNode++;
    const n: DraftNode = { id, x, y };
    if (z !== 0) n.z = z;
    this.nodes.push(n);
    return id;
  }

  findNode(x: number, y: number, z: number): number | null {
    return findCoincidentNode(this.nodes, x, y, z, this.tol);
  }

  /** Rectangular RC section, deduplicated by rounded cm dimensions. */
  rectSection(kind: 'Col' | 'Beam', b: number, h: number, fromCad: boolean): number {
    const bcm = Math.round(b * 100);
    const hcm = Math.round(h * 100);
    const key = `${kind}:${bcm}x${hcm}`;
    const found = this.sectionByKey.get(key);
    if (found != null) return found;
    const id = this.sections.length + 1;
    this.sections.push({
      id,
      name: `RC ${kind} ${bcm}x${hcm}${fromCad ? ' (CAD)' : ''}`,
      a: b * h,
      iy: (b * h ** 3) / 12,
      iz: (h * b ** 3) / 12,
      j: rectJ(b, h),
      b,
      h,
      shape: 'rect',
    });
    this.sectionByKey.set(key, id);
    return id;
  }

  frame(nodeI: number, nodeJ: number, sectionId: number, offset?: MemberOffset): number {
    const id = this.nextElement++;
    const el: DraftElement = {
      id, type: 'frame', nodeI, nodeJ, materialId: 1, sectionId,
      releaseI: { ...NO_RELEASE }, releaseJ: { ...NO_RELEASE },
    };
    if (offset) el.offset = offset;
    this.elements.push(el);
    return id;
  }

  quad(nodes: [number, number, number, number], thickness: number): number {
    const id = this.nextQuad++;
    this.quads.push({ id, nodes, materialId: 1, thickness });
    return id;
  }

  /** Split a frame element at parameter t, sharing node `nodeId` there.
   *  Draft beams carry no element loads, so the split is pure topology. */
  splitElement(elementId: number, nodeId: number): void {
    const idx = this.elements.findIndex((e) => e.id === elementId);
    if (idx < 0) return;
    const el = this.elements[idx];
    const a: DraftElement = { ...el, id: this.nextElement++, nodeJ: nodeId, releaseI: { ...el.releaseI }, releaseJ: { ...NO_RELEASE } };
    const b: DraftElement = { ...el, id: this.nextElement++, nodeI: nodeId, releaseI: { ...NO_RELEASE }, releaseJ: { ...el.releaseJ } };
    this.elements.splice(idx, 1, a, b);
  }
}

/** Split plan segments wherever a column point lies on their interior. */
function splitSegmentsAtPoints(
  segments: Array<{ a: CadPt; b: CadPt }>,
  points: CadPt[],
  tol: number,
): Array<{ a: CadPt; b: CadPt }> {
  const out: Array<{ a: CadPt; b: CadPt }> = [];
  for (const seg of segments) {
    const cuts: Array<{ t: number; p: CadPt }> = [];
    for (const p of points) {
      const t = pointOnSegment(p, seg.a, seg.b, tol);
      if (t !== null) cuts.push({ t, p });
    }
    cuts.sort((u, v) => u.t - v.t);
    let prev = seg.a;
    for (const c of cuts) {
      out.push({ a: prev, b: c.p });
      prev = c.p;
    }
    out.push({ a: prev, b: seg.b });
  }
  return out.filter((s) => dist(s.a, s.b) > tol);
}

export interface DraftSource {
  fileName: string;
  importedAtIso: string;
}

export function generateRcDraft(
  plan: ArchPlan,
  a: RcDraftAssumptions,
  source: DraftSource,
): RcDraftResult {
  const warnings: DraftWarning[] = [];
  const tol = a.snapTolerance;
  const b = new DraftBuilder(tol);

  // ── Levels ────────────────────────────────────────────────
  const heights = a.storyHeights.length === a.nFloors
    ? a.storyHeights
    : Array.from({ length: a.nFloors }, () => a.storyHeights[0] ?? 3);
  const levels: number[] = [0];
  for (const h of heights) levels.push(levels[levels.length - 1] + h);
  const floorLevels = levels.slice(1); // z of floor 1..N

  // ── Material ──────────────────────────────────────────────
  const grade = CONCRETE_GRADES[a.concreteGrade];
  const material = {
    id: 1,
    name: a.concreteGrade,
    e: grade.e,
    nu: 0.2,
    rho: grade.rho,
    fy: grade.fc, // PRO convention: material.fy carries f'c for concrete
  };

  // ── Section schedules + spec source accounting ────────────
  // Wizard rows win over same-key CAD rows; both beat labels/geometry.
  const schedules: SectionScheduleEntry[] = [
    ...(a.schedules ?? []).map((r) => ({ ...r, source: 'wizard' as const })),
    ...plan.schedules,
  ];
  const specCounts: Record<SpecSource, number> = { schedule: 0, label: 0, geometry: 0, default: 0 };
  const floorOfLevel = (z: number): number => {
    const i = floorLevels.findIndex((fz) => Math.abs(fz - z) <= tol);
    return i >= 0 ? i + 1 : 1;
  };

  // ── Columns ───────────────────────────────────────────────
  // Deduplicate coincident column points (within tolerance).
  const columns: typeof plan.columns = [];
  let mergedColumns = 0;
  for (const col of plan.columns) {
    if (columns.some((c) => dist(c.at, col.at) <= tol)) { mergedColumns++; continue; }
    columns.push(col);
  }
  if (mergedColumns > 0) {
    warnings.push({ severity: 'info', message: `columnsMerged:${mergedColumns}` });
  }
  if (plan.columns.some((c) => c.sizeSource === 'circle')) {
    warnings.push({ severity: 'warning', message: 'circularColumnsAsSquare' });
  }

  const defaultColSection = b.rectSection('Col', a.columnSection.b, a.columnSection.h, false);
  const defaultBeamSection = b.rectSection('Beam', a.beamSection.b, a.beamSection.h, false);

  let tinyCadSections = 0;
  let columnScheduleSegments = 0;
  const colSectionId = (col: (typeof columns)[number], floor: number): number => {
    const fromLabel = col.specSource === 'label';
    const r = resolveSection(
      'column', col.mark, floor, schedules,
      fromLabel && col.b !== undefined ? { b: col.b, h: col.h } : undefined,
      !fromLabel && col.b !== undefined && col.sizeSource !== 'default' ? { b: col.b, h: col.h } : undefined,
      { b: a.columnSection.b, h: a.columnSection.h },
    );
    if (floor === 1) specCounts[r.source]++;
    if (r.source === 'schedule') columnScheduleSegments++;
    const cb = r.b ?? a.columnSection.b, ch = r.h ?? a.columnSection.h;
    if (cb < 0.05 || ch < 0.05) { tinyCadSections++; return defaultColSection; }
    return b.rectSection('Col', cb, ch, r.source !== 'default');
  };

  for (const col of columns) {
    for (let k = 0; k < a.nFloors; k++) {
      const ni = b.node(col.at.x, col.at.y, levels[k]);
      const nj = b.node(col.at.x, col.at.y, levels[k + 1]);
      b.frame(ni, nj, colSectionId(col, k + 1));
    }
  }
  if (tinyCadSections > 0) {
    warnings.push({ severity: 'warning', message: `tinyCadColumnSize:${tinyCadSections}` });
  }
  const columnElementCount = b.elements.length;

  // ── Beams ─────────────────────────────────────────────────
  // Split plan segments at column points so beams connect to columns mid-run,
  // then replicate at every floor level.
  const columnPts = columns.map((c) => c.at);
  const beamSegs0 = splitSegmentsAtPoints(plan.beams, columnPts, tol);
  // Re-attach mark/width/depth specs lost by splitting (nearest source beam).
  const beamSegs = beamSegs0.map((seg) => {
    const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
    const src = plan.beams.find((pb) =>
      pointOnSegment(mid, pb.a, pb.b, tol, 0) !== null || dist(pb.a, mid) <= tol || dist(pb.b, mid) <= tol);
    return { ...seg, width: src?.width, depth: src?.depth, mark: src?.mark, specSource: src?.specSource };
  });

  // ── Beam eccentricity detection (PR [7] member offsets) ────
  // A beam whose centerline runs PARALLEL past two column centres at the same
  // signed perpendicular distance (e.g. flush with the column faces) is
  // analytically a centre-line member with a constant eccentric offset.
  //
  // The element nodes ALWAYS go on the line through the column centres — a
  // flush beam left at its physical centerline would not touch the columns and
  // would float (disconnected). The physical shift is recorded as
  // element.offset (frame 'global') ONLY when offset modeling is enabled;
  // otherwise the beam is modeled centered (connected, eccentricity ignored,
  // warned). Skewed/one-sided cases are AMBIGUOUS: left untouched + warned.
  const offsetTol = a.offsetTolerance ?? 0.03;
  const MAX_OFFSET = 0.5;
  let offsetsAmbiguous = 0;
  type SegPlan = (typeof beamSegs)[number] & { shift?: CadPt };
  const plannedSegs: SegPlan[] = beamSegs.map((seg) => {
    const ux = seg.b.x - seg.a.x, uy = seg.b.y - seg.a.y;
    const L = Math.hypot(ux, uy);
    if (L < 1e-9) return seg;
    const nx = -uy / L, ny = ux / L; // unit normal
    const colNear = (p: CadPt) => {
      let best: (typeof columns)[number] | null = null;
      let bestD = Infinity;
      for (const c of columns) {
        const r = Math.max(c.b ?? a.columnSection.b, c.h ?? a.columnSection.h) / 2 + tol;
        const d = dist(p, c.at);
        if (d <= r && d < bestD) { best = c; bestD = d; }
      }
      return best;
    };
    const cI = colNear(seg.a), cJ = colNear(seg.b);
    if (!cI || !cJ || cI === cJ) return seg;
    const sd = (c: CadPt) => (c.x - seg.a.x) * nx + (c.y - seg.a.y) * ny;
    const dI = sd(cI.at), dJ = sd(cJ.at);
    if (Math.abs(dI) <= offsetTol && Math.abs(dJ) <= offsetTol) return seg; // centred
    if (Math.abs(dI - dJ) > offsetTol || Math.abs(dI) > MAX_OFFSET) {
      offsetsAmbiguous++;
      return seg;
    }
    const dAvg = (dI + dJ) / 2;
    // Relocate onto the column-centre line (always — for connectivity).
    return { ...seg, shift: { x: dAvg * nx, y: dAvg * ny } };
  });

  // Floating-end check in plan space: an endpoint that touches no column and
  // no other beam segment (endpoint or interior) will hang in the air.
  let floatingEnds = 0;
  beamSegs.forEach((seg, i) => {
    for (const p of [seg.a, seg.b]) {
      const onColumn = columnPts.some((c) => dist(c, p) <= tol);
      if (onColumn) continue;
      const touchesOther = beamSegs.some((other, j) => {
        if (i === j) return false;
        if (dist(other.a, p) <= tol || dist(other.b, p) <= tol) return true;
        return pointOnSegment(p, other.a, other.b, tol) !== null;
      });
      const onWall = plan.walls.some((w) =>
        dist(w.a, p) <= tol || dist(w.b, p) <= tol || pointOnSegment(p, w.a, w.b, tol) !== null);
      if (!touchesOther && !onWall) floatingEnds++;
    }
  });
  if (floatingEnds > 0) {
    warnings.push({ severity: 'warning', message: `beamEndsFloating:${floatingEnds}` });
  }

  let beamsWithOffsets = 0;
  let eccentricBeamsCentered = 0;
  let beamScheduleSegments = 0;
  let beamsDefaulted = 0;
  // Distinct beam sections actually used, tagged by the winning spec source —
  // surfaced in the provenance so the user sees per-member beam dimensions.
  const beamSectionLog = new Map<string, { b: number; h: number; source: SpecSource }>();
  const beamSectionId = (seg: SegPlan, floor: number): number => {
    const fromLabel = seg.specSource === 'label';
    const r = resolveSection(
      'beam', seg.mark, floor, schedules,
      fromLabel && seg.width !== undefined ? { b: seg.width, h: seg.depth } : undefined,
      !fromLabel && seg.width !== undefined ? { b: seg.width } : undefined,
      { b: a.beamSection.b, h: a.beamSection.h },
    );
    const bw = r.b ?? a.beamSection.b, bh = r.h ?? a.beamSection.h;
    if (floor === 1) {
      specCounts[r.source]++;
      if (r.source === 'default') beamsDefaulted++;
      const key = `${Math.round(bw * 100)}x${Math.round(bh * 100)}`;
      if (!beamSectionLog.has(key)) beamSectionLog.set(key, { b: bw, h: bh, source: r.source });
    }
    if (r.source === 'schedule') beamScheduleSegments++;
    return b.rectSection('Beam', bw, bh, r.source !== 'default');
  };

  for (const z of floorLevels) {
    const floor = floorOfLevel(z);
    for (const seg of plannedSegs) {
      // Analytical line through the column centres; physical shift → offset.
      const ax = seg.a.x + (seg.shift?.x ?? 0), ay = seg.a.y + (seg.shift?.y ?? 0);
      const bx = seg.b.x + (seg.shift?.x ?? 0), by = seg.b.y + (seg.shift?.y ?? 0);
      const ni = b.node(ax, ay, z);
      const nj = b.node(bx, by, z);
      if (ni === nj) continue;
      // Attach the analytical eccentric offset only when offset modeling is
      // on; otherwise the relocated beam is modeled centered (connected).
      const offset: MemberOffset | undefined = seg.shift && a.detectOffsets
        ? {
            frame: 'global',
            i: { x: -seg.shift.x, y: -seg.shift.y, z: 0 },
            j: { x: -seg.shift.x, y: -seg.shift.y, z: 0 },
          }
        : undefined;
      if (offset) beamsWithOffsets++;
      else if (seg.shift) eccentricBeamsCentered++;
      b.frame(ni, nj, beamSectionId(seg, floor), offset);
    }
  }
  if (offsetsAmbiguous > 0) {
    warnings.push({ severity: 'warning', message: `offsetsAmbiguous:${offsetsAmbiguous}` });
  }
  if (beamsDefaulted > 0) {
    warnings.push({ severity: 'warning', message: `beamsDefaulted:${beamsDefaulted}` });
  }
  // ── Slabs ─────────────────────────────────────────────────
  const slabQuads: Array<{ id: number; z: number }> = [];
  let slabsSkipped = 0;
  let slabsDecomposed = 0;

  let slabScheduleHits = 0;
  const slabThicknessAt = (slab: (typeof plan.slabs)[number], z: number): number => {
    const r = resolveSection(
      'slab', slab.mark, floorOfLevel(z), schedules,
      slab.specSource === 'label' && slab.thickness !== undefined ? { t: slab.thickness } : undefined,
      undefined,
      { t: a.slabThickness },
    );
    if (r.source === 'schedule') slabScheduleHits++;
    return r.t ?? a.slabThickness;
  };
  const meshRegion = (corners: CadPt[], z: number, nx: number, ny: number, thickness: number): void => {
    const c = corners.map((p) => ({ x: p.x, y: p.y, z }));
    buildBilinearQuadGrid(
      [c[0], c[1], c[2], c[3]],
      nx, ny,
      {
        findNode: (x, y, zz) => b.findNode(x, y, zz),
        addNode: (x, y, zz) => b.node(x, y, zz),
        addQuad: (nodes) => { slabQuads.push({ id: b.quad(nodes, thickness), z }); },
      },
    );
  };

  // Opening polygons (in the slab plane), pre-analyzed for cutting.
  const openingPolys = plan.openings
    .map((op) => makeOpeningPoly(op.outline, tol))
    .filter((op): op is NonNullable<typeof op> => op !== null);

  // Emit one axis-aligned rectangular cell as a quad (corners weld to shared
  // nodes via b.node, so cells around a hole share their edge nodes).
  const emitCell = (r: Rect, z: number, thickness: number): void => {
    const n0 = b.node(r.minX, r.minY, z);
    const n1 = b.node(r.maxX, r.minY, z);
    const n2 = b.node(r.maxX, r.maxY, z);
    const n3 = b.node(r.minX, r.maxY, z);
    slabQuads.push({ id: b.quad([n0, n1, n2, n3], thickness), z });
  };

  // Count a slab's "supported" edges: edges collinear-overlapping a beam, OR
  // shared with another slab's edge. ≥1 → supported (exactly 1 = cantilever /
  // balcón-voladizo); 0 → isolated (skipped — an isolated slab is not a valid
  // structure). This keeps a one-edge-supported balcony while refusing a slab
  // floating free of the frame.
  const slabSupportEdges = (slab: (typeof plan.slabs)[number]): number => {
    const o = slab.outline;
    let supported = 0;
    for (let i = 0; i < o.length; i++) {
      const p = o[i], q = o[(i + 1) % o.length];
      const onBeam = plan.beams.some((bm) => segmentsCollinearOverlap(p, q, bm.a, bm.b));
      const onOtherSlab = !onBeam && plan.slabs.some((s2) => {
        if (s2 === slab) return false;
        const o2 = s2.outline;
        for (let j = 0; j < o2.length; j++) {
          if (segmentsCollinearOverlap(p, q, o2[j], o2[(j + 1) % o2.length])) return true;
        }
        return false;
      });
      if (onBeam || onOtherSlab) supported++;
    }
    return supported;
  };

  // Meshing mode: target-size (default) keeps cells near `target` across all
  // panels and forces mesh lines through structural geometry; legacy fixed
  // divisions remain available. When meshing is OFF, one cell per panel.
  const meshMode: 'targetSize' | 'fixedDivisions' = a.meshMode ?? 'targetSize';
  const target = a.meshTargetSize ?? 1.0;
  const fixedN = a.meshSlabs ? Math.max(1, Math.round(a.meshDivisions)) : 1;
  // When meshing is disabled, force one cell by using a huge target.
  const effTarget = a.meshSlabs ? target : 1e6;

  // Structural lines that mesh boundaries must pass through (axis-aligned
  // beams, walls, and the column grid) — collected once, in plan coordinates.
  const axisX = new Set<number>(), axisY = new Set<number>();
  const axisTol = 1e-3;
  const addAxis = (set: Set<number>, v: number) => {
    for (const e of set) if (Math.abs(e - v) <= axisTol) return;
    set.add(v);
  };
  for (const c of columns) { addAxis(axisX, c.at.x); addAxis(axisY, c.at.y); }
  for (const seg of [...plan.beams, ...plan.walls]) {
    if (Math.abs(seg.a.x - seg.b.x) <= axisTol) addAxis(axisX, (seg.a.x + seg.b.x) / 2);
    else if (Math.abs(seg.a.y - seg.b.y) <= axisTol) addAxis(axisY, (seg.a.y + seg.b.y) / 2);
  }
  const forcedX = [...axisX], forcedY = [...axisY];
  let meshSlivers = 0;

  /** Mesh an axis-aligned panel with the chosen mode + forced structural lines,
   *  cutting the given openings; emits quads and accumulates slivers. */
  const meshPanel = (panel: Rect, outline: CadPt[], z: number, thickness: number, ops: typeof openingPolys): number => {
    const res = generateStructuredMesh({
      panel, containment: outline, openings: ops,
      mode: meshMode, targetSize: effTarget, fixedNx: fixedN, fixedNy: fixedN,
      // Structural-line forcing is a target-size feature; legacy fixed mode
      // keeps its even subdivisions + opening edges only (backward compatible).
      forcedX: meshMode === 'targetSize' ? forcedX : [],
      forcedY: meshMode === 'targetSize' ? forcedY : [],
      snapTolerance: tol,
    });
    for (const cell of res.cells) emitCell(cell, z, thickness);
    meshSlivers += res.slivers;
    return res.droppedByOpening;
  };

  /** Bilinear divisions for a NON-axis-aligned quad edge of physical length L. */
  const bilinearDivs = (L: number): number =>
    meshMode === 'targetSize' ? Math.max(1, Math.round(L / effTarget)) : fixedN;

  const cutOpenings = new Set<number>();      // opening indices cut from a slab
  const approxOpenings = new Set<number>();   // cut but boundary not exact
  let openingsUncut = 0;                       // recognized but not cut (per slab×opening)
  let cantileverSlabs = 0;
  let isolatedSlabs = 0;

  for (const slab of plan.slabs) {
    // Skip slabs with no structural support (not a beam edge, not adjacent to
    // another slab). A cantilever (1 supported edge) is kept; an isolated slab
    // is refused so the draft stays a connected structure.
    const support = slabSupportEdges(slab);
    if (support === 0) { isolatedSlabs++; continue; }
    if (support === 1) cantileverSlabs++;
    const opsInSlab = openingPolys
      .map((op, idx) => ({ op, idx }))
      .filter(({ op }) => pointInPolygon(op.centroid, slab.outline));
    const axisAligned = isAxisAlignedRectilinear(slab.outline, 1e-4);
    const ops = opsInSlab.map(({ op }) => op);

    if (axisAligned) {
      // Axis-aligned slab: target-size (or fixed) structured mesh that forces
      // mesh lines through beams/walls/columns + opening edges. ignoreOpenings
      // meshes solid (no openings passed); otherwise openings are cut.
      const panels: Rect[] = slab.isQuad
        ? [polygonBBox(slab.outline)]
        : (decomposeRectilinear(slab.outline, tol) ?? []);
      if (!slab.isQuad) {
        if (panels.length > 0) slabsDecomposed++;
        else { slabsSkipped++; continue; }
      }
      const cutOps = a.ignoreOpenings ? [] : ops;
      for (const z of floorLevels) {
        const th = slabThicknessAt(slab, z);
        for (const panel of panels) {
          const panelOps = cutOps.filter((op) =>
            op.bbox.minX < panel.maxX - tol && op.bbox.maxX > panel.minX + tol &&
            op.bbox.minY < panel.maxY - tol && op.bbox.maxY > panel.minY + tol);
          meshPanel(panel, slab.outline, z, th, panelOps);
        }
      }
      if (a.ignoreOpenings) {
        openingsUncut += opsInSlab.length;
      } else {
        for (const { idx, op } of opsInSlab) {
          cutOpenings.add(idx);
          if (!op.rectilinear) approxOpenings.add(idx);
        }
      }
      continue;
    }

    // Non-axis-aligned (rotated/skewed) quad: bilinear mesh with target-derived
    // divisions. An opening here cannot be cut exactly on a skewed grid, so the
    // shell is REFUSED (skipped) unless the user chose to ignore openings.
    if (!slab.isQuad) { slabsSkipped++; if (opsInSlab.length) openingsUncut += opsInSlab.length; continue; }
    if (opsInSlab.length > 0 && !a.ignoreOpenings) {
      slabsSkipped++; openingsUncut += opsInSlab.length; continue;
    }
    const o = slab.outline;
    const nx = bilinearDivs(dist(o[0], o[1]));
    const ny = bilinearDivs(dist(o[0], o[3]));
    for (const z of floorLevels) meshRegion(slab.outline, z, nx, ny, slabThicknessAt(slab, z));
    if (a.ignoreOpenings && opsInSlab.length) openingsUncut += opsInSlab.length;
  }
  if (slabsDecomposed > 0) {
    warnings.push({ severity: 'info', message: `slabsDecomposed:${slabsDecomposed}` });
  }
  if (slabsSkipped > 0) {
    warnings.push({ severity: 'warning', message: `slabsSkippedNonRect:${slabsSkipped}` });
  }

  // ── Opening accounting ────────────────────────────────────
  const openingsCutCount = cutOpenings.size;
  const openingsApproxCount = approxOpenings.size;
  if (openingsCutCount > 0) {
    warnings.push({ severity: 'info', message: `openingsCut:${openingsCutCount}` });
  }
  if (openingsApproxCount > 0) {
    warnings.push({ severity: 'warning', message: `openingsCutApprox:${openingsApproxCount}` });
  }
  if (a.ignoreOpenings && openingsUncut > 0) {
    warnings.push({ severity: 'error', message: `openingsIgnored:${openingsUncut}` });
  } else if (openingsUncut > 0) {
    warnings.push({ severity: 'warning', message: `openingsNotCutSkewedSlab:${openingsUncut}` });
  }
  if (cantileverSlabs > 0) {
    warnings.push({ severity: 'info', message: `cantileverSlabs:${cantileverSlabs}` });
  }
  if (isolatedSlabs > 0) {
    warnings.push({ severity: 'warning', message: `slabsIsolated:${isolatedSlabs}` });
  }
  if (meshSlivers > 0) {
    warnings.push({ severity: 'warning', message: `meshSlivers:${meshSlivers}` });
  }

  // ── Walls / tabiques ──────────────────────────────────────
  // One quad per story per wall run (coarse, stated in assumptions). Wall
  // centerlines are split at column points so corners weld to column nodes.
  const wallQuadStart = b.quads.length;
  const wallSegs = plan.walls.map((w) => ({ a: w.a, b: w.b, thickness: w.thickness }));
  const wallRuns = splitSegmentsAtPoints(wallSegs, columnPts, tol).map((seg) => {
    // Recover specs from the source wall containing this run (midpoint test).
    const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
    const src = plan.walls.find((w) =>
      pointOnSegment(mid, w.a, w.b, tol, 0) !== null || dist(w.a, mid) <= tol || dist(w.b, mid) <= tol);
    return { ...seg, thickness: src?.thickness, mark: src?.mark, specSource: src?.specSource };
  });
  let wallScheduleHits = 0;
  for (const run of wallRuns) {
    for (let k = 0; k < a.nFloors; k++) {
      const r = resolveSection(
        'wall', run.mark, k + 1, schedules,
        run.specSource === 'label' && run.thickness !== undefined ? { t: run.thickness } : undefined,
        run.specSource !== 'label' && run.thickness !== undefined ? { t: run.thickness } : undefined,
        { t: a.wallThickness },
      );
      if (r.source === 'schedule') wallScheduleHits++;
      const t = r.t ?? a.wallThickness;
      const z0 = levels[k], z1 = levels[k + 1];
      const n0 = b.node(run.a.x, run.a.y, z0);
      const n1 = b.node(run.b.x, run.b.y, z0);
      const n2 = b.node(run.b.x, run.b.y, z1);
      const n3 = b.node(run.a.x, run.a.y, z1);
      b.quad([n0, n1, n2, n3], t);
    }
  }
  const wallQuadCount = b.quads.length - wallQuadStart;
  if (wallQuadCount > 0) {
    warnings.push({ severity: 'info', message: 'wallsCoarseMesh' });
  }
  // Wall openings: from plan geometry alone we cannot know an opening's sill/
  // head height within a vertical wall, so we do NOT cut wall shells — we
  // recognize and warn (honest: no faked vertical hole). An opening "touches"
  // a wall when its centroid is within half its diagonal of a wall run.
  let wallOpeningsNotCut = 0;
  for (const op of openingPolys) {
    const reach = Math.max(op.bbox.maxX - op.bbox.minX, op.bbox.maxY - op.bbox.minY) / 2 + tol;
    const touches = wallRuns.some((run) => {
      const onSeg = pointOnSegment(op.centroid, run.a, run.b, reach, 0) !== null;
      return onSeg || dist(op.centroid, run.a) <= reach || dist(op.centroid, run.b) <= reach;
    });
    if (touches) wallOpeningsNotCut++;
  }
  if (wallOpeningsNotCut > 0) {
    warnings.push({ severity: 'warning', message: `wallOpeningsNotCut:${wallOpeningsNotCut}` });
  }
  // Pass plan-level warnings through, except the generic openings one (the
  // draft emits its own, more specific opening warnings above).
  for (const w of plan.warnings) {
    if (w !== 'openingsNotSubtracted') warnings.push({ severity: 'warning', message: w });
  }

  // ── Split beams at shell nodes (PR [8] mesh logic) ────────
  let beamsSplit = 0;
  if (a.splitBeams) {
    const nodeById = (id: number) => b.nodes.find((nn) => nn.id === id);
    // Every distinct node referenced by a shell quad.
    const shellNodeIds = [...new Set(b.quads.flatMap((q) => q.nodes))];
    // Split beams to a FIXED POINT: a split creates new shorter sub-beams, and
    // another shell node may lie on a newly-created sub-beam (common where
    // closely-spaced structural lines make short stubs). Re-scan all shell
    // nodes until a full pass produces no split (bounded for safety).
    for (let round = 0; round < 6; round++) {
      let splitThisRound = 0;
      for (const nid of shellNodeIds) {
        const nn = nodeById(nid);
        if (!nn) continue;
        for (let guard = 0; guard < 4; guard++) {
          const hit = beamThrough(nodeById, b.elements, nn.x, nn.y, nn.z ?? 0, tol);
          if (!hit) break;
          b.splitElement(hit.id, nid);
          beamsSplit++;
          splitThisRound++;
        }
      }
      if (splitThisRound === 0) break;
    }
  }

  // Final offset-element count (splits at shell nodes copy the parallel
  // offset to both halves, so count finished elements, not plan segments).
  let offsetElementCount = b.elements.filter((e) => e.offset).length;
  // ENGINE GUARD: analytical member offsets route the solve through the
  // constrained solver, which is effectively dense — on large models this
  // exhausts WASM memory (engine limitation, PR [7] scope). Above this node
  // count, detected offsets are STRIPPED with a warning instead of producing
  // a model that crashes the solver.
  const OFFSET_MODEL_NODE_LIMIT = 1200;
  if (offsetElementCount > 0 && b.nodes.length > OFFSET_MODEL_NODE_LIMIT) {
    for (const e of b.elements) delete e.offset;
    warnings.push({ severity: 'warning', message: `offsetsSkippedLargeModel:${offsetElementCount}` });
    // Beams stay relocated on the column line (connected) but are now modeled
    // centered — fold them into the centered-eccentric count.
    eccentricBeamsCentered += offsetElementCount;
    offsetElementCount = 0;
  }
  if (offsetElementCount > 0) {
    warnings.push({ severity: 'info', message: `beamsWithOffsets:${offsetElementCount}` });
  }
  // Flush beams relocated onto the column line but WITHOUT a modeled offset
  // (offset detection off, or stripped on a large model): connected, but the
  // eccentricity is not represented — surface it honestly.
  if (eccentricBeamsCentered > 0) {
    warnings.push({ severity: 'warning', message: `eccentricBeamsCentered:${eccentricBeamsCentered}` });
  }

  // ── Supports ──────────────────────────────────────────────
  let supId = 1;
  for (const nn of b.nodes) {
    if ((nn.z ?? 0) === 0) {
      b.supports.push({ id: supId++, nodeId: nn.id, type: a.baseSupport });
    }
  }

  // ── Loads (explicit user values only) ─────────────────────
  // With a roof live load defined, the TOP level's slabs carry Lr (case 3)
  // and lower floors carry L; otherwise L applies everywhere.
  const useLr = a.roofLiveLoad !== undefined;
  const topZ = floorLevels[floorLevels.length - 1];

  // Room/use-based live loads: each FLOOR (non-roof) slab quad gets the live
  // load of the nearest architectural room label, falling back to the global
  // default L when no label is within reach. Classification is by nearest
  // label centroid (v1) — there are no closed room polygons — and splitting a
  // slab by room boundaries is future work. The roof always carries Lr.
  const roomBased = a.roomBasedLiveLoads === true && plan.roomLabels.length > 0;
  const ROOM_REACH = 6; // m — max quad-centroid → label distance to classify
  const quadCentroid = (qid: number): CadPt | null => {
    const q = b.quads.find((qq) => qq.id === qid);
    if (!q) return null;
    let x = 0, y = 0; let nn = 0;
    for (const nid of q.nodes) {
      const node = b.nodes.find((n2) => n2.id === nid);
      if (node) { x += node.x; y += node.y; nn++; }
    }
    return nn ? { x: x / nn, y: y / nn } : null;
  };
  const nearestRoomQ = (c: CadPt): { q: number; category: string } | null => {
    let best: (typeof plan.roomLabels)[number] | null = null;
    let bestD = ROOM_REACH;
    for (const r of plan.roomLabels) {
      const d = Math.hypot(c.x - r.at.x, c.y - r.at.y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best ? { q: best.q, category: best.category } : null;
  };
  const liveLoadByCategory: Record<string, number> = {};
  let liveLoadDefaulted = 0;

  for (const { id: qid, z } of slabQuads) {
    const isRoof = useLr && Math.abs(z - topZ) <= tol;
    if (a.deadLoad > 0) {
      b.loads.push({ type: 'surface3d', data: { id: b.nextLoad++, quadId: qid, q: a.deadLoad, caseId: 1 } });
    }
    if (isRoof) {
      if ((a.roofLiveLoad ?? 0) > 0) {
        b.loads.push({ type: 'surface3d', data: { id: b.nextLoad++, quadId: qid, q: a.roofLiveLoad!, caseId: 3 } });
      }
      continue;
    }
    // Floor live load: room-based when enabled, else the global default.
    let lq = a.liveLoad;
    if (roomBased) {
      const c = quadCentroid(qid);
      const room = c ? nearestRoomQ(c) : null;
      if (room) {
        lq = room.q;
        liveLoadByCategory[room.category] = (liveLoadByCategory[room.category] ?? 0) + 1;
      } else {
        lq = a.liveLoad;
        liveLoadDefaulted++;
      }
    }
    if (lq > 0) {
      b.loads.push({ type: 'surface3d', data: { id: b.nextLoad++, quadId: qid, q: lq, caseId: 2 } });
    }
  }
  if (roomBased) {
    warnings.push({ severity: 'info', message: `liveLoadsByRoom:${Object.keys(liveLoadByCategory).length}` });
    warnings.push({ severity: 'warning', message: 'roomBoundaryByNearestLabel' });
    if (liveLoadDefaulted > 0) {
      warnings.push({ severity: 'warning', message: `liveLoadDefaulted:${liveLoadDefaulted}` });
    }
  } else if (a.roomBasedLiveLoads === true && plan.roomLabels.length === 0) {
    warnings.push({ severity: 'warning', message: 'roomBasedRequestedNoLabels' });
  }

  const loadCases = [
    { id: 1, type: 'D', name: 'Dead Load' },
    { id: 2, type: 'L', name: 'Live Load' },
    ...(useLr ? [{ id: 3, type: 'Lr', name: 'Roof Live Load' }] : []),
  ];
  const combinations = a.generateCombos
    ? useLr
      ? [
          { id: 1, name: '1.4 D', factors: [{ caseId: 1, factor: 1.4 }] },
          { id: 2, name: '1.2 D + 1.6 L + 0.5 Lr', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }, { caseId: 3, factor: 0.5 }] },
          { id: 3, name: '1.2 D + 0.5 L + 1.6 Lr', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 0.5 }, { caseId: 3, factor: 1.6 }] },
        ]
      : [
          { id: 1, name: '1.4 D', factors: [{ caseId: 1, factor: 1.4 }] },
          { id: 2, name: '1.2 D + 1.6 L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
        ]
    : [];

  // ── Provenance & assumptions ──────────────────────────────
  const cm = (v: number) => Math.round(v * 100);
  const assumptions: string[] = [
    `One architectural floor plan replicated across all ${a.nFloors} floor(s); per-floor distinct plans are future work.`,
    `Concrete ${a.concreteGrade}: f'c = ${grade.fc} MPa, E = ${grade.e} MPa. No reinforcement is generated — design/verification is a separate step.`,
    `Default sections: columns ${cm(a.columnSection.b)}x${cm(a.columnSection.h)} cm, beams ${cm(a.beamSection.b)}x${cm(a.beamSection.h)} cm; slab t = ${cm(a.slabThickness)} cm; wall t = ${cm(a.wallThickness)} cm. Column sizes detected in the drawing are used where available.`,
    `All base-level (z = 0) nodes are ${a.baseSupport === 'fixed3d' ? 'fixed' : 'pinned'} supports. No foundation design.`,
    roomBased
      ? `Live loads assigned by ROOM LABELS from the CAD plan (CIRSOC 101 occupancy table, nearest-label classification): ${Object.entries(liveLoadByCategory).map(([cat, n]) => `${cat} ${ROOM_CATEGORY_LOADS[cat] ?? '?'} kN/m² (${n} quad-floors)`).join(', ')}${liveLoadDefaulted > 0 ? `; ${liveLoadDefaulted} quad-floors used the default L = ${a.liveLoad} kN/m² (no nearby room label)` : ''}. Room regions inferred by nearest text label (no closed room polygons); splitting a slab by room boundary is future work. D = ${a.deadLoad} kN/m²${useLr ? `, roof Lr = ${a.roofLiveLoad} kN/m²` : ''}. Self-weight NOT included; no wind/seismic/snow.`
      : `Slab loads exactly as entered: D = ${a.deadLoad} kN/m², L = ${a.liveLoad} kN/m²${useLr ? `, roof Lr = ${a.roofLiveLoad} kN/m² (top floor slabs carry Lr instead of L)` : ''}. Self-weight is NOT included automatically. No wind/seismic/snow loads are generated.`,
    a.generateCombos
      ? useLr
        ? 'Only the explicit factored combinations 1.4D, 1.2D+1.6L+0.5Lr, and 1.2D+0.5L+1.6Lr are generated.'
        : 'Only the explicit factored combinations 1.4D and 1.2D+1.6L are generated.'
      : 'No load combinations generated.',
    a.meshSlabs
      ? (meshMode === 'targetSize'
          ? `Slabs meshed to a target element size of ${target} m (cells ~${(target * 0.75).toFixed(2)}–${(target * 1.5).toFixed(2)} m); mesh lines are forced through beams, walls, columns and opening edges, and near lines are snapped together to avoid slivers${meshSlivers > 0 ? ` (${meshSlivers} unavoidable narrow strip(s) where structural lines are closer than the target — flagged)` : ''}`
          : `Slabs meshed with fixed ${fixedN}×${fixedN} subdivisions per panel`)
        + `${a.splitBeams ? '; surrounding beams split at mesh nodes so shells share nodes with beams' : '; beams NOT split (shells couple only at coincident corners)'}.`
      : 'Slabs modeled as single shell elements (no mesh).',
  ];
  if (wallQuadCount > 0) {
    assumptions.push('Walls/tabiques modeled as one shell element per story (coarse); refine with the shell mesh tool before relying on wall results.');
  }
  if (cantileverSlabs > 0) {
    assumptions.push(`${cantileverSlabs} cantilever slab(s) / balcón–voladizo (supported along ONE edge by a beam/adjacent slab, no exterior columns) modeled as shell cantilevers; their supported edge shares nodes with the adjacent beam (beam split at the shell edge nodes).`);
  }
  if (isolatedSlabs > 0) {
    assumptions.push(`${isolatedSlabs} slab(s) had NO structural support (no beam edge, not adjacent to any slab) and were SKIPPED — an isolated slab is not a valid structure (a cantilever needs at least one supported edge).`);
  }
  if (openingPolys.length > 0) {
    if (a.ignoreOpenings) {
      assumptions.push(`Openings IGNORED by explicit choice: ${openingPolys.length} opening(s) recognized but slab shells were meshed SOLID through them — results over those areas are not representative.`);
    } else {
      const parts = [`${openingPolys.length} opening(s) recognized`];
      if (openingsCutCount > 0) parts.push(`${openingsCutCount} cut out of slab shells (exact rectangular holes; ${openingsApproxCount} with an approximate non-rectilinear boundary)`);
      if (openingsUncut > 0) parts.push(`${openingsUncut} on skewed/curved slabs were NOT cut and the affected shell was skipped`);
      if (wallOpeningsNotCut > 0) parts.push(`${wallOpeningsNotCut} overlap wall/tabique runs and are NOT cut from wall shells (plan geometry gives no sill/head height) — model wall openings manually if needed`);
      assumptions.push(parts.join('; ') + '.');
    }
  }
  if (schedules.length > 0) {
    assumptions.push(`Floor-dependent section schedules in effect (${schedules.length} row(s)): ` +
      schedules.map((r) => `${r.kind} ${r.mark} fl.${r.fromFloor}-${r.toFloor} ${r.b !== undefined ? `${Math.round(r.b * 100)}x${Math.round((r.h ?? 0) * 100)}` : `t=${Math.round((r.t ?? 0) * 100)}`}cm [${r.source}]`).join('; ') + '.');
  }
  if (beamSectionLog.size > 0) {
    assumptions.push('Beam sections (per member, resolved as exact schedule → label → wildcard schedule → measured geometry → default): ' +
      [...beamSectionLog.values()]
        .sort((x, y) => y.b * y.h - x.b * x.h)
        .map((v) => `${Math.round(v.b * 100)}x${Math.round(v.h * 100)} cm [${v.source}]`).join(', ') + '.');
  }
  if (a.detectOffsets) {
    assumptions.push(`Beam eccentricity detection ON (tolerance ${(a.offsetTolerance ?? 0.03)} m): ${offsetElementCount} beam element(s) carry analytical member offsets (nodes on the column-centre line, physical centerline recorded as element.offset); ${offsetsAmbiguous} candidate(s) were AMBIGUOUS (skewed/one-sided) and left without offset — review manually.`);
  }

  const provenance: ModelProvenance = {
    source: 'cad-dxf',
    fileName: source.fileName,
    importedAtIso: source.importedAtIso,
    status: 'cad-draft-unreviewed',
    assumptions,
    layerMappings: plan.mappings.map((m) => ({ ...m })),
  };

  // ── Snapshot ──────────────────────────────────────────────
  const snapshot: ModelSnapshot = {
    name: source.fileName.replace(/\.dxf$/i, '') + ' (CAD draft)',
    analysisMode: 'pro',
    nodes: b.nodes.map((nn) => [nn.id, { ...nn }]),
    materials: [[1, material]],
    sections: b.sections.map((s) => [s.id, s]) as ModelSnapshot['sections'],
    elements: b.elements.map((el) => [el.id, { ...el, releaseI: { ...el.releaseI }, releaseJ: { ...el.releaseJ } }]) as unknown as ModelSnapshot['elements'],
    supports: b.supports.map((s) => [s.id, { ...s }]) as ModelSnapshot['supports'],
    loads: b.loads,
    loadCases,
    combinations,
    plates: [],
    quads: b.quads.map((q) => [q.id, { ...q, nodes: [...q.nodes] as [number, number, number, number] }]),
    constraints: [],
    connectors: [],
    provenance,
    nextId: {
      node: b.nextNode,
      material: 2,
      section: b.sections.length + 1,
      element: b.nextElement,
      support: supId,
      load: b.nextLoad,
      loadCase: 3,
      combination: combinations.length + 1,
      plate: 1,
      quad: b.nextQuad,
      connector: 1,
    },
  };

  return {
    snapshot,
    provenance,
    warnings,
    counts: {
      nodes: b.nodes.length,
      columns: columnElementCount,
      beams: b.elements.length - columnElementCount,
      slabQuads: slabQuads.length,
      wallQuads: wallQuadCount,
      supports: b.supports.length,
      loads: b.loads.length,
      combinations: combinations.length,
      beamsSplit,
      slabsSkipped,
      beamsWithOffsets: offsetElementCount,
      offsetsAmbiguous,
      specSections: specCounts,
      scheduleAssignments: columnScheduleSegments + beamScheduleSegments + wallScheduleHits + slabScheduleHits,
      openingsDetected: openingPolys.length,
      openingsCutFromSlabs: openingsCutCount,
      openingsNotCut: openingPolys.length - openingsCutCount,
      cantileverSlabs,
      slabsIsolated: isolatedSlabs,
      liveLoadByCategory,
      liveLoadDefaulted,
    },
  };
}
