import * as THREE from 'three';
import { AXIS_COLORS } from '../three/selection-helpers';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { disposeObject } from '../three/selection-helpers';
import { setPlaneOffset, type WorkingPlane3D } from '../geometry/coordinate-system';

/**
 * How the grid is laid out for a given zoom: its pitches, size and where it sits.
 *
 * Separated from the drawing because the viewport asks this every frame, cheaply, to know
 * whether anything would change; a rebuild happens only when the answer does.
 */
export interface GridLayout {
  /** The finest pitch drawn: the reader's spacing, or ten or a hundred times it when zoomed far out. */
  spacing: number;
  /** The emphasised lines, every ten of `spacing`; 0 when the extent cannot hold two of them. */
  major: number;
  /** Cells of `spacing` across the patch; always even. */
  divisions: number;
  extent: number;
  /** Centre of the patch, in the working plane's own two axes, on a multiple of the coarsest pitch drawn. */
  cu: number;
  cv: number;
  /** Opacity of the fine lines, 0.2 to 1, in steps of 0.2: they fade as they crowd. */
  fade: number;
}

/*
 * ── The lines are where a node snaps, at every zoom ───────────────────
 *
 * The grid used to pick its spacing from the zoom, as a round multiple of the reader's
 * (1, 2, 5, 10, 20 …), so about 28 lines crossed the screen at any zoom. The pointer kept
 * snapping to the reader's spacing, so a zoom out showed 5 m cells over a 1 m snap, and each
 * step of the wheel redrew the floor at another pitch: the grid stopped saying where a node
 * would land.
 *
 * Now the pitches are fixed by the reader's spacing s alone: fine lines every s, emphasised
 * lines every 10·s. The zoom only decides whether the fine lines are drawn: they fade as they
 * crowd and, past `MAX_CELLS` across the screen, the level goes and 10·s becomes the fine one
 * (with 100·s emphasised). A line that is drawn sits on the same coordinate at every zoom.
 *
 * The patch follows the view, clipped to the reader's extent, so a ten-kilometre site does not
 * cost a line every metre over ten kilometres.
 */
/** Fine cells across the screen past which the finest level is dropped. */
const MAX_CELLS = 120;
/** Fine cells across the screen at which they start to fade. */
const FADE_FROM = 50;
const LEVEL = 10;

export function gridLayout(
  gridSize3D: number, gridExtent: number,
  view?: { u: number; v: number; span: number },
): GridLayout {
  const s = Math.max(gridSize3D, 1e-6);
  const extentMax = Math.max(gridExtent, 2 * s);
  /* No camera yet (first build): the reader's spacing, a comfortable patch of it. */
  const span = view && view.span > 0 ? view.span : s * 28;

  /* The finest level that is not a line every few pixels, and never coarser than the extent holds two of. */
  let spacing = s;
  while (span / spacing > MAX_CELLS && spacing * LEVEL * 2 <= extentMax) spacing *= LEVEL;
  const cells = span / spacing;
  const fade = cells <= FADE_FROM ? 1
    : Math.max(0.2, Math.round((1 - (cells - FADE_FROM) / (MAX_CELLS - FADE_FROM)) * 5) / 5);

  let major = spacing * LEVEL;
  if (2 * major > extentMax) major = 0;
  /* The coarsest pitch drawn: the patch is a whole, even number of these, so both levels land on it. */
  const unit = major || spacing;

  const half = Math.min(extentMax / 2, Math.max(span * 1.25, 2 * unit));
  let halfCells = Math.ceil(half / unit - 1e-9);
  while (halfCells > 1 && 2 * halfCells * unit > extentMax + 1e-9) halfCells--;
  const extent = 2 * Math.max(1, halfCells) * unit;
  const divisions = Math.round(extent / spacing);

  /*
   * Centred on what the camera is looking at, on a multiple of the coarsest pitch so the lines
   * keep their coordinates while you pan, and kept inside the extent the reader asked for.
   */
  let cu = 0;
  let cv = 0;
  if (view) {
    const room = Math.floor(Math.max(0, (extentMax - extent) / 2) / unit + 1e-9) * unit;
    const snap = (v: number) => Math.max(-room, Math.min(room, Math.round(v / unit) * unit));
    cu = snap(view.u);
    cv = snap(view.v);
  }
  return { spacing, major, divisions, extent, cu, cv, fade };
}

/**
 * A layout's identity, for deciding whether the grid needs rebuilding at all.
 *
 * Rounded, because `cu` and `cv` are already snapped and floating-point noise in the last digits
 * would otherwise rebuild the grid every frame of an orbit.
 */
export function gridKey(l: GridLayout): string {
  return `${l.spacing}|${l.major}|${l.divisions}|${Math.round(l.cu / l.spacing)}|${Math.round(l.cv / l.spacing)}|${l.fade}`;
}

const FINE = 0x27333d;
const MAJOR = 0x3d4b57;

/** A GridHelper with one colour throughout: its centre is the patch's, which is not the origin. */
function gridLines(extent: number, divisions: number, color: number, opacity: number): THREE.GridHelper {
  const g = new THREE.GridHelper(extent, divisions, color, color);
  if (opacity < 1) {
    const m = g.material as THREE.LineBasicMaterial;
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  }
  return g;
}

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
   * `u`/`v` are the target's coordinates IN the working plane; `span` is the visible
   * world width at that distance. Optional so the first build, before a camera exists,
   * still draws something sensible.
   */
  view?: { u: number; v: number; span: number },
): THREE.Object3D | null {
  // Remove old grid
  if (oldGridGroup) {
    scene.remove(oldGridGroup);
    disposeObject(oldGridGroup);
  }

  if (!showGrid) return null;

  const { spacing, major, divisions, extent, cu, cv, fade } = gridLayout(gridSize3D, gridExtent, view);

  const grid = new THREE.Group();
  grid.add(gridLines(extent, divisions, FINE, fade));
  if (major) {
    /* Drawn after the fine lines, so where the two coincide the emphasised one shows. */
    const m = gridLines(extent, Math.round(extent / major), MAJOR, 1);
    m.renderOrder = 1;
    grid.add(m);
  }
  grid.userData.gridSpacing = spacing;

  setPlaneOffset(grid, workingPlane, nodeCreateZ);

  if (view) {
    if (workingPlane === 'XY') { grid.position.x = cu; grid.position.y = cv; }
    else if (workingPlane === 'XZ') { grid.position.x = cu; grid.position.z = cv; }
    else { grid.position.y = cu; grid.position.z = cv; }
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
