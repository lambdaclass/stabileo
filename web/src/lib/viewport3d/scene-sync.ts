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
import { createNodalLoadArrow, createDistributedLoadGroup, createSurfaceLoadGroup } from '../three/create-load-arrow';
import { COLORS, setMeshColor, setGroupColor, disposeObject } from '../three/selection-helpers';
import { createPlateMesh, createQuadMesh } from '../three/create-shell-mesh';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import type { SolverNode3D } from '../engine/types-3d';
import {
  get2DDisplayNodalLoadMoment,
  get2DDisplayNodalLoadVertical,
  getCachedProjectModelToXZ,
  projectNodeToScene,
  shouldProjectModelToXZ,
} from '../geometry/coordinate-system';

/** Compute shouldProjectModelToXZ with per-pass caching keyed on modelVersion. */
function projectFlag(): boolean {
  return getCachedProjectModelToXZ(
    modelStore.modelVersion,
    uiStore.analysisMode,
    uiStore.viewportPresentation3D,
    () => shouldProjectModelToXZ({
      analysisMode: uiStore.analysisMode,
      viewportPresentation3D: uiStore.viewportPresentation3D,
      nodes: modelStore.nodes.values(),
      supports: modelStore.supports.values(),
      loads: modelStore.loads,
      plateCount: modelStore.plates.size,
      quadCount: modelStore.quads.size,
    }),
  );
}

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
  const project2D = projectFlag();

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
    const pos = projectNodeToScene(node, project2D);
    const existing = ctx.nodeMeshes.get(id);
    if (existing) {
      updateNodePosition(existing, pos.x, pos.y, pos.z);
    } else {
      const mesh = createNodeMesh(pos.x, pos.y, pos.z, { nodeId: id });
      ctx.nodesParent.add(mesh);
      ctx.nodeMeshes.set(id, mesh);
    }
  }
}

// ─── Elements ────────────────────────────────────────────────

export function syncElements(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const storeElements = modelStore.elements;
  const project2D = projectFlag();

  // Remove stale
  for (const [id, group] of ctx.elementGroups) {
    if (!storeElements.has(id)) {
      ctx.elementsParent.remove(group);
      disposeObject(group);
      ctx.elementGroups.delete(id);
    }
  }

  const renderMode = uiStore.renderMode3D;

  // Signature captures everything that forces a rebuild of the element mesh:
  // endpoint positions, type, hinges, section geometry, roll, render mode.
  for (const [id, elem] of storeElements) {
    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    const sec = modelStore.sections.get(elem.sectionId);
    const posI = projectNodeToScene(nI, project2D);
    const posJ = projectNodeToScene(nJ, project2D);
    const signature =
      `${renderMode}|${elem.type}|${elem.hingeStart ? 1 : 0}${elem.hingeEnd ? 1 : 0}` +
      `|${posI.x}:${posI.y}:${posI.z}|${posJ.x}:${posJ.y}:${posJ.z}` +
      `|${elem.sectionId}:${sec?.shape ?? ''}:${sec?.a ?? ''}:${sec?.b ?? ''}:${sec?.h ?? ''}:${sec?.rotation ?? ''}` +
      `|${elem.rollAngle ?? ''}`;

    const existing = ctx.elementGroups.get(id);
    if (existing && existing.userData.elementSig === signature) continue;
    if (existing) {
      ctx.elementsParent.remove(existing);
      disposeObject(existing);
    }

    const group = createElementGroup(
      posI,
      posJ,
      {
        elementId: id,
        elementType: elem.type,
        hingeStart: elem.hingeStart,
        hingeEnd: elem.hingeEnd,
        section: sec,
        sectionRotation: sec?.rotation,
        elementRollAngle: elem.rollAngle,
        renderMode,
      },
    );
    group.userData.elementSig = signature;
    ctx.elementsParent.add(group);
    ctx.elementGroups.set(id, group);
  }
}

// ─── Supports ────────────────────────────────────────────────

export function syncSupports(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const storeSupports = modelStore.supports;
  const project2D = projectFlag();

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
      projectNodeToScene(node, project2D),
      { supportId: id, supportType: gizmoType, dofRestraints: sup.dofRestraints },
    );
    ctx.supportsParent.add(gizmo);
    ctx.supportGizmos.set(id, gizmo);
  }
}

// ─── Shells (Plates + Quads) ────────────────────────────────

