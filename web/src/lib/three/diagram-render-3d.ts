// Three.js rendering of 3D force/moment diagrams
// Creates filled mesh polygons perpendicular to elements, showing diagram values
// in the local Y or Z direction depending on the diagram kind.

import * as THREE from 'three';
import type { Node, Element, Section } from '../store/model.svelte';
import type { ElementForces3D, EnvelopeDiagramData3D } from '../engine/types-3d';
import { computeLocalAxes3D } from '../engine/local-axes-3d';
import {
  computeDiagram3D,
  computeGlobalMax3D,
  getDiagramLocalDirection,
  formatDiagramValue3D,
  type Diagram3DKind,
} from '../engine/diagrams-3d';
import { createTextSprite } from './selection-helpers';
import { GLOBAL_Z } from '../geometry/coordinate-system';

// ─── Shared display-direction helper ────────────────────────────
// Centralised so that createDiagramGroup3D and createEnvelopeDiagramGroup3D
// always agree on how to orient diagram offsets for horizontal beams.

export interface DiagramDisplayDirection {
  perpVec: THREE.Vector3;  // unit vector for diagram offset (global coords)
  sign: number;            // +1 or −1 to apply to solver values before offset
}

/**
 * Compute the display perpendicular direction for a 3D diagram element.
 *
 * For horizontal beams (|ex.z| < 0.5) we project global Z onto the plane
 * perpendicular to `ex` so that diagrams always render "upward" in the
 * viewport regardless of the solver's internal local-axis convention.
 *
 * @param axes  Local axes from `computeLocalAxes3D`
 * @param perpDir  Whether the diagram lives in the local 'y' or 'z' plane
 */
export function computeDiagramDisplayDirection(
  axes: { ex: [number, number, number]; ey: [number, number, number]; ez: [number, number, number] },
  perpDir: 'y' | 'z',
): DiagramDisplayDirection {
  const solverPerp = perpDir === 'y'
    ? new THREE.Vector3(axes.ey[0], axes.ey[1], axes.ey[2])
    : new THREE.Vector3(axes.ez[0], axes.ez[1], axes.ez[2]);

  let perpVec: THREE.Vector3;
  let displayFlipped = false;
  const exVertical = Math.abs(axes.ex[2]);
  if (exVertical < 0.5) {
    // Horizontal beam: project global Z onto plane perpendicular to ex
    const exV = new THREE.Vector3(axes.ex[0], axes.ex[1], axes.ex[2]);
    const projZ = GLOBAL_Z.clone().sub(exV.clone().multiplyScalar(axes.ex[2]));
    const projLen = projZ.length();
    if (projLen > 0.01) {
      perpVec = projZ.divideScalar(projLen);
      displayFlipped = solverPerp.dot(perpVec) < 0;
    } else {
      perpVec = solverPerp;
    }
  } else {
    perpVec = solverPerp;
  }

  const baseSign = perpDir === 'z' ? -1 : 1;
  const sign = displayFlipped ? -baseSign : baseSign;

  return { perpVec, sign };
}

// Colors for different diagram types
const DIAGRAM_COLORS: Record<Diagram3DKind, { fill: number; line: number; text: string }> = {
  momentZ: { fill: 0x4169E1, line: 0x6495ED, text: '#6495ED' },   // Blue
  momentY: { fill: 0x20B2AA, line: 0x48D1CC, text: '#48D1CC' },   // Teal
  shearY:  { fill: 0x32CD32, line: 0x90EE90, text: '#90EE90' },   // Green
  shearZ:  { fill: 0x3CB371, line: 0x66CDAA, text: '#66CDAA' },   // Medium green
  axial:   { fill: 0xBA55D3, line: 0xDDA0DD, text: '#DDA0DD' },   // Purple
  torsion: { fill: 0xFF8C00, line: 0xFFA500, text: '#FFA500' },   // Orange
};

/**
 * Create a THREE.Group with 3D diagrams for all elements.
 * Each diagram is a filled polygon (triangle strip mesh) perpendicular to the element,
 * in the local Y or Z direction depending on the diagram kind.
 *
 * @param elements  - Map of element ID → Element
 * @param nodes     - Map of node ID → Node
 * @param elementForces - Array of ElementForces3D from the solver
 * @param kind      - Which diagram to draw
 * @param scaleMult - User diagram scale multiplier (default 1)
 * @param showValues - Whether to show value labels
 */
