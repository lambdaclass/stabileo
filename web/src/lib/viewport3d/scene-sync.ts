// Scene synchronization for Viewport3D — model entities
// Extracted from Viewport3D.svelte to reduce file size and improve modularity.
//
// These functions reconcile the Three.js scene graph with the model store:
//   - syncNodes(), syncElements(), syncSupports(), syncLoads(), syncSelection()

import * as THREE from 'three';
import { modelStore, uiStore, resultsStore } from '../store';
import { createNodeMesh, updateNodePosition } from '../three/create-node-mesh';
import { createElementGroup } from '../three/create-element-mesh';
import { createSupportGizmo } from '../three/create-support-gizmo';
import type { SupportGizmoType } from '../three/create-support-gizmo';
import { createNodalLoadArrow, createDistributedLoadGroup } from '../three/create-load-arrow';
import { COLORS, setMeshColor, setGroupColor, disposeObject } from '../three/selection-helpers';
import { createPlateMesh, createQuadMesh } from '../three/create-shell-mesh';
import { computeLocalAxes3D } from '../engine/solver-3d';

/**
 * Mutable context holding Three.js scene graph references.
 * Created once in Viewport3D.svelte, passed to all sync functions.
 */
export interface SceneSyncContext {
  // Initialized flag — sync functions no-op if false
  initialized: boolean;

  // Parent groups (scoped for raycasting)
  nodesParent: THREE.Group;
  elementsParent: THREE.Group;
  supportsParent: THREE.Group;
  loadsParent: THREE.Group;
  resultsParent: THREE.Group;
  shellsParent: THREE.Group;
  scene: THREE.Scene;

  // Reconciliation maps (mutated in place)
  nodeMeshes: Map<number, THREE.Mesh>;
  elementGroups: Map<number, THREE.Group>;
  supportGizmos: Map<number, THREE.Group>;
  shellGroups: Map<string, THREE.Group>; // key: "p{id}" or "q{id}"

  // Single-instance groups (replaced on each sync)
  loadGroup: THREE.Group | null;

  // Results state (mutable flags shared with results-sync)
  colorMapApplied: boolean;
}

// ─── Nodes ────────────────────────────────────────────────────

export function syncNodes(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const storeNodes = modelStore.nodes;

  // Remove nodes no longer in store
  for (const [id, mesh] of ctx.nodeMeshes) {
    if (!storeNodes.has(id)) {
      ctx.nodesParent.remove(mesh);
      disposeObject(mesh);
      ctx.nodeMeshes.delete(id);
    }
  }

  // Add/update nodes
  for (const [id, node] of storeNodes) {
    const existing = ctx.nodeMeshes.get(id);
    if (existing) {
      updateNodePosition(existing, node.x, node.y, node.z ?? 0);
    } else {
      const mesh = createNodeMesh(node.x, node.y, node.z ?? 0, { nodeId: id });
      ctx.nodesParent.add(mesh);
      ctx.nodeMeshes.set(id, mesh);
    }
  }
}

// ─── Elements ────────────────────────────────────────────────

export function syncElements(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const storeElements = modelStore.elements;

  // Remove stale
  for (const [id, group] of ctx.elementGroups) {
    if (!storeElements.has(id)) {
      ctx.elementsParent.remove(group);
      disposeObject(group);
      ctx.elementGroups.delete(id);
    }
  }

  // Recreate all (simpler than diffing positions/types; elements rarely change individually)
  for (const [id, elem] of storeElements) {
    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    // Remove old and recreate
    const old = ctx.elementGroups.get(id);
    if (old) {
      ctx.elementsParent.remove(old);
      disposeObject(old);
    }

    const sec = modelStore.sections.get(elem.sectionId);
    const group = createElementGroup(
      { x: nI.x, y: nI.y, z: nI.z ?? 0 },
      { x: nJ.x, y: nJ.y, z: nJ.z ?? 0 },
      {
        elementId: id,
        elementType: elem.type,
        hingeStart: elem.hingeStart,
        hingeEnd: elem.hingeEnd,
        section: sec,
        sectionRotation: sec?.rotation,
        elementRollAngle: elem.rollAngle,
        renderMode: uiStore.renderMode3D,
      },
    );
    ctx.elementsParent.add(group);
    ctx.elementGroups.set(id, group);
  }
}

