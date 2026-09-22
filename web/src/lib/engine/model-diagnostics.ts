/**
 * Pre-solve model diagnostics — analyzes model data for quality issues
 * without running the solver. Returns SolverDiagnostic[] with source 'model'.
 */
import type { SolverDiagnostic } from './types';
import type { Node, Element, Section, Material, Support, Plate, Quad } from '../store/model.svelte';
import type { Constraint3D, ConnectorElement } from './types-3d';
import { addConstraintConnectivity } from './constraint-connectivity';

interface LoadEntry {
  type: string;
  data: { id: number; caseId?: number; elementId?: number; nodeId?: number; [k: string]: unknown };
}

interface LoadCase {
  id: number;
  name: string;
  type: string;
}

interface ModelData {
  nodes: Map<number, Node>;
  elements: Map<number, Element>;
  materials: Map<number, Material>;
  sections: Map<number, Section>;
  supports: Map<number, Support>;
  loads: LoadEntry[];
  loadCases: LoadCase[];
  plates?: Map<number, Plate>;
  quads?: Map<number, Quad>;
  connectors?: Map<number, ConnectorElement>;
  constraints?: Constraint3D[];
}

function diag(
  severity: SolverDiagnostic['severity'],
  code: string,
  message: string,
  opts?: { elementIds?: number[]; nodeIds?: number[]; details?: Record<string, unknown> },
): SolverDiagnostic {
  return { severity, code, message, source: 'model' as any, ...opts };
}

/**
 * Perpendicular-to-member magnitude (kN or kN/m) of a member load.
 * Mirrors the load decomposition in solver-service so the "transverse on a
 * truss" warning matches what the solver would actually do with the load.
 * 3D member loads (distributed3d / pointOnElement3d) store their components in
 * local Y/Z, which are perpendicular to the member axis by definition.
 * 2D loads (distributed / pointOnElement) depend on the load angle + local/global flag.
 */
export function memberLoadPerpComponent(
  load: LoadEntry,
  elem: Element,
  nodes: Map<number, Node>,
): number {
  const d = load.data as Record<string, number | boolean | undefined>;
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

  if (load.type === 'distributed3d') {
    return Math.max(Math.abs(num(d.qYI)), Math.abs(num(d.qYJ)), Math.abs(num(d.qZI)), Math.abs(num(d.qZJ)));
  }
  if (load.type === 'pointOnElement3d') {
    return Math.max(Math.abs(num(d.py)), Math.abs(num(d.pz)));
  }
  if (load.type !== 'distributed' && load.type !== 'pointOnElement') return 0;

  const ni = nodes.get(elem.nodeI), nj = nodes.get(elem.nodeJ);
  if (!ni || !nj) return 0;
  const edx = nj.x - ni.x, edy = nj.y - ni.y, edz = (nj.z ?? 0) - (ni.z ?? 0);
  // Use the full 3D length for the degenerate guard so a member running along
  // global Z (edx=edy=0) is not mistaken for zero-length — otherwise a local
  // transverse load on a vertical 3D truss would be silently missed.
  const L = Math.hypot(edx, edy, edz);
  if (L < 1e-10) return 0;
  // In-plane (X-Y) direction used only to project a GLOBAL-frame 2D load onto the
  // member normal. A member with no X-Y extent has no defined in-plane normal, so
  // a global 2D load there can't be projected (returns 0); a LOCAL 2D load's
  // perpendicular magnitude is orientation-independent and handled below.
  const Lxy = Math.hypot(edx, edy);
  const cosT = Lxy > 1e-10 ? edx / Lxy : 1, sinT = Lxy > 1e-10 ? edy / Lxy : 0;
  const angleRad = num(d.angle) * Math.PI / 180;
  const isGlobal = d.isGlobal === true;
  // Local: angle=0 ⇒ fully perpendicular. Global: project onto the member normal.
  const perpOf = (q: number): number => isGlobal
    ? (q * Math.sin(angleRad)) * (-sinT) + (q * Math.cos(angleRad)) * cosT
    : q * Math.cos(angleRad);

  if (load.type === 'distributed') {
    return Math.max(Math.abs(perpOf(num(d.qI))), Math.abs(perpOf(num(d.qJ))));
  }
  // pointOnElement: d.p is the perpendicular magnitude; d.px is purely axial.
  return Math.abs(perpOf(num(d.p)));
}

