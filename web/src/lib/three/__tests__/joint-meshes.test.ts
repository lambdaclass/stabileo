/**
 * The bolted joint's meshes — the half `joint-layout.test.ts` cannot reach.
 *
 * That file proves the placement arithmetic. This one proves what is built from it: that the
 * plate is ORIENTED rather than axis-aligned, that its holes are real perforations, that a bolt
 * passes through the plate rather than lying in it, and that a joint with no geometry produces
 * no mesh.
 *
 * The regression that motivated all of it, measured on the default shed at joint node 9 — whose
 * first member runs along global Z — is the first test below: four of six bolts stood outside
 * the plate, because the frame the layout computed never crossed into the viewport.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildJointMeshes } from '../joint-meshes';
import { jointSceneLayout } from '../joint-layout';
import { designJoint } from '../../connection/joint-design';
import type { BoltLayoutChoice } from '../../connection/bolted-joint';
import type { JointDesign } from '../../connection/joint-design';

const BOLTS: BoltLayoutChoice = {
  diameterMm: 20, grade: 'A325', threads: 'excluded', count: 6, rows: 2,
  spacingMm: 60, edgeDistanceMm: 35,
};

/** A joint with drawable geometry, at the origin unless moved. */
function design(over: Partial<Parameters<typeof designJoint>[0]> = {}): JointDesign {
  return designJoint({
    nodeId: 9,
    elementIds: [1, 2],
    elements: new Map([
      [1, { id: 1, nodeI: 9, nodeJ: 10 }],
      [2, { id: 2, nodeI: 8, nodeJ: 9 }],
    ]),
    combos: [],
    originM: { x: 0.3, y: 0, z: 0 },
    bolts: BOLTS,
    plate: { thicknessMm: 12, fuMPa: 400 },
    ...over,
  });
}

const VERTICAL = { x: 0, y: 0, z: 1 };
const meshesFor = (axis = VERTICAL, d = design()) =>
  buildJointMeshes(jointSceneLayout(d, axis), 9);

const byType = (m: THREE.Mesh[], type: string) =>
  m.filter((x) => (x.userData as { type?: string }).type === type);

// ── Orientation: the defect this module was written for ───────────────────

describe('the plate is oriented by the joint frame', () => {
  it('puts every bolt inside the plate, for a member along Z', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const plate = layout.plate!;
    const frame = layout.frame!;
    const dot = (a: THREE.Vector3, b: { x: number; y: number; z: number }) =>
      a.x * b.x + a.y * b.y + a.z * b.z;

    for (const bolt of layout.bolts) {
      const d = new THREE.Vector3(
        bolt.centreM.x - plate.centreM.x,
        bolt.centreM.y - plate.centreM.y,
        bolt.centreM.z - plate.centreM.z,
      );
      expect(Math.abs(dot(d, frame.u))).toBeLessThanOrEqual(plate.lengthM / 2 + 1e-9);
      expect(Math.abs(dot(d, frame.v))).toBeLessThanOrEqual(plate.widthM / 2 + 1e-9);
    }
  });

  it('would have left four of six outside an axis-aligned box — the regression, pinned', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const p = layout.plate!;
    let outside = 0;
    for (const bolt of layout.bolts) {
      const dx = Math.abs(bolt.centreM.x - p.centreM.x);
      const dy = Math.abs(bolt.centreM.y - p.centreM.y);
      const dz = Math.abs(bolt.centreM.z - p.centreM.z);
      if (dx > p.lengthM / 2 + 1e-9 || dy > p.widthM / 2 + 1e-9 || dz > p.thicknessM / 2 + 1e-9) {
        outside++;
      }
    }
    // Not a claim about the fix — a claim about the SHAPE of the bug, so a future change that
    // silently reverts to an axis-aligned box fails here instead of looking fine.
    expect(outside).toBe(4);
  });

  it('rotates the plate mesh onto the frame rather than leaving it axis-aligned', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const [plate] = byType(buildJointMeshes(layout, 9).meshes, 'jointPlate');
    const frame = layout.frame!;
    // The mesh's local X must be the frame's `u`: that is what «oriented» means here.
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(plate.quaternion);
    expect(localX.x).toBeCloseTo(frame.u.x, 9);
    expect(localX.y).toBeCloseTo(frame.u.y, 9);
    expect(localX.z).toBeCloseTo(frame.u.z, 9);
    expect(plate.quaternion.length()).toBeCloseTo(1, 9);
  });

  it('keeps the frame orthonormal and right-handed', () => {
    for (const axis of [VERTICAL, { x: 1, y: 0, z: 0 }, { x: 3, y: -2, z: 1 }]) {
      const f = jointSceneLayout(design(), axis).frame!;
      const u = new THREE.Vector3(f.u.x, f.u.y, f.u.z);
      const v = new THREE.Vector3(f.v.x, f.v.y, f.v.z);
      const n = new THREE.Vector3(f.n.x, f.n.y, f.n.z);
      expect(u.length()).toBeCloseTo(1, 9);
      expect(v.length()).toBeCloseTo(1, 9);
      expect(n.length()).toBeCloseTo(1, 9);
      expect(u.dot(v)).toBeCloseTo(0, 9);
      expect(u.dot(n)).toBeCloseTo(0, 9);
      expect(v.dot(n)).toBeCloseTo(0, 9);
      // Right-handed: u × v === n, so the hole pattern is not mirrored.
      const cross = new THREE.Vector3().crossVectors(u, v);
      expect(cross.distanceTo(n)).toBeCloseTo(0, 9);
    }
  });
});

