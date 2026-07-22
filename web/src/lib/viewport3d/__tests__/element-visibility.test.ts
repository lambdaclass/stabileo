/**
 * applyElementVisibility — guard against the intermittent "only some members
 * render" 3D bug (PR13). Despiece hides element groups; syncElements reuses
 * groups on a matching signature without resetting visibility, so a stale
 * `visible = false` could ride onto a reused group for a new model. This helper
 * is the single authority that re-asserts the correct visibility on every sync.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyElementVisibility } from '../scene-sync';

function setup() {
  const groups = new Map<number, THREE.Group>();
  const g1 = new THREE.Group(), g2 = new THREE.Group();
  groups.set(1, g1); groups.set(2, g2);
  const batched = new THREE.Object3D();
  const parent = new THREE.Object3D();
  return { groups, g1, g2, batched, parent };
}

describe('applyElementVisibility', () => {
  it('despiece ON hides all element groups; OFF restores them', () => {
    const { groups, g1, g2, batched, parent } = setup();
    applyElementVisibility(groups, batched, parent, true, true);
    expect(g1.visible).toBe(false);
    expect(g2.visible).toBe(false);
    applyElementVisibility(groups, batched, parent, false, true);
    expect(g1.visible).toBe(true);
    expect(g2.visible).toBe(true);
  });

  it('restores a stale hidden group reused for a new model (root-cause fix)', () => {
    const { groups, g1, batched, parent } = setup();
    g1.visible = false; // stale state left by a prior despiece session
    applyElementVisibility(groups, batched, parent, false, true);
    expect(g1.visible).toBe(true);
  });

  it('batched wireframe shows only in wireframe mode AND not in despiece', () => {
    const { groups, batched, parent } = setup();
    applyElementVisibility(groups, batched, parent, false, true);
    expect(batched.visible).toBe(true);
    applyElementVisibility(groups, batched, parent, false, false); // solid mode
    expect(batched.visible).toBe(false);
    applyElementVisibility(groups, batched, parent, true, true); // despiece
    expect(batched.visible).toBe(false);
  });

  it('always forces the elements parent visible (undo transient LOD hide)', () => {
    const { groups, batched, parent } = setup();
    parent.visible = false; // LOD hid it during an orbit, model loaded mid-orbit
    applyElementVisibility(groups, batched, parent, false, true);
    expect(parent.visible).toBe(true);
  });

  it('tolerates a null batched mesh / parent', () => {
    const { groups } = setup();
    expect(() => applyElementVisibility(groups, null, null, false, true)).not.toThrow();
  });
});
