// Scene synchronization for Viewport3D — model entities
// Extracted from Viewport3D.svelte to reduce file size and improve modularity.
//
// These functions reconcile the Three.js scene graph with the model store:
//   - syncNodes(), syncElements(), syncSupports(), syncLoads(), syncSelection()

import * as THREE from 'three';
import { modelStore, uiStore, resultsStore } from '../store';
import { NodesInstanced } from '../three/nodes-instanced';
import { ElementsBatched } from '../three/elements-batched';
import { ElementsPicking } from '../three/elements-picking';
import { createElementGroup } from '../three/create-element-mesh';
import { createSupportGizmo } from '../three/create-support-gizmo';
import type { SupportGizmoType } from '../three/create-support-gizmo';
import { createNodalLoadArrow, createDistributedLoadGroup, createSurfaceLoadGroup } from '../three/create-load-arrow';
import { COLORS, setGroupColor, disposeObject } from '../three/selection-helpers';
import { createPlateMesh, createQuadMesh, shellColorForMaterial, paintShell, paintShellEdge, restoreShellColor } from '../three/create-shell-mesh';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import { createLocalAxesTriad } from '../three/create-local-axes';
import { createMemberOffsetViz } from '../three/create-offset-viz';
import { hasMemberOffset, resolveOffsetWorldVectors } from '../engine/member-offsets';
import { hasShellOffset, resolveShellOffsetGlobal } from '../engine/shell-offsets';
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
  /** Batched node rendering — one InstancedMesh for all nodes. */
  nodesInstanced: NodesInstanced;
  /** Batched element rendering (wireframe mode) — one LineSegments2 for all. */
  elementsBatched: ElementsBatched;
  /** BVH-accelerated picking surface — one InstancedMesh of invisible cylinders. */
  elementsPicking: ElementsPicking;
  elementGroups: Map<number, THREE.Group>;
  supportGizmos: Map<number, THREE.Group>;
  shellGroups: Map<string, THREE.Group>; // key: "p{id}" or "q{id}"

  // Single-instance groups (replaced on each sync)
  loadGroup: THREE.Group | null;
  localAxesGroup: THREE.Group | null;
  offsetVizGroup: THREE.Group | null;
  shellOffsetVizGroup: THREE.Group | null;
  /** Persistent parent for the triad group — LOD-managed (hidden in the
   *  heavy-model orbit fallback, like the other decorative parents). */
  localAxesParent: THREE.Group;

  // Results state (mutable flags shared with results-sync)
  colorMapApplied: boolean;
}

// ─── Nodes ────────────────────────────────────────────────────

export function syncNodes(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const storeNodes = modelStore.nodes;
  const project2D = projectFlag();
  const ni = ctx.nodesInstanced;

  // Remove nodes no longer in store. Collect first — remove() mutates indices.
  const toRemove: number[] = [];
  for (const [id] of iterateIds(ni)) {
    if (!storeNodes.has(id)) toRemove.push(id);
  }
  for (const id of toRemove) ni.remove(id);

  // Add/update nodes
  for (const [id, node] of storeNodes) {
    const pos = projectNodeToScene(node, project2D);
    ni.upsert(id, pos.x, pos.y, pos.z);
  }
}

/** Enumerate (id, index) pairs in insertion order. Exposed for syncNodes. */
function* iterateIds(ni: NodesInstanced): IterableIterator<[number, number]> {
  for (let i = 0; i < ni.count; i++) {
    const id = ni.nodeIdAt(i);
    if (id !== null) yield [id, i];
  }
}

// ─── Elements ────────────────────────────────────────────────