/** Run all pre-solve model checks */
export function checkModel(m: ModelData): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];

  // ─── Minimum structure ─────────────────────────
  if (m.nodes.size < 2) {
    out.push(diag('error', 'MODEL_FEW_NODES', 'diag.model.fewNodes'));
  }
  const hasShells = (m.plates?.size ?? 0) + (m.quads?.size ?? 0) > 0;
  if (m.elements.size === 0 && !hasShells) {
    out.push(diag('error', 'MODEL_NO_ELEMENTS', 'diag.model.noElements'));
  }
  if (m.supports.size === 0) {
    out.push(diag('error', 'MODEL_NO_SUPPORTS', 'diag.model.noSupports'));
  }

  // ─── Coincident nodes ──────────────────────────
  const nodeArr = [...m.nodes.values()];
  for (let i = 0; i < nodeArr.length; i++) {
    for (let j = i + 1; j < nodeArr.length; j++) {
      const a = nodeArr[i], b = nodeArr[j];
      const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
      if (dx * dx + dy * dy + dz * dz < 1e-6) {
        out.push(diag('warning', 'MODEL_COINCIDENT_NODES', 'diag.model.coincidentNodes', {
          nodeIds: [a.id, b.id],
          details: { x: a.x, y: a.y, z: a.z ?? 0 },
        }));
      }
    }
  }

  // ─── Disconnected nodes ────────────────────────
  // Elements + shell elements + connectors all count as connectivity. A node
  // coupled by a ConnectorElement is NOT a disconnected/orphan node.
  const connectedNodes = new Set<number>();
  for (const [, el] of m.elements) {
    connectedNodes.add(el.nodeI);
    connectedNodes.add(el.nodeJ);
  }
  if (m.plates) {
    for (const [, p] of m.plates) {
      for (const nid of p.nodes) connectedNodes.add(nid);
    }
  }
  if (m.quads) {
    for (const [, q] of m.quads) {
      for (const nid of q.nodes) connectedNodes.add(nid);
    }
  }
  if (m.connectors) {
    for (const [, c] of m.connectors) {
      connectedNodes.add(c.nodeI);
      connectedNodes.add(c.nodeJ);
    }
  }
  addConstraintConnectivity(connectedNodes, m.constraints);
  for (const [id] of m.nodes) {
    if (!connectedNodes.has(id)) {
      // Skip if it has a support (reaction point)
      const hasSupport = [...m.supports.values()].some(s => s.nodeId === id);
      if (!hasSupport) {
        out.push(diag('warning', 'MODEL_DISCONNECTED_NODE', 'diag.model.disconnectedNode', {
          nodeIds: [id],
        }));
      }
    }
  }

  // ─── Element checks ───────────────────────────
  const edgeSet = new Set<string>();
  for (const [, el] of m.elements) {
    const nI = m.nodes.get(el.nodeI);
    const nJ = m.nodes.get(el.nodeJ);

    // Missing nodes
    if (!nI || !nJ) {
      out.push(diag('error', 'MODEL_MISSING_NODE', 'diag.model.missingNode', {
        elementIds: [el.id],
        details: { nodeI: el.nodeI, nodeJ: el.nodeJ },
      }));
      continue;
    }

    // Zero-length
    const dx = nJ.x - nI.x, dy = nJ.y - nI.y, dz = (nJ.z ?? 0) - (nI.z ?? 0);
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-4) {
      out.push(diag('error', 'MODEL_ZERO_LENGTH', 'diag.model.zeroLength', {
        elementIds: [el.id],
      }));
    } else if (L < 0.05) {
      out.push(diag('warning', 'MODEL_SHORT_ELEMENT', 'diag.model.shortElement', {
        elementIds: [el.id],
        details: { L: L },
      }));
    }

    // Duplicate elements (same node pair)
    const edgeKey = el.nodeI < el.nodeJ
      ? `${el.nodeI}-${el.nodeJ}`
      : `${el.nodeJ}-${el.nodeI}`;
    if (edgeSet.has(edgeKey)) {
      out.push(diag('warning', 'MODEL_DUPLICATE_ELEMENT', 'diag.model.duplicateElement', {
        elementIds: [el.id],
        nodeIds: [el.nodeI, el.nodeJ],
      }));
    }
    edgeSet.add(edgeKey);

    // Missing / invalid section
    const sec = m.sections.get(el.sectionId);
    if (!sec) {
      out.push(diag('error', 'MODEL_MISSING_SECTION', 'diag.model.missingSection', {
        elementIds: [el.id],
        details: { sectionId: el.sectionId },
      }));
    } else {
      if (sec.a <= 0) {
        out.push(diag('error', 'MODEL_ZERO_AREA', 'diag.model.zeroArea', {
          elementIds: [el.id],
          details: { section: sec.name, A: sec.a },
        }));
      }
      if (el.type === 'frame' && sec.iz <= 0) {
        out.push(diag('error', 'MODEL_ZERO_INERTIA', 'diag.model.zeroInertia', {
          elementIds: [el.id],
          details: { section: sec.name, Iz: sec.iz },
        }));
      }
    }

    // Missing / invalid material
    const mat = m.materials.get(el.materialId);
    if (!mat) {
      out.push(diag('error', 'MODEL_MISSING_MATERIAL', 'diag.model.missingMaterial', {
        elementIds: [el.id],
        details: { materialId: el.materialId },
      }));
    } else {
      if (mat.e <= 0) {
        out.push(diag('error', 'MODEL_ZERO_MODULUS', 'diag.model.zeroModulus', {
          elementIds: [el.id],
          details: { material: mat.name, E: mat.e },
        }));
      }
    }

    // Double-hinged frame (mechanism unless laterally supported)
    if (el.type === 'frame' && el.releaseI?.mz === true && el.releaseJ?.mz === true) {
      out.push(diag('warning', 'MODEL_DOUBLE_HINGE', 'diag.model.doubleHinge', {
        elementIds: [el.id],
      }));
    }
  }

  // ─── Support on non-existent node ──────────────
  for (const [, sup] of m.supports) {
    if (!m.nodes.has(sup.nodeId)) {
      out.push(diag('error', 'MODEL_SUPPORT_ORPHAN', 'diag.model.supportOrphan', {
        nodeIds: [sup.nodeId],
      }));
    }
  }

  // ─── Load checks ──────────────────────────────
  if (m.loads.length === 0 && m.elements.size > 0) {
    out.push(diag('info', 'MODEL_NO_LOADS', 'diag.model.noLoads'));
  }

  // Empty load cases (have cases but no loads in them)
  const casesWithLoads = new Set(m.loads.map(l => l.data.caseId ?? 1));
  for (const lc of m.loadCases) {
    if (!casesWithLoads.has(lc.id)) {
      out.push(diag('info', 'MODEL_EMPTY_CASE', 'diag.model.emptyCase', {
        details: { caseName: lc.name, caseId: lc.id },
      }));
    }
  }

  // Loads referencing non-existent elements/nodes
  for (const load of m.loads) {
    if ('elementId' in load.data && load.data.elementId != null) {
      if (!m.elements.has(load.data.elementId as number)) {
        out.push(diag('error', 'MODEL_LOAD_ORPHAN_ELEM', 'diag.model.loadOrphanElem', {
          details: { loadId: load.data.id, elementId: load.data.elementId },
        }));
      }
    }
    if ('nodeId' in load.data && load.data.nodeId != null) {
      if (!m.nodes.has(load.data.nodeId as number)) {
        out.push(diag('error', 'MODEL_LOAD_ORPHAN_NODE', 'diag.model.loadOrphanNode', {
          details: { loadId: load.data.id, nodeId: load.data.nodeId },
        }));
      }
    }
  }

  // ─── Members that lie on top of each other ─────────────────────
  out.push(...overlappingCollinearWarnings(m.elements, m.nodes));

  // ─── Surfaces: repeated, and out of plane ──────────────────────
  out.push(...surfaceWarnings(m.plates, m.quads, m.nodes));

  // ─── Transverse load on an axial-only (truss) member ───────────
  out.push(...transverseOnTrussWarnings(m.loads, m.elements, m.nodes));

  return out;
}

