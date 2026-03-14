// Results synchronization for Viewport3D — diagrams, deformed shape, reactions, labels, color maps
// Extracted from Viewport3D.svelte to reduce file size and improve modularity.
//
// Exports:
//   - ResultsSyncContext (interface)
//   - DIAGRAM_3D_TYPES (constant)
//   - syncDeformed(), syncDiagrams3D(), syncColorMap3D(), syncVerificationLabels(), syncReactions(), syncConstraintForces(), syncLabels3D()

import * as THREE from 'three';
import { modelStore, uiStore, resultsStore } from '../store';
import { createDeformedLines, type ElementEI } from '../three/deformed-shape-3d';
import { createDiagramGroup3D, createEnvelopeDiagramGroup3D } from '../three/diagram-render-3d';
import { COLORS, setGroupColor, disposeObject, heatmapColor, axialForceColor, verificationColor, createTextSprite } from '../three/selection-helpers';
import { verificationStore } from '../store/verification.svelte';
import { createReactionArrow, createConstraintForceArrow } from '../three/create-load-arrow';
import { computeElementStress3D } from '../engine/section-stress-3d';
import type { Diagram3DKind } from '../engine/diagrams-3d';
import type { Displacement3D } from '../engine/types-3d';
import { sampleElementValues, createHeatmapCylinder, orientHeatmapMesh, applyShellVertexColors, type HeatmapVariable } from '../three/stress-heatmap';

export const DIAGRAM_3D_TYPES: Set<string> = new Set(['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion']);

/**
 * Mutable context for results visualization.
 * Created once in Viewport3D.svelte, passed to all sync functions.
 */
export interface ResultsSyncContext {
  initialized: boolean;

  // Parent groups
  resultsParent: THREE.Group;
  scene: THREE.Scene;

  // Element groups (needed for color map + deformed opacity)
  elementGroups: Map<number, THREE.Group>;

  // Shell groups (needed for shell stress heatmap) — key: "p{id}" or "q{id}"
  shellGroups: Map<string, THREE.Group>;

  // Results groups (replaced on each sync)
  deformedGroup: THREE.Group | null;
  diagramGroup: THREE.Group | null;
  overlayDiagramGroup: THREE.Group | null;
  reactionGroup: THREE.Group | null;
  constraintForcesGroup: THREE.Group | null;
  nodeLabelsGroup: THREE.Group | null;
  elementLabelsGroup: THREE.Group | null;
  lengthLabelsGroup: THREE.Group | null;
  verificationLabelsGroup: THREE.Group | null;

  // Mutable state flags
  lastDeformedAnimScale: number | null;
  colorMapApplied: boolean;
}

/** Compute the diagonal of the structure's bounding box (for mode shape scaling). */
function computeStructureBBox(): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const n of modelStore.nodes.values()) {
    if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    const z = n.z ?? 0;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
}

// ─── Deformed shape ──────────────────────────────────────────

