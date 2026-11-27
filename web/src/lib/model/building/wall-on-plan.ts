import { modelStore } from '../../store/model.svelte';
import { supportWallBase } from '../foundation/generate';
import type { Level } from '../grid';
import { meshPanel } from './build-on-grid';
import { declare, nextName } from './declare';
import { columnsAtLevel, type P2 } from './draw-on-plan';

export interface WallOnPlan {
  a: P2; b: P2; thickness: number;
  levels: readonly Level[]; levelFrom: string; levelTo: string;
  materialId: number; meshSize: number; typology?: string;
  /** Its base held, when it starts on the lowest level. */
  fixBase?: boolean;
}
export interface WallPlaced { created: number; shells: number; refused?: string }

/** An end of the wall inside a column's footprint goes to the column's line, so the wall's mesh takes the column. */
function toColumn(p: P2, z: number): P2 {
  for (const c of columnsAtLevel(z)) {
    const f = c.footprint, dx = p.x - f.center.x, dy = p.y - f.center.y;
    if (Math.abs(dx * f.u.x + dy * f.u.y) <= f.b / 2 + 0.01 && Math.abs(dx * f.v.x + dy * f.v.y) <= f.h / 2 + 0.01) {
      const n = modelStore.nodes.get(c.node)!;
      return { x: n.x, y: n.y };
    }
  }
  return p;
}

/**
 * A wall drawn on the plan by its axis, from one level to another, one meshed panel per storey,
 * like the walls placed between axes: the columns and beams in its plane are cut to share its
 * mesh, and on the lowest level its base is held. Declared one physical wall per storey.
 */
export function placeWallOnPlan(d: WallOnPlan): WallPlaced {
  const lo = d.levels.find((l) => l.id === d.levelFrom), hi = d.levels.find((l) => l.id === d.levelTo);
  if (!lo || !hi || lo.z >= hi.z) return { created: 0, shells: 0, refused: 'levels' };
  const lv = d.levels.filter((l) => l.z >= lo.z - 1e-9 && l.z <= hi.z + 1e-9).sort((p, q) => p.z - q.z);
  if (d.thickness < 0.01 || Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) < 0.1) return { created: 0, shells: 0, refused: 'size' };
  const lowest = Math.min(...d.levels.map((l) => l.z));
  const name = nextName('M');
  const out: WallPlaced = { created: 0, shells: 0 };
  modelStore.batch(() => {
    for (let k = 0; k + 1 < lv.length; k++) {
      const z0 = lv[k]!.z, z1 = lv[k + 1]!.z;
      const a = toColumn(d.a, z0), b = toColumn(d.b, z0);
      const r = meshPanel([[a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1], [a.x, a.y, z1]], [], { size: d.meshSize, materialId: d.materialId, thickness: d.thickness });
      if ('refused' in r) { out.refused = r.refused; continue; }
      const id = declare(name(), r, { kind: 'wall', provenance: 'declared', levelFrom: lv[k]!.id, levelTo: lv[k + 1]!.id, ...(d.typology ? { typology: d.typology } : {}) });
      out.created++; out.shells += r.quads.length + r.plates.length;
      if (d.fixBase && Math.abs(z0 - lowest) < 1e-9 && id !== undefined) supportWallBase(id);
    }
  });
  return out;
}