/** Tolerances. Relative to member length, so they mean the same on a bolt and on a bridge. */
const COLLINEAR_TOL = 1e-6;   // sine of the angle between two directions
const OVERLAP_TOL = 1e-4;     // fraction of the shorter member that must actually overlap

/**
 * Two members sharing the same line and the same stretch of it.
 *
 * Not the same as a duplicate element, which `checkModel` already catches by node pair.
 * These have DIFFERENT end nodes, so nothing upstream notices them: a 6 m beam and a 3 m
 * beam laid over its first half are two load paths where the drawing shows one, and the
 * structure comes out stiffer than anything that will be built.
 *
 * Grouped by the line each member lies on before anything is compared, so this costs
 * O(n log n) and not the O(n²) that a model of a few thousand members would feel.
 */
export function overlappingCollinearWarnings(
  elements: ModelData['elements'],
  nodes: ModelData['nodes'],
): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];
  type Seg = { id: number; t0: number; t1: number; ends: string };
  const lines = new Map<string, Seg[]>();

  for (const el of elements.values()) {
    const a = nodes.get(el.nodeI);
    const b = nodes.get(el.nodeJ);
    if (!a || !b) continue;
    const az = a.z ?? 0, bz = b.z ?? 0;
    let d: [number, number, number] = [b.x - a.x, b.y - a.y, bz - az];
    const L = Math.hypot(d[0], d[1], d[2]);
    if (L < 1e-9) continue;
    d = [d[0] / L, d[1] / L, d[2] / L];
    // One direction per line, not two: a member drawn J→I is on the same line as I→J.
    const flip = d[0] < -COLLINEAR_TOL
      || (Math.abs(d[0]) <= COLLINEAR_TOL && d[1] < -COLLINEAR_TOL)
      || (Math.abs(d[0]) <= COLLINEAR_TOL && Math.abs(d[1]) <= COLLINEAR_TOL && d[2] < 0);
    if (flip) d = [-d[0], -d[1], -d[2]];

    // The line's own identity: its direction, plus the foot of the perpendicular from
    // the origin. Two members are on the same line exactly when both agree.
    const dot = a.x * d[0] + a.y * d[1] + az * d[2];
    const foot: [number, number, number] = [a.x - dot * d[0], a.y - dot * d[1], az - dot * d[2]];
    const q = (v: number): string => (Math.round(v / 1e-6) * 1e-6).toFixed(6);
    const key = `${q(d[0])},${q(d[1])},${q(d[2])}|${q(foot[0])},${q(foot[1])},${q(foot[2])}`;

    const tA = a.x * d[0] + a.y * d[1] + az * d[2];
    const tB = b.x * d[0] + b.y * d[1] + bz * d[2];
    const ends = el.nodeI < el.nodeJ ? `${el.nodeI}-${el.nodeJ}` : `${el.nodeJ}-${el.nodeI}`;
    const seg: Seg = { id: el.id, t0: Math.min(tA, tB), t1: Math.max(tA, tB), ends };
    const bucket = lines.get(key);
    if (bucket) bucket.push(seg); else lines.set(key, [seg]);
  }

  for (const segs of lines.values()) {
    if (segs.length < 2) continue;
    segs.sort((x, y) => x.t0 - y.t0);
    for (let i = 0; i < segs.length - 1; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        // Sorted by start, so once a segment starts after this one ends, so do the rest.
        if (segs[j]!.t0 >= segs[i]!.t1) break;
        // Two members on the SAME node pair are a duplicate, and `checkModel` already
        // says so. They also overlap completely, so without this they would be reported
        // twice under two names — one defect, two warnings, and the reader deciding
        // whether they are the same thing.
        if (segs[i]!.ends === segs[j]!.ends) continue;
        const over = Math.min(segs[i]!.t1, segs[j]!.t1) - segs[j]!.t0;
        const shorter = Math.min(segs[i]!.t1 - segs[i]!.t0, segs[j]!.t1 - segs[j]!.t0);
        // Members meeting end to end share a point, not a stretch. That is a connection.
        if (over > OVERLAP_TOL * shorter) {
          out.push(diag('warning', 'MODEL_OVERLAPPING_MEMBERS', 'diag.model.overlappingMembers', {
            elementIds: [segs[i]!.id, segs[j]!.id],
            details: { overlapLength: +over.toFixed(4) },
          }));
        }
      }
    }
  }
  return out;
}