export function syncDeformed(ctx: ResultsSyncContext, scaleOverride?: number): void {
  if (!ctx.initialized) return;

  // Remove old deformed
  if (ctx.deformedGroup) {
    ctx.resultsParent.remove(ctx.deformedGroup);
    disposeObject(ctx.deformedGroup);
    ctx.deformedGroup = null;
  }

  const dt = resultsStore.diagramType;
  const isDeformedLike = dt === 'deformed' || dt === 'modeShape' || dt === 'bucklingMode';

  // Restore element opacity when not showing deformed shape
  const showingDeformed = resultsStore.results3D && isDeformedLike;
  for (const group of ctx.elementGroups.values()) {
    group.traverse((child) => {
      // Skip picking helpers and heatmap overlays — they manage their own state
      if (child.userData?.pickingHelper) return;
      if (child.userData?.heatmapMesh) return;
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material as THREE.Material;
        if (showingDeformed) {
          mat.transparent = true;
          mat.opacity = 0.2;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
        }
      }
    });
  }

  // Determine displacements source: static deformed, modal mode, or buckling mode
  let displacements: Displacement3D[] | null = null;
  let scale = scaleOverride ?? resultsStore.deformedScale;
  let modeColor: number | null = null;

  if (dt === 'deformed') {
    const r3d = resultsStore.results3D;
    if (!r3d) return;
    displacements = r3d.displacements;
  } else if (dt === 'modeShape') {
    const modal = resultsStore.modalResult3D;
    if (!modal || !modal.modes.length) return;
    const mode = modal.modes[resultsStore.activeModeIndex];
    if (!mode) return;
    // Scale mode shapes relative to structure size (eigenvectors are normalized to max=1)
    const structureSize = computeStructureBBox();
    const modeScale = structureSize * 0.15 * (scale / 100);
    scale = modeScale * Math.sin(performance.now() / 500);
    displacements = mode.displacements;
    modeColor = 0x4ecdc4; // cyan
  } else if (dt === 'bucklingMode') {
    const buckling = resultsStore.bucklingResult3D;
    if (!buckling || !buckling.modes.length) return;
    const mode = buckling.modes[resultsStore.activeBucklingMode];
    if (!mode) return;
    // Scale buckling modes relative to structure size (eigenvectors are normalized to max=1)
    const structureSize = computeStructureBBox();
    const modeScale = structureSize * 0.15 * (scale / 100);
    scale = modeScale * Math.sin(performance.now() / 500);
    displacements = mode.displacements;
    modeColor = 0xe96941; // orange-red
  } else {
    return;
  }

  if (!displacements) return;

  // Build EI map for particular solution (only for static deformed — modes don't need it)
  let eiMap: Map<number, ElementEI> | undefined;
  const r3d = resultsStore.results3D;
  if (dt === 'deformed') {
    eiMap = new Map<number, ElementEI>();
    for (const [id, elem] of modelStore.elements) {
      const mat = modelStore.materials.get(elem.materialId);
      const sec = modelStore.sections.get(elem.sectionId);
      if (mat && sec) {
        const E = mat.e * 1000; // MPa → kN/m²
        const modelIy = sec.iy ?? (sec.b && sec.h ? (sec.b * sec.h ** 3) / 12 : sec.iz);
        eiMap.set(id, {
          EIy: E * modelIy,    // Iy (about Y horizontal) → Z-plane bending (w, θy)
          EIz: E * sec.iz,     // Iz (about Z vertical) → Y-plane bending (v, θz)
        });
      }
    }
  }

  ctx.deformedGroup = createDeformedLines(
    modelStore.elements,
    modelStore.nodes,
    displacements,
    dt === 'deformed' && r3d ? r3d.elementForces : [],
    scale,
    eiMap,
    uiStore.axisConvention3D === 'leftHand',
  );

  // Tint mode shapes with their distinctive color
  if (modeColor !== null) {
    const color = new THREE.Color(modeColor);
    ctx.deformedGroup.traverse((child) => {
      if ((child as THREE.Line).isLine && (child as THREE.Line).material) {
        const mat = (child as THREE.Line).material as THREE.LineBasicMaterial;
        mat.color.copy(color);
      } else if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (!mat.color) return;
        mat.color.copy(color);
      }
    });
  }

  ctx.resultsParent.add(ctx.deformedGroup);
}

// ─── Force/moment diagrams ─────────────────────────────────