// ─── Supports ────────────────────────────────────────────────

export function syncSupports(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const storeSupports = modelStore.supports;

  // Remove stale
  for (const [id, gizmo] of ctx.supportGizmos) {
    if (!storeSupports.has(id)) {
      ctx.supportsParent.remove(gizmo);
      disposeObject(gizmo);
      ctx.supportGizmos.delete(id);
    }
  }

  // Recreate all
  for (const [id, sup] of storeSupports) {
    const node = modelStore.nodes.get(sup.nodeId);
    if (!node) continue;

    const old = ctx.supportGizmos.get(id);
    if (old) {
      ctx.supportsParent.remove(old);
      disposeObject(old);
    }

    // Determine gizmo type: if dofRestraints present, derive visual type
    let gizmoType: SupportGizmoType = sup.type as SupportGizmoType;
    if (sup.dofRestraints) {
      const r = sup.dofRestraints;
      const allT = r.tx && r.ty && r.tz;
      const allR = r.rx && r.ry && r.rz;
      if (allT && allR) gizmoType = 'fixed3d';
      else if (allT && !r.rx && !r.ry && !r.rz) gizmoType = 'pinned3d';
      else if (!r.tx && !r.ty && !r.tz && !r.rx && !r.ry && !r.rz) gizmoType = 'spring3d';
      else gizmoType = 'custom3d';
    }
    const gizmo = createSupportGizmo(
      { x: node.x, y: node.y, z: node.z ?? 0 },
      { supportId: id, supportType: gizmoType, dofRestraints: sup.dofRestraints },
    );
    ctx.supportsParent.add(gizmo);
    ctx.supportGizmos.set(id, gizmo);
  }
}

// ─── Shells (Plates + Quads) ────────────────────────────────

export function syncShells(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;

  const getNode = (id: number) => {
    const n = modelStore.nodes.get(id);
    return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : null;
  };

  // Clear all existing shell meshes (simple rebuild, like elements)
  for (const [key, group] of ctx.shellGroups) {
    ctx.shellsParent.remove(group);
    disposeObject(group);
  }
  ctx.shellGroups.clear();

  // Plates (triangular DKT)
  for (const [id, plate] of modelStore.plates) {
    const [n0, n1, n2] = plate.nodes.map(nid => getNode(nid));
    if (!n0 || !n1 || !n2) continue;

    const group = createPlateMesh(n0, n1, n2, id);
    ctx.shellsParent.add(group);
    ctx.shellGroups.set(`p${id}`, group);
  }

  // Quads (MITC4)
  for (const [id, quad] of modelStore.quads) {
    const [n0, n1, n2, n3] = quad.nodes.map(nid => getNode(nid));
    if (!n0 || !n1 || !n2 || !n3) continue;

    const group = createQuadMesh(n0, n1, n2, n3, id);
    ctx.shellsParent.add(group);
    ctx.shellGroups.set(`q${id}`, group);
  }
}

// ─── Loads ───────────────────────────────────────────────────