// ── Holes ─────────────────────────────────────────────────────────────────

describe('the holes are real perforations', () => {
  it('carries one hole per bolt, at the design positions and Tabla J.3.3 diameter', () => {
    const d = design();
    const layout = jointSceneLayout(d, VERTICAL);
    const source = d.plate.state === 'available' ? d.plate.plate : null;
    expect(source).not.toBeNull();
    expect(layout.plate!.holes).toHaveLength(source!.holesM.length);
    expect(layout.plate!.holes).toHaveLength(layout.bolts.length);
    for (const [i, hole] of layout.plate!.holes.entries()) {
      expect(hole.uv).toEqual(source!.holesM[i]);
      expect(hole.diameterM).toBe(source!.holeDiameterM);
    }
  });

  it('cuts them out of the plate geometry, so the plate is not a solid slab', () => {
    const [plate] = byType(meshesFor().meshes, 'jointPlate');
    const solid = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.13, 0.012));
    const perforated = plate.geometry.attributes.position.count;
    // A perforated extrusion carries far more vertices than a box: the holes are geometry, not
    // a texture. The comparison is against a box of the same size so the assertion is about the
    // perforation and not about tessellation in general.
    expect(perforated).toBeGreaterThan(solid.geometry.attributes.position.count * 4);
  });

  it('draws the shank narrower than its hole — the J.3.3 clearance, visible', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const hole = layout.plate!.holes[0];
    const bolt = layout.bolts[0];
    expect(bolt.diameterM).toBeLessThan(hole.diameterM);
    // 20 mm nominal in a 22 mm hole.
    expect(bolt.diameterM * 1000).toBeCloseTo(20, 6);
    expect(hole.diameterM * 1000).toBeCloseTo(22, 6);
  });
});

// ── Bolts ─────────────────────────────────────────────────────────────────

describe('a bolt goes through the plate, with a head on it', () => {
  it('builds a shank and a head for every bolt', () => {
    const built = meshesFor();
    const bolts = byType(built.meshes, 'jointBolt');
    const parts = bolts.map((b) => (b.userData as { part?: string }).part);
    expect(parts.filter((p) => p === 'shank')).toHaveLength(6);
    expect(parts.filter((p) => p === 'head')).toHaveLength(6);
    expect(byType(built.meshes, 'jointPlate')).toHaveLength(1);
  });

  it('gives the shank the nominal diameter, from the bolt area the checks used', () => {
    const d = design();
    const layout = jointSceneLayout(d, VERTICAL);
    const fromArea = 2 * Math.sqrt(d.bolts.boltAreaCm2! / Math.PI) / 100;
    expect(layout.bolts[0].diameterM).toBeCloseTo(fromArea, 12);
    expect(layout.bolts[0].diameterM * 1000).toBeCloseTo(BOLTS.diameterMm, 6);
  });

  it('points the shank along the plate normal, not along the cylinder default', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const built = buildJointMeshes(layout, 9);
    const shank = byType(built.meshes, 'jointBolt')
      .find((m) => (m.userData as { part?: string }).part === 'shank')!;
    // A cylinder is born along +Y; after the turn its axis must be the frame normal.
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(shank.quaternion);
    const n = layout.frame!.n;
    expect(axis.x).toBeCloseTo(n.x, 9);
    expect(axis.y).toBeCloseTo(n.y, 9);
    expect(axis.z).toBeCloseTo(n.z, 9);
    // And the normal is NOT global Y here, so the assertion above has teeth.
    expect(Math.abs(n.y)).toBeLessThan(0.5);
  });

  it('puts the head clear of the plate, on the +n face', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const built = buildJointMeshes(layout, 9);
    const bolts = byType(built.meshes, 'jointBolt');
    const shank = bolts.find((m) => (m.userData as { part?: string }).part === 'shank')!;
    const head = bolts.find((m) => (m.userData as { part?: string }).part === 'head')!;
    const n = new THREE.Vector3(layout.frame!.n.x, layout.frame!.n.y, layout.frame!.n.z);
    const offset = head.position.clone().sub(shank.position);
    // Along +n, and beyond half the plate thickness so it does not sit inside the plate.
    expect(offset.dot(n)).toBeGreaterThan(layout.plate!.thicknessM / 2);
    expect(offset.clone().projectOnPlane(n).length()).toBeCloseTo(0, 9);
  });

  it('draws the head as a hexagon, and only as a drawing convention', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const bolt = layout.bolts[0];
    // Wider than the shank so it reads as a head, and clear of its neighbour at the §J.3.3
    // minimum spacing of 3d — otherwise a group merges into one blob.
    expect(bolt.head.diameterM).toBeGreaterThan(bolt.diameterM);
    expect(bolt.head.diameterM).toBeLessThan(3 * bolt.diameterM);
    expect(bolt.head.heightM).toBeGreaterThan(0);
  });
});

