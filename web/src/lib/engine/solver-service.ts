// Solver service — pure functions extracted from model.svelte.ts
// Each function takes a ModelData parameter instead of accessing reactive store state.

import { solve as solveStructure, solve3D as solve3DEngine, analyzeKinematics, combineResults, combineResults3D, computeEnvelope, computeEnvelope3D } from './wasm-solver';
import type { SolverInput, FullEnvelope, AnalysisResults } from './types';
import { computeLocalAxes3D } from './solver-3d';
import type { SolverInput3D, SolverLoad3D, AnalysisResults3D, FullEnvelope3D } from './types-3d';
import type { KinematicResult } from './kinematic-2d';
import { t } from '../i18n';

import type {
  Node, Element, Support, Load, Material, Section,
  LoadCase, LoadCombination,
  DistributedLoad, PointLoadOnElement, ThermalLoad,
  NodalLoad3D, DistributedLoad3D, PointLoadOnElement3D,
} from '../store/model.svelte';

// ─── ModelData interface ──────────────────────────────────────────

export interface ModelData {
  nodes: Map<number, Node>;
  elements: Map<number, Element>;
  supports: Map<number, Support>;
  loads: Load[];
  materials: Map<number, Material>;
  sections: Map<number, Section>;
}

// ─── Internal helpers ─────────────────────────────────────────────

/** Compute average element angle at a node (radians). */
function getElemAngleAtNode(nodeId: number, nodes: Map<number, Node>, elements: Map<number, Element>): number {
  let sumAngle = 0, count = 0;
  for (const elem of elements.values()) {
    if (elem.nodeI === nodeId || elem.nodeJ === nodeId) {
      const ni = nodes.get(elem.nodeI);
      const nj = nodes.get(elem.nodeJ);
      if (!ni || !nj) continue;
      const angle = elem.nodeI === nodeId
        ? Math.atan2(nj.y - ni.y, nj.x - ni.x)
        : Math.atan2(ni.y - nj.y, ni.x - nj.x);
      sumAngle += angle;
      count++;
    }
  }
  return count > 0 ? sumAngle / count : 0;
}

/** Effective bending inertia for a rotated section profile (Mohr's circle).
 *  When the section is rotated by angle α around the bar axis,
 *  the effective inertia for 2D bending is:
 *    I_eff = Iy·cos²α + Iz·sin²α
 *  This is exported so Viewport.svelte can reuse it for deformed-shape rendering. */
export function effectiveBendingInertia(sec: Section): number {
  const Iy = sec.iy ?? sec.iz;  // about Y horizontal (strong for IPN)
  const Iz = sec.iz;             // about Z vertical (weak for IPN)
  const alpha = (sec.rotation ?? 0) * Math.PI / 180;
  if (Math.abs(alpha) < 1e-10) return Iy;  // fast path: no rotation
  return Iy * Math.cos(alpha) ** 2 + Iz * Math.sin(alpha) ** 2;
}

/** Build solver supports map (2D), handling roller angle/inclined roller and spring rotation. */
function buildSolverSupports2D(model: ModelData): Map<number, any> {
  return new Map(Array.from(model.supports.entries()).map(([id, s]) => {
    const isRoller = s.type === 'rollerX' || s.type === 'rollerY';
    if (isRoller) {
      const baseAngleDeg = s.type === 'rollerX' ? 0 : 90;
      let effectiveAngleDeg = baseAngleDeg;
      if (s.isGlobal === false) {
        const elemAngle = getElemAngleAtNode(s.nodeId, model.nodes, model.elements);
        effectiveAngleDeg = (elemAngle * 180 / Math.PI) + baseAngleDeg;
      }
      effectiveAngleDeg += (s.angle ?? 0);
      effectiveAngleDeg = ((effectiveAngleDeg % 360) + 360) % 360;
      const isAxisAligned =
        Math.abs(effectiveAngleDeg % 360) < 0.01 ||
        Math.abs(effectiveAngleDeg % 360 - 360) < 0.01 ||
        Math.abs(effectiveAngleDeg % 360 - 90) < 0.01 ||
        Math.abs(effectiveAngleDeg % 360 - 180) < 0.01 ||
        Math.abs(effectiveAngleDeg % 360 - 270) < 0.01;
      const di = s.type === 'rollerX' ? (s.dy ?? 0) : (s.dx ?? 0);
      if (isAxisAligned) {
        const norm = Math.round(effectiveAngleDeg / 90) % 4;
        const mappedType = (norm === 0 || norm === 2) ? 'rollerX' : 'rollerY';
        const solverDx = mappedType === 'rollerY' ? di : undefined;
        const solverDy = mappedType === 'rollerX' ? di : undefined;
        return [id, { id: s.id, nodeId: s.nodeId, type: mappedType as any, kx: s.kx, ky: s.ky, kz: s.kz, dx: solverDx, dy: solverDy, drz: s.drz }];
      } else {
        const angleRad = effectiveAngleDeg * Math.PI / 180;
        const solverDx = di !== 0 ? di * Math.sin(angleRad) : undefined;
        const solverDy = di !== 0 ? di * Math.cos(angleRad) : undefined;
        return [id, { id: s.id, nodeId: s.nodeId, type: 'inclinedRoller' as any, angle: angleRad, kx: s.kx, ky: s.ky, kz: s.kz, dx: solverDx, dy: solverDy, drz: s.drz }];
      }
    }
    if (s.type === 'spring' && (s.angle !== undefined && s.angle !== 0 || s.isGlobal === false)) {
      const baseAngleDeg = 0;
      let effectiveAngleDeg = baseAngleDeg;
      if (s.isGlobal === false) {
        const elemAngle = getElemAngleAtNode(s.nodeId, model.nodes, model.elements);
        effectiveAngleDeg = elemAngle * 180 / Math.PI;
      }
      effectiveAngleDeg += (s.angle ?? 0);
      const angleRad = effectiveAngleDeg * Math.PI / 180;
      return [id, { id: s.id, nodeId: s.nodeId, type: 'spring' as any, kx: s.kx, ky: s.ky, kz: s.kz, dx: s.dx, dy: s.dy, drz: s.drz, angle: angleRad }];
    }
    return [id, { id: s.id, nodeId: s.nodeId, type: s.type, kx: s.kx, ky: s.ky, kz: s.kz, dx: s.dx, dy: s.dy, drz: s.drz }];
  }));
}

// ─── 2D: validateAndSolve2D ───────────────────────────────────────

/**
 * Full 2D solve with all pre-solve validations.
 * Returns AnalysisResults on success, an error string, or null.
 * Also returns the KinematicResult via the optional `onKinematic` callback.
 */
