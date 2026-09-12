import * as THREE from 'three';
import { AXIS_COLORS } from '../three/selection-helpers';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { disposeObject } from '../three/selection-helpers';
import { setPlaneOffset, type WorkingPlane3D } from '../geometry/coordinate-system';

/**
 * Remove the old grid (if any), optionally create a new one based on settings,
 * add it to the scene, and return the new grid (or null).
 */
export function updateGrid(
  scene: THREE.Scene,
  oldGridGroup: THREE.Object3D | null,
  showGrid: boolean,
  gridSize3D: number,
  gridExtent: number,
  workingPlane: WorkingPlane3D,
  nodeCreateZ: number,
): THREE.Object3D | null {
  // Remove old grid
  if (oldGridGroup) {
    scene.remove(oldGridGroup);
    disposeObject(oldGridGroup);
  }

  if (!showGrid) return null;

  /*
   * ── Two grids, because one cannot serve both distances ────────────
   *
   * A single GridHelper has one spacing, and a line budget forces that
   * spacing to grow with the extent: ten kilometres inside 400 divisions is a
   * line every 25 m. At a working zoom the camera then sits INSIDE one cell
   * and the floor is blank — "set the grid to 10000 and it does not even
   * show", which is exactly right and was not a rendering fault.
   *
   * So: a FINE grid at the spacing that was asked for, covering as much as
   * the budget allows around the origin, and a COARSE one carrying the full
   * extent at a round multiple. Close in you read the fine one; zoomed out it
   * falls below a pixel and the coarse one is what remains. Nothing is
   * per-frame — two static meshes, chosen once.
   *
   * The multiples are round on purpose, so lines land on coordinates a reader
   * recognises: 1 m becomes 10 m, never 8.3 m.
   */
  const MAX_DIVISIONS = 400;
  const ROUND_STEPS = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const spacing = Math.max(gridSize3D, 1e-6);

  const group = new THREE.Group();
  group.name = 'grid';

  /* The fine grid: the requested spacing, over as much as the budget buys. */
  const fineExtent = Math.min(gridExtent, spacing * MAX_DIVISIONS);
  const fineDivisions = Math.max(1, Math.round(fineExtent / spacing));
  const fine = new THREE.GridHelper(fineExtent, fineDivisions, 0x3d4b57, 0x27333d);
  group.add(fine);

  /*
   * The coarse grid, only when the extent reaches past the fine one. Aimed at
   * ~120 divisions: enough that a line is always in view at any zoom that can
   * see the whole extent, few enough to stay cheap.
   */
  if (gridExtent > fineExtent * 1.01) {
    const want = gridExtent / 120;
    let coarse = spacing;
    for (const k of ROUND_STEPS) {
      coarse = spacing * k;
      if (coarse >= want) break;
    }
    const coarseDivisions = Math.max(1, Math.min(MAX_DIVISIONS, Math.round(gridExtent / coarse)));
    /* Dimmer than the fine grid: it is the backdrop, not the ruler. */
    const far = new THREE.GridHelper(gridExtent, coarseDivisions, 0x33404b, 0x1f2933);
    /* Under the fine one where they overlap, so the ruler stays on top. */
    far.renderOrder = -1;
    group.add(far);
  }

  const grid: THREE.Object3D = group;

  setPlaneOffset(grid, workingPlane, nodeCreateZ);

  scene.add(grid);
  return grid;
}

/**
 * Create a group with fat XYZ axis lines (red, green, blue).
 */
export function createFatAxes(fatLineResolution: THREE.Vector2): THREE.Group {
  const group = new THREE.Group();
  const axes = [
    { positions: [0, 0, 0, 3, 0, 0], color: AXIS_COLORS.x }, // X = red
    { positions: [0, 0, 0, 0, 3, 0], color: AXIS_COLORS.y }, // Y = green
    { positions: [0, 0, 0, 0, 0, 3], color: AXIS_COLORS.z }, // Z = blue
  ];
  for (const a of axes) {
    const geo = new LineGeometry();
    geo.setPositions(a.positions);
    const mat = new LineMaterial({
      color: a.color,
      linewidth: 2,
      worldUnits: false,
      depthTest: false,
      depthWrite: false,
      resolution: fatLineResolution,
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    line.renderOrder = 1;
    group.add(line);
  }
  return group;
}

/**
 * Create X/Y/Z label sprites and add them to the scene.
 * Returns the created sprites so the caller can track them.
 */
export function addAxisLabels(scene: THREE.Scene): THREE.Sprite[] {
  const sprites: THREE.Sprite[] = [];
  const labels = [
    { text: 'X', color: '#ff4444', pos: new THREE.Vector3(3.4, 0, 0) },
    { text: 'Y', color: '#44ff44', pos: new THREE.Vector3(0, 3.4, 0) },
    { text: 'Z', color: '#4488ff', pos: new THREE.Vector3(0, 0, 3.4) },
  ];
  for (const { text, color, pos } of labels) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(0.35, 0.35, 1);
    sprite.renderOrder = 1;
    scene.add(sprite);
    sprites.push(sprite);
  }
  return sprites;
}
