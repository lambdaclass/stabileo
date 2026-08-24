// Results synchronization for Viewport3D — diagrams, deformed shape, reactions, labels, color maps
// Extracted from Viewport3D.svelte to reduce file size and improve modularity.
//
// Exports:
//   - ResultsSyncContext (interface)
//   - DIAGRAM_3D_TYPES (constant)
//   - syncDeformed(), syncDiagrams3D(), syncColorMap3D(), syncVerificationLabels(), syncReactions(), syncConstraintForces(), syncLabels3D()

import * as THREE from 'three';
import { modelStore, uiStore, resultsStore } from '../store';
import { forEachElementVisual } from './scene-sync';
export { forEachElementVisual };
import { colourScaleSource } from '../store/result-view';
import { createDeformedLines, type ElementEI } from '../three/deformed-shape-3d';
import { createDiagramGroup3D, createEnvelopeDiagramGroup3D } from '../three/diagram-render-3d';
import { createDespiece3DGroup } from '../three/despiece-3d';
import { COLORS, setGroupColor, disposeObject, axialForceColor, verificationStateColor, createTextSpriteCached, heatmapColor } from '../three/selection-helpers';
import { verificationStore } from '../store/verification.svelte';
import { createReactionArrow, createConstraintForceArrow } from '../three/create-load-arrow';
import type { Diagram3DKind } from '../engine/diagrams-3d';
import type { Displacement3D } from '../engine/types-3d';
import { sampleElementValues, createHeatmapCylinder, orientHeatmapMesh, applyShellVertexColors, applyShellFlatColor, divergingColor, type HeatmapVariable } from '../three/stress-heatmap';
import { colourMapUnit } from '../three/colour-ramp';
import { shearPeakFactor } from '../engine/section-stress';
import { restoreShellColor } from '../three/create-shell-mesh';
import { shellComponentMeta, shellComponentValue, shellComponentRange } from '../engine/shell-stress';
import { getCachedProjectModelToXZ, projectNodeToScene, shouldProjectModelToXZ } from '../geometry/coordinate-system';

/** Cached shouldProjectModelToXZ, keyed on modelVersion + analysisMode + presentation. */
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

export const DIAGRAM_3D_TYPES: Set<string> = new Set(['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion']);

/** Build a node map projected to scene coordinates (handles 2D→XZ swap for embedded models). */
let projectedNodesCache: { key: string; map: Map<number, { id: number; x: number; y: number; z?: number }> } | null = null;

function getProjectedNodes(): Map<number, { id: number; x: number; y: number; z?: number }> {
  const project2D = projectFlag();
  // Node coords only change with modelVersion — one rebuild per edit total,
  // not one per animation frame / per results publish.
  const key = `${modelStore.modelVersion}|${project2D}`;
  if (projectedNodesCache?.key === key) return projectedNodesCache.map;
  const projected = new Map<number, { id: number; x: number; y: number; z?: number }>();
  for (const [id, n] of modelStore.nodes) {
    const p = projectNodeToScene(n, project2D);
    projected.set(id, { id, x: p.x, y: p.y, z: p.z });
  }
  projectedNodesCache = { key, map: projected };
  return projected;
}

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

  // Batched wireframe mesh — needed so axialColor / colorMap / verification
  // colors propagate to the visible primary in wireframe render mode (where
  // elementGroups are empty and setGroupColor is a no-op).
  elementsBatched: import('../three/elements-batched').ElementsBatched;

  // Shell groups (needed for shell stress heatmap) — key: "p{id}" or "q{id}"
  shellGroups: Map<string, THREE.Group>;

  // Results groups (replaced on each sync)
  deformedGroup: THREE.Group | null;
  diagramGroup: THREE.Group | null;
  overlayDiagramGroup: THREE.Group | null;
  despieceGroup: THREE.Group | null;
  reactionGroup: THREE.Group | null;
  constraintForcesGroup: THREE.Group | null;
  nodeLabelsGroup: THREE.Group | null;
  elementLabelsGroup: THREE.Group | null;
  lengthLabelsGroup: THREE.Group | null;
  verificationLabelsGroup: THREE.Group | null;

  // Mutable state flags
  lastDeformedAnimScale: number | null;
  lastDespieceSep: number | null;
  colorMapApplied: boolean;
}

