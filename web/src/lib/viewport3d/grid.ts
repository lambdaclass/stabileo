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
  /**
   * What the camera is looking at, and how much world is across the screen.
   *
   * `u`/`v` are the target's coordinates IN the working plane; `span` is the
   * visible world width at that distance. Optional so the first build, before
   * a camera exists, still draws something sensible.
   */
  view?: { u: number; v: number; span: number },
): THREE.Object3D | null {
  // Remove old grid
  if (oldGridGroup) {
    scene.remove(oldGridGroup);
    disposeObject(oldGridGroup);
  }

  if (!showGrid) return null;

  /*
   * ── One grid, at a density that does not change across the floor ───
   *
   * It was two: a FINE grid at the requested spacing over as much as a line
   * budget allowed, and a COARSE one carrying the full extent. Near the
   * origin you therefore saw both — a metre grid on top of an eighty-metre
   * one — and past the fine patch only the coarse. The floor was far denser
   * at 0,0,0 than a few thousand metres out, which is what it looked like.
   *
   * One spacing everywhere fixes the density, and the cost is that the
   * spacing cannot then also be the one that was asked for at every zoom: ten
   * kilometres of one-metre grid is ten thousand divisions, which is a line
   * per pixel and twenty thousand segments rebuilt whenever the plane moves.
   *
   * So the grid FOLLOWS THE VIEW, which is what every CAD program does with
   * one. The spacing is a round multiple of the reader's, chosen so roughly
   * `TARGET_LINES` of them cross what is on screen; the patch is centred on
   * what the camera is looking at, snapped to that spacing so the lines do
   * not crawl as you pan; and the reader's extent is a hard limit the patch
   * is clipped to, so "10 000 × 10 000" still means what it says.
   *
   * Round multiples on purpose: 1 m becomes 10 m, never 8.3 m, so a line
   * always lands on a coordinate a reader recognises.
   */
  const MAX_DIVISIONS = 240;
  const TARGET_LINES = 28;
  const ROUND_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const base = Math.max(gridSize3D, 1e-6);

  /* No camera yet (first build): show the reader's own spacing. */
  const span = view && view.span > 0 ? view.span : base * TARGET_LINES;

  let spacing = base;
  for (const k of ROUND_STEPS) {
    spacing = base * k;
    if (span / spacing <= TARGET_LINES) break;
  }
  /*
   * Never coarser than the extent can hold two of.
   *
   * Without this the floor below multiplies it straight back up: pulled far
   * enough out the spacing reaches 10 km, and a 20 m grid rounded to "at
   * least two divisions" then drew 20 KILOMETRES — the one number the reader
   * explicitly capped.
   */
  spacing = Math.min(spacing, gridExtent / 2);

  /* Whole cells, bounded, and never wider than the extent that was asked for. */
  const wanted = Math.min(gridExtent, spacing * MAX_DIVISIONS, Math.max(span * 2.5, spacing * 4));
  const divisions = Math.max(2, Math.min(MAX_DIVISIONS, Math.round(wanted / spacing)));
  const extent = divisions * spacing;

  const grid: THREE.Object3D = new THREE.GridHelper(extent, divisions, 0x3d4b57, 0x27333d);

  setPlaneOffset(grid, workingPlane, nodeCreateZ);

  /*
   * Centred on what the camera is looking at, snapped to the spacing so the
   * lines stay on their coordinates while you pan instead of crawling, and
   * clamped so the patch never leaves the extent the reader asked for.
   */
  if (view) {
    const half = Math.max(0, (gridExtent - extent) / 2);
    const snap = (v: number) => {
      const q = Math.round(v / spacing) * spacing;
      return Math.max(-half, Math.min(half, q));
    };
    if (workingPlane === 'XY') { grid.position.x = snap(view.u); grid.position.y = snap(view.v); }
    else if (workingPlane === 'XZ') { grid.position.x = snap(view.u); grid.position.z = snap(view.v); }
    else { grid.position.y = snap(view.u); grid.position.z = snap(view.v); }
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
