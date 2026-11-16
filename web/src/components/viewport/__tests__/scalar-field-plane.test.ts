import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createViewerPerspectiveCamera } from '../../../lib/viewport3d/scene-setup';
import {
  fitScalarFieldCamera,
  pickingPlane,
  planeRotationX,
  planeToWorld,
  projectedDataAxes,
  standsUp,
  worldToPlane,
  type ScalarFieldPlane,
  type ScalarFieldProjection,
} from '../scalar-field-plane';

const WIDTH = 600;
const HEIGHT = 400;
const ARCH: [number, number, number, number] = [-5, 0, 5, 4];

function fitted(plane: ScalarFieldPlane, projection: ScalarFieldProjection, bounds: readonly [number, number, number, number] = ARCH) {
  const camera = createViewerPerspectiveCamera();
  camera.aspect = WIDTH / HEIGHT;
  const fit = fitScalarFieldCamera(plane, projection, bounds, camera.aspect, camera.fov);
  camera.position.copy(fit.position);
  camera.near = fit.near;
  camera.far = fit.far;
  camera.updateProjectionMatrix();
  camera.lookAt(fit.target);
  camera.updateMatrixWorld();
  return camera;
}

const viewDirection = (camera: THREE.Camera) => camera.getWorldDirection(new THREE.Vector3());
const screenUp = (camera: THREE.Camera) => new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

describe('the plane mapping', () => {
  it.each([
    ['plan', [2, 3, 0]],
    ['elevation', [2, 0, 3]],
  ] as const)('puts the data (2, 3) of a %s at %j and reads it back, as the rotated mesh does', (plane, world) => {
    expect(planeToWorld(plane, 2, 3).toArray()).toEqual(world);
    expect(worldToPlane(plane, new THREE.Vector3(...world))).toEqual([2, 3]);
    const group = new THREE.Group();
    group.rotation.x = planeRotationX(plane);
    group.updateMatrixWorld();
    const local = new THREE.Vector3(2, 3, 0).applyMatrix4(group.matrixWorld);
    expect(local.distanceTo(new THREE.Vector3(...world))).toBeLessThan(1e-12);
    expect(pickingPlane(plane).distanceToPoint(local)).toBeCloseTo(0, 12);
  });

  it('keeps the mesh edges on the camera side of an elevation', () => {
    const group = new THREE.Group();
    group.rotation.x = planeRotationX('elevation');
    group.updateMatrixWorld();
    const lifted = new THREE.Vector3(0, 0, 1e-6).applyMatrix4(group.matrixWorld);
    expect(lifted.y).toBeLessThan(0);
    expect(fitted('elevation', 'plan').position.y).toBeLessThan(0);
  });
});

describe('the camera fit', () => {
  it.each([
    ['plan', ['plan']],
    ['elevation', ['plan', 'orbit']],
  ] as const)('keeps Z up and the whole %s region in view in %j', (plane, projections) => {
    for (const projection of projections) {
      const camera = fitted(plane, projection);
      expect(camera.up.toArray()).toEqual([0, 0, 1]);
      for (const [x, y] of [[ARCH[0], ARCH[1]], [ARCH[2], ARCH[1]], [ARCH[0], ARCH[3]], [ARCH[2], ARCH[3]]]) {
        const p = planeToWorld(plane, x, y).project(camera);
        expect(Math.abs(p.x)).toBeLessThan(1);
        expect(Math.abs(p.y)).toBeLessThan(1);
      }
    }
  });

  it('looks down at a plan in 2D, tipped just enough for Z to stay the orbit axis', () => {
    const d = viewDirection(fitted('plan', 'plan'));
    expect(d.z).toBeLessThan(-0.999);
    expect(d.y).toBeGreaterThan(0);
  });

  it('looks horizontally along +Y at an elevation in 2D, with Z straight up on screen', () => {
    const camera = fitted('elevation', 'plan');
    expect(viewDirection(camera).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
    expect(screenUp(camera).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
  });

  it('looks slightly down at a standing elevation in 3D, from the front right', () => {
    const d = viewDirection(fitted('elevation', 'orbit'));
    expect(d.y).toBeGreaterThan(0.7);
    expect(d.x).toBeLessThan(0);
    expect(d.z).toBeLessThan(0);
    expect(d.z).toBeGreaterThan(-0.5);
    expect(screenUp(fitted('elevation', 'orbit')).z).toBeGreaterThan(0.9);
  });

  const axes = (plane: ScalarFieldPlane, projection: ScalarFieldProjection, bounds: readonly [number, number, number, number] = ARCH) => projectedDataAxes(plane, fitted(plane, projection, bounds), bounds, WIDTH, HEIGHT);

  it('draws the data y axis of an elevation screen-vertical in 2D and keeps it standing in 3D', () => {
    const flat = axes('elevation', 'plan');
    expect(Math.abs(flat.y[0])).toBeLessThan(1e-6);
    expect(flat.y[1]).toBeLessThan(0);
    expect(Math.abs(flat.x[1])).toBeLessThan(1e-6);
    expect(flat.x[0]).toBeGreaterThan(0);
    expect(standsUp(flat, axes('elevation', 'orbit'))).toBe(true);
    for (const tall of [[0, 0, 0.5, 10], [0, 0, 10, 0.5]] as const) expect(standsUp(axes('elevation', 'plan', tall), axes('elevation', 'orbit', tall))).toBe(true);
  });

  it('would catch an elevation drawn lying on the floor: the plan 3D view fails the same check', () => {
    for (const bounds of [ARCH, [0, 0, 0.5, 10], [0, 0, 10, 0.5]] as const) {
      expect(standsUp(axes('plan', 'plan', bounds), axes('plan', 'orbit', bounds))).toBe(false);
    }
  });

  it('keeps the plan default exactly where the viewer always put it', () => {
    const fit = fitScalarFieldCamera('plan', 'orbit', [0, 0, 2, 2], 1, 50);
    const dist = (1.08 * 2) / 2 / Math.tan(THREE.MathUtils.degToRad(25));
    expect(fit.target.toArray()).toEqual([1, 1, 0]);
    expect(fit.position.distanceTo(new THREE.Vector3(1 + dist * 0.45, 1 - dist * 0.75, dist * 0.6))).toBeLessThan(1e-12);
    const top = fitScalarFieldCamera('plan', 'plan', [0, 0, 2, 2], 1, 50);
    expect(top.position.distanceTo(new THREE.Vector3(1, 1 - dist * Math.sin(0.018), dist * Math.cos(0.018)))).toBeLessThan(1e-12);
  });
});