/** Compute the diagonal of the structure's bounding box (for mode shape scaling). */
function computeStructureBBox(): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const project2D = projectFlag();
  for (const n of modelStore.nodes.values()) {
    const p = projectNodeToScene(n, project2D);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
}

// ─── Deformed shape ──────────────────────────────────────────

export function syncDeformed(ctx: ResultsSyncContext, scaleOverride?: number): void {
  if (!ctx.initialized) return;

  const dt = resultsStore.diagramType;
  const isDeformedLike = dt === 'deformed' || dt === 'modeShape' || dt === 'bucklingMode';

  // Restore element opacity when not showing deformed shape
  const showingDeformed = resultsStore.results3D && isDeformedLike;
  for (const group of ctx.elementGroups.values()) {
    group.traverse((child) => {
      // Skip picking helpers, heatmap overlays and section edge outlines —
      // they manage their own state (the edge material is transparent at a
      // fixed 0.55; restoring it to opaque would permanently destroy it).
      if (child.userData?.pickingHelper) return;
      if (child.userData?.heatmapMesh) return;
      if (child.userData?.sectionEdge) return;
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

  /**
   * Nothing to draw means the old shape has to GO, not merely stop updating.
   *
   * Every branch below bailed with a bare `return` when its data was missing —
   * and the code that removes the previous group sits after them, on the path
   * where the data changed. So going from "deformed on screen" to "no results"
   * left the group in the scene: load a second model over a solved one and the
   * previous structure's deformed shape stayed floating over it, at full size,
   * while the status bar reported the new model's three nodes. `clear()` had
   * dropped the results correctly; the scene was never told.
   */
  function dropDeformed(): void {
    if (!ctx.deformedGroup) return;
    ctx.resultsParent.remove(ctx.deformedGroup);
    disposeObject(ctx.deformedGroup);
    ctx.deformedGroup = null;
  }

  if (dt === 'deformed') {
    const r3d = resultsStore.results3D;
    if (!r3d) { dropDeformed(); return; }
    displacements = r3d.displacements;
    // Scale x1 = true physical deformation (1:1). No auto-amplification.
    // The user increases the scale slider to amplify if needed.
  } else if (dt === 'modeShape') {
    const modal = resultsStore.modalResult3D;
    if (!modal || !modal.modes.length) { dropDeformed(); return; }
    const mode = modal.modes[resultsStore.activeModeIndex];
    if (!mode) { dropDeformed(); return; }
    // Scale mode shapes relative to structure size (eigenvectors are normalized to max=1)
    const structureSize = computeStructureBBox();
    const modeScale = structureSize * 0.15 * (scale / 100);
    scale = modeScale * Math.sin(performance.now() / 500);
    displacements = mode.displacements;
    modeColor = 0x7fd4cc; // --st-value
  } else if (dt === 'bucklingMode') {
    const buckling = resultsStore.bucklingResult3D;
    if (!buckling || !buckling.modes.length) { dropDeformed(); return; }
    const mode = buckling.modes[resultsStore.activeBucklingMode];
    if (!mode) { dropDeformed(); return; }
    // Scale buckling modes relative to structure size (eigenvectors are normalized to max=1)
    const structureSize = computeStructureBBox();
    const modeScale = structureSize * 0.15 * (scale / 100);
    scale = modeScale * Math.sin(performance.now() / 500);
    displacements = mode.displacements;
    modeColor = 0xd9a441; // --st-warn
  } else {
    // Any other diagram — including 'none' after a model swap.
    dropDeformed();
    return;
  }

  if (!displacements) { dropDeformed(); return; }

  // In-place scale update when the underlying data is unchanged: the group
  // carries preallocated base/displacement buffers and a setScale() that
  // rewrites positions without rebuilding any geometry (previously every
  // animation frame disposed and recreated the whole group per element).
  const r3d = resultsStore.results3D;
  const sigDt = dt;
  const sigDisp = displacements;
  const sigForces = dt === 'deformed' && r3d ? r3d.elementForces : null;
  const sigVer = modelStore.modelVersion;
  const sigHand = uiStore.axisConvention3D === 'leftHand';
  const prev = ctx.deformedGroup?.userData;
  if (ctx.deformedGroup && prev?.sigDt === sigDt && prev?.sigDisp === sigDisp
      && prev?.sigForces === sigForces && prev?.sigVer === sigVer && prev?.sigHand === sigHand) {
    prev.setScale(scale);
    prev.material.color.setHex(modeColor ?? COLORS.deformed);
    ctx.resultsParent.add(ctx.deformedGroup);
    return;
  }

  // Remove old deformed — the data actually changed, rebuild is required.
  if (ctx.deformedGroup) {
    ctx.resultsParent.remove(ctx.deformedGroup);
    disposeObject(ctx.deformedGroup);
    ctx.deformedGroup = null;
  }

  // Build EI map for particular solution (only for static deformed — modes don't need it)
  let eiMap: Map<number, ElementEI> | undefined;
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
    getProjectedNodes(),
    displacements,
    dt === 'deformed' && r3d ? r3d.elementForces : [],
    scale,
    eiMap,
    sigHand,
    modelStore.sections,
  );
  if (modeColor !== null) {
    ctx.deformedGroup.userData.material.color.setHex(modeColor);
  }
  ctx.deformedGroup.userData.sigDt = sigDt;
  ctx.deformedGroup.userData.sigDisp = sigDisp;
  ctx.deformedGroup.userData.sigForces = sigForces;
  ctx.deformedGroup.userData.sigVer = sigVer;
  ctx.deformedGroup.userData.sigHand = sigHand;

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
  const projectedNodes = getProjectedNodes();

  // Check if envelope dual curves should be rendered
  const isEnvelope = resultsStore.isEnvelopeActive && resultsStore.fullEnvelope3D;
  if (isEnvelope) {
    const envData = resultsStore.fullEnvelope3D!;
    const envDiagram = envData[kind as keyof typeof envData] as import('../engine/types-3d').EnvelopeDiagramData3D | undefined;
    if (envDiagram && 'elements' in envDiagram) {
      ctx.diagramGroup = createEnvelopeDiagramGroup3D(
        modelStore.elements,
        projectedNodes,
        envDiagram,
        kind,
        resultsStore.diagramScale,
        resultsStore.showDiagramValues,
        leftHand,
        modelStore.sections,
        resultsStore.drawPositiveTowardLocalAxes,
      );
      ctx.resultsParent.add(ctx.diagramGroup);
    }
  } else {
    // Normal single diagram
    ctx.diagramGroup = createDiagramGroup3D(
      modelStore.elements,
      projectedNodes,
      r3d.elementForces,
      kind,
      resultsStore.diagramScale,
      resultsStore.showDiagramValues,
      leftHand,
      modelStore.sections,
      resultsStore.drawPositiveTowardLocalAxes,
    );
    ctx.resultsParent.add(ctx.diagramGroup);

    // Overlay diagram (comparison)
    const overlay3D = resultsStore.overlayResults3D;
    if (overlay3D) {
      ctx.overlayDiagramGroup = createDiagramGroup3D(
        modelStore.elements,
        projectedNodes,
        overlay3D.elementForces,
        kind,
        resultsStore.diagramScale,
        false, // don't show values on overlay to avoid clutter
        leftHand,
        modelStore.sections,
        resultsStore.drawPositiveTowardLocalAxes,
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
  const wireframe = uiStore.renderMode3D === 'wireframe';
  const eb = ctx.elementsBatched;

  // Restore default state if not in color mode
  if (!r3d || (dt !== 'axialColor' && dt !== 'colorMap' && dt !== 'verification')) {
    if (ctx.colorMapApplied) {
      clearHeatmapMeshes(ctx);
      forEachElementVisual(ctx, (id, group) => {
        if (group) showOriginalMeshes(group, true);
        const elem = modelStore.elements.get(id);
        const isTruss = elem?.type === 'truss';
        const wireBaseColor = isTruss ? COLORS.truss : COLORS.frameWire;
        const baseColor = wireframe ? wireBaseColor : (isTruss ? COLORS.truss : COLORS.frame);
        const selected = uiStore.selectedElements.has(id);
        const finalColor = selected ? COLORS.elementSelected : baseColor;
        if (group) setGroupColor(group, finalColor);
        // Sync batched mesh too — wireframe primary needs explicit reset
        // since the per-group color path doesn't reach the LineSegments2.
        eb.setBaseColor(id, finalColor);
      });
      eb.flush();
      resetShellColors(ctx);
      ctx.colorMapApplied = false;
    }
    resultsStore.setColourScale(null);
    return;
  }

  // Build forces lookup
  const forcesMap = new Map<number, typeof r3d.elementForces[0]>();
  for (const ef of r3d.elementForces) {
    forcesMap.set(ef.elementId, ef);
  }

  if (dt === 'axialColor') {
    clearHeatmapMeshes(ctx);
    forEachElementVisual(ctx, (id, group) => {
      if (group) showOriginalMeshes(group, true);
      const ef = forcesMap.get(id);
      if (!ef) return;
      const nAvg = (ef.nStart + ef.nEnd) / 2;
      const c = axialForceColor(nAvg);
      if (group) setGroupColor(group, c);
      // The batched wireframe primary is where a plain member's colour lives:
      // without this, axial colours are silently invisible in wireframe.
      eb.setBaseColor(id, c);
    });
    eb.flush();
    resetShellColors(ctx);
    // Member colour is a two-colour key, not a scale: the tension/compression
    // legend says everything there is to say and a gradient bar would be a
    // second, wrong story about the same picture.
    resultsStore.setColourScale(null);
    ctx.colorMapApplied = true;
  } else if (dt === 'colorMap') {
    const cmKind = resultsStore.colorMapKind;

    if (cmKind === 'shellVonMises' || cmKind === 'shellBending') {
      // Shell-only mode: restore frame elements, paint shells by the selected
      // contour component (Von Mises / principal / σ / moment).
      clearHeatmapMeshes(ctx);
      forEachElementVisual(ctx, (id, group) => {
        if (group) {
          showOriginalMeshes(group, true);
          setGroupColor(group, 0x888888); // dim frames
        }
        eb.setBaseColor(id, 0x888888);
      });
      eb.flush();
      applyShellContour(ctx, r3d);
    } else {
      // Continuous heatmap on frame elements. applyFrameHeatmap also mirrors
      // the SELECTED variable's color onto the batched wireframe mesh (and
      // flushes), so wireframe mode shows the right gradient — not axial force.
      resetShellColors(ctx);
      applyFrameHeatmap(ctx, forcesMap, cmKind as HeatmapVariable);
    }

    ctx.colorMapApplied = true;
  } else if (dt === 'verification') {
    // Verification status color map: flat per-element colors based on CIRSOC ratio
    clearHeatmapMeshes(ctx);
    // THREE HONEST STATES: current / stale / unavailable. The previous code read
    // `designMap` (the auto-design baseline, which is "designed to pass" by
    // construction) and therefore stayed green after a user weakened rebar.
    forEachElementVisual(ctx, (id, group) => {
      if (group) showOriginalMeshes(group, true);
      const ds = verificationStore.getDisplayStatus(id);
      const state = ds === 'unavailable' ? 'unavailable' : ds === 'stale' ? 'stale' : 'current';
      const ratio = state === 'unavailable' ? null : verificationStore.getDisplayRatio(id);
      const c = verificationStateColor(ratio, state);
      if (group) setGroupColor(group, c);
      eb.setBaseColor(id, c);
    });
    eb.flush();
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

  if (resultsStore.diagramType !== 'verification') return;
  if (!verificationStore.hasResults && !verificationStore.hasDemandData) return;

  const project2D = projectFlag();

  const group = new THREE.Group();
  group.name = 'verification-labels';

  // Same partial-registry trap as the colour maps: in wireframe the labels
  // would appear only on the handful of members that happen to have a group.
  forEachElementVisual(ctx, (id) => {
    const ds = verificationStore.getDisplayStatus(id);
    if (ds === 'unavailable') return;
    const ratio = verificationStore.getDisplayRatio(id);
    if (ratio === null) return;

    const elem = modelStore.elements.get(id);
    if (!elem) return;
    const nI = modelStore.nodes.get(elem.nodeI);
    const nJ = modelStore.nodes.get(elem.nodeJ);
    if (!nI || !nJ) return;

    // Position at element midpoint (projected to scene coordinates)
    const sceneI = projectNodeToScene(nI, project2D);
    const sceneJ = projectNodeToScene(nJ, project2D);
    const mx = (sceneI.x + sceneJ.x) / 2;
    const my = (sceneI.y + sceneJ.y) / 2;
    const mz = (sceneI.z + sceneJ.z) / 2;

    // Colour + glyph carry the state so it is never colour-only (a11y).
    const status = verificationStore.getStatus(id);
    const baseColor = status === 'fail' ? '#ff4444' : status === 'warn' ? '#ffaa00' : '#44ff88';
    const textColor = ds === 'stale' ? '#b9b9a8' : baseColor;
    const glyph = ds === 'stale' ? '⌛ ' : status === 'fail' ? '✗ ' : status === 'warn' ? '⚠ ' : '';

    const sprite = createTextSpriteCached(`${glyph}${ratio.toFixed(2)}`, textColor, 32);
    sprite.position.set(mx, my + 0.15, mz); // offset slightly above element
    sprite.scale.set(0.45, 0.45, 1);
    group.add(sprite);
  });

  ctx.verificationLabelsGroup = group;
  ctx.resultsParent.add(group);
}

// ─── Heatmap helpers ─────────────────────────────────────────

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
    // Clear any contour vertex-colour, then restore the per-material base
    // colour stored on the group at creation (CP1).
    group.traverse((child) => {
      // Only the shell FACE mesh carries a contour colour + its own material.
      // Restrict the mutation to it so a non-owning child (were one ever added)
      // can't have its material altered.
      if (child instanceof THREE.Mesh && child.userData.shellFace) {
        const geo = child.geometry;
        if (geo.hasAttribute('color')) geo.deleteAttribute('color');
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.vertexColors = false;
        // Restore the mode's base look (contour may have forced it opaque).
        if (child.userData.baseOpacity !== undefined) {
          mat.opacity = child.userData.baseOpacity;
          mat.transparent = child.userData.baseTransparent;
          mat.depthWrite = child.userData.baseDepthWrite;
        }
        mat.needsUpdate = true;
      }
    });
    restoreShellColor(group);
  }
}

/** Build section props for an element */
export function getSectionProps(elemId: number) {
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
    /*
     * The section's own shear form factor, resolved once here rather than per
     * vertex: `sampleValue` runs 17 times per member per load case, and this
     * needs the profile catalogue. `shearPeakFactor` caches per section too.
     */
    shearFactor: shearPeakFactor(sec),
    /*
     * fy arrives in MPa (the model store's unit) and the section-stress
     * evaluation works in kPa (kN/m²) — feeding one into the other made every
     * utilisation a thousand times too small. Null when the material has no
     * yield strength: the stressRatio painter skips the member rather than
     * grade it against a steel strength nobody entered.
     */
    fy: mat?.fy ? mat.fy * 1000 : null,
  };
}

/**
 * What the legend publishes for a frame heat map, or null when nothing is
 * painted.
 *
 * The map normalises in the units the sampling produces — kN, kN·m, and kPa
 * for the stresses, which come straight from `computeSectionStress`. The
 * legend labels stresses MPa, so the conversion happens HERE, at publish
 * time: the one place the number and its unit are decided together. Keeping
 * the internal normalisation in kPa and converting only what is published is
 * what keeps the painted gradient and the legend from drifting a factor of
 * 1000 apart.
 */
export function publishedHeatmapScale(
  variable: HeatmapVariable,
  globalMax: number,
): { max: number; unit: string; source: string } | null {
  if (globalMax <= 1e-10) return null;
  const isStress = variable === 'vonMises' || variable === 'sigmaMax' || variable === 'tauMax';
  return {
    max: isStress ? globalMax / 1000 : globalMax,
    unit: colourMapUnit(variable),
    source: colourScaleSource(),
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

  const project2D = projectFlag();

  // Pass 1: sample values for all elements and find global max
  const elemSamples = new Map<number, number[]>();
  let globalMax = 0;

  /*
   * Sampled for every element on screen, not only the ones with a group.
   *
   * In wireframe almost none has a group, so this pass collected nothing and
   * `globalMax` stayed zero: the heat map painted a uniform nothing, which is
   * the same partial-registry trap the flat colour maps fell into. The comment
   * below about mirroring onto the batched mesh was true and useless — it
   * mirrored an empty sample set.
   */
  forEachElementVisual(ctx, (id) => {
    const ef = forcesMap.get(id);
    if (!ef) return;
    const sec = getSectionProps(id);
    if (!sec) return;
    /*
     * Utilisation divides by fy, so a member whose material has none cannot
     * be painted honestly — substituting a default strength graded a concrete
     * member against steel nobody entered, while the panel warned the measure
     * "cannot be computed". Skip it, as the 2D map does.
     */
    if (variable === 'stressRatio' && sec.fy === null) return;
    const values = sampleElementValues(ef, variable, sec);
    elemSamples.set(id, values);
    for (const v of values) {
      if (v > globalMax) globalMax = v;
    }
  });

  /*
   * Utilisation is read against a FIXED scale: 1.00 is the limit, whatever
   * the model, and a ratio past it is off the scale — painted magenta by the
   * shared ramp, never "red, but more so". Letting the maximum stretch the
   * scale (as the other variables do) would paint a member at 140% of fy with
   * the same red as one at 100%.
   */
  if (variable === 'stressRatio') globalMax = 1.0;

  // What the legend shows, published from where the maximum is decided.
  resultsStore.setColourScale(publishedHeatmapScale(variable, globalMax));

  // Pass 2: create heatmap meshes (or restore visibility for skipped elements)
  // The textured cylinder is the solid-mode representation, so it is built
  // only where there is a group to hang it on. Wireframe gets its colour from
  // the batched mesh below.
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
    const sceneI = projectNodeToScene(nI, project2D);
    const sceneJ = projectNodeToScene(nJ, project2D);
    orientHeatmapMesh(heatMesh, sceneI, sceneJ);
    heatMesh.renderOrder = 2;
    group.add(heatMesh);
  }

  // Mirror the heatmap color onto the batched wireframe mesh so wireframe mode
  // shows the SELECTED variable's gradient (one representative color per element)
  // instead of always axial force. Uses the same heatmapColor/globalMax mapping
  // as the textured cylinders above.
  forEachElementVisual(ctx, (id) => {
    const values = elemSamples.get(id);
    if (!values || values.length === 0) {
      ctx.elementsBatched.setBaseColor(id, 0x555555);
      return;
    }
    let peak = 0;
    for (const v of values) if (v > peak) peak = v;
    // Unclamped on purpose: past the top of the scale the shared ramp answers
    // magenta (utilisation over fy), which clamping to 1 would paint as red.
    const norm = globalMax > 0 ? peak / globalMax : 0;
    ctx.elementsBatched.setBaseColor(id, heatmapColor(norm));
  });
  ctx.elementsBatched.flush();
}

/** Paint plates + quads by the selected shell contour component.
 *  - 'vonMises' uses per-node values when available (smooth gradient).
 *  - all other components are reported only at element level → flat per-element
 *    colour, signed components on a diverging blue↔red scale. */
function applyShellContour(
  ctx: ResultsSyncContext,
  r3d: NonNullable<typeof resultsStore.results3D>,
): void {
  const component = resultsStore.shellContourComponent;
  const meta = shellComponentMeta(component);

  const plateById = new Map<number, NonNullable<typeof r3d.plateStresses>[number]>();
  const quadById = new Map<number, NonNullable<typeof r3d.quadStresses>[number]>();
  for (const ps of r3d.plateStresses ?? []) plateById.set(ps.elementId, ps);
  for (const qs of r3d.quadStresses ?? []) quadById.set(qs.elementId, qs);
  const all = [...(r3d.plateStresses ?? []), ...(r3d.quadStresses ?? [])];
  if (all.length === 0) return;

  // ── Von Mises: nodal-smoothed vertex colours (best-quality default) ──
  if (component === 'vonMises') {
    let globalMax = 0;
    const nodalById = new Map<string, number[]>();
    for (const ps of r3d.plateStresses ?? []) {
      const nvm = ps.nodalVonMises?.length ? [...ps.nodalVonMises] : [ps.vonMises, ps.vonMises, ps.vonMises];
      nodalById.set(`p${ps.elementId}`, nvm);
      for (const v of nvm) if (v > globalMax) globalMax = v;
    }
    for (const qs of r3d.quadStresses ?? []) {
      const nvm = qs.nodalVonMises?.length ? [...qs.nodalVonMises] : [qs.vonMises, qs.vonMises, qs.vonMises, qs.vonMises];
      nodalById.set(`q${qs.elementId}`, nvm);
      for (const v of nvm) if (v > globalMax) globalMax = v;
    }
    for (const [key, group] of ctx.shellGroups) {
      const nodalVM = nodalById.get(key);
      if (!nodalVM) continue;
      const isQuad = key.startsWith('q');
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData?.shellFace) {
          applyShellVertexColors(child, nodalVM, globalMax || 1, isQuad);
        }
      });
    }
    return;
  }

  // ── Other components: flat per-element colour ──
  const { min, max } = shellComponentRange(all, component);
  const A = meta.signed ? Math.max(Math.abs(min), Math.abs(max)) : Math.max(max, 1e-12);
  for (const [key, group] of ctx.shellGroups) {
    const isPlate = key.startsWith('p');
    const id = parseInt(key.substring(1));
    const s = isPlate ? plateById.get(id) : quadById.get(id);
    if (!s) continue;
    const v = shellComponentValue(s, component);
    const norm = A > 1e-12 ? v / A : 0;
    const hex = meta.signed ? divergingColor(norm) : heatmapColor(Math.max(0, norm));
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData?.shellFace) applyShellFlatColor(child, hex);
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
  // In despiece the free-body overlay draws each reaction ONCE — don't double them.
  if (!r3d || !resultsStore.showReactions || resultsStore.diagramType === 'despiece') return;

  const project2D = projectFlag();

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
    const pos = projectNodeToScene(node, project2D);
    const arrow = createReactionArrow(
      pos,
      r.fx, r.fy, r.fz,
      r.mx, r.my, r.mz,
      maxR,
    );
    ctx.reactionGroup.add(arrow);
  }

  ctx.resultsParent.add(ctx.reactionGroup);
}