export function syncDiagrams3D(ctx: ResultsSyncContext): void {
  if (!ctx.initialized) return;

  // Remove old diagram + overlay
  if (ctx.diagramGroup) {
    ctx.resultsParent.remove(ctx.diagramGroup);
    disposeObject(ctx.diagramGroup);
    ctx.diagramGroup = null;
  }
  if (ctx.overlayDiagramGroup) {
    ctx.resultsParent.remove(ctx.overlayDiagramGroup);
    disposeObject(ctx.overlayDiagramGroup);
    ctx.overlayDiagramGroup = null;
  }

  const r3d = resultsStore.results3D;
  const dt = resultsStore.diagramType;
  if (!r3d || !DIAGRAM_3D_TYPES.has(dt)) return;

  const leftHand = uiStore.axisConvention3D === 'leftHand';
  const kind = dt as Diagram3DKind;

  // Check if envelope dual curves should be rendered
  const isEnvelope = resultsStore.isEnvelopeActive && resultsStore.fullEnvelope3D;
  if (isEnvelope) {
    const envData = resultsStore.fullEnvelope3D!;
    const envDiagram = envData[kind as keyof typeof envData] as import('../engine/types-3d').EnvelopeDiagramData3D | undefined;
    if (envDiagram && 'elements' in envDiagram) {
      ctx.diagramGroup = createEnvelopeDiagramGroup3D(
        modelStore.elements,
        modelStore.nodes,
        envDiagram,
        kind,
        resultsStore.diagramScale,
        resultsStore.showDiagramValues,
        leftHand,
        modelStore.sections,
      );
      ctx.resultsParent.add(ctx.diagramGroup);
    }
  } else {
    // Normal single diagram
    ctx.diagramGroup = createDiagramGroup3D(
      modelStore.elements,
      modelStore.nodes,
      r3d.elementForces,
      kind,
      resultsStore.diagramScale,
      resultsStore.showDiagramValues,
      leftHand,
      modelStore.sections,
    );
    ctx.resultsParent.add(ctx.diagramGroup);

    // Overlay diagram (comparison)
    const overlay3D = resultsStore.overlayResults3D;
    if (overlay3D) {
      ctx.overlayDiagramGroup = createDiagramGroup3D(
        modelStore.elements,
        modelStore.nodes,
        overlay3D.elementForces,
        kind,
        resultsStore.diagramScale,
        false, // don't show values on overlay to avoid clutter
        leftHand,
        modelStore.sections,
      );
      // Tint overlay with orange color
      ctx.overlayDiagramGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.color.setHex(0xFF8C00);
          mat.opacity = 0.2;
        } else if ((child as THREE.Line).isLine && (child as THREE.Line).material) {
          const mat = (child as THREE.Line).material as THREE.LineBasicMaterial;
          mat.color.setHex(0xFFA500);
        }
      });
      ctx.resultsParent.add(ctx.overlayDiagramGroup);
    }
  }
}

// ─── Color map (axialColor / colorMap) ──────────────────────

export function syncColorMap3D(ctx: ResultsSyncContext): void {
  if (!ctx.initialized) return;

  const r3d = resultsStore.results3D;
  const dt = resultsStore.diagramType;

  // Restore default state if not in color mode
  if (!r3d || (dt !== 'axialColor' && dt !== 'colorMap' && dt !== 'verification')) {
    if (ctx.colorMapApplied) {
      clearHeatmapMeshes(ctx);
      for (const [id, group] of ctx.elementGroups) {
        showOriginalMeshes(group, true);
        const elem = modelStore.elements.get(id);
        const baseColor = elem?.type === 'truss' ? COLORS.truss : COLORS.frame;
        const selected = uiStore.selectedElements.has(id);
        setGroupColor(group, selected ? COLORS.elementSelected : baseColor);
      }
      resetShellColors(ctx);
      ctx.colorMapApplied = false;
    }
    return;
  }

  // Build forces lookup
  const forcesMap = new Map<number, typeof r3d.elementForces[0]>();
  for (const ef of r3d.elementForces) {
    forcesMap.set(ef.elementId, ef);
  }

  if (dt === 'axialColor') {
    clearHeatmapMeshes(ctx);
    for (const [id, group] of ctx.elementGroups) {
      showOriginalMeshes(group, true);
      const ef = forcesMap.get(id);
      if (!ef) continue;
      const nAvg = (ef.nStart + ef.nEnd) / 2;
      setGroupColor(group, axialForceColor(nAvg));
    }
    resetShellColors(ctx);
    ctx.colorMapApplied = true;
  } else if (dt === 'colorMap') {
    const cmKind = resultsStore.colorMapKind;

    if (cmKind === 'shellVonMises') {
      // Shell-only mode: restore frame elements, apply shell heatmap
      clearHeatmapMeshes(ctx);
      for (const [id, group] of ctx.elementGroups) {
        showOriginalMeshes(group, true);
        setGroupColor(group, 0x888888); // dim frames
      }
      applyShellHeatmap(ctx, r3d);
    } else {
      // Continuous heatmap on frame elements
      resetShellColors(ctx);
      applyFrameHeatmap(ctx, forcesMap, cmKind as HeatmapVariable);
    }

    ctx.colorMapApplied = true;
  } else if (dt === 'verification') {
    // Verification status color map: flat per-element colors based on CIRSOC ratio
    clearHeatmapMeshes(ctx);
    for (const [id, group] of ctx.elementGroups) {
      showOriginalMeshes(group, true);
      const ratio = verificationStore.getMaxRatio(id);
      setGroupColor(group, verificationColor(ratio));
    }
    resetShellColors(ctx);
    ctx.colorMapApplied = true;
  }
}