export function syncElements(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const storeElements = modelStore.elements;
  const project2D = projectFlag();
  const renderMode = uiStore.renderMode3D;
  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const eb = ctx.elementsBatched;
  const ep = ctx.elementsPicking;

  // Remove stale (groups, batched segments, picking instances)
  for (const [id, group] of ctx.elementGroups) {
    if (!storeElements.has(id)) {
      ctx.elementsParent.remove(group);
      disposeObject(group);
      ctx.elementGroups.delete(id);
      eb.remove(id);
      ep.remove(id);
    }
  }

  // Signature captures everything that forces a rebuild of the element mesh:
  // endpoint positions, type, hinges, section geometry, roll, render mode.
  for (const [id, elem] of storeElements) {
    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    const sec = modelStore.sections.get(elem.sectionId);
    const posI = projectNodeToScene(nI, project2D);
    const posJ = projectNodeToScene(nJ, project2D);

    // Always maintain the batched wireframe segment so toggling render mode
    // doesn't require a full rebuild.
    eb.upsert(id, posI.x, posI.y, posI.z, posJ.x, posJ.y, posJ.z);
    // Push the per-type base color so frame vs truss is visually distinct
    // even before the user makes a selection. Without this, the batched
    // mesh keeps the default COLORS.frame for every element on first load
    // and trusses look identical to frames until syncSelection runs.
    // Mirror the wireframe-vs-solid color choice from syncSelection.
    {
      const isTruss = elem.type === 'truss';
      const baseColor = (renderMode === 'wireframe')
        ? (isTruss ? 0xf0b848 : 0x6cb4ff)
        : (isTruss ? COLORS.truss : COLORS.frame);
      eb.setBaseColor(id, baseColor);
    }
    // BVH-accelerated picking surface (invisible) — kept in sync with positions.
    ep.upsert(id, posI, posJ);

    const signature =
      `${renderMode}|${elem.type}|${elem.releaseI?.mz === true ? 1 : 0}${elem.releaseJ?.mz === true ? 1 : 0}` +
      `|${posI.x}:${posI.y}:${posI.z}|${posJ.x}:${posJ.y}:${posJ.z}` +
      `|${elem.sectionId}:${sec?.shape ?? ''}:${sec?.a ?? ''}:${sec?.b ?? ''}:${sec?.h ?? ''}:${sec?.tw ?? ''}:${sec?.tf ?? ''}:${sec?.t ?? ''}:${sec?.tl ?? ''}:${sec?.rotation ?? ''}` +
      `|${elem.rollAngle ?? ''}:${elem.localYx ?? ''}:${elem.localYy ?? ''}:${elem.localYz ?? ''}|${leftHand ? 'L' : 'R'}` +
      `|off:${elem.offset ? JSON.stringify(elem.offset) : ''}`;

    const existing = ctx.elementGroups.get(id);
    if (existing && existing.userData.elementSig === signature) continue;
    if (existing) {
      ctx.elementsParent.remove(existing);
      disposeObject(existing);
    }

    // Local axes orient extruded sections so they sit the way the solver sees
    // them (e.g. an I-beam web vertical on a horizontal member — depth h up, not
    // lying sideways). Computed here on rebuild from the SCENE coordinates the
    // mesh actually spans (posI/posJ). For a flat 2D model embedded into the XZ
    // plane this is essential: the projected vertical is global Z, so axes built
    // from raw model (x,y) coords would be 90° off, but axes from projected
    // coords keep the section depth vertical. Falls back to undefined (legacy
    // +Z→dir orientation) only on a degenerate/zero-length element.
    let localAxes: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] } | undefined;
    {
      try {
        // Explicit per-element local_y / roll only apply to genuine 3D models;
        // a 2D model has none, and its section rotation is handled via secRot.
        const elemLocalY = (!project2D && elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
          ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
        const ax = computeLocalAxes3D(
          { id: 0, x: posI.x, y: posI.y, z: posI.z },
          { id: 0, x: posJ.x, y: posJ.y, z: posJ.z },
          // leftHand mirrors the solver's convention (negated ey) so asymmetric
          // profiles render the way the solver computes them.
          elemLocalY, project2D ? undefined : elem.rollAngle, leftHand,
        );
        localAxes = { ex: ax.ex, ey: ax.ey, ez: ax.ez };
      } catch {
        localAxes = undefined;
      }
    }

    // In solid/sections modes, render the actual section/cylinder at the OFFSET
    // analytical location (same endpoints the solver expansion uses), so an
    // eccentric member's profile sits where it acts. Wireframe stays on the
    // centerline (the offset preview line shows the shift). Picking + batched
    // wireframe always track the centerline.
    let gI = posI, gJ = posJ;
    if (renderMode !== 'wireframe' && !project2D && hasMemberOffset(elem)) {
      // NOT the mesh-orientation axes: the solver expansion composes the
      // section rotation into the roll angle, so the shifted profile must use
      // the same resolver or it renders away from where the member acts.
      const off = resolveOffsetWorldVectors(elem, posI, posJ, sec?.rotation, leftHand);
      if (off) {
        gI = { ...posI, x: posI.x + (off.i?.x ?? 0), y: posI.y + (off.i?.y ?? 0), z: posI.z + (off.i?.z ?? 0) };
        gJ = { ...posJ, x: posJ.x + (off.j?.x ?? 0), y: posJ.y + (off.j?.y ?? 0), z: posJ.z + (off.j?.z ?? 0) };
      }
    }

    const group = createElementGroup(
      gI,
      gJ,
      {
        elementId: id,
        elementType: elem.type,
        hingeStart: elem.releaseI?.mz === true,
        hingeEnd: elem.releaseJ?.mz === true,
        section: sec,
        sectionRotation: sec?.rotation,
        elementRollAngle: elem.rollAngle,
        renderMode,
        localAxes,
      },
    );
    group.userData.elementSig = signature;
    ctx.elementsParent.add(group);
    ctx.elementGroups.set(id, group);
  }

  // Only the wireframe primary renders the batched LineSegments2.
  eb.mesh.visible = renderMode === 'wireframe';
  eb.flush();
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
  const renderMode = uiStore.renderMode3D;

  const getNode = (id: number) => {
    const n = modelStore.nodes.get(id);
    return n ? projectNodeToScene(n, project2D) : null;
  };

  // Signature of a shell: node ids + positions + project flag + render mode +
  // thickness + material (mode/thickness/material drive the extruded slab and
  // its colour, so a change must rebuild the mesh).
  const sig = (
    project: boolean,
    pts: Array<{ x: number; y: number; z: number }>,
    ids: number[],
    thickness: number,
    materialId: number,
  ): string => {
    let s = `${project ? '1' : '0'}|${renderMode}|t${thickness}|m${materialId}`;
    for (let i = 0; i < ids.length; i++) {
      const p = pts[i];
      s += `|${ids[i]}:${p.x}:${p.y}:${p.z}`;
    }
    return s;
  };

  const seen = new Set<string>();

  // In 'sections' (rendered) mode, draw an offset shell at its analytical
  // offset location (like member offsets). The offset is genuine-3D only, so
  // skip when projecting a planar model. Shifting the points here makes the
  // signature change too → the mesh rebuilds when the offset changes.
  const shiftForOffset = (
    pts: Array<{ x: number; y: number; z: number }>,
    offset: import('../model/element-3d-metadata').ShellOffset | undefined,
  ): Array<{ x: number; y: number; z: number }> => {
    if (renderMode !== 'sections' || project2D || !offset) return pts;
    const v = resolveShellOffsetGlobal(offset, pts);
    if (!v) return pts;
    return pts.map(p => ({ x: p.x + v.x, y: p.y + v.y, z: p.z + v.z }));
  };

  // Plates (triangular DKT)
  for (const [id, plate] of modelStore.plates) {
    const key = `p${id}`;
    const nodes = plate.nodes.map(nid => getNode(nid));
    if (nodes.some(n => !n)) continue;
    const [n0, n1, n2] = shiftForOffset(nodes as Array<{ x: number; y: number; z: number }>, plate.offset);
    const signature = sig(project2D, [n0, n1, n2], [...plate.nodes], plate.thickness, plate.materialId);

    const existing = ctx.shellGroups.get(key);
    if (existing && existing.userData.shellSig === signature) {
      seen.add(key);
      continue;
    }
    if (existing) {
      ctx.shellsParent.remove(existing);
      disposeObject(existing);
    }
    const group = createPlateMesh(n0, n1, n2, id, {
      renderMode, thickness: plate.thickness, faceColor: shellColorForMaterial(plate.materialId),
    });
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
    const [n0, n1, n2, n3] = shiftForOffset(nodes as Array<{ x: number; y: number; z: number }>, quad.offset);
    const signature = sig(project2D, [n0, n1, n2, n3], [...quad.nodes], quad.thickness, quad.materialId);

    const existing = ctx.shellGroups.get(key);
    if (existing && existing.userData.shellSig === signature) {
      seen.add(key);
      continue;
    }
    if (existing) {
      ctx.shellsParent.remove(existing);
      disposeObject(existing);
    }
    const group = createQuadMesh(n0, n1, n2, n3, id, {
      renderMode, thickness: quad.thickness, faceColor: shellColorForMaterial(quad.materialId),
    });
    group.userData.shellSig = signature;
    ctx.shellsParent.add(group);
    ctx.shellGroups.set(key, group);
    seen.add(key);
  }

  // Re-apply selection tint to surviving/rebuilt shell groups.
  applyShellSelection(ctx);

  // Remove shell groups whose backing plate/quad no longer exists
  for (const [key, group] of ctx.shellGroups) {
    if (seen.has(key)) continue;
    ctx.shellsParent.remove(group);
    disposeObject(group);
    ctx.shellGroups.delete(key);
  }
}