export function validateAndSolve2D(
  model: ModelData,
  includeSelfWeight = false,
  onKinematic?: (k: KinematicResult | null) => void,
): AnalysisResults | string | null {
  if (model.nodes.size < 2 || model.elements.size < 1) {
    return t('svc.needNodesAndElements');
  }
  if (model.supports.size < 1) {
    return t('svc.needSupport');
  }

  // Check for disconnected nodes (nodes not connected to any element)
  const connectedNodes = new Set<number>();
  for (const elem of model.elements.values()) {
    connectedNodes.add(elem.nodeI);
    connectedNodes.add(elem.nodeJ);
  }
  for (const nodeId of model.nodes.keys()) {
    if (!connectedNodes.has(nodeId)) {
      return t('svc.disconnectedNode').replace('{n}', String(nodeId));
    }
  }

  // Check for zero-length elements (detect 3D elements projected onto 2D)
  for (const elem of model.elements.values()) {
    const ni = model.nodes.get(elem.nodeI);
    const nj = model.nodes.get(elem.nodeJ);
    if (ni && nj) {
      const L2d = Math.sqrt((nj.x - ni.x) ** 2 + (nj.y - ni.y) ** 2);
      if (L2d < 1e-6) {
        const dz = Math.abs((nj.z ?? 0) - (ni.z ?? 0));
        if (dz > 1e-6) {
          return t('svc.zeroLength2dButZ').replace('{n}', String(elem.id)).replace('{dz}', dz.toFixed(3));
        }
        return t('svc.zeroLengthElement').replace('{n}', String(elem.id)).replace('{ni}', String(elem.nodeI)).replace('{nj}', String(elem.nodeJ));
      }
    }
  }

  // Detect 3D model features that are incompatible with the 2D solver
  {
    const types3D = new Set(['fixed3d', 'pinned3d', 'spring3d', 'rollerXZ', 'rollerXY', 'rollerYZ']);
    const sup3D = [...model.supports.values()].find(s => types3D.has(s.type));
    if (sup3D) {
      return t('svc.model3dSupport').replace('{n}', sup3D.type);
    }
    const hasZCoords = [...model.nodes.values()].some(n => n.z !== undefined && Math.abs(n.z) > 1e-10);
    if (hasZCoords) {
      return t('svc.model3dZCoords');
    }
  }

  // Count support DOFs for basic stability check
  const hasFrames = [...model.elements.values()].some(e => e.type === 'frame');
  let constrainedDOFs = 0;
  for (const sup of model.supports.values()) {
    if (sup.type === 'fixed') constrainedDOFs += hasFrames ? 3 : 2;
    else if (sup.type === 'pinned') constrainedDOFs += 2;
    else if (sup.type === 'spring') {
      if (sup.kx && sup.kx > 0) constrainedDOFs++;
      if (sup.ky && sup.ky > 0) constrainedDOFs++;
      if (hasFrames && sup.kz && sup.kz > 0) constrainedDOFs++;
    } else constrainedDOFs += 1; // roller
  }
  if (constrainedDOFs < 3) {
    return t('svc.hypostaticDofs').replace('{n}', String(constrainedDOFs));
  }

  // ── External stability: reaction equilibrium matrix rank check ──
  {
    const supNodes: Array<{ x: number; y: number; type: string; kx?: number; ky?: number; kz?: number }> = [];
    for (const sup of model.supports.values()) {
      const nd = model.nodes.get(sup.nodeId);
      if (nd) supNodes.push({ x: nd.x, y: nd.y, type: sup.type, kx: sup.kx, ky: sup.ky, kz: sup.kz });
    }

    let cx = 0, cy = 0;
    for (const s of supNodes) { cx += s.x; cy += s.y; }
    cx /= supNodes.length; cy /= supNodes.length;

    const cols: Array<[number, number, number]> = [];
    for (const s of supNodes) {
      const rx = s.x - cx, ry = s.y - cy;
      switch (s.type) {
        case 'fixed':
          cols.push([1, 0, -ry]);
          cols.push([0, 1, rx]);
          if (hasFrames) cols.push([0, 0, 1]);
          break;
        case 'pinned':
          cols.push([1, 0, -ry]);
          cols.push([0, 1, rx]);
          break;
        case 'rollerX':
          cols.push([0, 1, rx]);
          break;
        case 'rollerY':
          cols.push([1, 0, -ry]);
          break;
        case 'spring':
          if (s.kx && s.kx > 0) cols.push([1, 0, -ry]);
          if (s.ky && s.ky > 0) cols.push([0, 1, rx]);
          if (hasFrames && s.kz && s.kz > 0) cols.push([0, 0, 1]);
          break;
      }
    }

    if (cols.length >= 3) {
      const G = [[0,0,0],[0,0,0],[0,0,0]];
      for (const c of cols) {
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++)
            G[i][j] += c[i] * c[j];
      }
      const det = G[0][0] * (G[1][1]*G[2][2] - G[1][2]*G[2][1])
                - G[0][1] * (G[1][0]*G[2][2] - G[1][2]*G[2][0])
                + G[0][2] * (G[1][0]*G[2][1] - G[1][1]*G[2][0]);

      const tr = G[0][0] + G[1][1] + G[2][2];
      const relDet = tr > 1e-20 ? Math.abs(det) / (tr * tr * tr) : 0;

      if (relDet < 1e-10) {
        const hasRx = cols.some(c => Math.abs(c[0]) > 1e-12);
        const hasRy = cols.some(c => Math.abs(c[1]) > 1e-12);
        const hasMoment = cols.some(c => Math.abs(c[2]) > 1e-12);

        if (!hasRx) return t('svc.hypostaticNoHoriz');
        if (!hasRy) return t('svc.hypostaticNoVert');
        if (!hasMoment) return t('svc.hypostaticNoMoment');
        return t('svc.hypostaticUnstable');
      }
    }
  }

  // ── Graph connectivity: structure must be a single connected component ──
  {
    const adj = new Map<number, Set<number>>();
    for (const nid of connectedNodes) {
      adj.set(nid, new Set());
    }
    for (const elem of model.elements.values()) {
      adj.get(elem.nodeI)!.add(elem.nodeJ);
      adj.get(elem.nodeJ)!.add(elem.nodeI);
    }
    const visited = new Set<number>();
    const startNode = connectedNodes.values().next().value!;
    const queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur)!) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    if (visited.size < connectedNodes.size) {
      const disconnected = [...connectedNodes].filter(n => !visited.has(n));
      return t('svc.disconnectedGraph').replace('{ids}', disconnected.join(', '));
    }
  }

  // ── Collinear supports ──
  {
    const supNodes: { x: number; y: number }[] = [];
    for (const sup of model.supports.values()) {
      const nd = model.nodes.get(sup.nodeId);
      if (nd) supNodes.push(nd);
    }
    if (supNodes.length >= 2) {
      const allCollinear = supNodes.length < 3 ? false : (() => {
        const x0 = supNodes[0].x, y0 = supNodes[0].y;
        const dx = supNodes[1].x - x0, dy = supNodes[1].y - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) return false;
        return supNodes.slice(2).every(p => {
          const cross = Math.abs(dx * (p.y - y0) - dy * (p.x - x0));
          return cross / len < 1e-6;
        });
      })();

      const isRollerType = (t: string) => t === 'rollerX' || t === 'rollerY';
      const onlyRollersX = [...model.supports.values()].every(s => s.type === 'rollerX');
      const onlyRollersY = [...model.supports.values()].every(s => s.type === 'rollerY');

      if (onlyRollersX) {
        return t('svc.unstableAllRollersX');
      }
      if (onlyRollersY) {
        return t('svc.unstableAllRollersY');
      }

      if (allCollinear) {
        const types = [...model.supports.values()].map(s => s.type);
        const allRollers = types.every(t => isRollerType(t));
        if (allRollers) {
          return t('svc.unstableCollinearRollers');
        }
      }
    }
  }

  // ── Hinge mechanism: collinear elements all hinged at a node ──
  {
    const nodeHingeCount = new Map<number, number>();
    const nodeElemCount = new Map<number, number>();
    const nodeDoubleHingedOrTruss = new Map<number, number>();
    for (const elem of model.elements.values()) {
      nodeElemCount.set(elem.nodeI, (nodeElemCount.get(elem.nodeI) ?? 0) + 1);
      nodeElemCount.set(elem.nodeJ, (nodeElemCount.get(elem.nodeJ) ?? 0) + 1);
      if (elem.hingeStart) {
        nodeHingeCount.set(elem.nodeI, (nodeHingeCount.get(elem.nodeI) ?? 0) + 1);
      }
      if (elem.hingeEnd) {
        nodeHingeCount.set(elem.nodeJ, (nodeHingeCount.get(elem.nodeJ) ?? 0) + 1);
      }
      const isDoubleHinged = elem.hingeStart && elem.hingeEnd;
      const isTruss = elem.type === 'truss';
      if (isDoubleHinged || isTruss) {
        nodeDoubleHingedOrTruss.set(elem.nodeI, (nodeDoubleHingedOrTruss.get(elem.nodeI) ?? 0) + 1);
        nodeDoubleHingedOrTruss.set(elem.nodeJ, (nodeDoubleHingedOrTruss.get(elem.nodeJ) ?? 0) + 1);
      }
    }
    const supportedNodes = new Set([...model.supports.values()].map(s => s.nodeId));
    for (const [nodeId, hinges] of nodeHingeCount) {
      const elems = nodeElemCount.get(nodeId) ?? 0;
      if (hinges >= elems && elems >= 2 && !supportedNodes.has(nodeId)) {
        const dblOrTruss = nodeDoubleHingedOrTruss.get(nodeId) ?? 0;
        if (dblOrTruss === 0) continue;

        const node = model.nodes.get(nodeId);
        if (!node) continue;
        const angles: number[] = [];
        for (const el of model.elements.values()) {
          if (el.nodeI === nodeId || el.nodeJ === nodeId) {
            const other = el.nodeI === nodeId ? model.nodes.get(el.nodeJ) : model.nodes.get(el.nodeI);
            if (other) angles.push(Math.atan2(other.y - node.y, other.x - node.x));
          }
        }
        let allCollinearHere = true;
        if (angles.length >= 2) {
          const ref = angles[0];
          for (let k = 1; k < angles.length; k++) {
            let diff = Math.abs(angles[k] - ref) % Math.PI;
            if (diff > Math.PI / 2) diff = Math.PI - diff;
            if (diff > 0.1) { allCollinearHere = false; break; }
          }
        }
        if (allCollinearHere) {
          return t('svc.mechCollinearHinge').replace('{n}', String(nodeId)).replace('{elems}', String(elems));
        }
      }
    }
  }

  // ── Double-hinged elements creating lateral mechanism ──
  {
    const nodeFrameCount2 = new Map<number, number>();
    const nodeDoubleHingedCount = new Map<number, number>();
    const nodeHingeCount2 = new Map<number, number>();
    for (const elem of model.elements.values()) {
      if (elem.type !== 'frame') continue;
      nodeFrameCount2.set(elem.nodeI, (nodeFrameCount2.get(elem.nodeI) ?? 0) + 1);
      nodeFrameCount2.set(elem.nodeJ, (nodeFrameCount2.get(elem.nodeJ) ?? 0) + 1);
      if (elem.hingeStart && elem.hingeEnd) {
        nodeDoubleHingedCount.set(elem.nodeI, (nodeDoubleHingedCount.get(elem.nodeI) ?? 0) + 1);
        nodeDoubleHingedCount.set(elem.nodeJ, (nodeDoubleHingedCount.get(elem.nodeJ) ?? 0) + 1);
      }
      if (elem.hingeStart) nodeHingeCount2.set(elem.nodeI, (nodeHingeCount2.get(elem.nodeI) ?? 0) + 1);
      if (elem.hingeEnd) nodeHingeCount2.set(elem.nodeJ, (nodeHingeCount2.get(elem.nodeJ) ?? 0) + 1);
    }
    const supportMap2 = new Map([...model.supports.values()].map(s => [s.nodeId, s.type]));
    for (const [nodeId, frames] of nodeFrameCount2) {
      const dblCount = nodeDoubleHingedCount.get(nodeId) ?? 0;
      const hinges = nodeHingeCount2.get(nodeId) ?? 0;
      const supType = supportMap2.get(nodeId);
      const hasRotSupport = supType === 'fixed' || supType === 'spring';
      if (dblCount >= frames && frames >= 2 && !supType) {
        return t('svc.mechDoubleHinged').replace('{n}', String(nodeId)).replace('{elems}', String(frames));
      }
      if (hinges >= frames && frames >= 2 && dblCount > 0 && !hasRotSupport) {
        return t('svc.mechInsufficientStiffness').replace('{n}', String(nodeId)).replace('{elems}', String(frames)).replace('{dbl}', String(dblCount));
      }
    }
  }

  // Check that loads reference valid entities
  for (const l of model.loads) {
    if (l.type === 'nodal') {
      if (!model.nodes.has(l.data.nodeId)) {
        return t('svc.loadRefNodeMissing').replace('{n}', String(l.data.nodeId));
      }
    } else if (l.type === 'distributed') {
      if (!model.elements.has((l.data as DistributedLoad).elementId)) {
        return t('svc.loadRefDistMissing').replace('{n}', String((l.data as DistributedLoad).elementId));
      }
    } else if (l.type === 'pointOnElement') {
      if (!model.elements.has((l.data as PointLoadOnElement).elementId)) {
        return t('svc.loadRefPointMissing').replace('{n}', String((l.data as PointLoadOnElement).elementId));
      }
    } else if (l.type === 'thermal') {
      if (!model.elements.has((l.data as ThermalLoad).elementId)) {
        return t('svc.loadRefThermalMissing').replace('{n}', String((l.data as ThermalLoad).elementId));
      }
    }
  }

  // Build solver loads array
  const solverLoads = model.loads.map(l => {
    if (l.type === 'nodal') {
      return { type: 'nodal' as const, data: { nodeId: l.data.nodeId, fx: l.data.fx, fy: l.data.fy, mz: l.data.mz } };
    } else if (l.type === 'distributed') {
      const d = l.data as DistributedLoad;
      const sd: { elementId: number; qI: number; qJ: number; a?: number; b?: number } = { elementId: d.elementId, qI: d.qI, qJ: d.qJ };
      if (d.a !== undefined && d.a > 0) sd.a = d.a;
      if (d.b !== undefined) sd.b = d.b;
      return { type: 'distributed' as const, data: sd };
    } else if (l.type === 'thermal') {
      const d = l.data as ThermalLoad;
      return { type: 'thermal' as const, data: { elementId: d.elementId, dtUniform: d.dtUniform, dtGradient: d.dtGradient } };
    } else {
      const d = l.data as PointLoadOnElement;
      const spd: { elementId: number; a: number; p: number; px?: number; mz?: number } = { elementId: d.elementId, a: d.a, p: d.p };
      if (d.px !== undefined && d.px !== 0) spd.px = d.px;
      if (d.mz !== undefined && d.mz !== 0) spd.mz = d.mz;
      return { type: 'pointOnElement' as const, data: spd };
    }
  });

  // Add self-weight as distributed loads
  if (includeSelfWeight) {
    for (const elem of model.elements.values()) {
      const mat = model.materials.get(elem.materialId);
      const sec = model.sections.get(elem.sectionId);
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!mat || !sec || !ni || !nj) continue;

      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-10) continue;

      const sinTheta = dy / L;
      const cosTheta = dx / L;
      const w = mat.rho * sec.a;

      const qPerp = -w * cosTheta;
      if (Math.abs(qPerp) > 1e-10) {
        solverLoads.push({
          type: 'distributed' as const,
          data: { elementId: elem.id, qI: qPerp, qJ: qPerp },
        });
      }

      const qTangent = -w * sinTheta;
      if (Math.abs(qTangent) > 1e-10) {
        const Ft = qTangent * L / 2;
        const fxNode = Ft * cosTheta;
        const fyNode = Ft * sinTheta;
        solverLoads.push(
          { type: 'nodal' as const, data: { nodeId: elem.nodeI, fx: fxNode, fy: fyNode, mz: 0 } },
          { type: 'nodal' as const, data: { nodeId: elem.nodeJ, fx: fxNode, fy: fyNode, mz: 0 } },
        );
      }
    }
  }

  // Build solver input
  const input: SolverInput = {
    nodes: new Map(Array.from(model.nodes.entries()).map(([id, n]) => [id, { id: n.id, x: n.x, y: n.y }])),
    materials: new Map(Array.from(model.materials.entries()).map(([id, m]) => [id, { id: m.id, e: m.e, nu: m.nu }])),
    // 2D solver uses the effective bending inertia (accounts for section rotation via Mohr)
    sections: new Map(Array.from(model.sections.entries()).map(([id, s]) => [id, { id: s.id, a: s.a, iz: effectiveBendingInertia(s) }])),
    elements: new Map(Array.from(model.elements.entries()).map(([id, e]) => [id, {
      id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
      materialId: e.materialId, sectionId: e.sectionId,
      hingeStart: e.hingeStart ?? false, hingeEnd: e.hingeEnd ?? false,
    }])),
    supports: buildSolverSupports2D(model),
    loads: solverLoads,
  };

  // Kinematic analysis
  try {
    const kinematic = analyzeKinematics(input);
    if (onKinematic) onKinematic(kinematic);
    if (!kinematic.isSolvable) {
      return kinematic.diagnosis;
    }
  } catch {
    if (onKinematic) onKinematic(null);
  }

  try {
    const t0 = performance.now();
    const results = solveStructure(input);
    const dt = performance.now() - t0;
    console.log(`Estructura resuelta en ${dt.toFixed(1)} ms — ${model.nodes.size} nodos, ${model.elements.size} elementos`);
    return results;
  } catch (err: any) {
    console.error('Solver error:', err);
    return t('svc.solverError').replace('{n}', err.message);
  }
}

