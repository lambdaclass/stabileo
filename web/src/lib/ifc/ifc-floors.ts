/**
 * The floors of an imported building, meshed on the model once its bars are in.
 *
 * Each region (`ifc-analytical.ts`) is meshed in one piece, following the bars that lie in it
 * (the beams are cut where the mesh meets them, the columns are mesh points), at its level with
 * its mid-surface half its thickness down, so its top is the level. A waffle is analysed at its
 * weight per square metre with a material as stiff as its ribs (Ec·(h,eq / t)³), and declared a
 * waffle with its rib system, which the design lays out per rib; its drops are solid at their own
 * thickness. Each region is one physical slab.
 */
import { modelStore } from '../store/model.svelte';
import { patchOwnDesignData, designData } from '../store/design-data';
import { applyMesh } from '../model/edit/mesh-apply';
import { ribbedProperties } from '../engine/design/slabs/ribbed';
import { CONCRETE, materialFor } from './ifc-mapper';
import type { FloorRegion } from './ifc-analytical';

export interface FloorsResult { slabs: number; shells: number; failed: string[] }

const inside = (p: { x: number; y: number }, poly: ReadonlyArray<{ x: number; y: number }>) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

export function meshFloors(floors: readonly FloorRegion[], o: { meshSize: number; declare: boolean }): FloorsResult {
  const out: FloorsResult = { slabs: 0, shells: 0, failed: [] };
  const materials = new Map<string, number>();
  const materialId = (name: string | undefined, eFactor = 1, suffix = '') => {
    const key = `${name ?? ''}|${eFactor.toFixed(6)}`;
    const hit = materials.get(key);
    if (hit) return hit;
    const base = (name ? materialFor(name) : null) ?? CONCRETE;
    const label = `${name ?? 'Hormigón'}${suffix}`, e = Math.round(base.e * eFactor);
    // The bars' own material, where the import already made it.
    const same = [...modelStore.materials.values()].find((m) => m.name === label && Math.abs(m.e - e) < 1);
    if (same) { materials.set(key, same.id); return same.id; }
    const id = modelStore.addMaterial({ name: label, ...base, e } as never);
    materials.set(key, id);
    return id;
  };
  const systems = { ...(designData().specialFloors?.systems ?? {}) };
  for (const f of floors) {
    const z = f.level.z;
    const P = (q: { x: number; y: number }): [number, number, number] => [q.x, q.y, z];
    const eFactor = f.ribbed ? (ribbedProperties(f.ribbed).hEq / f.thickness) ** 3 : 1;
    const mat = materialId(f.materialName, eFactor, f.ribbed ? ` · ${Math.round((f.ribbed.h - f.ribbed.c) * 100)}+${Math.round(f.ribbed.c * 100)}` : '');
    const size = f.ribbed ? Math.min(o.meshSize, f.ribbed.spacingX, f.ribbed.spacingY ?? f.ribbed.spacingX) : o.meshSize;
    const res = applyMesh({ outer: { kind: 'polygon', points: f.outer.map(P) }, holes: f.holes.map((h) => ({ kind: 'polygon' as const, points: h.map(P) })), size, element: 'quad' }, { materialId: mat, thickness: f.thickness, splitBeams: true });
    if (!res || res.occupied) { out.failed.push(`${f.level.name}`); continue; }
    const solid = f.zones.length ? materialId(f.materialName) : mat;
    // One commit for the floor's shells, not one per shell.
    modelStore.bulkMutate(() => {
      for (const q of res.quads) {
        const quad = modelStore.quads.get(q)!;
        const ps = quad.nodes.map((n) => modelStore.nodes.get(n)!);
        const c = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
        const zone = f.zones.find((zn) => inside(c, zn.outline));
        if (zone) modelStore.updateQuad(q, { materialId: solid, thickness: zone.thickness });
        const t = modelStore.quads.get(q)!.thickness;
        modelStore.setShellOffset('quad', q, { frame: 'global', x: 0, y: 0, z: -t / 2 } as never);
      }
      for (const p of res.plates) {
        const t = modelStore.plates.get(p)?.thickness ?? f.thickness;
        modelStore.setShellOffset('plate', p, { frame: 'global', x: 0, y: 0, z: -t / 2 } as never);
      }
    });
    out.slabs++; out.shells += res.quads.length + res.plates.length;
    if (o.declare) {
      const gid = modelStore.addGroup(f.names.length === 1 ? f.names[0]! : `Losa ${f.level.name}`, 'physicalMember', { quads: res.quads, plates: res.plates }, {
        origin: 'user', data: { kind: 'slab', provenance: 'declared', typology: f.ribbed ? 'waffle' : 'solid', levelFrom: f.level.id, levelTo: f.level.id },
      });
      if (f.ribbed) systems[`S${gid}`] = { ribbed: f.ribbed };
    }
  }
  if (Object.keys(systems).length) patchOwnDesignData({ specialFloors: { ...(designData().specialFloors ?? {}), systems } });
  return out;
}