// ── Nothing drawn, and why ────────────────────────────────────────────────

describe('a joint with no geometry builds no mesh', () => {
  it('draws nothing and names the missing input when the plate is unavailable', () => {
    const d = design({ plate: {} }); // no thickness → GEOMETRY_UNAVAILABLE
    expect(d.plate.state).toBe('GEOMETRY_UNAVAILABLE');
    const layout = jointSceneLayout(d, VERTICAL);
    expect(layout.plate).toBeNull();
    expect(layout.frame).toBeNull();
    expect(buildJointMeshes(layout, 9).meshes).toHaveLength(0);
    expect(layout.emptyReasonKeys.length).toBeGreaterThan(0);
    expect(layout.emptyReasonKeys).toContain('plate.missing.thickness');
  });

  it('draws nothing for a joint that was never designed, and says so', () => {
    const d = design({ bolts: null, plate: {} });
    expect(d.state).toBe('notDesigned');
    const layout = jointSceneLayout(d, VERTICAL);
    expect(buildJointMeshes(layout, 9).meshes).toHaveLength(0);
    expect(layout.emptyReasonKeys.length).toBeGreaterThan(0);
  });

  it('reports no bounding radius when there is nothing to frame', () => {
    const layout = jointSceneLayout(design({ plate: {} }), VERTICAL);
    expect(buildJointMeshes(layout, 9).boundingRadiusM).toBe(0);
  });
});

// ── exceeded keeps its geometry ───────────────────────────────────────────

describe('a joint whose checks failed is still drawn', () => {
  /**
   * A spacing that violates §J.3.3's `s >= 3d` minimum: the check fails and the geometry is
   * intact. Same route `joint-design.test.ts` uses for its own `exceeded` case, so this file
   * does not invent a second way to fail — and it needs no analysis results, which keeps the
   * fixture about the drawing rather than about the solver.
   */
  const exceeded = () => designJoint({
    nodeId: 9,
    elementIds: [1],
    elements: new Map([[1, { id: 1, nodeI: 9, nodeJ: 10 }]]),
    combos: [],
    originM: { x: 0, y: 0, z: 0 },
    bolts: { ...BOLTS, count: 2, rows: 1, spacingMm: 10 },
    plate: { thicknessMm: 10, fuMPa: 400 },
  });

  it('is exceeded, and still produces a plate and its bolts', () => {
    const d = exceeded();
    expect(d.state).toBe('exceeded');
    const built = meshesFor(VERTICAL, d);
    expect(byType(built.meshes, 'jointPlate')).toHaveLength(1);
    expect(byType(built.meshes, 'jointBolt').length).toBeGreaterThan(0);
    expect(built.boundingRadiusM).toBeGreaterThan(0);
  });

  it('is drawn with the same materials as a passing joint — no second verdict system', () => {
    const pass = byType(meshesFor().meshes, 'jointPlate')[0];
    const fail = byType(meshesFor(VERTICAL, exceeded()).meshes, 'jointPlate')[0];
    const colourOf = (m: THREE.Mesh) =>
      (m.material as THREE.MeshStandardMaterial).color.getHex();
    expect(colourOf(fail)).toBe(colourOf(pass));
  });
});

// ── Framing ───────────────────────────────────────────────────────────────

describe('the bounding radius is what makes the joint inspectable', () => {
  it('contains the plate and the bolt heads that stand proud of it', () => {
    const layout = jointSceneLayout(design(), VERTICAL);
    const { boundingRadiusM } = buildJointMeshes(layout, 9);
    const p = layout.plate!;
    const halfDiagonal = Math.hypot(p.lengthM / 2, p.widthM / 2, p.thicknessM / 2);
    expect(boundingRadiusM).toBeGreaterThanOrEqual(halfDiagonal);
    for (const bolt of layout.bolts) {
      const d = Math.hypot(
        bolt.centreM.x - p.centreM.x, bolt.centreM.y - p.centreM.y, bolt.centreM.z - p.centreM.z,
      );
      expect(boundingRadiusM).toBeGreaterThanOrEqual(d);
    }
  });

  it('is small enough against a shed to show why framing is needed at all', () => {
    const { boundingRadiusM } = buildJointMeshes(jointSceneLayout(design(), VERTICAL), 9);
    // A 20 m shed against a joint this size: under a pixel on a 1600 px viewport.
    expect(boundingRadiusM * 2 / 20).toBeLessThan(0.05);
  });
});

// ── Picking ───────────────────────────────────────────────────────────────

describe('every mesh carries what a click needs', () => {
  it('tags each part pickable and with its node id', () => {
    for (const mesh of meshesFor().meshes) {
      const ud = mesh.userData as { type?: string; nodeId?: number; jointPickable?: boolean };
      expect(ud.jointPickable).toBe(true);
      expect(ud.nodeId).toBe(9);
      expect(['jointPlate', 'jointBolt']).toContain(ud.type);
    }
  });
});
