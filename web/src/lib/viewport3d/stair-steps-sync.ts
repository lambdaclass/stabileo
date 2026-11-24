/**
 * The steps of every plate declared a stair flight, meshed or not, kept under the shells' parent
 * apart from the shells themselves: they are drawn, never picked or tinted.
 */
import type * as THREE from 'three';
import { physicalPlates } from '../store/physical-plates';
import { plateLoops } from '../model/physical/plate';
import { shellColorForMaterial, type ShellRenderMode } from '../three/create-shell-mesh';
import { createFlightStepsMesh, flightSteps } from '../three/stair-steps';
import { disposeObject } from '../three/selection-helpers';

type Pt = { x: number; y: number; z: number };
const drawn = new WeakMap<THREE.Object3D, Map<number, THREE.Group>>();

export function syncStairSteps(parent: THREE.Object3D, renderMode: ShellRenderMode, nodeAt: (id: number) => Pt | null): void {
  let mine = drawn.get(parent);
  if (!mine) drawn.set(parent, (mine = new Map()));
  const seen = new Set<number>();
  for (const pl of physicalPlates()) {
    const steps = pl.physical.stair?.steps;
    if (!steps) continue;
    const outline = plateLoops(pl.group).outer.map(nodeAt);
    if (outline.some((p) => !p)) continue;
    const pts = outline as Pt[];
    const signature = `${renderMode}|${steps}|${pl.surface.thickness}|${pl.surface.materialId}|` + pts.map((p) => `${p.x}:${p.y}:${p.z}`).join(';');
    const old = mine.get(pl.id);
    if (old?.userData.stepsSig === signature) { seen.add(pl.id); continue; }
    if (old) { parent.remove(old); disposeObject(old); mine.delete(pl.id); }
    const geo = flightSteps(pts, pl.surface.thickness, steps);
    if (!geo) continue;
    const group = createFlightStepsMesh(geo, shellColorForMaterial(pl.surface.materialId), renderMode);
    group.userData = { stepsSig: signature, stairSteps: pl.id };
    parent.add(group);
    mine.set(pl.id, group);
    seen.add(pl.id);
  }
  for (const [id, group] of mine) if (!seen.has(id)) { parent.remove(group); disposeObject(group); mine.delete(id); }
}