export function createDiagramGroup3D(
  elements: Map<number, Element>,
  nodes: Map<number, Node>,
  elementForces: ElementForces3D[],
  kind: Diagram3DKind,
  scaleMult: number = 1,
  showValues: boolean = true,
  leftHand: boolean = false,
  sections?: Map<number, Section>,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'diagram3d', kind };

  const globalMax = computeGlobalMax3D(elementForces, kind);
  if (globalMax < 1e-10) return group;

  // Compute model bounding box for scale reference
  let modelSize = 1;
  const box = new THREE.Box3();
  for (const [, node] of nodes) {
    box.expandByPoint(new THREE.Vector3(node.x, node.y, node.z ?? 0));
  }
  const size = box.getSize(new THREE.Vector3());
  modelSize = Math.max(size.x, size.y, size.z, 1);

  // Target diagram height: ~8% of model size, scaled by user multiplier
  const targetHeight = modelSize * 0.08 * scaleMult;
  const scale = targetHeight / globalMax;

  const colors = DIAGRAM_COLORS[kind];
  const perpDir = getDiagramLocalDirection(kind);

  // Build forces lookup
  const forcesMap = new Map<number, ElementForces3D>();
  for (const ef of elementForces) {
    forcesMap.set(ef.elementId, ef);
  }

  for (const [elemId, elem] of elements) {
    const ef = forcesMap.get(elemId);
    if (!ef) continue;

    const nI = nodes.get(elem.nodeI);
    const nJ = nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    // Compute local axes
    const solverNodeI = { id: elem.nodeI, x: nI.x, y: nI.y, z: nI.z ?? 0 };
    const solverNodeJ = { id: elem.nodeJ, x: nJ.x, y: nJ.y, z: nJ.z ?? 0 };

    // Pass element orientation (localY + effective rollAngle = β + θ) to match solver axes
    const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
    const secRot = sections?.get(elem.sectionId)?.rotation ?? 0;
    const effectiveRoll = (elem.rollAngle ?? 0) + secRot;

    let axes;
    try {
      axes = computeLocalAxes3D(solverNodeI, solverNodeJ, localY, effectiveRoll || undefined, leftHand);
    } catch {
      continue; // zero-length element
    }

    // Compute diagram values
    const diagram = computeDiagram3D(ef, kind);

    const { perpVec, sign } = computeDiagramDisplayDirection(axes, perpDir);

    // Build mesh: triangle strip between baseline and diagram curve
    const positions: number[] = [];
    const indices: number[] = [];

    const baselinePoints: THREE.Vector3[] = [];
    const diagramPoints: THREE.Vector3[] = [];

    for (const pt of diagram.points) {
      const t = pt.t;

      // Baseline point (on element axis)
      const bx = nI.x + t * (nJ.x - nI.x);
      const by = nI.y + t * (nJ.y - nI.y);
      const bz = (nI.z ?? 0) + t * ((nJ.z ?? 0) - (nI.z ?? 0));

      const offset = sign * pt.value * scale;
      const dx = bx + perpVec.x * offset;
      const dy = by + perpVec.y * offset;
      const dz = bz + perpVec.z * offset;

      baselinePoints.push(new THREE.Vector3(bx, by, bz));
      diagramPoints.push(new THREE.Vector3(dx, dy, dz));

      // Add vertices: baseline then diagram point
      const idx = positions.length / 3;
      positions.push(bx, by, bz);      // baseline vertex
      positions.push(dx, dy, dz);      // diagram vertex

      // Create two triangles for the quad (if not the first point)
      if (idx >= 2) {
        // Previous baseline, previous diagram, current baseline
        indices.push(idx - 2, idx - 1, idx);
        // Previous diagram, current diagram, current baseline
        indices.push(idx - 1, idx + 1, idx);
      }
    }

    if (positions.length >= 6) {
      // Create filled mesh
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const fillMat = new THREE.MeshBasicMaterial({
        color: colors.fill,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, fillMat);
      // Store element info for raycaster tooltip
      mesh.userData = { type: 'diagram3dMesh', elementId: elemId, kind };
      group.add(mesh);

      // Create outline line (diagram curve)
      const lineGeo = new THREE.BufferGeometry().setFromPoints(diagramPoints);
      const lineMat = new THREE.LineBasicMaterial({
        color: colors.line,
        linewidth: 2,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.userData = { type: 'diagram3dLine', elementId: elemId, kind };
      group.add(line);

      // Draw perpendicular lines at start and end connecting baseline to diagram
      const startLine = new THREE.BufferGeometry().setFromPoints([baselinePoints[0], diagramPoints[0]]);
      const endLine = new THREE.BufferGeometry().setFromPoints([
        baselinePoints[baselinePoints.length - 1],
        diagramPoints[diagramPoints.length - 1],
      ]);
      const closeMat = new THREE.LineBasicMaterial({ color: colors.line, linewidth: 1 });
      group.add(new THREE.Line(startLine, closeMat));
      group.add(new THREE.Line(endLine, closeMat.clone()));

      // ── Max/min markers and labels ─────────────────────────────
      // Find indices of max and min values
      let maxIdx = 0;
      let minIdx = 0;
      let maxVal = -Infinity;
      let minVal = Infinity;
      for (let i = 0; i < diagram.points.length; i++) {
        if (diagram.points[i].value > maxVal) {
          maxVal = diagram.points[i].value;
          maxIdx = i;
        }
        if (diagram.points[i].value < minVal) {
          minVal = diagram.points[i].value;
          minIdx = i;
        }
      }

      const sphereRadius = modelSize * 0.008;
      const spriteScale = modelSize * 0.04;
      const sphereGeo = new THREE.SphereGeometry(sphereRadius, 12, 8);

      // Helper to add a marker sphere + label at a given index
      const addMarker = (idx: number, val: number) => {
        if (Math.abs(val) < globalMax * 0.05) return; // skip negligible
        const pos = diagramPoints[idx];
        // Sphere marker
        const sphereMat = new THREE.MeshBasicMaterial({ color: colors.line, depthTest: false });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(pos);
        sphere.renderOrder = 1;
        group.add(sphere);

        if (showValues) {
          const labelText = formatDiagramValue3D(val, kind);
          const sprite = createTextSprite(labelText, colors.text, 28);
          sprite.position.set(
            pos.x + perpVec.x * 0.15,
            pos.y + perpVec.y * 0.15,
            pos.z + perpVec.z * 0.15,
          );
          sprite.scale.set(spriteScale, spriteScale, 1);
          group.add(sprite);
        }
      };

      // Always add max absolute value marker
      if (Math.abs(maxVal) >= Math.abs(minVal)) {
        addMarker(maxIdx, maxVal);
        // Also add min if it has opposite sign and is significant
        if (minVal < 0 && maxVal > 0 && Math.abs(minVal) > globalMax * 0.05) {
          addMarker(minIdx, minVal);
        }
      } else {
        addMarker(minIdx, minVal);
        // Also add max if it has opposite sign and is significant
        if (maxVal > 0 && minVal < 0 && Math.abs(maxVal) > globalMax * 0.05) {
          addMarker(maxIdx, maxVal);
        }
      }
    }
  }

  return group;
}

// ─── Envelope colors: positive (blue) and negative (red) ─────────
const ENVELOPE_POS_COLOR = { fill: 0x4169E1, line: 0x6495ED, text: '#6495ED' };
const ENVELOPE_NEG_COLOR = { fill: 0xE15041, line: 0xED6456, text: '#ED6456' };

/**
 * Create a THREE.Group with dual envelope diagrams (Env+ and Env−) for 3D mode.
 * Shows max positive values in blue and max negative values in red simultaneously.
 */
export function createEnvelopeDiagramGroup3D(
  elements: Map<number, Element>,
  nodes: Map<number, Node>,
  envelopeData: EnvelopeDiagramData3D,
  kind: Diagram3DKind,
  scaleMult: number = 1,
  showValues: boolean = true,
  leftHand: boolean = false,
  sections?: Map<number, Section>,
): THREE.Group {
  const group = new THREE.Group();
  group.userData = { type: 'diagram3dEnvelope', kind };

  const globalMax = envelopeData.globalMax;
  if (globalMax < 1e-10) return group;

  // Compute model bounding box for scale reference
  let modelSize = 1;
  const box = new THREE.Box3();
  for (const [, node] of nodes) {
    box.expandByPoint(new THREE.Vector3(node.x, node.y, node.z ?? 0));
  }
  const size = box.getSize(new THREE.Vector3());
  modelSize = Math.max(size.x, size.y, size.z, 1);

  const targetHeight = modelSize * 0.08 * scaleMult;
  const scale = targetHeight / globalMax;
  const perpDir = getDiagramLocalDirection(kind);

  for (const envElem of envelopeData.elements) {
    const elem = elements.get(envElem.elementId);
    if (!elem) continue;

    const nI = nodes.get(elem.nodeI);
    const nJ = nodes.get(elem.nodeJ);
    if (!nI || !nJ) continue;

    // Compute local axes
    const solverNodeI = { id: elem.nodeI, x: nI.x, y: nI.y, z: nI.z ?? 0 };
    const solverNodeJ = { id: elem.nodeJ, x: nJ.x, y: nJ.y, z: nJ.z ?? 0 };

    const localY = (elem.localYx !== undefined && elem.localYy !== undefined && elem.localYz !== undefined)
      ? { x: elem.localYx, y: elem.localYy, z: elem.localYz } : undefined;
    const secRotE = sections?.get(elem.sectionId)?.rotation ?? 0;
    const effectiveRollE = (elem.rollAngle ?? 0) + secRotE;

    let axes;
    try {
      axes = computeLocalAxes3D(solverNodeI, solverNodeJ, localY, effectiveRollE || undefined, leftHand);
    } catch {
      continue;
    }

    const { perpVec, sign } = computeDiagramDisplayDirection(axes, perpDir);

    // Draw both positive and negative envelope curves
    for (const curveType of ['pos', 'neg'] as const) {
      const values = curveType === 'pos' ? envElem.posValues : envElem.negValues;
      const colors = curveType === 'pos' ? ENVELOPE_POS_COLOR : ENVELOPE_NEG_COLOR;

      // Check if this curve has any significant values
      const maxAbs = Math.max(...values.map(Math.abs));
      if (maxAbs < globalMax * 0.001) continue;

      const positions: number[] = [];
      const indices: number[] = [];
      const baselinePoints: THREE.Vector3[] = [];
      const diagramPoints: THREE.Vector3[] = [];

      for (let j = 0; j < envElem.tPositions.length; j++) {
        const t = envElem.tPositions[j];
        const val = values[j];

        const bx = nI.x + t * (nJ.x - nI.x);
        const by = nI.y + t * (nJ.y - nI.y);
        const bz = (nI.z ?? 0) + t * ((nJ.z ?? 0) - (nI.z ?? 0));

        const offset = sign * val * scale;
        const dx = bx + perpVec.x * offset;
        const dy = by + perpVec.y * offset;
        const dz = bz + perpVec.z * offset;

        baselinePoints.push(new THREE.Vector3(bx, by, bz));
        diagramPoints.push(new THREE.Vector3(dx, dy, dz));

        const idx = positions.length / 3;
        positions.push(bx, by, bz);
        positions.push(dx, dy, dz);

        if (idx >= 2) {
          indices.push(idx - 2, idx - 1, idx);
          indices.push(idx - 1, idx + 1, idx);
        }
      }

      if (positions.length >= 6) {
        // Filled mesh
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const fillMat = new THREE.MeshBasicMaterial({
          color: colors.fill,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, fillMat);
        mesh.userData = { type: 'diagram3dEnvelopeMesh', elementId: envElem.elementId, kind, curve: curveType };
        group.add(mesh);

        // Outline
        const lineGeo = new THREE.BufferGeometry().setFromPoints(diagramPoints);
        const lineMat = new THREE.LineBasicMaterial({ color: colors.line, linewidth: 2 });
        const line = new THREE.Line(lineGeo, lineMat);
        line.userData = { type: 'diagram3dEnvelopeLine', elementId: envElem.elementId, kind, curve: curveType };
        group.add(line);

        // Start/end closing lines
        const startLine = new THREE.BufferGeometry().setFromPoints([baselinePoints[0], diagramPoints[0]]);
        const endLine = new THREE.BufferGeometry().setFromPoints([
          baselinePoints[baselinePoints.length - 1],
          diagramPoints[diagramPoints.length - 1],
        ]);
        const closeMat = new THREE.LineBasicMaterial({ color: colors.line, linewidth: 1 });
        group.add(new THREE.Line(startLine, closeMat));
        group.add(new THREE.Line(endLine, closeMat.clone()));

        // Max value markers
        if (showValues) {
          let extremeIdx = 0;
          let extremeVal = values[0];
          for (let i = 1; i < values.length; i++) {
            if (Math.abs(values[i]) > Math.abs(extremeVal)) {
              extremeVal = values[i];
              extremeIdx = i;
            }
          }

          if (Math.abs(extremeVal) > globalMax * 0.05) {
            const sphereRadius = modelSize * 0.008;
            const spriteScale = modelSize * 0.04;
            const sphereGeo = new THREE.SphereGeometry(sphereRadius, 12, 8);
            const pos = diagramPoints[extremeIdx];

            const sphereMat = new THREE.MeshBasicMaterial({ color: colors.line, depthTest: false });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            sphere.position.copy(pos);
            sphere.renderOrder = 1;
            group.add(sphere);

            const labelText = formatDiagramValue3D(extremeVal, kind);
            const sprite = createTextSprite(labelText, colors.text, 28);
            sprite.position.set(
              pos.x + perpVec.x * 0.15,
              pos.y + perpVec.y * 0.15,
              pos.z + perpVec.z * 0.15,
            );
            sprite.scale.set(spriteScale, spriteScale, 1);
            group.add(sprite);
          }
        }
      }
    }
  }

  return group;
}