// ─── 2D: buildSolverInput2D ──────────────────────────────────────

/** Build a SolverInput from model data (no validation). Returns null if model is empty. */
export function buildSolverInput2D(model: ModelData, includeSelfWeight = false): SolverInput | null {
  if (model.nodes.size < 2 || model.elements.size < 1 || model.supports.size < 1) return null;

  const solverLoads: SolverInput['loads'] = [];

  for (const l of model.loads) {
    if (l.type === 'nodal') {
      solverLoads.push({ type: 'nodal' as const, data: { nodeId: l.data.nodeId, fx: l.data.fx, fy: l.data.fy, mz: l.data.mz } });
    } else if (l.type === 'thermal') {
      const d = l.data as ThermalLoad;
      solverLoads.push({ type: 'thermal' as const, data: { elementId: d.elementId, dtUniform: d.dtUniform, dtGradient: d.dtGradient } });
    } else if (l.type === 'pointOnElement') {
      const d = l.data as PointLoadOnElement;
      const angle = d.angle ?? 0;
      const isGlobal = d.isGlobal ?? false;

      if (angle === 0 && !isGlobal) {
        solverLoads.push({ type: 'pointOnElement' as const, data: { elementId: d.elementId, a: d.a, p: d.p, px: d.px, mz: d.mz } });
      } else {
        const elem = model.elements.get(d.elementId);
        if (!elem) continue;
        const ni = model.nodes.get(elem.nodeI);
        const nj = model.nodes.get(elem.nodeJ);
        if (!ni || !nj) continue;
        const edx = nj.x - ni.x, edy = nj.y - ni.y;
        const L = Math.sqrt(edx * edx + edy * edy);
        if (L < 1e-10) continue;
        const cosTheta = edx / L, sinTheta = edy / L;
        const angleRad = angle * Math.PI / 180;

        let fxGlobal: number, fyGlobal: number;
        if (isGlobal) {
          fxGlobal = d.p * Math.sin(angleRad);
          fyGlobal = d.p * Math.cos(angleRad);
        } else {
          const fLocalPerp = d.p * Math.cos(angleRad);
          const fLocalAxial = d.p * Math.sin(angleRad);
          fxGlobal = fLocalAxial * cosTheta + fLocalPerp * (-sinTheta);
          fyGlobal = fLocalAxial * sinTheta + fLocalPerp * cosTheta;
        }

        const pPerp = fxGlobal * (-sinTheta) + fyGlobal * cosTheta;
        const pAxial = fxGlobal * cosTheta + fyGlobal * sinTheta;

        if (Math.abs(pPerp) > 1e-10) {
          solverLoads.push({ type: 'pointOnElement' as const, data: { elementId: d.elementId, a: d.a, p: pPerp } });
        }
        if (Math.abs(pAxial) > 1e-10) {
          const t = d.a / L;
          const fI = pAxial * (1 - t);
          const fJ = pAxial * t;
          solverLoads.push(
            { type: 'nodal' as const, data: { nodeId: elem.nodeI, fx: fI * cosTheta, fy: fI * sinTheta, mz: 0 } },
            { type: 'nodal' as const, data: { nodeId: elem.nodeJ, fx: fJ * cosTheta, fy: fJ * sinTheta, mz: 0 } },
          );
        }
      }
    } else if (l.type === 'distributed') {
      const d = l.data as DistributedLoad;
      const angle = d.angle ?? 0;
      const isGlobal = d.isGlobal ?? false;

      if (angle === 0 && !isGlobal) {
        solverLoads.push({ type: 'distributed' as const, data: { elementId: d.elementId, qI: d.qI, qJ: d.qJ, a: d.a, b: d.b } });
      } else {
        const elem = model.elements.get(d.elementId);
        if (!elem) continue;
        const ni = model.nodes.get(elem.nodeI);
        const nj = model.nodes.get(elem.nodeJ);
        if (!ni || !nj) continue;
        const edx = nj.x - ni.x, edy = nj.y - ni.y;
        const L = Math.sqrt(edx * edx + edy * edy);
        if (L < 1e-10) continue;
        const cosTheta = edx / L, sinTheta = edy / L;
        const angleRad = angle * Math.PI / 180;

        let qIPerpLocal: number, qIAxialLocal: number;
        let qJPerpLocal: number, qJAxialLocal: number;

        if (isGlobal) {
          const fxFactorI = d.qI * Math.sin(angleRad);
          const fyFactorI = d.qI * Math.cos(angleRad);
          const fxFactorJ = d.qJ * Math.sin(angleRad);
          const fyFactorJ = d.qJ * Math.cos(angleRad);
          qIPerpLocal = fxFactorI * (-sinTheta) + fyFactorI * cosTheta;
          qIAxialLocal = fxFactorI * cosTheta + fyFactorI * sinTheta;
          qJPerpLocal = fxFactorJ * (-sinTheta) + fyFactorJ * cosTheta;
          qJAxialLocal = fxFactorJ * cosTheta + fyFactorJ * sinTheta;
        } else {
          qIPerpLocal = d.qI * Math.cos(angleRad);
          qIAxialLocal = d.qI * Math.sin(angleRad);
          qJPerpLocal = d.qJ * Math.cos(angleRad);
          qJAxialLocal = d.qJ * Math.sin(angleRad);
        }

        if (Math.abs(qIPerpLocal) > 1e-10 || Math.abs(qJPerpLocal) > 1e-10) {
          solverLoads.push({ type: 'distributed' as const, data: { elementId: d.elementId, qI: qIPerpLocal, qJ: qJPerpLocal, a: d.a, b: d.b } });
        }
        if (Math.abs(qIAxialLocal) > 1e-10 || Math.abs(qJAxialLocal) > 1e-10) {
          const loadA = d.a ?? 0;
          const loadB = d.b ?? L;
          const loadSpan = loadB - loadA;
          const totalAxial = (qIAxialLocal + qJAxialLocal) * loadSpan / 2;
          const sumQ = Math.abs(qIAxialLocal) + Math.abs(qJAxialLocal);
          const centroidFromA = sumQ > 1e-10 ? loadSpan * (Math.abs(qIAxialLocal) + 2 * Math.abs(qJAxialLocal)) / (3 * sumQ) : loadSpan / 2;
          const centroidFromNodeI = loadA + centroidFromA;
          const tC = centroidFromNodeI / L;
          const fI = totalAxial * (1 - tC);
          const fJ = totalAxial * tC;
          solverLoads.push(
            { type: 'nodal' as const, data: { nodeId: elem.nodeI, fx: fI * cosTheta, fy: fI * sinTheta, mz: 0 } },
            { type: 'nodal' as const, data: { nodeId: elem.nodeJ, fx: fJ * cosTheta, fy: fJ * sinTheta, mz: 0 } },
          );
        }
      }
    }
  }

  if (includeSelfWeight) {
    for (const elem of model.elements.values()) {
      const mat = model.materials.get(elem.materialId);
      const sec = model.sections.get(elem.sectionId);
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!mat || !sec || !ni || !nj) continue;
      const dx = nj.x - ni.x, dy = nj.y - ni.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-10) continue;
      const sinTheta = dy / L, cosTheta = dx / L;
      const w = mat.rho * sec.a;
      const qPerp = -w * cosTheta;
      if (Math.abs(qPerp) > 1e-10) {
        solverLoads.push({ type: 'distributed' as const, data: { elementId: elem.id, qI: qPerp, qJ: qPerp } });
      }
      const qTangent = -w * sinTheta;
      if (Math.abs(qTangent) > 1e-10) {
        const Ft = qTangent * L / 2;
        const fxNode = Ft * cosTheta, fyNode = Ft * sinTheta;
        solverLoads.push(
          { type: 'nodal' as const, data: { nodeId: elem.nodeI, fx: fxNode, fy: fyNode, mz: 0 } },
          { type: 'nodal' as const, data: { nodeId: elem.nodeJ, fx: fxNode, fy: fyNode, mz: 0 } },
        );
      }
    }
  }

  return {
    nodes: new Map(Array.from(model.nodes.entries()).map(([id, n]) => [id, { id: n.id, x: n.x, y: n.y }])),
    materials: new Map(Array.from(model.materials.entries()).map(([id, m]) => [id, { id: m.id, e: m.e, nu: m.nu }])),
    // 2D solver uses the effective bending inertia (accounts for section rotation via Mohr)
    sections: new Map(Array.from(model.sections.entries()).map(([id, s]) => [id, { id: s.id, a: s.a, iz: effectiveBendingInertia(s) }])),
    elements: new Map(Array.from(model.elements.entries()).map(([id, e]) => [id, {
      id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
      materialId: e.materialId, sectionId: e.sectionId,
      hingeStart: e.hingeStart ?? false, hingeEnd: e.hingeEnd ?? false,
    }])),
    supports: buildSolverSupports2D(model),
    loads: solverLoads,
  };
}