// ─── Despiece / Free-body view (3D) ──────────────────────────

/** Sync the 3D despiece overlay to separation `sep` (0..1). The overlay is built
 *  ONCE (per results/model change) and the pull-apart is animated in place via
 *  the group's `despieceUpdate` hook — so animation frames do no allocation (no
 *  rebuilt geometries/materials/text-sprites). No-op without solved results. */
export function syncDespiece3D(ctx: ResultsSyncContext, sep: number): void {
  if (!ctx.initialized) return;
  const r3d = resultsStore.results3D;
  if (!r3d || !r3d.elementForces?.length) {
    if (ctx.despieceGroup) {
      ctx.resultsParent.remove(ctx.despieceGroup);
      disposeObject(ctx.despieceGroup);
      ctx.despieceGroup = null;
    }
    return;
  }

  const ver = modelStore.modelVersion;
  // Options that change WHAT is drawn → rebuild (they're infrequent user actions);
  // the pull-apart itself is animated cheaply via despieceUpdate.
  const optSig = `${uiStore.despieceVectorMode}|${uiStore.despieceBasis}|${uiStore.despieceVectorSize}|${uiStore.despieceLabelSize}|${resultsStore.showReactions ? 1 : 0}|${uiStore.axisConvention3D}|${uiStore.despieceCombineVectors ? 1 : 0}|${uiStore.despieceLoadMode}`;
  const g = ctx.despieceGroup;
  const stale = !g || g.userData.despieceResultsRef !== r3d || g.userData.despieceModelVer !== ver || g.userData.despieceOptSig !== optSig;
  if (stale) {
    if (g) { ctx.resultsParent.remove(g); disposeObject(g); }
    const ng = createDespiece3DGroup({
      elements: modelStore.elements,
      nodes: modelStore.nodes,
      forces: r3d.elementForces,
      reactions: r3d.reactions ?? [],
      sep,
      sections: modelStore.sections,
      leftHand: uiStore.axisConvention3D === 'leftHand',
      project2D: projectFlag(),
      vectorMode: uiStore.despieceVectorMode,
      basis: uiStore.despieceBasis,
      vectorSize: uiStore.despieceVectorSize,
      labelSize: uiStore.despieceLabelSize,
      showReactions: resultsStore.showReactions,
      resultant: uiStore.despieceCombineVectors,
      loads: modelStore.loads,
      loadMode: uiStore.despieceLoadMode,
    });
    ng.userData.despieceResultsRef = r3d;
    ng.userData.despieceModelVer = ver;
    ng.userData.despieceOptSig = optSig;
    ctx.resultsParent.add(ng);
    ctx.despieceGroup = ng;
  }
  // Cheap per-frame pose update (transforms + 2 line vertices per member).
  (ctx.despieceGroup as import('../three/despiece-3d').DespieceGroup).userData.despieceUpdate(sep);
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

  const project2D = projectFlag();

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
    const pos = projectNodeToScene(node, project2D);

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

  const project2D = projectFlag();

  // Compute model size for sprite scaling
  const box = new THREE.Box3();
  for (const [, node] of modelStore.nodes) {
    const pos = projectNodeToScene(node, project2D);
    box.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z));
  }
  const size = box.getSize(new THREE.Vector3());
  const modelSize = Math.max(size.x, size.y, size.z, 1);
  const spriteScale = modelSize * 0.025;

  // Node labels
  if (uiStore.showNodeLabels3D && modelStore.nodes.size > 0) {
    ctx.nodeLabelsGroup = new THREE.Group();
    ctx.nodeLabelsGroup.name = 'nodeLabels';

    for (const [id, node] of modelStore.nodes) {
      const pos = projectNodeToScene(node, project2D);
      const sprite = createTextSpriteCached(String(id), '#ffffff', 28);
      sprite.position.set(
        pos.x + spriteScale * 0.3,
        pos.y + spriteScale * 0.5,
        pos.z,
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
      const sceneI = projectNodeToScene(nI, project2D);
      const sceneJ = projectNodeToScene(nJ, project2D);
      const mx = (sceneI.x + sceneJ.x) / 2;
      const my = (sceneI.y + sceneJ.y) / 2;
      const mz = (sceneI.z + sceneJ.z) / 2;

      const sprite = createTextSpriteCached(String(id), '#88ccff', 24);
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

      const sceneI = projectNodeToScene(nI, project2D);
      const sceneJ = projectNodeToScene(nJ, project2D);
      const dx = sceneJ.x - sceneI.x;
      const dy = sceneJ.y - sceneI.y;
      const dz = sceneJ.z - sceneI.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const mx = (sceneI.x + sceneJ.x) / 2;
      const my = (sceneI.y + sceneJ.y) / 2 - spriteScale * 0.3;
      const mz = (sceneI.z + sceneJ.z) / 2;

      const sprite = createTextSpriteCached(`${len.toFixed(2)} m`, '#88cc88', 22);
      sprite.position.set(mx, my, mz);
      sprite.scale.set(spriteScale * 0.7, spriteScale * 0.7, 1);
      ctx.lengthLabelsGroup.add(sprite);
    }
    ctx.scene.add(ctx.lengthLabelsGroup);
  }
}
