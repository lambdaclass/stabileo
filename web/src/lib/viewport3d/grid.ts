import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { disposeObject } from '../three/selection-helpers';

/**
 * Remove the old grid (if any), optionally create a new one based on settings,
 * add it to the scene, and return the new grid (or null).
 */
export function updateGrid(
  scene: THREE.Scene,
  oldGridGroup: THREE.Object3D | null,
  showGrid: boolean,
  gridSize3D: number,
  workingPlane: 'XY' | 'YZ' | 'XZ',
  nodeCreateZ: number,
): THREE.Object3D | null {
  // Remove old grid
  if (oldGridGroup) {
    scene.remove(oldGridGroup);
    disposeObject(oldGridGroup);
  }

  if (!showGrid) return null;

  const gridSize = 20;
  const divisions = Math.round(gridSize / gridSize3D);
  const grid = new THREE.GridHelper(gridSize, divisions, 0x1a4a7a, 0x0f3460);

  if (workingPlane === 'XY') {
    // Default horizontal plane for Z-up scenes: grid on XY at z = nodeCreateZ.
    grid.rotation.x = Math.PI / 2;
    grid.position.z = nodeCreateZ;
  } else if (workingPlane === 'XZ') {
    // Vertical elevation plane (normal = Y).
    grid.position.y = nodeCreateZ;
  } else if (workingPlane === 'YZ') {
    // Rotate grid to lie on YZ plane (normal = X)
    grid.rotation.z = Math.PI / 2;
    grid.position.x = nodeCreateZ;
  }

  scene.add(grid);
  return grid;
}

/**
 * Create a group with fat XYZ axis lines (red, green, blue).
 */
export function createFatAxes(fatLineResolution: THREE.Vector2): THREE.Group {
  const group = new THREE.Group();
  const axes = [
    { positions: [0, 0, 0, 3, 0, 0], color: 0xff4444 }, // X = red
    { positions: [0, 0, 0, 0, 3, 0], color: 0x44ff44 }, // Y = green
    { positions: [0, 0, 0, 0, 0, 3], color: 0x4488ff }, // Z = blue
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