// ─── 2D: solveCombinations2D ─────────────────────────────────────

export function solveCombinations2D(
  model: ModelData,
  loadCases: LoadCase[],
  combinations: LoadCombination[],
  includeSelfWeight = false,
): { perCase: Map<number, AnalysisResults>; perCombo: Map<number, AnalysisResults>; envelope: FullEnvelope } | string | null {
  if (model.nodes.size < 2 || model.elements.size < 1) return t('svc.needNodesAndElements');
  if (model.supports.size < 1) return t('svc.needSupport');
  if (combinations.length === 0) return t('svc.needCombination');

  const perCase = new Map<number, AnalysisResults>();

  for (const lc of loadCases) {
    // Filter loads for this case instead of mutating model.loads
    const caseModel: ModelData = { ...model, loads: model.loads.filter(l => (l.data.caseId ?? 1) === lc.id) };
    const result = validateAndSolve2D(caseModel, includeSelfWeight && lc.type === 'D');
    if (typeof result === 'string') {
      return t('svc.errorInCase').replace('{n}', lc.name).replace('{err}', result);
    }
    if (result) perCase.set(lc.id, result);
  }

  if (perCase.size === 0) return t('svc.noLoadsApplied');

  const perCombo = new Map<number, AnalysisResults>();

  for (const combo of combinations) {
    const combined = combineResults(combo.factors, perCase);
    if (combined) perCombo.set(combo.id, combined);
  }

  const allComboResults = Array.from(perCombo.values());
  const envelope = computeEnvelope(allComboResults);

  if (!envelope) return t('svc.envelopeError');
  return { perCase, perCombo, envelope };
}

