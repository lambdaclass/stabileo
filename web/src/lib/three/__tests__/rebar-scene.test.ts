/**
 * The renderer, checked where a screenshot cannot help.
 *
 * A twisting tube still looks like a bar, a tube built from a re-sampled curve still looks
 * like a bar, and a picking map off by one bar still returns a mark. All three are the kind
 * of defect that ships. So the frame, the vertex count and the triangle-to-bar mapping are
 * asserted numerically, and the parts that are genuinely about appearance are left alone.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRebarScene, transportFrames, frameExtent, REBAR_COLORS }
  from '../rebar-scene';
import type { SceneBar, SceneModel } from '../../engine/detailing/scene-model';

function bar(over: Partial<SceneBar> = {}): SceneBar {
  return {
    barId: 'b1', mark: 'B1', diameterMm: 20, role: 'longitudinal', ownerScope: 'frame', piece: 'longitudinal',
    assemblyId: 'a', elementIds: [1], cuttingLength: 5, conflicted: false,
    polyline: [
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 },
    ],
    ...over,
  };
}

function scene(over: Partial<SceneModel> = {}): SceneModel {
  return {
    seriesId: 'S', revision: 1, readiness: 'ISSUED',
    bars: [bar()], solids: [], conflicts: [],
    facets: { assemblies: [], families: [], roles: ['longitudinal'], layers: [] },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } },
    unresolvedMembers: [], unreinforcedMembers: [], provisionalMembers: [], lockedMembers: [],
    torsionUnevaluatedMembers: [],
    ...over,
  };
}

// ─── The frame ───────────────────────────────────────────────────

describe('the tube frame is parallel-transported, not Frenet', () => {
  it('does not rotate along a straight run', () => {
    const pts = [0, 1, 2, 3, 4].map((x) => new THREE.Vector3(x, 0, 0));
    const { normals } = transportFrames(pts);
    for (const n of normals) {
      expect(n.angleTo(normals[0])).toBeCloseTo(0, 9);
    }
  });

  it('keeps every normal perpendicular to its own tangent through a bend', () => {
    // A 90° hook: the case where a Frenet frame flips and a naive fixed normal degenerates.
    const pts = [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1.05, 0, 0.05), new THREE.Vector3(1.1, 0, 0.15),
      new THREE.Vector3(1.1, 0, 0.3),
    ];
    const { tangents, normals, binormals } = transportFrames(pts);
    for (let i = 0; i < pts.length; i++) {
      expect(Math.abs(normals[i].dot(tangents[i])), `normal ⟂ tangent at ${i}`)
        .toBeLessThan(1e-9);
      expect(normals[i].length()).toBeCloseTo(1, 9);
      expect(binormals[i].length()).toBeCloseTo(1, 9);
    }
  });

  it('survives a vertical bar, where the seed axis has to change', () => {
    const pts = [0, 1, 2].map((z) => new THREE.Vector3(0, 0, z));
    const { normals } = transportFrames(pts);
    for (const n of normals) expect(Number.isFinite(n.x + n.y + n.z)).toBe(true);
    expect(normals[0].length()).toBeCloseTo(1, 9);
  });

  it('does not produce NaN when two samples coincide', () => {
    const pts = [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0),
    ];
    const { normals } = transportFrames(pts);
    for (const n of normals) expect(Number.isNaN(n.x + n.y + n.z)).toBe(false);
  });
});

// ─── Geometry ────────────────────────────────────────────────────

describe('the tube walks the polyline the document sampled', () => {
  it('places one ring per sampled vertex, adding none and dropping none', () => {
    const radial = 6;
    const s = scene();
    const built = createRebarScene(s, { radialSegments: radial });
    const geom = built.bars[0].mesh.geometry;
    expect(geom.getAttribute('position').count).toBe(s.bars[0].polyline.length * radial);
    built.dispose();
  });

  it('gives the tube the bar\'s real radius', () => {
    const built = createRebarScene(scene(), { radialSegments: 4 });
    const pos = built.bars[0].mesh.geometry.getAttribute('position');
    // First ring, first bar: 20 mm diameter → 10 mm off the centreline at x = 0.
    let maxOffset = 0;
    for (let i = 0; i < 4; i++) {
      maxOffset = Math.max(maxOffset, Math.hypot(pos.getY(i), pos.getZ(i)));
    }
    expect(maxOffset).toBeCloseTo(0.01, 9);
    built.dispose();
  });

  it('honours diameterScale as an explicit exaggeration', () => {
    const built = createRebarScene(scene(), { radialSegments: 4, diameterScale: 3 });
    const pos = built.bars[0].mesh.geometry.getAttribute('position');
    // 7 places, not 9: positions live in a Float32Array and 0,03 is not exact in float32.
    expect(Math.hypot(pos.getY(0), pos.getZ(0))).toBeCloseTo(0.03, 7);
    built.dispose();
  });

  it('skips a degenerate one-point bar rather than emitting a broken mesh', () => {
    const built = createRebarScene(scene({
      bars: [bar({ polyline: [{ x: 0, y: 0, z: 0 }] })],
    }));
    expect(built.bars).toHaveLength(0);
    built.dispose();
  });
});

// ─── Batching and picking ────────────────────────────────────────

describe('bars are batched by colour but stay individually identifiable', () => {
  const s = scene({
    bars: [
      bar({ barId: 'L1' }),
      bar({ barId: 'L2' }),
      bar({ barId: 'T1', role: 'transverse', diameterMm: 8 }),
      bar({ barId: 'X1', conflicted: true }),
    ],
  });
  const built = createRebarScene(s);

  it('merges each category into ONE mesh', () => {
    const cats = built.bars.map((b) => b.category).sort();
    expect(cats).toEqual(['conflicted', 'longitudinal', 'transverse']);
    expect(built.bars.find((b) => b.category === 'longitudinal')!.ranges).toHaveLength(2);
  });

  it('colours a conflicted bar as conflicted, whatever its role', () => {
    const conflicted = built.bars.find((b) => b.category === 'conflicted')!;
    expect((conflicted.mesh.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(REBAR_COLORS.conflicted);
  });

  it('maps the FIRST and LAST triangle of every bar back to that bar', () => {
    for (const entry of built.bars) {
      for (const r of entry.ranges) {
        expect(built.barIdAt(entry.mesh, r.firstTri), `first tri of ${r.barId}`)
          .toBe(r.barId);
        expect(built.barIdAt(entry.mesh, r.firstTri + r.triCount - 1), `last tri of ${r.barId}`)
          .toBe(r.barId);
      }
    }
  });

  it('returns null past the end rather than the nearest bar', () => {
    const entry = built.bars[0];
    const last = entry.ranges[entry.ranges.length - 1];
    expect(built.barIdAt(entry.mesh, last.firstTri + last.triCount)).toBeNull();
    expect(built.barIdAt(entry.mesh, undefined)).toBeNull();
  });
});

// ─── Concrete and conflicts ──────────────────────────────────────

describe('concrete is drawn so the steel can be seen through it', () => {
  const s = scene({
    solids: [{
      id: 'member:1', kind: 'beam', assemblyId: 'a', elementIds: [1],
      base: [
        { x: 0, y: -0.1, z: -0.25 }, { x: 0, y: 0.1, z: -0.25 },
        { x: 0, y: 0.1, z: 0.25 }, { x: 0, y: -0.1, z: 0.25 },
      ],
      extrude: { x: 3, y: 0, z: 0 },
      label: { key: 'detailing.scene.solid.member', params: { id: 1 } },
      reinforced: true,
    }],
  });

  it('is translucent and does not write depth', () => {
    const built = createRebarScene(s);
    const mat = built.solids[0].mesh.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeLessThan(0.5);
    expect(mat.depthWrite).toBe(false);
    built.dispose();
  });

  it('draws unreinforced concrete as its OWN mesh, so it can be seen as different', () => {
    // Merging it into the grey batch is how a member the app could not design becomes
    // indistinguishable from one it did.
    const built = createRebarScene(scene({
      solids: [
        { ...s.solids[0], id: 'member:1', reinforced: true },
        { ...s.solids[0], id: 'member:2', elementIds: [2], reinforced: false },
      ],
    }));
    const ok = built.solids.find((x) => x.reinforced);
    const bad = built.solids.find((x) => !x.reinforced);
    expect(ok).toBeDefined();
    expect(bad).toBeDefined();
    const okMat = ok!.mesh.material as THREE.MeshStandardMaterial;
    const badMat = bad!.mesh.material as THREE.MeshStandardMaterial;
    expect(badMat.color.getHex()).toBe(REBAR_COLORS.unreinforced);
    expect(badMat.color.getHex()).not.toBe(okMat.color.getHex());
    // And more opaque, so it reads as the exception rather than as more of the same.
    expect(badMat.opacity).toBeGreaterThan(okMat.opacity);
    built.dispose();
  });

  it('emits no unreinforced mesh when every member has steel', () => {
    const built = createRebarScene(s);
    expect(built.solids.some((x) => !x.reinforced)).toBe(false);
    built.dispose();
  });

  it('can be turned off to leave the bare cage', () => {
    const built = createRebarScene(s, { showConcrete: false });
    expect(built.solids).toHaveLength(0);
    built.dispose();
  });

  it('closes the prism: two caps and one quad per side', () => {
    const built = createRebarScene(s);
    // 4 sides × 2 + 2 caps × 2 = 12 triangles.
    expect(built.solids[0].mesh.geometry.getIndex()!.count / 3).toBe(12);
    built.dispose();
  });
});

describe('a conflict is a thing you can point at', () => {
  const s = scene({
    conflicts: [{
      assemblyId: 'a', at: { x: 1, y: 0, z: 0 }, barIds: ['b1', 'b2'],
      clearance: -0.006, required: 0.025, pairClass: 'prohibitedOverlap', shortfall: 0.01, severity: 'clearance' as const, elementIds: [1],
    }],
  });

  it('places one marker per conflict', () => {
    const built = createRebarScene(s);
    const marks = built.group.getObjectByName('rebar-conflicts') as THREE.InstancedMesh;
    expect(marks.count).toBe(1);
    built.dispose();
  });

  it('never shrinks a marker below visibility, however small the shortfall', () => {
    const built = createRebarScene(scene({
      conflicts: [{
        assemblyId: 'a', at: { x: 0, y: 0, z: 0 }, barIds: ['b1', 'b2'],
        clearance: 0.0249, required: 0.025, pairClass: 'x', shortfall: 0.01, severity: 'clearance' as const, elementIds: [1],
      }],
    }));
    const marks = built.group.getObjectByName('rebar-conflicts') as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    marks.getMatrixAt(0, m);
    // The instance matrix is float32, so the floor comes back a few ulps under it.
    expect(new THREE.Vector3().setFromMatrixScale(m).x).toBeGreaterThan(0.02 - 1e-7);
    built.dispose();
  });
});

// ─── Framing ─────────────────────────────────────────────────────

/**
 * Framed from an extent, not from a scene.
 *
 * `frameBounds(scene)` used to wrap this with `scene.bounds`, and the viewport no longer wants
 * that: it frames what the layer switches leave VISIBLE, which `visibleBounds` answers. A
 * one-line wrapper nothing but its own tests called is dead weight, so the tests point at the
 * function that does the work.
 */
describe('framing', () => {
  const bounds = () => scene().bounds;

  it('centres on the bounds and backs off enough to see them', () => {
    const f = frameExtent(bounds())!;
    expect(f.centre.x).toBeCloseTo(1.5, 9);
    expect(f.distance).toBeGreaterThan(1.5);
  });

  it('refuses to frame an empty scene', () => {
    expect(frameExtent(null)).toBeNull();
  });

  it('backs further off a TALL viewport, where the horizontal angle is the tight one', () => {
    // A panel narrower than it is tall constrains width, not height. Framing on the vertical
    // fov alone would fit the height and let the scene run off both sides — which is exactly
    // what this view did before the aspect was passed in.
    const wide = frameExtent(bounds(), 50, 2)!;
    const tall = frameExtent(bounds(), 50, 0.5)!;
    expect(tall.distance).toBeGreaterThan(wide.distance);
  });

  it('is unaffected by aspect once the vertical angle is the tight one', () => {
    // Beyond square, the vertical fov governs and widening the canvas cannot require more
    // distance. A framing that kept receding with aspect would shrink the scene for nothing.
    expect(frameExtent(bounds(), 50, 4)!.distance)
      .toBeCloseTo(frameExtent(bounds(), 50, 2)!.distance, 9);
  });
});