export function syncShells(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;

  const project2D = projectFlag();

  const getNode = (id: number) => {
    const n = modelStore.nodes.get(id);
    return n ? projectNodeToScene(n, project2D) : null;
  };

  // Signature of a shell: node ids + positions + project flag.
  // Rebuild the mesh only when the signature changes.
  const sig = (project: boolean, pts: Array<{ x: number; y: number; z: number }>, ids: number[]): string => {
    let s = project ? '1' : '0';
    for (let i = 0; i < ids.length; i++) {
      const p = pts[i];
      s += `|${ids[i]}:${p.x}:${p.y}:${p.z}`;
    }
    return s;
  };

  const seen = new Set<string>();

  // Plates (triangular DKT)
  for (const [id, plate] of modelStore.plates) {
    const key = `p${id}`;
    const nodes = plate.nodes.map(nid => getNode(nid));
    if (nodes.some(n => !n)) continue;
    const [n0, n1, n2] = nodes as Array<{ x: number; y: number; z: number }>;
    const signature = sig(project2D, [n0, n1, n2], [...plate.nodes]);

    const existing = ctx.shellGroups.get(key);
    if (existing && existing.userData.shellSig === signature) {
      seen.add(key);
      continue;
    }
    if (existing) {
      ctx.shellsParent.remove(existing);
      disposeObject(existing);
    }
    const group = createPlateMesh(n0, n1, n2, id);
    group.userData.shellSig = signature;
    ctx.shellsParent.add(group);
    ctx.shellGroups.set(key, group);
    seen.add(key);
  }

  // Quads (MITC4)
  for (const [id, quad] of modelStore.quads) {
    const key = `q${id}`;
    const nodes = quad.nodes.map(nid => getNode(nid));
    if (nodes.some(n => !n)) continue;
    const [n0, n1, n2, n3] = nodes as Array<{ x: number; y: number; z: number }>;
    const signature = sig(project2D, [n0, n1, n2, n3], [...quad.nodes]);

    const existing = ctx.shellGroups.get(key);
    if (existing && existing.userData.shellSig === signature) {
      seen.add(key);
      continue;
    }
    if (existing) {
      ctx.shellsParent.remove(existing);
      disposeObject(existing);
    }
    const group = createQuadMesh(n0, n1, n2, n3, id);
    group.userData.shellSig = signature;
    ctx.shellsParent.add(group);
    ctx.shellGroups.set(key, group);
    seen.add(key);
  }

  // Remove shell groups whose backing plate/quad no longer exists
  for (const [key, group] of ctx.shellGroups) {
    if (seen.has(key)) continue;
    ctx.shellsParent.remove(group);
    disposeObject(group);
    ctx.shellGroups.delete(key);
  }
}

// ─── Loads ───────────────────────────────────────────────────