// ─── 3D: buildSolverInput3D ──────────────────────────────────────

/** Build a SolverInput3D from model data. Returns null if model is empty. */
export function buildSolverInput3D(model: ModelData, includeSelfWeight = false, leftHand = false): SolverInput3D | null {
  if (model.nodes.size < 2 || model.elements.size < 1 || model.supports.size < 1) return null;

  const solverLoads: SolverLoad3D[] = [];

  for (const l of model.loads) {
    if (l.type === 'nodal') {
      solverLoads.push({
        type: 'nodal',
        data: { nodeId: l.data.nodeId, fx: l.data.fx, fy: l.data.fy, fz: 0, mx: 0, my: 0, mz: l.data.mz },
      });
    } else if (l.type === 'nodal3d') {
      const d = l.data as NodalLoad3D;
      solverLoads.push({
        type: 'nodal',
        data: { nodeId: d.nodeId, fx: d.fx, fy: d.fy, fz: d.fz, mx: d.mx, my: d.my, mz: d.mz },
      });
    } else if (l.type === 'distributed') {
      const d = l.data as DistributedLoad;
      const angle = d.angle ?? 0;
      const isGlobal = d.isGlobal ?? false;

      const elem = model.elements.get(d.elementId);
      if (!elem) continue;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) continue;
      const edx = nj.x - ni.x, edy = nj.y - ni.y;
      const L2d = Math.sqrt(edx * edx + edy * edy);
      if (L2d < 1e-10) continue;
      const cosTheta = edx / L2d, sinTheta = edy / L2d;
      const angleRad = angle * Math.PI / 180;

      const niSolver = { id: elem.nodeI, x: ni.x, y: ni.y, z: ni.z ?? 0 };
      const njSolver = { id: elem.nodeJ, x: nj.x, y: nj.y, z: nj.z ?? 0 };
      const elemLocalY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
        ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
      const secRot1 = model.sections.get(elem.sectionId)?.rotation ?? 0;
      const axes = computeLocalAxes3D(niSolver, njSolver, elemLocalY, (elem.rollAngle ?? 0) + secRot1, leftHand);

      const projectLoad = (q: number): { qY: number; qZ: number; qAxial: number } => {
        if (Math.abs(q) < 1e-15) return { qY: 0, qZ: 0, qAxial: 0 };
        let dirX: number, dirY: number, dirZ: number;
        if (isGlobal) {
          dirX = Math.sin(angleRad);
          dirY = Math.cos(angleRad);
          dirZ = 0;
        } else {
          const perpFactor = Math.cos(angleRad);
          const axialFactor = Math.sin(angleRad);
          dirX = perpFactor * (-sinTheta) + axialFactor * cosTheta;
          dirY = perpFactor * cosTheta + axialFactor * sinTheta;
          dirZ = 0;
        }
        const projY = dirX * axes.ey[0] + dirY * axes.ey[1] + dirZ * axes.ey[2];
        const projZ = dirX * axes.ez[0] + dirY * axes.ez[1] + dirZ * axes.ez[2];
        const projX = dirX * axes.ex[0] + dirY * axes.ex[1] + dirZ * axes.ex[2];
        return { qY: projY * q, qZ: projZ * q, qAxial: projX * q };
      };

      const projI = projectLoad(d.qI);
      const projJ = projectLoad(d.qJ);

      if (Math.abs(projI.qY) > 1e-10 || Math.abs(projJ.qY) > 1e-10 ||
          Math.abs(projI.qZ) > 1e-10 || Math.abs(projJ.qZ) > 1e-10) {
        solverLoads.push({
          type: 'distributed',
          data: { elementId: d.elementId, qYI: projI.qY, qYJ: projJ.qY, qZI: projI.qZ, qZJ: projJ.qZ, a: d.a, b: d.b },
        });
      }

      if (Math.abs(projI.qAxial) > 1e-10 || Math.abs(projJ.qAxial) > 1e-10) {
        const dz3d = (nj.z ?? 0) - (ni.z ?? 0);
        const L3d = Math.sqrt(edx * edx + edy * edy + dz3d * dz3d);
        const loadA = d.a ?? 0;
        const loadB = d.b ?? L3d;
        const loadSpan = loadB - loadA;
        const totalAxial = (projI.qAxial + projJ.qAxial) * loadSpan / 2;
        const sumQ = Math.abs(projI.qAxial) + Math.abs(projJ.qAxial);
        const centroidFromA = sumQ > 1e-10 ? loadSpan * (Math.abs(projI.qAxial) + 2 * Math.abs(projJ.qAxial)) / (3 * sumQ) : loadSpan / 2;
        const centroidFromNodeI = loadA + centroidFromA;
        const tC = centroidFromNodeI / L3d;
        const fI = totalAxial * (1 - tC);
        const fJ = totalAxial * tC;
        solverLoads.push(
          { type: 'nodal', data: { nodeId: elem.nodeI, fx: fI * axes.ex[0], fy: fI * axes.ex[1], fz: fI * axes.ex[2], mx: 0, my: 0, mz: 0 } },
          { type: 'nodal', data: { nodeId: elem.nodeJ, fx: fJ * axes.ex[0], fy: fJ * axes.ex[1], fz: fJ * axes.ex[2], mx: 0, my: 0, mz: 0 } },
        );
      }
    } else if (l.type === 'distributed3d') {
      const d = l.data as DistributedLoad3D;
      solverLoads.push({
        type: 'distributed',
        data: { elementId: d.elementId, qYI: d.qYI, qYJ: d.qYJ, qZI: d.qZI, qZJ: d.qZJ, a: d.a, b: d.b },
      });
    } else if (l.type === 'pointOnElement') {
      const d = l.data as PointLoadOnElement;
      const angle = d.angle ?? 0;
      const isGlobal = d.isGlobal ?? false;

      const elem = model.elements.get(d.elementId);
      if (!elem) continue;
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!ni || !nj) continue;
      const edx = nj.x - ni.x, edy = nj.y - ni.y;
      const L2d = Math.sqrt(edx * edx + edy * edy);
      if (L2d < 1e-10) continue;
      const cosTheta = edx / L2d, sinTheta = edy / L2d;
      const angleRad = angle * Math.PI / 180;

      const niSolver = { id: elem.nodeI, x: ni.x, y: ni.y, z: ni.z ?? 0 };
      const njSolver = { id: elem.nodeJ, x: nj.x, y: nj.y, z: nj.z ?? 0 };
      const elemLocalY2 = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
        ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
      const secRot2 = model.sections.get(elem.sectionId)?.rotation ?? 0;
      const axes = computeLocalAxes3D(niSolver, njSolver, elemLocalY2, (elem.rollAngle ?? 0) + secRot2, leftHand);

      let dirX: number, dirY: number, dirZ: number;
      if (isGlobal) {
        dirX = Math.sin(angleRad);
        dirY = Math.cos(angleRad);
        dirZ = 0;
      } else {
        const perpFactor = Math.cos(angleRad);
        const axialFactor = Math.sin(angleRad);
        dirX = perpFactor * (-sinTheta) + axialFactor * cosTheta;
        dirY = perpFactor * cosTheta + axialFactor * sinTheta;
        dirZ = 0;
      }

      const projY = (dirX * axes.ey[0] + dirY * axes.ey[1] + dirZ * axes.ey[2]) * d.p;
      const projZ = (dirX * axes.ez[0] + dirY * axes.ez[1] + dirZ * axes.ez[2]) * d.p;
      const projAxial = (dirX * axes.ex[0] + dirY * axes.ex[1] + dirZ * axes.ex[2]) * d.p;

      if (Math.abs(projY) > 1e-10 || Math.abs(projZ) > 1e-10) {
        solverLoads.push({
          type: 'pointOnElement',
          data: { elementId: d.elementId, a: d.a, py: projY, pz: projZ },
        });
      }

      if (Math.abs(projAxial) > 1e-10) {
        const dz3d = (nj.z ?? 0) - (ni.z ?? 0);
        const L3d = Math.sqrt(edx * edx + edy * edy + dz3d * dz3d);
        const t = d.a / L3d;
        const fI = projAxial * (1 - t);
        const fJ = projAxial * t;
        solverLoads.push(
          { type: 'nodal', data: { nodeId: elem.nodeI, fx: fI * axes.ex[0], fy: fI * axes.ex[1], fz: fI * axes.ex[2], mx: 0, my: 0, mz: 0 } },
          { type: 'nodal', data: { nodeId: elem.nodeJ, fx: fJ * axes.ex[0], fy: fJ * axes.ex[1], fz: fJ * axes.ex[2], mx: 0, my: 0, mz: 0 } },
        );
      }
    } else if (l.type === 'pointOnElement3d') {
      const d = l.data as PointLoadOnElement3D;
      solverLoads.push({
        type: 'pointOnElement',
        data: { elementId: d.elementId, a: d.a, py: d.py, pz: d.pz },
      });
    } else if (l.type === 'thermal') {
      const d = l.data as ThermalLoad;
      solverLoads.push({
        type: 'thermal' as const,
        data: {
          elementId: d.elementId,
          dtUniform: d.dtUniform,
          dtGradientY: 0,
          dtGradientZ: d.dtGradient,
        },
      });
    }
  }

  // Self-weight
  if (includeSelfWeight) {
    for (const elem of model.elements.values()) {
      const mat = model.materials.get(elem.materialId);
      const sec = model.sections.get(elem.sectionId);
      const ni = model.nodes.get(elem.nodeI);
      const nj = model.nodes.get(elem.nodeJ);
      if (!mat || !sec || !ni || !nj) continue;
      const dx = nj.x - ni.x;
      const dy = nj.y - (ni.y);
      const dz = (nj.z ?? 0) - (ni.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-10) continue;

      const w = mat.rho * sec.a;
      const totalWeight = w * L;
      solverLoads.push({
        type: 'nodal',
        data: { nodeId: elem.nodeI, fx: 0, fy: -totalWeight / 2, fz: 0, mx: 0, my: 0, mz: 0 },
      });
      solverLoads.push({
        type: 'nodal',
        data: { nodeId: elem.nodeJ, fx: 0, fy: -totalWeight / 2, fz: 0, mx: 0, my: 0, mz: 0 },
      });
    }
  }

  // Convert support types to SolverSupport3D booleans
  const supportTo3D = (s: Support): { rx: boolean; ry: boolean; rz: boolean; rrx: boolean; rry: boolean; rrz: boolean } => {
    switch (s.type) {
      case 'fixed':
      case 'fixed3d':
        return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
      case 'pinned':
        return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: false };
      case 'pinned3d':
        return { rx: true, ry: true, rz: true, rrx: false, rry: false, rrz: false };
      case 'rollerX':
        return { rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: false };
      case 'rollerY':
        return { rx: true, ry: false, rz: true, rrx: true, rry: true, rrz: false };
      case 'rollerXZ':
        return { rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false };
      case 'rollerXY':
        return { rx: false, ry: false, rz: true, rrx: false, rry: false, rrz: false };
      case 'rollerYZ':
        return { rx: true, ry: false, rz: false, rrx: false, rry: false, rrz: false };
      case 'spring':
      case 'spring3d':
        return { rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false };
      case 'custom3d':
        return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
      default:
        return { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
    }
  };

  return {
    nodes: new Map(Array.from(model.nodes.entries()).map(([id, n]) => [id, { id: n.id, x: n.x, y: n.y, z: n.z ?? 0 }])),
    materials: new Map(Array.from(model.materials.entries()).map(([id, m]) => [id, { id: m.id, e: m.e, nu: m.nu }])),
    sections: new Map(Array.from(model.sections.entries()).map(([id, s]) => {
      // s.iy = about Y-axis (horizontal), s.iz = about Z-axis (vertical)
      // Solver convention: iy controls bending about Y (w, θy DOFs), iz controls bending about Z (v, θz DOFs)
      const aboutY = s.iy ?? (s.b && s.h ? (s.b * s.h ** 3) / 12 : s.iz);  // Iy: about Y horizontal
      const aboutZ = s.iz;  // Iz: about Z vertical
      return [id, {
        id: s.id, name: s.name, a: s.a,
        iy: aboutY,   // solver iy = Iy (about Y horizontal) → controls Z-displacement bending (w, θy)
        iz: aboutZ,   // solver iz = Iz (about Z vertical) → controls Y-displacement bending (v, θz)
        j: s.j ?? aboutY * 0.001,
      }];
    })),
    elements: new Map(Array.from(model.elements.entries()).map(([id, e]) => {
      const elem: any = {
        id: e.id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ,
        materialId: e.materialId, sectionId: e.sectionId,
        hingeStart: e.hingeStart ?? false, hingeEnd: e.hingeEnd ?? false,
      };
      if (e.localYx !== undefined) { elem.localYx = e.localYx; elem.localYy = e.localYy; elem.localYz = e.localYz; }
      // Compose element rollAngle with section rotation — computeLocalAxes3D rotates local Y/Z
      const sec = model.sections.get(e.sectionId);
      const secRot = sec?.rotation ?? 0;
      const effectiveRoll = (e.rollAngle ?? 0) + secRot;
      if (effectiveRoll !== 0) { elem.rollAngle = effectiveRoll; }
      return [id, elem];
    })),
    supports: new Map(Array.from(model.supports.entries()).map(([_id, s]) => {
      let dofs: { rx: boolean; ry: boolean; rz: boolean; rrx: boolean; rry: boolean; rrz: boolean };
      if (s.dofRestraints) {
        const r = s.dofRestraints;
        dofs = { rx: r.tx, ry: r.ty, rz: r.tz, rrx: r.rx, rry: r.ry, rrz: r.rz };
      } else {
        dofs = supportTo3D(s);
      }
      return [s.nodeId, {
        nodeId: s.nodeId,
        ...dofs,
        kx: s.kx, ky: s.ky,
        kz: (s.type === 'spring3d' || s.type === 'spring') ? undefined : undefined,
        krx: s.krx, kry: s.kry, krz: s.krz ?? s.kz,
        dx: s.dx, dy: s.dy, dz: s.dz,
        drx: s.drx, dry: s.dry, drz: s.drz,
        normalX: s.normalX, normalY: s.normalY, normalZ: s.normalZ,
        isInclined: s.isInclined,
      }];
    })),
    loads: solverLoads,
    leftHand,
  };
}

