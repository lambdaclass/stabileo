/**
 * The use zones drawn over their floors (`store/use-zone-map.svelte.ts`): each zone filled at its
 * level, coloured by its use, its state, or the intensity of its live load. A zone with no use is
 * drawn grey and hatched-light, never in the colour of a load of zero. Nothing here is pickable.
 */
import * as THREE from 'three';
import { zoneLiveLoad, zoneStatus, zoneUseOf, type ZoneStatus } from '../model/use-zones';
import { findOccupancy } from '../codes/cirsoc101/live-loads';
import { disposeObject } from './selection-helpers';
import type { ModelGroup } from '../store/model.svelte';

const STATUS: Record<ZoneStatus, number> = { assigned: 0x4caf7d, pending: 0xe0a040, unsupported: 0xe06c3c, unassigned: 0x7d838c, none: 0x5b7fa6 };
const CATEGORY: Record<string, number> = {
  residential: 0x6aa9e9, office: 0x9b7be0, commercial: 0xe08bd0, education: 0x5cc9b9, health: 0x7fd36b, assembly: 0xe0c060,
  industrial: 0xc98a5a, storage: 0xb06a3c, parking: 0x8f9aa6, roof: 0x56b4d3, circulation: 0xd9d26a, other: 0xa0a0a0,
};

export function buildUseZoneMap(zones: readonly ModelGroup[], nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>, mode: 'use' | 'status' | 'intensity'): THREE.Group | null {
  if (!zones.length) return null;
  const group = new THREE.Group();
  group.name = 'useZoneMap';
  group.userData.noPick = true;
  const qs = zones.map((z) => zoneLiveLoad(zoneUseOf(z))?.q ?? 0);
  const qMax = Math.max(1, ...qs);
  zones.forEach((z, k) => {
    const pts = (z.members.nodes ?? []).map((id) => nodes.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    if (pts.length < 3) return;
    const use = zoneUseOf(z);
    const status = zoneStatus(use);
    let color: number;
    if (mode === 'status' || status !== 'assigned') color = STATUS[status];
    else if (mode === 'use') color = CATEGORY[findOccupancy(use?.occupancy ?? '')?.category ?? 'other'] ?? CATEGORY.other!;
    else { const f = qs[k]! / qMax; color = new THREE.Color().setHSL(0.33 * (1 - f), 0.7, 0.5).getHex(); }
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.translate(0, 0, (pts[0]!.z ?? 0) + 0.01);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: status === 'assigned' ? 0.35 : 0.2, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = -1;
    mesh.userData.noPick = true;
    group.add(mesh);
  });
  return group;
}

export function syncUseZoneMap(scene: THREE.Scene, prev: THREE.Group | null, zones: readonly ModelGroup[], nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>, mode: 'off' | 'use' | 'status' | 'intensity'): THREE.Group | null {
  if (prev) { scene.remove(prev); disposeObject(prev); }
  if (mode === 'off') return null;
  const next = buildUseZoneMap(zones, nodes, mode);
  if (next) scene.add(next);
  return next;
}
