import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findElementHit, findNodeHit } from '../picking';
import { planClipPlanes, insideClip } from '../plan-clip';

function bar(id: number, z: number, type = 'element'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 0.3), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  m.position.set(3, 0, z);
  m.userData = { type, id };
  m.updateMatrixWorld();
  return m;
}

function lookingDown(): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -1e5, 1e5);
  cam.up.set(0, 1, 0);
  cam.position.set(3, 0, 1003);
  cam.lookAt(3, 0, 3);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

describe('picking in the plan of a level', () => {
  const planes = planClipPlanes(3, 0);
  const inside = insideClip(planes);

  it('keeps what lies between the cut over the level and the one over the level below', () => {
    expect(inside(new THREE.Vector3(0, 0, 3))).toBe(true);
    expect(inside(new THREE.Vector3(0, 0, 3.1))).toBe(true);
    expect(inside(new THREE.Vector3(0, 0, 6))).toBe(false);
    expect(inside(new THREE.Vector3(0, 0, 0.1))).toBe(false);
    expect(insideClip(planClipPlanes(0, -Infinity))(new THREE.Vector3(0, 0, -50))).toBe(true);
  });

  it('a click on a beam of the level takes it, not the beam above it that the plan does not draw', () => {
    const elements = new THREE.Group();
    elements.add(bar(1, 3), bar(2, 6));
    elements.updateMatrixWorld(true);
    const ndc = new THREE.Vector2(0, 0);
    expect(findElementHit(new THREE.Raycaster(), ndc, lookingDown(), elements)).toBe(2);
    expect(findElementHit(new THREE.Raycaster(), ndc, lookingDown(), elements, inside)).toBe(1);
  });

  it('nodes above the cut are not picked either', () => {
    const nodes = new THREE.Group();
    nodes.add(bar(10, 3, 'node'), bar(11, 6, 'node'));
    nodes.updateMatrixWorld(true);
    expect(findNodeHit(new THREE.Raycaster(), new THREE.Vector2(0, 0), lookingDown(), nodes, inside)).toBe(10);
  });
});
