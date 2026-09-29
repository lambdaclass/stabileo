/**
 * The structural grid drawn in the 3D view: the axes on the active level, with their names in
 * bubbles at both ends, and each level named at the grid's corner.
 *
 * Nothing here is pickable: the grid is a reference to snap to (`model/grid.ts snapToAxes`), not
 * an object to select.
 */
import * as THREE from 'three';
import { axesOf, sortedLevels, type StructuralGrid } from '../model/grid';
import { createTextSpriteCached, disposeObject } from './selection-helpers';

const AXIS_COLOR = 0x5b84b1;
const LABEL_COLOR = '#3f6f9f';
const LEVEL_COLOR = 0x8a9bb0;

export function buildStructuralGrid(grid: StructuralGrid | undefined, activeZ: number | null): THREE.Group | null {
  const xs = axesOf(grid, 'x'), ys = axesOf(grid, 'y');
  const levels = sortedLevels(grid);
  if (xs.length === 0 && ys.length === 0 && levels.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'structuralGrid';
  group.userData.noPick = true;

  const xMin = xs.length ? xs[0]!.at : 0, xMax = xs.length ? xs[xs.length - 1]!.at : 0;
  const yMin = ys.length ? ys[0]!.at : 0, yMax = ys.length ? ys[ys.length - 1]!.at : 0;
  const span = Math.max(xMax - xMin, yMax - yMin, 4);
  const m = Math.max(1, span * 0.08);
  const z = activeZ ?? levels[0]?.z ?? 0;

  const pts: number[] = [];
  for (const a of xs) pts.push(a.at, yMin - m, z, a.at, yMax + m, z);
  for (const a of ys) pts.push(xMin - m, a.at, z, xMax + m, a.at, z);
  if (pts.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineDashedMaterial({ color: AXIS_COLOR, dashSize: span / 60, gapSize: span / 120, transparent: true, opacity: 0.85, depthWrite: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.computeLineDistances();
    lines.renderOrder = -1;
    group.add(lines);
  }

  const bubble = (text: string, x: number, y: number) => {
    const s = createTextSpriteCached(text, LABEL_COLOR, 44, true);
    s.scale.set(0.045, 0.045, 1);
    s.position.set(x, y, z);
    s.userData.noPick = true;
    group.add(s);
  };
  for (const a of xs) { bubble(a.name, a.at, yMin - m * 1.35); bubble(a.name, a.at, yMax + m * 1.35); }
  for (const a of ys) { bubble(a.name, xMin - m * 1.35, a.at); bubble(a.name, xMax + m * 1.35, a.at); }

  // Every level as the outline of the grid at its elevation, named at a corner.
  const outline: number[] = [];
  for (const l of levels) {
    const c = [[xMin - m, yMin - m], [xMax + m, yMin - m], [xMax + m, yMax + m], [xMin - m, yMax + m]] as const;
    for (let i = 0; i < 4; i++) outline.push(c[i]![0], c[i]![1], l.z, c[(i + 1) % 4]![0], c[(i + 1) % 4]![1], l.z);
    const s = createTextSpriteCached(l.name, Math.abs(l.z - z) < 1e-6 ? LABEL_COLOR : '#7d8b9c', 34, true);
    s.scale.set(0.05, 0.05, 1);
    s.position.set(xMin - m * 1.6, yMin - m * 1.6, l.z);
    s.userData.noPick = true;
    group.add(s);
  }
  if (outline.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
    group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: LEVEL_COLOR, transparent: true, opacity: 0.45, depthWrite: false })));
  }
  return group;
}

/** Replace `prev` in `scene` with the grid as it stands now. */
export function syncStructuralGrid(scene: THREE.Scene, prev: THREE.Group | null, grid: StructuralGrid | undefined, activeZ: number | null): THREE.Group | null {
  if (prev) { scene.remove(prev); disposeObject(prev); }
  const next = buildStructuralGrid(grid, activeZ);
  if (next) scene.add(next);
  return next;
}
