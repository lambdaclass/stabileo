// Basic 2D section orientation when a flat 2D model is embedded into Basic 3D
// "sections" render mode (PR [11]).
//
// Bug: a 2D beam viewed in 3D rendered its section lying sideways (weak axis),
// even though the 2D solver and the section-analysis tool both treat it as
// standing up (depth h vertical, strong-axis bending). Root cause: scene-sync
// disabled per-element local axes for projected (2D→XZ) models, so the section
// fell back to a minimal +Z→dir rotation that does NOT keep the depth vertical.
//
// Fix: scene-sync computes local axes from the PROJECTED scene coordinates
// (posI/posJ) the mesh actually spans, so the extruded profile stands up. This
// test replicates that exact chain (project → computeLocalAxes3D → render) and
// asserts the section depth (shape local +Y) maps to world up (+Z).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createElementGroup } from '../create-element-mesh';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { projectNodeToScene } from '../../geometry/coordinate-system';
import { effectiveBendingInertia } from '../../engine/solver-service';
import type { Section } from '../../store/model.svelte';

// IPN 300 — the section every 2D beam example uses. h (depth) > b (width);
// iy is the strong axis, iz the weak.
const IPN300: Section = { id: 1, name: 'IPN 300', a: 0.0069, iy: 9.8e-5, iz: 4.51e-6, j: 1e-7, b: 0.125, h: 0.3, shape: 'I', tw: 0.0108, tf: 0.0162 };

/** Replicate scene-sync's section-orientation chain for a flat 2D element
 *  (2D coords → projected XZ scene → local axes from projected coords). */
function embeddedLocalAxes(a: { x: number; y: number }, b: { x: number; y: number }) {
  const pI = projectNodeToScene({ x: a.x, y: a.y }, true); // → { x, y:0, z:a.y }
  const pJ = projectNodeToScene({ x: b.x, y: b.y }, true);
  const ax = computeLocalAxes3D({ id: 0, ...pI }, { id: 0, ...pJ }, undefined, undefined, false);
  return { localAxes: { ex: ax.ex, ey: ax.ey, ez: ax.ez }, pI, pJ };
}

function sectionMesh(group: THREE.Group): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !found) found = o as THREE.Mesh; });
  return found;
}

/** World direction the section DEPTH (shape local +Y) points after orientation. */
function depthWorldDir(group: THREE.Group): THREE.Vector3 {
  const mesh = sectionMesh(group)!;
  return new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
}

describe('2D-embedded section orientation (Basic 2D viewed in Basic 3D sections)', () => {
  it('horizontal beam: section depth stands up (vertical, +Z) — not sideways', () => {
    const { localAxes, pI, pJ } = embeddedLocalAxes({ x: 0, y: 0 }, { x: 8, y: 0 });
    // Projected onto the XZ plane: the vertical is global Z.
    expect(localAxes.ez).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6), expect.closeTo(1, 6)]);
    const group = createElementGroup(pI, pJ, {
      elementId: 1, elementType: 'frame', section: IPN300, renderMode: 'sections', localAxes,
    });
    const depth = depthWorldDir(group);
    expect(depth.z).toBeCloseTo(1, 5); // depth h → world up
    expect(Math.hypot(depth.x, depth.y)).toBeLessThan(1e-5); // nothing sideways
  });

  it('REGRESSION (documents the old bug): the legacy fallback (no localAxes) put depth sideways', () => {
    const { pI, pJ } = embeddedLocalAxes({ x: 0, y: 0 }, { x: 8, y: 0 });
    const group = createElementGroup(pI, pJ, {
      elementId: 1, elementType: 'frame', section: IPN300, renderMode: 'sections', // no localAxes
    });
    const depth = depthWorldDir(group);
    expect(depth.z).toBeLessThan(0.5); // the bug: depth was NOT vertical → the fix supplies localAxes
  });

  it('diagonal/inclined in-plane member: depth stays in the model plane (not flipped sideways)', () => {
    const { localAxes } = embeddedLocalAxes({ x: 0, y: 0 }, { x: 3, y: 4 });
    // Projected into XZ, an inclined member's depth is ⊥ the member WITHIN the
    // vertical plane: no out-of-plane (global Y) component, and it points up-ish.
    expect(Math.abs(localAxes.ez[1])).toBeLessThan(1e-6); // stays in plane, not sideways
    expect(localAxes.ez[2]).toBeGreaterThan(0);           // up-ish, not inverted
  });

  it('genuine 3D (non-projected) X beam still renders depth up (PR [10] convention preserved)', () => {
    const ax = computeLocalAxes3D({ id: 0, x: 0, y: 0, z: 0 }, { id: 0, x: 5, y: 0, z: 0 }, undefined, undefined, false);
    const group = createElementGroup({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, {
      elementId: 1, elementType: 'frame', section: IPN300, renderMode: 'sections',
      localAxes: { ex: ax.ex, ey: ax.ey, ez: ax.ez },
    });
    expect(depthWorldDir(group).z).toBeCloseTo(1, 5);
  });

  it('explicit section rotation can still lay the profile on its side (user opt-in)', () => {
    const { localAxes, pI, pJ } = embeddedLocalAxes({ x: 0, y: 0 }, { x: 8, y: 0 });
    const group = createElementGroup(pI, pJ, {
      elementId: 1, elementType: 'frame', section: IPN300, renderMode: 'sections',
      localAxes, sectionRotation: 90, // roll about the member axis
    });
    const depth = depthWorldDir(group);
    expect(depth.z).toBeLessThan(0.1); // 90° roll → depth no longer vertical (explicit weak-axis view)
  });
});

describe('2D solver uses the strong axis for vertical bending', () => {
  it('IPN 300 effective bending inertia is the strong axis (iy), not weak (iz)', () => {
    const I = effectiveBendingInertia(IPN300);
    expect(I).toBeCloseTo(IPN300.iy!, 12);
    expect(I).toBeGreaterThan(IPN300.iz! * 10); // strong ≫ weak
  });
});
