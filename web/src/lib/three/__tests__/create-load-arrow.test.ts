import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createConstraintForceArrow,
  createDistributedLoadGroup,
} from '../create-load-arrow';

const canvasStub = {
  width: 0,
  height: 0,
  getContext: () => ({
    fillStyle: '',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillText: () => {},
  }),
};

Object.defineProperty(globalThis, 'document', {
  value: {
    createElement: () => canvasStub,
  },
  configurable: true,
});

function findArrowHelpers(group: THREE.Group): THREE.ArrowHelper[] {
  return group.children.filter((child): child is THREE.ArrowHelper => child instanceof THREE.ArrowHelper);
}

describe('create-load-arrow coordinate contract', () => {
  it('supports canonical 2D rotational aliases for constraint forces', () => {
    const group = createConstraintForceArrow({ x: 0, y: 0, z: 0 }, 'my', 12, 12);
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('uses global Z for distributed-load fallback when axis=Z', () => {
    const group = createDistributedLoadGroup(
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      -10,
      -10,
      10,
      1,
      'Z',
    );
    const arrows = findArrowHelpers(group);
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows[0].position.z).toBeGreaterThan(0);
    expect(Math.abs(arrows[0].position.y)).toBeLessThan(1e-9);
  });
});