// ─── Verification ratio labels ────────────────────────────────

/**
 * Show floating ratio labels (e.g. "0.87") on each element at its midpoint.
 * Only visible when diagramType === 'verification'.
 */
export function syncVerificationLabels(ctx: ResultsSyncContext): void {
  if (!ctx.initialized) return;

  // Remove old labels
  if (ctx.verificationLabelsGroup) {
    ctx.resultsParent.remove(ctx.verificationLabelsGroup);
    disposeObject(ctx.verificationLabelsGroup);
    ctx.verificationLabelsGroup = null;
  }

  if (resultsStore.diagramType !== 'verification' || !verificationStore.hasResults) return;

  const group = new THREE.Group();
  group.name = 'verification-labels';

  for (const [id] of ctx.elementGroups) {
    const ratio = verificationStore.getMaxRatio(id);
    if (ratio === null) continue;

    const elem = modelStore.elements.get(id);
    if (!elem) continue;
    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    // Position at element midpoint
    const mx = (nI.x + nJ.x) / 2;
    const my = (nI.y + nJ.y) / 2;
    const mz = ((nI.z ?? 0) + (nJ.z ?? 0)) / 2;

    // Color based on status
    const status = verificationStore.getStatus(id);
    const textColor = status === 'fail' ? '#ff4444' : status === 'warn' ? '#ffaa00' : '#44ff88';

    const sprite = createTextSprite(ratio.toFixed(2), textColor, 32);
    sprite.position.set(mx, my + 0.15, mz); // offset slightly above element
    sprite.scale.set(0.45, 0.45, 1);
    group.add(sprite);
  }

  ctx.verificationLabelsGroup = group;
  ctx.resultsParent.add(group);
}

// ─── Heatmap helpers ─────────────────────────────────────────

const SHELL_DEFAULT_COLOR = 0x4ecdc4;

/** Remove all heatmap overlay meshes from element groups */
function clearHeatmapMeshes(ctx: ResultsSyncContext): void {
  for (const [, group] of ctx.elementGroups) {
    const toRemove: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child.userData?.heatmapMesh) toRemove.push(child);
    });
    for (const obj of toRemove) {
      group.remove(obj);
      disposeObject(obj);
    }
  }
}

/** Show or hide original (non-heatmap) meshes in an element group */
function showOriginalMeshes(group: THREE.Group, visible: boolean): void {
  group.traverse((child) => {
    if (child === group) return;
    if (child.userData?.heatmapMesh) return;
    if (child.userData?.pickingHelper) return;
    child.visible = visible;
  });
}

/** Reset shell meshes to default teal */
function resetShellColors(ctx: ResultsSyncContext): void {
  for (const [, group] of ctx.shellGroups) {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geo = child.geometry;
        if (geo.hasAttribute('color')) geo.deleteAttribute('color');
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.vertexColors = false;
        mat.color.setHex(SHELL_DEFAULT_COLOR);
        mat.needsUpdate = true;
      }
    });
  }
}