// ─── 3D: validateAndSolve3D ──────────────────────────────────────

/** Solve the current model using the 3D solver. Returns results or error string. */
export function validateAndSolve3D(model: ModelData, includeSelfWeight = false, leftHand = false): AnalysisResults3D | string | null {
  if (model.nodes.size < 2 || model.elements.size < 1) {
    return t('svc.needNodesAndElements');
  }
  if (model.supports.size < 1) {
    return t('svc.needSupport');
  }

  // Check for disconnected nodes
  const connectedNodes = new Set<number>();
  for (const elem of model.elements.values()) {
    connectedNodes.add(elem.nodeI);
    connectedNodes.add(elem.nodeJ);
  }
  for (const nodeId of model.nodes.keys()) {
    if (!connectedNodes.has(nodeId)) {
      return t('svc.disconnectedNode').replace('{n}', String(nodeId));
    }
  }

  // Check for zero-length elements
  for (const elem of model.elements.values()) {
    const ni = model.nodes.get(elem.nodeI);
    const nj = model.nodes.get(elem.nodeJ);
    if (ni && nj) {
      const dx = nj.x - ni.x, dy = nj.y - ni.y, dz = (nj.z ?? 0) - (ni.z ?? 0);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-6) {
        return t('svc.zeroLengthElement').replace('{n}', String(elem.id)).replace('{ni}', String(elem.nodeI)).replace('{nj}', String(elem.nodeJ));
      }
    }
  }

  // Check graph connectivity
  const adj = new Map<number, Set<number>>();
  for (const nid of connectedNodes) adj.set(nid, new Set());
  for (const elem of model.elements.values()) {
    adj.get(elem.nodeI)!.add(elem.nodeJ);
    adj.get(elem.nodeJ)!.add(elem.nodeI);
  }
  const visited = new Set<number>();
  const startNode = connectedNodes.values().next().value!;
  const queue = [startNode];
  visited.add(startNode);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur)!) {
      if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
    }
  }
  if (visited.size < connectedNodes.size) {
    const disconnected = [...connectedNodes].filter(n => !visited.has(n));
    return t('svc.disconnectedGraph').replace('{ids}', disconnected.join(', '));
  }

  const input = buildSolverInput3D(model, includeSelfWeight, leftHand);
  if (!input) return t('svc.emptyModel');

  try {
    const t0 = performance.now();
    const results = solve3DEngine(input);
    const dt = performance.now() - t0;
    if (typeof results === 'string') {
      console.warn(`Solver 3D (${dt.toFixed(1)} ms): ${results}`);
    } else {
      console.log(`Estructura 3D resuelta en ${dt.toFixed(1)} ms — ${model.nodes.size} nodos, ${model.elements.size} elementos`);
    }
    return results;
  } catch (err: any) {
    console.error('Solver 3D error:', err);
    return t('svc.solver3dError').replace('{n}', err.message);
  }
}