export function syncLoads(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const project2D = projectFlag();

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
      maxForce = Math.max(maxForce, Math.abs(d.fx), Math.abs(get2DDisplayNodalLoadVertical(d)), Math.abs(get2DDisplayNodalLoadMoment(d)));
    } else if (load.type === 'nodal3d') {
      const d = load.data;
      maxForce = Math.max(maxForce, Math.abs(d.fx), Math.abs(d.fy), Math.abs(d.fz));
    } else if (load.type === 'distributed') {
      maxQ = Math.max(maxQ, Math.abs(load.data.qI), Math.abs(load.data.qJ));
    } else if (load.type === 'distributed3d') {
      const d = load.data;
      maxQ = Math.max(maxQ, Math.abs(d.qYI), Math.abs(d.qYJ), Math.abs(d.qZI), Math.abs(d.qZJ));
    } else if (load.type === 'surface3d') {
      maxQ = Math.max(maxQ, Math.abs(load.data.q));
    }
  }
  if (maxForce < 1e-10) maxForce = 10;
  if (maxQ < 1e-10) maxQ = 10;

  const loadGrp = ctx.loadGroup;

  // Visibility filter and color helper
  const visibleCases = uiStore.visibleLoadCases3D; // null = all visible
  function getCaseColor(caseId: number | undefined): number {
    const hex = modelStore.getLoadCaseColor(caseId ?? 1);
    return parseInt(hex.replace('#', ''), 16);
  }

  for (let i = 0; i < loads.length; i++) {
    const load = loads[i];
    const caseId: number | undefined = load.data.caseId;

    // Filter by visible load cases
    if (visibleCases !== null && caseId !== undefined && !visibleCases.includes(caseId)) continue;

    const cc = getCaseColor(caseId);

    if (load.type === 'nodal') {
      const node = modelStore.nodes.get(load.data.nodeId);
      if (!node) continue;
      const pos = projectNodeToScene(node, project2D);
      const vertical = get2DDisplayNodalLoadVertical(load.data);
      const moment = get2DDisplayNodalLoadMoment(load.data);
      const arrow = createNodalLoadArrow(
        pos,
        load.data.fx, project2D ? 0 : vertical, project2D ? vertical : 0,
        0, project2D ? moment : 0, project2D ? 0 : moment,
        maxForce, i,
        uiStore.momentStyle3D,
        cc,
      );
      loadGrp.add(arrow);
    } else if (load.type === 'nodal3d') {
      const node = modelStore.nodes.get(load.data.nodeId);
      if (!node) continue;
      const d = load.data;
      const arrow = createNodalLoadArrow(
        projectNodeToScene(node, project2D),
        d.fx, d.fy, d.fz,
        d.mx, d.my, d.mz,
        maxForce, i,
        uiStore.momentStyle3D,
        cc,
      );
      loadGrp.add(arrow);
    } else if (load.type === 'distributed') {
      const elem = modelStore.elements.get(load.data.elementId);
      if (!elem) continue;
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;
      const posI = projectNodeToScene(nI, project2D);
      const posJ = projectNodeToScene(nJ, project2D);
      const grp = createDistributedLoadGroup(
        posI,
        posJ,
        load.data.qI, load.data.qJ,
        maxQ, i, 'Z', undefined, cc,
      );
      loadGrp.add(grp);
    } else if (load.type === 'distributed3d') {
      const elem = modelStore.elements.get(load.data.elementId);
      if (!elem) continue;
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;
      // Compute local axes to get the actual ey/ez directions in global coordinates
      const posI = { id: 0, x: nI.x, y: nI.y, z: nI.z ?? 0 } as SolverNode3D;
      const posJ = { id: 0, x: nJ.x, y: nJ.y, z: nJ.z ?? 0 } as SolverNode3D;
      const sceneI = projectNodeToScene(nI, project2D);
      const sceneJ = projectNodeToScene(nJ, project2D);
      const elemLocalY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
        ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
      const localAxes = computeLocalAxes3D(posI, posJ, elemLocalY, elem.rollAngle);
      const ey = { x: localAxes.ey[0], y: localAxes.ey[1], z: localAxes.ey[2] };
      const ez = { x: localAxes.ez[0], y: localAxes.ez[1], z: localAxes.ez[2] };
      // qY loads act along local ey
      if (Math.abs(load.data.qYI) > 0.01 || Math.abs(load.data.qYJ) > 0.01) {
        const grp = createDistributedLoadGroup(
          sceneI, sceneJ,
          load.data.qYI, load.data.qYJ,
          maxQ, i, 'Y', ey, cc,
        );
        loadGrp.add(grp);
      }
      // qZ loads act along local ez
      if (Math.abs(load.data.qZI) > 0.01 || Math.abs(load.data.qZJ) > 0.01) {
        const grpZ = createDistributedLoadGroup(
          sceneI, sceneJ,
          load.data.qZI, load.data.qZJ,
          maxQ, i, 'Z', ez, cc,
        );
        loadGrp.add(grpZ);
      }
    }
    // surface3d: render as a grid of arrows covering the quad area
    else if (load.type === 'surface3d') {
      const quad = modelStore.quads.get(load.data.quadId);
      if (!quad) continue;
      const ns = quad.nodes.map((nid: number) => modelStore.nodes.get(nid));
      if (ns.some((n: any) => !n)) continue;
      const grp = createSurfaceLoadGroup(
        ns as Array<{ x: number; y: number; z: number }>,
        load.data.q, maxQ, i, cc,
      );
      loadGrp.add(grp);
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
      const sceneI = projectNodeToScene(nI, project2D);
      const sceneJ = projectNodeToScene(nJ, project2D);
      const px = sceneI.x + (sceneJ.x - sceneI.x) * t;
      const py = sceneI.y + (sceneJ.y - sceneI.y) * t;
      const pz = sceneI.z + (sceneJ.z - sceneI.z) * t;
      const arrow = createNodalLoadArrow(
        { x: px, y: py, z: pz },
        0, 0, -Math.abs(load.data.p),
        0, 0, 0,
        maxForce, i,
        'double-arrow', cc,
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
  const wireframe = uiStore.renderMode3D === 'wireframe';
  for (const [id, group] of ctx.elementGroups) {
    const selected = uiStore.selectedElements.has(id);
    const elem = modelStore.elements.get(id);
    const isTruss = elem?.type === 'truss';
    // Use brightened colors in wireframe mode for grid contrast
    const baseColor = wireframe
      ? (isTruss ? 0xf0b848 : 0x6cb4ff)
      : (isTruss ? COLORS.truss : COLORS.frame);
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