/** Build section props for an element */
function getSectionProps(elemId: number) {
  const elem = modelStore.elements.get(elemId);
  if (!elem) return null;
  const sec = modelStore.sections.get(elem.sectionId);
  if (!sec) return null;
  const mat = modelStore.materials.get(elem.materialId);
  return {
    A: sec.a,
    Iz: sec.iz,
    Iy: sec.iy ?? sec.iz,
    h: sec.h ?? 0,
    b: sec.b ?? 0,
    fy: mat?.fy ?? 355_000,
  };
}

/**
 * Apply continuous per-vertex heatmap on frame elements.
 * Creates overlay cylinder meshes with color gradients along length.
 */
function applyFrameHeatmap(
  ctx: ResultsSyncContext,
  forcesMap: Map<number, import('../engine/types-3d').ElementForces3D>,
  variable: HeatmapVariable,
): void {
  // Remove old heatmap meshes first
  clearHeatmapMeshes(ctx);

  // Pass 1: sample values for all elements and find global max
  const elemSamples = new Map<number, number[]>();
  let globalMax = 0;

  for (const [id] of ctx.elementGroups) {
    const ef = forcesMap.get(id);
    if (!ef) continue;
    const sec = getSectionProps(id);
    if (!sec) continue;
    const values = sampleElementValues(ef, variable, sec);
    elemSamples.set(id, values);
    for (const v of values) {
      if (v > globalMax) globalMax = v;
    }
  }

  // For stressRatio, fix scale at 1.0 (100% of fy)
  if (variable === 'stressRatio') globalMax = Math.max(globalMax, 1.0);

  // Pass 2: create heatmap meshes (or restore visibility for skipped elements)
  for (const [id, group] of ctx.elementGroups) {
    const values = elemSamples.get(id);
    if (!values) {
      // Element has no sampled data — ensure originals stay visible (dimmed)
      showOriginalMeshes(group, true);
      setGroupColor(group, 0x555555);
      continue;
    }
    const ef = forcesMap.get(id);
    if (!ef) {
      showOriginalMeshes(group, true);
      setGroupColor(group, 0x555555);
      continue;
    }

    // Get node positions
    const elem = modelStore.elements.get(id);
    if (!elem) { showOriginalMeshes(group, true); setGroupColor(group, 0x555555); continue; }
    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) { showOriginalMeshes(group, true); setGroupColor(group, 0x555555); continue; }

    // Hide original mesh, show heatmap overlay
    showOriginalMeshes(group, false);

    const heatMesh = createHeatmapCylinder(ef.length, values, globalMax);
    // Node.z is optional (undefined when z===0), must default to 0
    orientHeatmapMesh(heatMesh,
      { x: nI.x, y: nI.y, z: nI.z ?? 0 },
      { x: nJ.x, y: nJ.y, z: nJ.z ?? 0 },
    );
    heatMesh.renderOrder = 2;
    group.add(heatMesh);
  }
}

/** Apply Von Mises heatmap on plates and quads */
function applyShellHeatmap(
  ctx: ResultsSyncContext,
  r3d: NonNullable<typeof resultsStore.results3D>,
): void {
  let globalMax = 0;
  const plateMap = new Map<number, number[]>();
  const quadMap = new Map<number, number[]>();

  if (r3d.plateStresses) {
    for (const ps of r3d.plateStresses) {
      // Use nodal values if available, otherwise uniform centroidal vonMises
      const nvm = ps.nodalVonMises?.length ? [...ps.nodalVonMises] : [ps.vonMises, ps.vonMises, ps.vonMises];
      plateMap.set(ps.elementId, nvm);
      for (const v of nvm) if (v > globalMax) globalMax = v;
    }
  }
  if (r3d.quadStresses) {
    for (const qs of r3d.quadStresses) {
      const nvm = qs.nodalVonMises?.length ? [...qs.nodalVonMises] : [qs.vonMises, qs.vonMises, qs.vonMises, qs.vonMises];
      quadMap.set(qs.elementId, nvm);
      for (const v of nvm) if (v > globalMax) globalMax = v;
    }
  }

  if (globalMax < 1e-10) {
    for (const [, group] of ctx.shellGroups) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.vertexColors = false;
          mat.color.setHex(0x888888);
          mat.needsUpdate = true;
        }
      });
    }
    return;
  }

  for (const [key, group] of ctx.shellGroups) {
    const isPlate = key.startsWith('p');
    const id = parseInt(key.substring(1));
    const nodalVM = isPlate ? plateMap.get(id) : quadMap.get(id);
    if (!nodalVM) continue;

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        applyShellVertexColors(child, nodalVM, globalMax, !isPlate);
      }
    });
  }
}