// ─── 3D: solveCombinations3D ─────────────────────────────────────

export function solveCombinations3D(
  model: ModelData,
  loadCases: LoadCase[],
  combinations: LoadCombination[],
  includeSelfWeight = false,
  leftHand = false,
): { perCase: Map<number, AnalysisResults3D>; perCombo: Map<number, AnalysisResults3D>; envelope: FullEnvelope3D } | string | null {
  if (model.nodes.size < 2 || model.elements.size < 1) return t('svc.needNodesAndElements');
  if (model.supports.size < 1) return t('svc.needSupport');
  if (combinations.length === 0) return t('svc.needCombination');

  const perCase = new Map<number, AnalysisResults3D>();

  for (const lc of loadCases) {
    // Filter loads for this case instead of mutating model.loads
    const caseModel: ModelData = { ...model, loads: model.loads.filter(l => (l.data.caseId ?? 1) === lc.id) };
    const result = validateAndSolve3D(caseModel, includeSelfWeight && lc.type === 'D', leftHand);
    if (typeof result === 'string') {
      return t('svc.errorInCase3d').replace('{n}', lc.name).replace('{err}', result);
    }
    if (result) perCase.set(lc.id, result);
  }

  if (perCase.size === 0) return t('svc.noLoadsApplied');

  const perCombo = new Map<number, AnalysisResults3D>();
  for (const combo of combinations) {
    const combined = combineResults3D(combo.factors, perCase);
    if (combined) perCombo.set(combo.id, combined);
  }

  const allComboResults = Array.from(perCombo.values());
  const envelope = computeEnvelope3D(allComboResults);

  if (!envelope) return t('svc.envelopeError3d');
  return { perCase, perCombo, envelope };
}
