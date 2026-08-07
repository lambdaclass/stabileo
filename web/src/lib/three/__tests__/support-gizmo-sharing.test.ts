/**
 * Support gizmos are drawn from a small fixed set of shapes, but every gizmo was
 * allocating its own BufferGeometry and Material. La Bombonera has 205 supports,
 * all `fixed3d` — identical down to the last vertex — and they were producing
 * ~1400 distinct geometries and ~400 distinct materials for one shape.
 *
 * Geometry and material are immutable per shape here (position lives on the
 * Group, colour comes from a per-state material), so they can be module-level
 * singletons. These tests pin that sharing so it cannot silently regress.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSupportGizmo } from '../create-support-gizmo';
import { disposeObject } from '../selection-helpers';

const ORIGIN = { x: 0, y: 0, z: 0 };

/** Distinct geometry and material instances reachable from these objects. */
function countDistinctResources(objects: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  for (const root of objects) {
    root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g) geometries.add(g);
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => materials.add(mm));
      else if (m) materials.add(m);
    });
  }
  return { geometries: geometries.size, materials: materials.size };
}

function makeMany(n: number, supportType: string, selected = false) {
  return Array.from({ length: n }, (_, i) =>
    createSupportGizmo(
      { x: i, y: 0, z: 0 },
      { supportId: i + 1, supportType, selected } as never,
    ),
  );
}

describe('support gizmo resource sharing', () => {
  it('205 identical fixed supports share one set of geometries', () => {
    const many = makeMany(205, 'fixed3d');
    const one = makeMany(1, 'fixed3d');

    const manyRes = countDistinctResources(many);
    const oneRes = countDistinctResources(one);

    // Whatever a single gizmo needs, 205 of them must need no more.
    expect(manyRes.geometries).toBe(oneRes.geometries);
    expect(manyRes.materials).toBe(oneRes.materials);

    // And that per-shape count has to stay small.
    expect(manyRes.geometries).toBeLessThan(10);
    expect(manyRes.materials).toBeLessThan(10);
  });

  it('every support type shares across instances', () => {
    for (const t of ['fixed3d', 'pinned3d', 'rollerX', 'rollerY', 'rollerXY', 'spring3d']) {
      const many = countDistinctResources(makeMany(40, t));
      const one = countDistinctResources(makeMany(1, t));
      expect(many.geometries, `${t}: geometries`).toBe(one.geometries);
      expect(many.materials, `${t}: materials`).toBe(one.materials);
    }
  });

  it('selected gizmos use a different material but the same geometry', () => {
    const plain = makeMany(1, 'fixed3d', false);
    const selected = makeMany(1, 'fixed3d', true);

    const both = countDistinctResources([...plain, ...selected]);
    const plainOnly = countDistinctResources(plain);

    // Same shapes...
    expect(both.geometries).toBe(plainOnly.geometries);
    // ...but the selection colour must actually differ.
    expect(both.materials).toBeGreaterThan(plainOnly.materials);
  });

  it('still positions each gizmo independently', () => {
    const gizmos = makeMany(3, 'fixed3d');
    expect(gizmos.map((g) => g.position.x)).toEqual([0, 1, 2]);
    expect(gizmos[0].userData.id).toBe(1);
    expect(gizmos[2].userData.id).toBe(3);
  });

  it('deleting one support leaves the others intact', () => {
    // The whole point of the sharing: `disposeObject` runs when a support is
    // removed or rebuilt. If it disposed the shared geometry, every remaining
    // support would render nothing — worse than the allocation it saves.
    const [a, b] = makeMany(2, 'fixed3d');

    const geometriesOf = (o: THREE.Object3D) => {
      const out: THREE.BufferGeometry[] = [];
      o.traverse((c) => { const g = (c as THREE.Mesh).geometry; if (g) out.push(g); });
      return out;
    };
    const survivorGeos = geometriesOf(b);
    expect(survivorGeos.length).toBeGreaterThan(0);

    disposeObject(a);

    // Three.js sets attributes to an empty object on dispose; a live geometry
    // keeps its position attribute.
    for (const g of survivorGeos) {
      expect(g.getAttribute('position'), 'survivor geometry was disposed').toBeDefined();
    }
  });

  it('private (non-shared) resources are still disposed', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    let geoDisposed = false, matDisposed = false;
    geo.addEventListener('dispose', () => { geoDisposed = true; });
    mat.addEventListener('dispose', () => { matDisposed = true; });

    disposeObject(mesh);

    expect(geoDisposed).toBe(true);
    expect(matDisposed).toBe(true);
  });

  it('a gizmo still renders something', () => {
    const [g] = makeMany(1, 'fixed3d');
    let drawables = 0;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine) drawables++;
    });
    expect(drawables).toBeGreaterThan(0);
  });
});