// ─── Reactions ───────────────────────────────────────────────

export function syncReactions(ctx: ResultsSyncContext): void {
  if (!ctx.initialized) return;

  if (ctx.reactionGroup) {
    ctx.resultsParent.remove(ctx.reactionGroup);
    disposeObject(ctx.reactionGroup);
    ctx.reactionGroup = null;
  }

  const r3d = resultsStore.results3D;
  if (!r3d || !resultsStore.showReactions) return;

  ctx.reactionGroup = new THREE.Group();
  ctx.reactionGroup.name = 'reactions';

  // Max reaction for scaling
  let maxR = 0;
  for (const r of r3d.reactions) {
    maxR = Math.max(maxR, Math.abs(r.fx), Math.abs(r.fy), Math.abs(r.fz));
  }
  if (maxR < 1e-10) maxR = 10;

  for (const r of r3d.reactions) {
    const node = modelStore.nodes.get(r.nodeId);
    if (!node) continue;
    const arrow = createReactionArrow(
      { x: node.x, y: node.y, z: node.z ?? 0 },
      r.fx, r.fy, r.fz,
      r.mx, r.my, r.mz,
      maxR,
    );
    ctx.reactionGroup.add(arrow);
  }

  ctx.resultsParent.add(ctx.reactionGroup);
}

// ─── Constraint Forces ───────────────────────────────────────

export function syncConstraintForces(ctx: ResultsSyncContext): void {
  if (!ctx.initialized) return;

  if (ctx.constraintForcesGroup) {
    ctx.resultsParent.remove(ctx.constraintForcesGroup);
    disposeObject(ctx.constraintForcesGroup);
    ctx.constraintForcesGroup = null;
  }

  const forces = resultsStore.constraintForces3D;
  if (!forces || forces.length === 0 || !resultsStore.showConstraintForces) return;

  ctx.constraintForcesGroup = new THREE.Group();
  ctx.constraintForcesGroup.name = 'constraintForces';

  // Max force for scaling (translational only)
  let maxF = 0;
  for (const cf of forces) {
    if (!cf.dof.startsWith('r')) {
      maxF = Math.max(maxF, Math.abs(cf.force));
    }
  }
  if (maxF < 1e-10) maxF = 10;

  // Group by nodeId so arrows at same node are positioned together
  const byNode = new Map<number, typeof forces>();
  for (const cf of forces) {
    let arr = byNode.get(cf.nodeId);
    if (!arr) { arr = []; byNode.set(cf.nodeId, arr); }
    arr.push(cf);
  }

  for (const [nodeId, cfs] of byNode) {
    const node = modelStore.nodes.get(nodeId);
    if (!node) continue;
    const pos = { x: node.x, y: node.y, z: node.z ?? 0 };

    for (const cf of cfs) {
      const arrow = createConstraintForceArrow(pos, cf.dof, cf.force, maxF);
      ctx.constraintForcesGroup.add(arrow);
    }
  }

  ctx.resultsParent.add(ctx.constraintForcesGroup);
}

// ─── Labels (node/element IDs, lengths) ─────────────────────