/** A quad this far out of its own plane, as a fraction of its mean edge, is a modelling error. */
const WARP_TOL = 0.01;

/**
 * Repeated surfaces, and quads whose four corners are not coplanar.
 *
 * A warped quad is the quiet one. The formulation assumes a flat element, so four corners
 * that do not share a plane are silently projected onto one — the element solves, reports
 * stresses, and describes a surface nobody drew. Nothing downstream can tell, which is
 * precisely why it has to be said here.
 *
 * Plates are triangles and three points always share a plane, so only their repetition
 * can be wrong. Quads can be both.
 */
export function surfaceWarnings(
  plates: ModelData['plates'],
  quads: ModelData['quads'],
  nodes: ModelData['nodes'],
): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];
  const seen = new Map<string, number>();
  const keyOf = (ids: readonly number[]): string => [...ids].sort((a, b) => a - b).join('-');

  for (const p of plates?.values() ?? []) {
    const k = `P${keyOf(p.nodes)}`;
    const first = seen.get(k);
    if (first !== undefined) {
      out.push(diag('warning', 'MODEL_DUPLICATE_SURFACE', 'diag.model.duplicateSurface', {
        nodeIds: [...p.nodes], details: { surfaceId: p.id, sameAs: first },
      }));
    } else seen.set(k, p.id);
  }

  for (const q of quads?.values() ?? []) {
    const k = `Q${keyOf(q.nodes)}`;
    const first = seen.get(k);
    if (first !== undefined) {
      out.push(diag('warning', 'MODEL_DUPLICATE_SURFACE', 'diag.model.duplicateSurface', {
        nodeIds: [...q.nodes], details: { surfaceId: q.id, sameAs: first },
      }));
    } else seen.set(k, q.id);

    const pts = q.nodes.map((id) => nodes.get(id));
    if (pts.some((n) => !n)) continue;
    const P = pts.map((n) => [n!.x, n!.y, n!.z ?? 0] as [number, number, number]);
    const u: [number, number, number] = [P[1]![0] - P[0]![0], P[1]![1] - P[0]![1], P[1]![2] - P[0]![2]];
    const v: [number, number, number] = [P[2]![0] - P[0]![0], P[2]![1] - P[0]![1], P[2]![2] - P[0]![2]];
    const n: [number, number, number] = [
      u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0],
    ];
    const nLen = Math.hypot(n[0], n[1], n[2]);
    if (nLen < 1e-12) continue; // degenerate, and already someone else's warning
    const w: [number, number, number] = [P[3]![0] - P[0]![0], P[3]![1] - P[0]![1], P[3]![2] - P[0]![2]];
    const outOfPlane = Math.abs(w[0] * n[0] + w[1] * n[1] + w[2] * n[2]) / nLen;
    let per = 0;
    for (let i = 0; i < 4; i++) {
      const a = P[i]!, b = P[(i + 1) % 4]!;
      per += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    const meanEdge = per / 4;
    if (meanEdge > 1e-9 && outOfPlane > WARP_TOL * meanEdge) {
      out.push(diag('warning', 'MODEL_WARPED_QUAD', 'diag.model.warpedQuad', {
        nodeIds: [...q.nodes],
        details: { surfaceId: q.id, outOfPlane: +outOfPlane.toFixed(5), meanEdge: +meanEdge.toFixed(4) },
      }));
    }
  }
  return out;
}

/**
 * Transverse-load-on-truss warnings. A truss member carries only axial force, so
 * a perpendicular load is not transferred as beam bending/shear. Educational;
 * never blocks solving. Extracted from checkModel so the Basic solve path can
 * surface it as a pre-solve diagnostic too (checkModel itself only runs in PRO).
 */
export function transverseOnTrussWarnings(
  loads: ModelData['loads'],
  elements: ModelData['elements'],
  nodes: ModelData['nodes'],
): SolverDiagnostic[] {
  const out: SolverDiagnostic[] = [];
  for (const load of loads) {
    const elemId = load.data.elementId;
    if (elemId == null) continue;
    const elem = elements.get(elemId);
    if (!elem || elem.type !== 'truss') continue;
    if (memberLoadPerpComponent(load, elem, nodes) > 1e-9) {
      out.push(diag('warning', 'MODEL_TRANSVERSE_ON_TRUSS', 'diag.model.transverseOnTruss', {
        elementIds: [elem.id],
        details: { loadId: load.data.id },
      }));
    }
  }
  return out;
}