export function syncLoads(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;

  // Clear all load visuals
  if (ctx.loadGroup) {
    ctx.loadsParent.remove(ctx.loadGroup);
    disposeObject(ctx.loadGroup);
  }
  ctx.loadGroup = new THREE.Group();
  ctx.loadGroup.name = 'loadsContainer';
  ctx.loadsParent.add(ctx.loadGroup);

  // Respect showLoads toggle and hideLoadsWithDiagram
  if (!uiStore.showLoads3D) return;
  const dt = resultsStore.diagramType;
  if (uiStore.hideLoadsWithDiagram && dt !== 'none') return;

  const loads = modelStore.loads;
  if (loads.length === 0) return;

  // Compute max force magnitude for scaling
  let maxForce = 0;
  let maxQ = 0;
  for (const load of loads) {
    if (load.type === 'nodal') {
      const d = load.data;
      maxForce = Math.max(maxForce, Math.abs(d.fx), Math.abs(d.fy), Math.abs(d.mz));
    } else if (load.type === 'nodal3d') {
      const d = load.data;
      maxForce = Math.max(maxForce, Math.abs(d.fx), Math.abs(d.fy), Math.abs(d.fz));
    } else if (load.type === 'distributed') {
      maxQ = Math.max(maxQ, Math.abs(load.data.qI), Math.abs(load.data.qJ));
    } else if (load.type === 'distributed3d') {
      const d = load.data;
      maxQ = Math.max(maxQ, Math.abs(d.qYI), Math.abs(d.qYJ), Math.abs(d.qZI), Math.abs(d.qZJ));
    }
  }
  if (maxForce < 1e-10) maxForce = 10;
  if (maxQ < 1e-10) maxQ = 10;

  const loadGrp = ctx.loadGroup;

  for (let i = 0; i < loads.length; i++) {
    const load = loads[i];

    if (load.type === 'nodal') {
      const node = modelStore.nodes.get(load.data.nodeId);
      if (!node) continue;
      const arrow = createNodalLoadArrow(
        { x: node.x, y: node.y, z: node.z ?? 0 },
        load.data.fx, load.data.fy, 0,
        0, 0, load.data.mz,
        maxForce, i,
        uiStore.momentStyle3D,
      );
      loadGrp.add(arrow);
    } else if (load.type === 'nodal3d') {
      const node = modelStore.nodes.get(load.data.nodeId);
      if (!node) continue;
      const d = load.data;
      const arrow = createNodalLoadArrow(
        { x: node.x, y: node.y, z: node.z ?? 0 },
        d.fx, d.fy, d.fz,
        d.mx, d.my, d.mz,
        maxForce, i,
        uiStore.momentStyle3D,
      );
      loadGrp.add(arrow);
    } else if (load.type === 'distributed') {
      const elem = modelStore.elements.get(load.data.elementId);
      if (!elem) continue;
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;
      const grp = createDistributedLoadGroup(
        { x: nI.x, y: nI.y, z: nI.z ?? 0 },
        { x: nJ.x, y: nJ.y, z: nJ.z ?? 0 },
        load.data.qI, load.data.qJ,
        maxQ, i,
      );
      loadGrp.add(grp);
    } else if (load.type === 'distributed3d') {
      const elem = modelStore.elements.get(load.data.elementId);
      if (!elem) continue;
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;
      // Compute local axes to get the actual ey/ez directions in global coordinates
      const posI = { x: nI.x, y: nI.y, z: nI.z ?? 0 };
      const posJ = { x: nJ.x, y: nJ.y, z: nJ.z ?? 0 };
      const elemLocalY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
        ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
      const localAxes = computeLocalAxes3D(posI, posJ, elemLocalY, elem.rollAngle);
      const ey = { x: localAxes.ey[0], y: localAxes.ey[1], z: localAxes.ey[2] };
      const ez = { x: localAxes.ez[0], y: localAxes.ez[1], z: localAxes.ez[2] };
      // qY loads act along local ey
      if (Math.abs(load.data.qYI) > 0.01 || Math.abs(load.data.qYJ) > 0.01) {
        const grp = createDistributedLoadGroup(
          posI, posJ,
          load.data.qYI, load.data.qYJ,
          maxQ, i, 'Y', ey,
        );
        loadGrp.add(grp);
      }
      // qZ loads act along local ez
      if (Math.abs(load.data.qZI) > 0.01 || Math.abs(load.data.qZJ) > 0.01) {
        const grpZ = createDistributedLoadGroup(
          posI, posJ,
          load.data.qZI, load.data.qZJ,
          maxQ, i, 'Z', ez,
        );
        loadGrp.add(grpZ);
      }
    }
    // surface3d: render as a downward arrow at the quad centroid
    else if (load.type === 'surface3d') {
      const quad = modelStore.model.quads.get(load.data.quadId);
      if (!quad) continue;
      const ns = quad.nodes.map(nid => modelStore.nodes.get(nid));
      if (ns.some(n => !n)) continue;
      const cx = ns.reduce((s, n) => s + n!.x, 0) / 4;
      const cy = ns.reduce((s, n) => s + n!.y, 0) / 4;
      const cz = ns.reduce((s, n) => s + (n!.z ?? 0), 0) / 4;
      const totalForce = load.data.q * 1; // representative 1 m² for arrow sizing
      const arrow = createNodalLoadArrow(
        { x: cx, y: cy, z: cz },
        0, -Math.abs(totalForce), 0,
        0, 0, 0,
        maxForce, i,
      );
      loadGrp.add(arrow);
    }
    // pointOnElement and pointOnElement3d: simplified as nodal for now
    else if (load.type === 'pointOnElement') {
      const elem = modelStore.elements.get(load.data.elementId);
      if (!elem) continue;
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;
      const L = Math.sqrt((nJ.x-nI.x)**2 + (nJ.y-nI.y)**2 + ((nJ.z??0)-(nI.z??0))**2);
      const t = L > 0 ? load.data.a / L : 0.5;
      const px = nI.x + (nJ.x - nI.x) * t;
      const py = nI.y + (nJ.y - nI.y) * t;
      const pz = (nI.z ?? 0) + ((nJ.z ?? 0) - (nI.z ?? 0)) * t;
      const arrow = createNodalLoadArrow(
        { x: px, y: py, z: pz },
        0, -Math.abs(load.data.p), 0, // assume perpendicular = vertical
        0, 0, 0,
        maxForce, i,
      );
      loadGrp.add(arrow);
    }
  }

  // Loads render above grid (0), axes (1), and elements (2)
  loadGrp.traverse((obj) => {
    obj.renderOrder = 3;
    if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
      const mat = (obj as THREE.Mesh).material as THREE.Material;
      if (mat) {
        mat.depthTest = false;
        mat.depthWrite = false;
      }
    }
  });
}

