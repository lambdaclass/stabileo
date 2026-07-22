// Contract tests for the batched load renderer — same visuals as
// create-load-arrow.ts, collapsed into a handful of draw calls.
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createLoadArrowsBatched } from '../load-arrows-batched';
import { disposeObject } from '../selection-helpers';

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
  value: { createElement: () => canvasStub },
  configurable: true,
});

function leafCounts(group: THREE.Group) {
  let lineSegs = 0, instanced = 0, meshes = 0, sprites = 0;
  const cones: THREE.InstancedMesh[] = [];
  const toruses: THREE.InstancedMesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.LineSegments) lineSegs++;
    else if (o instanceof THREE.InstancedMesh) {
      instanced++;
      if (o.geometry instanceof THREE.ConeGeometry) cones.push(o);
      else toruses.push(o);
    } else if (o instanceof THREE.Mesh) meshes++;
    else if (o instanceof THREE.Sprite) sprites++;
  });
  return { lineSegs, instanced, meshes, sprites, cones, toruses };
}

describe('load-arrows-batched', () => {
  it('collapses many distributed loads into a bounded number of draw calls', () => {
    const b = createLoadArrowsBatched();
    for (let i = 0; i < 100; i++) {
      b.addDistributedLoad({ x: i * 5, y: 0, z: 0 }, { x: i * 5 + 5, y: 0, z: 0 }, -5, -5, 10, 'Z', undefined, 0xff4444);
    }
    const g = b.build();
    const c = leafCounts(g);
    // 100 loads × (8 arrows + envelope + 1 label) → 2 LineSegments + 1 cone
    // InstancedMesh + 100 sprites, instead of 100 × 19 individual objects.
    expect(c.lineSegs).toBe(2); // shafts + envelope
    expect(c.cones.length).toBe(1);
    expect(c.cones[0].count).toBe(800); // 8 arrows per load
    expect(c.meshes).toBe(0);
    expect(c.sprites).toBe(100); // qI == qJ → only the qI label
    expect(g.children.length).toBeLessThanOrEqual(3 + 100);
  });

  it('points axis=Z gravity arrows downward with tips on the element', () => {
    const b = createLoadArrowsBatched();
    b.addDistributedLoad({ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }, -10, -10, 10, 'Z');
    const g = b.build();
    const c = leafCounts(g);
    expect(c.cones.length).toBe(1);
    const mesh = c.cones[0];
    const m = new THREE.Matrix4();
    const tip = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      m.decompose(tip, q, new THREE.Vector3());
      // Tips land on the element (z = 0), x spread along the member.
      expect(tip.z).toBeCloseTo(0, 6);
      expect(tip.x).toBeGreaterThanOrEqual(-1e-9);
      expect(tip.x).toBeLessThanOrEqual(6 + 1e-9);
      // Orientation maps +Y to -Z (downward).
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      expect(dir.z).toBeCloseTo(-1, 6);
    }
    // Shafts live above the element (positive z tail end).
    const shafts = g.children.find((o) => o instanceof THREE.LineSegments) as THREE.LineSegments;
    const pos = shafts.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getZ(i)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('scales arrow length linearly with magnitude (3 kN is 3/10 of max)', () => {
    const small = createLoadArrowsBatched();
    small.addNodalLoadArrow({ x: 0, y: 0, z: 0 }, 0, 0, -3, 0, 0, 0, 10);
    const big = createLoadArrowsBatched();
    big.addNodalLoadArrow({ x: 0, y: 0, z: 0 }, 0, 0, -6, 0, 0, 0, 10);
    const shaftLen = (g: THREE.Group) => {
      const shafts = g.children.find((o) => o instanceof THREE.LineSegments) as THREE.LineSegments;
      const pos = shafts.geometry.getAttribute('position');
      return Math.hypot(
        pos.getX(1) - pos.getX(0), pos.getY(1) - pos.getY(0), pos.getZ(1) - pos.getZ(0),
      );
    };
    // Ratio preserved (head length subtracted from both, so not exactly 2×).
    const s = shaftLen(small.build());
    const bLen = shaftLen(big.build());
    expect(s).toBeGreaterThan(0);
    expect(bLen / s).toBeGreaterThan(1.5);
    expect(bLen / s).toBeLessThan(2.5);
  });

  it('renders surface loads with 16 cone instances, a fill mesh, outline and one label', () => {
    const b = createLoadArrowsBatched();
    b.addSurfaceLoad(
      [{ x: 0, y: 0, z: 3 }, { x: 5, y: 0, z: 3 }, { x: 5, y: 5, z: 3 }, { x: 0, y: 5, z: 3 }],
      5, 10, 0xff4444,
    );
    const g = b.build();
    const c = leafCounts(g);
    expect(c.cones.length).toBe(1);
    expect(c.cones[0].count).toBe(16); // 4×4 grid
    expect(c.meshes).toBe(1);           // merged fill quad
    expect(c.lineSegs).toBe(2);         // shafts + outline
    expect(c.sprites).toBe(1);          // single value label
  });

  it('skips zero-valued components', () => {
    const b = createLoadArrowsBatched();
    b.addNodalLoadArrow({ x: 0, y: 0, z: 0 }, 0, 0, 0, 0, 0, 0, 10);
    b.addDistributedLoad({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 0, 0, 10, 'Z');
    b.addSurfaceLoad([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], 0, 10);
    const g = b.build();
    // Nodal all-zero → nothing; surface q=0 → nothing. A zero-q distributed
    // load draws no arrows, but (as in create-load-arrow.ts) still draws the
    // envelope line lying on the element.
    expect(g.children.length).toBe(1);
    expect(g.children[0]).toBeInstanceOf(THREE.LineSegments);
    const c = leafCounts(g);
    expect(c.cones.length).toBe(0);
    expect(c.sprites).toBe(0);
  });

  it('draws double-arrow moments as shaft + two cones, curved moments as torus + cone', () => {
    const dbl = createLoadArrowsBatched();
    dbl.addNodalLoadArrow({ x: 0, y: 0, z: 0 }, 0, 0, 0, 0, 0, 4, 10, 'double-arrow');
    const gd = dbl.build();
    const cd = leafCounts(gd);
    expect(cd.cones[0].count).toBe(2);
    expect(cd.toruses.length).toBe(0);

    const cur = createLoadArrowsBatched();
    cur.addNodalLoadArrow({ x: 0, y: 0, z: 0 }, 0, 0, 0, 0, 0, 4, 10, 'curved');
    const gc = cur.build();
    const cc = leafCounts(gc);
    expect(cc.toruses.length).toBe(1);
    expect(cc.toruses[0].count).toBe(1);
    expect(cc.cones[0].count).toBe(1); // arc-tip arrowhead
  });

  it('colors cones per case via instanceColor', () => {
    const b = createLoadArrowsBatched();
    b.addNodalLoadArrow({ x: 0, y: 0, z: 0 }, 0, 0, -5, 0, 0, 0, 10, 'double-arrow', 0x123456);
    const g = b.build();
    const c = leafCounts(g);
    expect(c.cones[0].instanceColor).not.toBeNull();
  });

  it('shares cached label textures and survives disposeObject', () => {
    const b = createLoadArrowsBatched();
    b.addSurfaceLoad(
      [{ x: 0, y: 0, z: 3 }, { x: 5, y: 0, z: 3 }, { x: 5, y: 5, z: 3 }, { x: 0, y: 5, z: 3 }],
      5, 10,
    );
    b.addSurfaceLoad(
      [{ x: 6, y: 0, z: 3 }, { x: 11, y: 0, z: 3 }, { x: 11, y: 5, z: 3 }, { x: 6, y: 5, z: 3 }],
      5, 10,
    );
    const g = b.build();
    const sprites = g.children.filter((o): o is THREE.Sprite => o instanceof THREE.Sprite);
    expect(sprites.length).toBe(2);
    const map = (sprites[0].material as THREE.SpriteMaterial).map!;
    expect((sprites[1].material as THREE.SpriteMaterial).map).toBe(map);
    const spy = vi.spyOn(map, 'dispose');
    disposeObject(g);
    expect(spy).not.toHaveBeenCalled();
  });
});
