import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createElementGroup } from '../create-element-mesh';
import type { Section } from '../../store/model.svelte';

const I_SECTION: Section = {
  id: 1, name: 'IPN500', a: 0.0179, iz: 6.874e-4, iy: 2.48e-5,
  shape: 'I', h: 0.5, b: 0.185, tw: 0.018, tf: 0.027,
};

/** Find the extruded section mesh (a Mesh, not the edge LineSegments). */
function sectionMesh(group: THREE.Group): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !found) found = o as THREE.Mesh;
  });
  return found;
}

describe('createElementGroup — section orientation by local axes', () => {
  it('keeps an I-section web vertical on a horizontal +X member', () => {
    const group = createElementGroup(
      { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 },
      {
        elementId: 1, elementType: 'frame', section: I_SECTION, renderMode: 'sections',
        localAxes: { ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] },
      },
    );
    const mesh = sectionMesh(group);
    expect(mesh).not.toBeNull();
    // Section height (shape local +Y) must map to world up (+Z), not sideways.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh!.quaternion);
    expect(up.z).toBeCloseTo(1, 5);
    // Extrude axis (shape local +Z) must run along the member (+X).
    const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh!.quaternion);
    expect(axis.x).toBeCloseTo(1, 5);
  });

  it('renders trusses with section geometry too (not naked lines) in sections mode', () => {
    const group = createElementGroup(
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 },
      {
        elementId: 2, elementType: 'truss', section: I_SECTION, renderMode: 'sections',
        localAxes: { ex: [0, 0, 1], ey: [0, 1, 0], ez: [-1, 0, 0] },
      },
    );
    expect(sectionMesh(group)).not.toBeNull();
  });

  it('falls back to a cylinder for trusses without section geometry in solid mode', () => {
    const noGeo: Section = { id: 3, name: 'custom', a: 0.001, iz: 1e-7 };
    const group = createElementGroup(
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 },
      { elementId: 3, elementType: 'truss', section: noGeo, renderMode: 'solid' },
    );
    expect(sectionMesh(group)).not.toBeNull(); // cylinder mesh present
  });
});
