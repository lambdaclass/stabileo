// Results synchronization for Viewport3D — diagrams, deformed shape, reactions, labels, color maps
// Extracted from Viewport3D.svelte to reduce file size and improve modularity.
//
// Exports:
//   - ResultsSyncContext (interface)
//   - DIAGRAM_3D_TYPES (constant)
//   - syncDeformed(), syncDiagrams3D(), syncColorMap3D(), syncReactions(), syncLabels3D()

import * as THREE from 'three';
import { modelStore, uiStore, resultsStore } from '../store';
import { createDeformedLines, type ElementEI } from '../three/deformed-shape-3d';
import { createDiagramGroup3D, createEnvelopeDiagramGroup3D } from '../three/diagram-render-3d';
import { COLORS, setGroupColor, disposeObject, heatmapColor, axialForceColor, createTextSprite } from '../three/selection-helpers';
import { createReactionArrow } from '../three/create-load-arrow';
import { computeElementStress3D } from '../engine/section-stress-3d';
import type { Diagram3DKind } from '../engine/diagrams-3d';

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

  // Results groups (replaced on each sync)
  deformedGroup: THREE.Group | null;
  diagramGroup: THREE.Group | null;
  overlayDiagramGroup: THREE.Group | null;
  reactionGroup: THREE.Group | null;
  nodeLabelsGroup: THREE.Group | null;
  elementLabelsGroup: THREE.Group | null;
  lengthLabelsGroup: THREE.Group | null;

  // Mutable state flags
  lastDeformedAnimScale: number | null;
  colorMapApplied: boolean;
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

  // Restore element opacity when not showing deformed shape
  const showingDeformed = resultsStore.results3D && resultsStore.diagramType === 'deformed';
  for (const group of ctx.elementGroups.values()) {
    group.traverse((child) => {
      // Skip invisible picking helpers — they must stay transparent
      if (child.userData?.pickingHelper) return;
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

  const r3d = resultsStore.results3D;
  if (!r3d || resultsStore.diagramType !== 'deformed') return;

  // Use override scale (from animation loop) or store scale (from slider)
  const scale = scaleOverride ?? resultsStore.deformedScale;

  // Build EI map for particular solution (intra-element deflection from loads)
  // Direct mapping: EIy = E·Iy (about Y horizontal), EIz = E·Iz (about Z vertical)
  const eiMap = new Map<number, ElementEI>();
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

  ctx.deformedGroup = createDeformedLines(
    modelStore.elements,
    modelStore.nodes,
    r3d.displacements,
    r3d.elementForces,
    scale,
    eiMap,
    uiStore.axisConvention3D === 'leftHand',
  );
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

  // Restore default colors if not in color mode
  if (!r3d || (dt !== 'axialColor' && dt !== 'colorMap')) {
    if (ctx.colorMapApplied) {
      for (const [id, group] of ctx.elementGroups) {
        const elem = modelStore.elements.get(id);
        const baseColor = elem?.type === 'truss' ? COLORS.truss : COLORS.frame;
        const selected = uiStore.selectedElements.has(id);
        setGroupColor(group, selected ? COLORS.elementSelected : baseColor);
      }
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
    // Color by axial force: tension=red, compression=blue
    for (const [id, group] of ctx.elementGroups) {
      const ef = forcesMap.get(id);
      if (!ef) continue;
      const nAvg = (ef.nStart + ef.nEnd) / 2;
      setGroupColor(group, axialForceColor(nAvg));
    }
    ctx.colorMapApplied = true;
  } else if (dt === 'colorMap') {
    // Color by selected variable (moment, shear, axial, stressRatio)
    const cmKind = resultsStore.colorMapKind;

    // Compute values for normalization
    const values = new Map<number, number>();
    let maxVal = 0;

    for (const [id] of ctx.elementGroups) {
      const ef = forcesMap.get(id);
      if (!ef) continue;

      let val: number;
      switch (cmKind) {
        case 'moment':
          val = Math.max(Math.abs(ef.mzStart), Math.abs(ef.mzEnd),
                        Math.abs(ef.myStart), Math.abs(ef.myEnd));
          break;
        case 'shear':
          val = Math.max(Math.abs(ef.vyStart), Math.abs(ef.vyEnd),
                        Math.abs(ef.vzStart), Math.abs(ef.vzEnd));
          break;
        case 'axial':
          val = Math.max(Math.abs(ef.nStart), Math.abs(ef.nEnd));
          break;
        case 'stressRatio': {
          const elem = modelStore.elements.get(id);
          if (!elem) { val = 0; break; }
          const sec = modelStore.sections.get(elem.sectionId);
          if (!sec) { val = 0; break; }
          const stress = computeElementStress3D(
            ef, sec.a, sec.iz, sec.iy ?? sec.iz,
            sec.h ?? 0, sec.b ?? 0,
          );
          val = stress.max.ratio;
          break;
        }
      }
      values.set(id, val);
      if (val > maxVal) maxVal = val;
    }

    // Apply colors (neutral gray when all values are ~0, e.g. moment on truss-only models)
    for (const [id, group] of ctx.elementGroups) {
      const val = values.get(id) ?? 0;
      const norm = maxVal > 1e-10 ? val / maxVal : 0;
      setGroupColor(group, maxVal > 1e-10 ? heatmapColor(norm) : 0x888888);
    }
    ctx.colorMapApplied = true;
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