// ─── Selection highlight ─────────────────────────────────────

export function syncSelection(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;

  // Nodes
  for (const [id, mesh] of ctx.nodeMeshes) {
    const selected = uiStore.selectedNodes.has(id);
    const color = selected ? COLORS.nodeSelected : COLORS.node;
    setMeshColor(mesh, color);
  }

  // Elements
  for (const [id, group] of ctx.elementGroups) {
    const selected = uiStore.selectedElements.has(id);
    const elem = modelStore.elements.get(id);
    const baseColor = elem?.type === 'truss' ? COLORS.truss : COLORS.frame;
    const color = selected ? COLORS.elementSelected : baseColor;
    setGroupColor(group, color);
  }

  // Supports
  for (const [id, gizmo] of ctx.supportGizmos) {
    const selected = uiStore.selectedSupports.has(id);
    const color = selected ? COLORS.elementSelected : COLORS.support;
    setGroupColor(gizmo, color);
  }

  // Re-apply color map if active (syncSelection overwrites element colors)
  const dt = resultsStore.diagramType;
  if (resultsStore.results3D && (dt === 'axialColor' || dt === 'colorMap' || dt === 'verification')) {
    // Import dynamically avoided — call syncColorMap3D from Viewport3D after syncSelection
    // The caller is responsible for re-applying color map.
    // We just set a flag so the caller knows.
    ctx.colorMapApplied = false; // force re-apply
  }
}