/** True when a shell result contour owns the shell face colours (so selection
 *  highlight must not repaint faces). */
function shellContourActive(): boolean {
  if (resultsStore.diagramType !== 'colorMap') return false;
  const k = resultsStore.colorMapKind;
  if (k !== 'shellVonMises' && k !== 'shellBending') return false;
  const r = resultsStore.results3D;
  return !!(r && ((r.plateStresses?.length ?? 0) > 0 || (r.quadStresses?.length ?? 0) > 0));
}

/** Tint selected shell groups (key = "p{id}"/"q{id}"), restore the rest.
 *  While a contour is active, only the OUTLINE is highlighted — the contour
 *  keeps the face colours (otherwise selection/hover would clobber it). */
export function applyShellSelection(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;
  const selected = uiStore.selectedShells;
  const contour = shellContourActive();
  for (const [key, group] of ctx.shellGroups) {
    const isSel = selected.has(key);
    if (contour) {
      paintShellEdge(group, isSel ? COLORS.elementSelected : (group.userData.baseEdgeColor as number) ?? COLORS.support);
    } else if (isSel) {
      paintShell(group, COLORS.elementSelected, COLORS.elementSelected);
    } else {
      restoreShellColor(group);
    }
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

  // selectedElements is shared between frame elements and plates/quads, whose
  // id counters overlap; selectMode tells us which entity class the ids refer
  // to. In shells mode a selected shell id must not light up a frame element.
  const shellMode = uiStore.selectMode === 'shells';

  // Nodes
  const ni = ctx.nodesInstanced;
  for (let i = 0; i < ni.count; i++) {
    const id = ni.nodeIdAt(i);
    if (id === null) continue;
    const selected = uiStore.selectedNodes.has(id);
    ni.setBaseColor(id, selected ? COLORS.nodeSelected : COLORS.node);
  }

  // Elements
  const wireframe = uiStore.renderMode3D === 'wireframe';
  const eb = ctx.elementsBatched;
  for (const [id, group] of ctx.elementGroups) {
    const selected = !shellMode && uiStore.selectedElements.has(id);
    const elem = modelStore.elements.get(id);
    const isTruss = elem?.type === 'truss';
    // Use brightened colors in wireframe mode for grid contrast
    const baseColor = wireframe
      ? (isTruss ? 0xf0b848 : 0x6cb4ff)
      : (isTruss ? COLORS.truss : COLORS.frame);
    const color = selected ? COLORS.elementSelected : baseColor;
    setGroupColor(group, color);
    // Wireframe mode: batched LineSegments2 carries the visual, so push the
    // color into it as well. In solid/sections, the batched mesh is hidden
    // but we keep the base color in sync for toggle-back.
    eb.setBaseColor(id, color);
  }
  eb.flush();

  // Supports
  for (const [id, gizmo] of ctx.supportGizmos) {
    const selected = uiStore.selectedSupports.has(id);
    const color = selected ? COLORS.elementSelected : COLORS.support;
    setGroupColor(gizmo, color);
  }

  // Shells (plates + quads): selectedShells keys ("p{id}"/"q{id}") are
  // unambiguous, superseding the old opacity boost keyed on colliding
  // selectedElements ids.
  applyShellSelection(ctx);

  // Re-apply color map if active (syncSelection overwrites element colors)
  const dt = resultsStore.diagramType;
  if (resultsStore.results3D && (dt === 'axialColor' || dt === 'colorMap' || dt === 'verification')) {
    // Import dynamically avoided — call syncColorMap3D from Viewport3D after syncSelection
    // The caller is responsible for re-applying color map.
    // We just set a flag so the caller knows.
    ctx.colorMapApplied = false; // force re-apply
  }
}

// ─── Local-axis triads (visual only) ─────────────────────────
//
// Draws an x/y/z triad on the selected member(s), plus every member when the
// "show all local axes" toggle is on. Always consumes computeLocalAxes3D as the
// source of truth — it never changes the axis convention. Single-instance group
// rebuilt on each call (same pattern as loadGroup).

export function syncLocalAxes(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;

  // Tear down the previous triad group.
  if (ctx.localAxesGroup) {
    ctx.localAxesParent.remove(ctx.localAxesGroup);
    disposeObject(ctx.localAxesGroup);
    ctx.localAxesGroup = null;
  }

  // When the viewport projects a planar (2D) model into XZ, the triads must be
  // built from the SAME projected scene coordinates the meshes span (PR [12]) —
  // otherwise they'd point along the raw model axes and disagree with the render.
  const project2D = projectFlag();

  const LABEL_CAP = 8;

  // ── MEMBER local axes (independent setting: localAxesMode3D) ──
  const memberMode = uiStore.localAxesMode3D;
  // 'always' on an arbitrarily large model would mean tens of thousands of
  // arrow objects rebuilt per model mutation — beyond this cap the mode is a
  // no-op (the 'selected' path still works on models of any size).
  const MAX_ALWAYS_TRIADS = 1500;
  const memberShowAll = memberMode === 'always' && modelStore.elements.size <= MAX_ALWAYS_TRIADS;
  // In 'always' mode the selection is deliberately NOT read: it isn't needed
  // (every member gets a triad, labels off), and reading it would make the
  // whole group dispose + rebuild on every selection click. In shells
  // select-mode the ids in selectedElements are plate/quad ids (colliding
  // counters) — never frame elements. And "When selected" means MANUALLY
  // selected only: result diagrams / result-query / AI highlight via
  // selectedElements too, but with elementSelectionManual=false — reviewing
  // diagrams must not flood the scene with triads.
  const selected = memberShowAll || uiStore.selectMode === 'shells' || !uiStore.elementSelectionManual
    ? new Set<number>()
    : uiStore.selectedElements;
  const labelSelected = selected.size > 0 && selected.size <= LABEL_CAP;
  const drawMembers = memberMode !== 'never' && (memberShowAll || selected.size > 0);

  const leftHandTriads = uiStore.axisConvention3D === 'leftHand';
  const group = new THREE.Group();
  group.name = 'localAxesContainer';

  if (drawMembers) for (const [id, elem] of modelStore.elements) {
    const isSelected = selected.has(id);
    if (!memberShowAll && !isSelected) continue;

    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    // Use the PROJECTED scene coordinates the mesh actually spans (2D → XZ),
    // so the triad shares the rendered member basis.
    const posI = projectNodeToScene(nI, project2D);
    const posJ = projectNodeToScene(nJ, project2D);

    let axes;
    try {
      // For a projected 2D model the basis comes purely from the projected
      // coordinates (no explicit localY/roll) — matching the rendered section.
      // For genuine 3D, mirror the solver exactly: explicit localY + section
      // rotation folded into the roll angle + the leftHand convention.
      const elemLocalY = (!project2D && elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
        ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
      const secRot = modelStore.sections.get(elem.sectionId)?.rotation ?? 0;
      const roll = project2D ? undefined : (elem.rollAngle ?? 0) + secRot;
      axes = computeLocalAxes3D({ id: 0, ...posI }, { id: 0, ...posJ }, elemLocalY, roll, leftHandTriads);
    } catch {
      continue; // zero-length member — skip
    }

    const origin = new THREE.Vector3(
      (posI.x + posJ.x) / 2, (posI.y + posJ.y) / 2, (posI.z + posJ.z) / 2,
    );
    // Labels only on selected members, and only for a small selected set.
    group.add(createLocalAxesTriad(origin, axes, { withLabels: isSelected && labelSelected }));
  }

  // ── SHELL local axes / normals (independent setting: shellAxesMode3D) ──
  // In-plane x/y + normal (local z). Shells are always MANUALLY selected
  // (selectedShells is only set by click / table / box-select), so "When
  // selected" naturally shows just the picked shell — never a result flood.
  const shellMode = uiStore.shellAxesMode3D;
  const shellShowAll = shellMode === 'always';
  const selShells = uiStore.selectedShells;
  const drawShells = shellMode !== 'never' && (shellShowAll || selShells.size > 0);
  const shellLabel = selShells.size > 0 && selShells.size <= LABEL_CAP;
  if (drawShells) {
    const addShellTriad = (key: string, nodeIds: number[]) => {
      const isSel = selShells.has(key);
      if (!shellShowAll && !isSel) return;
      const verts = nodeIds.map(id => modelStore.nodes.get(id));
      if (verts.some(v => !v) || verts.length < 3) return;
      const axes = shellLocalAxes(verts as Array<{ x: number; y: number; z?: number }>);
      if (!axes) return;
      let cx = 0, cy = 0, cz = 0;
      for (const v of verts as Array<{ x: number; y: number; z?: number }>) { cx += v.x; cy += v.y; cz += v.z ?? 0; }
      const origin = new THREE.Vector3(cx / verts.length, cy / verts.length, cz / verts.length);
      group.add(createLocalAxesTriad(origin, axes, { withLabels: isSel && shellLabel }));
    };
    for (const [id, plate] of modelStore.plates) addShellTriad(`p${id}`, [...plate.nodes]);
    for (const [id, quad] of modelStore.quads) addShellTriad(`q${id}`, [...quad.nodes]);
  }

  ctx.localAxesGroup = group;
  ctx.localAxesParent.add(group);
}

/** Shell local frame: ex along node0→node1 edge, ez the face normal, ey = ez×ex.
 *  Visual only — mirrors the convention shells are assembled with, never changes
 *  it. Returns a LocalAxes3D-shaped triad sized to the element. */
function shellLocalAxes(
  verts: Array<{ x: number; y: number; z?: number }>,
): { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number]; L: number } | null {
  const p = (v: { x: number; y: number; z?: number }) => new THREE.Vector3(v.x, v.y, v.z ?? 0);
  const a = p(verts[0]), b = p(verts[1]), c = p(verts[2]);
  const ex = new THREE.Vector3().subVectors(b, a);
  const L = ex.length();
  if (L < 1e-9) return null;
  ex.multiplyScalar(1 / L);
  const ez = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (ez.length() < 1e-12) return null;
  ez.normalize();
  const ey = new THREE.Vector3().crossVectors(ez, ex).normalize();
  // Characteristic size = mean edge length, for a legible triad.
  let per = 0;
  for (let i = 0; i < verts.length; i++) per += p(verts[i]).distanceTo(p(verts[(i + 1) % verts.length]));
  return {
    ex: [ex.x, ex.y, ex.z], ey: [ey.x, ey.y, ey.z], ez: [ez.x, ez.y, ez.z],
    L: per / verts.length,
  };
}

// ─── Member-offset preview (visual only) ─────────────────────
//
// For every element carrying offset metadata, draw the ghost centerline, the
// offset analytical line, and the rigid arms. Mirrors the solver's ephemeral
// expansion (shared resolveOffsetWorldVectors) so the preview shows exactly
// where the analysis places the member. Single-instance group.

export function syncMemberOffsets(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;

  if (ctx.offsetVizGroup) {
    ctx.scene.remove(ctx.offsetVizGroup);
    disposeObject(ctx.offsetVizGroup);
    ctx.offsetVizGroup = null;
  }

  // Offsets are a genuine-3D feature (matches solver gating); skip projected 2D.
  if (projectFlag()) return;

  // Cheap early-out without materializing an array — this sync runs on every
  // model mutation tick (node drags) even when the feature isn't in use.
  let any = false;
  for (const e of modelStore.elements.values()) {
    if (hasMemberOffset(e)) { any = true; break; }
  }
  if (!any) return;

  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const group = new THREE.Group();
  group.name = 'memberOffsetContainer';

  for (const elem of modelStore.elements.values()) {
    if (!hasMemberOffset(elem)) continue;
    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;
    const pI = { x: nI.x, y: nI.y, z: nI.z ?? 0 };
    const pJ = { x: nJ.x, y: nJ.y, z: nJ.z ?? 0 };

    // Solver-faithful axes (effectiveRoll + leftHand) — the preview's whole
    // point is showing where the ANALYSIS places the member.
    const sec = modelStore.sections.get(elem.sectionId);
    const off = resolveOffsetWorldVectors(elem, pI, pJ, sec?.rotation, leftHand);
    if (!off) continue;
    group.add(createMemberOffsetViz(pI, pJ, off.i, off.j));
  }

  ctx.offsetVizGroup = group;
  ctx.scene.add(group);
}

// ─── Shell-offset preview (visual only) ──────────────────────
//
// For every offset shell, draw the rigid arms (base corner → offset corner)
// and the ghost outline of the offset surface. Mirrors the solver's per-corner
// helper-node expansion (same resolveShellOffsetGlobal) so the preview shows
// exactly where the analysis places the shell. Single-instance group.

const SHELL_OFFSET_COLOR = 0xffb347; // amber, matches member rigid arms

export function syncShellOffsets(ctx: SceneSyncContext): void {
  if (!ctx.initialized) return;

  if (ctx.shellOffsetVizGroup) {
    ctx.scene.remove(ctx.shellOffsetVizGroup);
    disposeObject(ctx.shellOffsetVizGroup);
    ctx.shellOffsetVizGroup = null;
  }

  // Offsets are a genuine-3D feature (matches solver gating); skip projected 2D.
  if (projectFlag()) return;

  const shellsWithOffset: Array<{ nodeIds: number[]; offset: import('../model/element-3d-metadata').ShellOffset }> = [];
  for (const p of modelStore.plates.values()) if (hasShellOffset(p)) shellsWithOffset.push({ nodeIds: [...p.nodes], offset: p.offset! });
  for (const q of modelStore.quads.values()) if (hasShellOffset(q)) shellsWithOffset.push({ nodeIds: [...q.nodes], offset: q.offset! });
  if (shellsWithOffset.length === 0) return;

  const group = new THREE.Group();
  group.name = 'shellOffsetContainer';
  const armMat = new THREE.LineBasicMaterial({ color: SHELL_OFFSET_COLOR });
  const ghostMat = new THREE.LineBasicMaterial({ color: SHELL_OFFSET_COLOR, transparent: true, opacity: 0.5 });

  for (const { nodeIds, offset } of shellsWithOffset) {
    const corners = nodeIds.map(id => modelStore.nodes.get(id));
    if (corners.some(c => !c)) continue;
    const cv = (corners as Array<{ x: number; y: number; z?: number }>).map(n => ({ x: n.x, y: n.y, z: n.z ?? 0 }));
    const v = resolveShellOffsetGlobal(offset, cv);
    if (!v) continue;

    // Rigid arms: base corner → offset corner.
    const armPts: THREE.Vector3[] = [];
    for (const c of cv) {
      armPts.push(new THREE.Vector3(c.x, c.y, c.z));
      armPts.push(new THREE.Vector3(c.x + v.x, c.y + v.y, c.z + v.z));
    }
    const armGeo = new THREE.BufferGeometry().setFromPoints(armPts);
    const arms = new THREE.LineSegments(armGeo, armMat);
    arms.raycast = () => {};
    group.add(arms);

    // Ghost outline of the offset surface (closed loop).
    const loop = cv.map(c => new THREE.Vector3(c.x + v.x, c.y + v.y, c.z + v.z));
    loop.push(loop[0].clone());
    const ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints(loop), ghostMat);
    ghost.raycast = () => {};
    group.add(ghost);
  }

  ctx.shellOffsetVizGroup = group;
  ctx.scene.add(group);
}
