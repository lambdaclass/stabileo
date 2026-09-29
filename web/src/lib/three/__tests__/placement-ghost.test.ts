/**
 * The placement ghost shows when a placement moves it, even with the fragment it already had —
 * a second paste of the same clipboard used to place blind.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlacementGhost } from '../placement-ghost';
import { translation } from '../../model/edit/affine';

describe('the placement ghost', () => {
  it('is visible again when a placement moves it after it was hidden', () => {
    const scene = new THREE.Scene();
    const ghost = new PlacementGhost(scene);
    const frag = { nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 4, y: 0, z: 0 }], elements: [{ id: 1, nodeI: 1, nodeJ: 2 }], quads: [], plates: [] };
    ghost.setFragment(frag as never);
    ghost.update(translation([1, 0, 0]), [1, 0, 0], [], 0.3);
    ghost.hide();
    // Second paste: same fragment, so the viewer only moves it.
    ghost.update(translation([2, 0, 0]), [2, 0, 0], [], 0.3);
    expect((ghost as unknown as { group: THREE.Group }).group.visible).toBe(true);
    ghost.dispose();
  });
});