export function syncLabels3D(ctx: ResultsSyncContext): void {
  if (!ctx.initialized) return;

  // Clear old labels
  if (ctx.nodeLabelsGroup) {
    ctx.scene.remove(ctx.nodeLabelsGroup);
    disposeObject(ctx.nodeLabelsGroup);
    ctx.nodeLabelsGroup = null;
  }
  if (ctx.elementLabelsGroup) {
    ctx.scene.remove(ctx.elementLabelsGroup);
    disposeObject(ctx.elementLabelsGroup);
    ctx.elementLabelsGroup = null;
  }
  if (ctx.lengthLabelsGroup) {
    ctx.scene.remove(ctx.lengthLabelsGroup);
    disposeObject(ctx.lengthLabelsGroup);
    ctx.lengthLabelsGroup = null;
  }

  // Compute model size for sprite scaling
  const box = new THREE.Box3();
  for (const [, node] of modelStore.nodes) {
    box.expandByPoint(new THREE.Vector3(node.x, node.y, node.z ?? 0));
  }
  const size = box.getSize(new THREE.Vector3());
  const modelSize = Math.max(size.x, size.y, size.z, 1);
  const spriteScale = modelSize * 0.025;

  // Node labels
  if (uiStore.showNodeLabels3D && modelStore.nodes.size > 0) {
    ctx.nodeLabelsGroup = new THREE.Group();
    ctx.nodeLabelsGroup.name = 'nodeLabels';

    for (const [id, node] of modelStore.nodes) {
      const sprite = createTextSprite(String(id), '#ffffff', 28);
      sprite.position.set(
        node.x + spriteScale * 0.3,
        node.y + spriteScale * 0.5,
        (node.z ?? 0),
      );
      sprite.scale.set(spriteScale, spriteScale, 1);
      ctx.nodeLabelsGroup.add(sprite);
    }
    ctx.scene.add(ctx.nodeLabelsGroup);
  }

  // Element labels
  if (uiStore.showElementLabels3D && modelStore.elements.size > 0) {
    ctx.elementLabelsGroup = new THREE.Group();
    ctx.elementLabelsGroup.name = 'elementLabels';

    for (const [id, elem] of modelStore.elements) {
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;

      // Midpoint
      const mx = (nI.x + nJ.x) / 2;
      const my = (nI.y + nJ.y) / 2;
      const mz = ((nI.z ?? 0) + (nJ.z ?? 0)) / 2;

      const sprite = createTextSprite(String(id), '#88ccff', 24);
      sprite.position.set(mx, my + spriteScale * 0.3, mz);
      sprite.scale.set(spriteScale * 0.8, spriteScale * 0.8, 1);
      ctx.elementLabelsGroup.add(sprite);
    }
    ctx.scene.add(ctx.elementLabelsGroup);
  }

  // Length labels
  if (uiStore.showLengths3D && modelStore.elements.size > 0) {
    ctx.lengthLabelsGroup = new THREE.Group();
    ctx.lengthLabelsGroup.name = 'lengthLabels';

    for (const [, elem] of modelStore.elements) {
      const nI = modelStore.nodes.get(elem.nodeI);
      const nJ = modelStore.nodes.get(elem.nodeJ);
      if (!nI || !nJ) continue;

      const dx = nJ.x - nI.x;
      const dy = nJ.y - nI.y;
      const dz = (nJ.z ?? 0) - (nI.z ?? 0);
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const mx = (nI.x + nJ.x) / 2;
      const my = (nI.y + nJ.y) / 2 - spriteScale * 0.3;
      const mz = ((nI.z ?? 0) + (nJ.z ?? 0)) / 2;

      const sprite = createTextSprite(`${len.toFixed(2)} m`, '#88cc88', 22);
      sprite.position.set(mx, my, mz);
      sprite.scale.set(spriteScale * 0.7, spriteScale * 0.7, 1);
      ctx.lengthLabelsGroup.add(sprite);
    }
    ctx.scene.add(ctx.lengthLabelsGroup);
  }
}
