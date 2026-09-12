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
   * ── A line budget, because the extent is now a real range ────────
   *
   * PRO's grid reaches 10 km. At a 1 m spacing that is ten thousand
   * divisions — twenty thousand line segments — rebuilt every time the
   * working plane moves, for a floor nobody can see the lines of anyway at
   * that zoom.
   *
   * So the spacing is coarsened when the count would be absurd: the grid
   * keeps its extent and draws at a multiple of the requested spacing. The
   * multiple is a round one, so the lines still land on coordinates a
   * reader recognises — 1 m becomes 10 m, not 8.3 m.
   */
  const MAX_DIVISIONS = 400;
  let spacing = Math.max(gridSize3D, 1e-6);
  let divisions = Math.max(1, Math.round(gridExtent / spacing));
  if (divisions > MAX_DIVISIONS) {
    const rounds = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
    for (const k of rounds) {
      if (Math.round(gridExtent / (spacing * k)) <= MAX_DIVISIONS) { spacing *= k; break; }
    }
    divisions = Math.max(1, Math.round(gridExtent / spacing));
    if (divisions > MAX_DIVISIONS) divisions = MAX_DIVISIONS;
  }
  /*
   * Neutral, and weaker than a panel hairline. The grid was two navy blues from
   * the old palette, which put a saturated colour across the whole floor and
   * left it competing with the model instead of sitting behind it. Centre line
   * slightly stronger than the rest, which is what a grid is for.
   */
  const grid = new THREE.GridHelper(gridExtent, divisions, 0x3d4b57, 0x27333d);

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
