import type { Vec3 } from '../engine/shell-load-integration';

/** A plain area load on one shell of a plate drawn as its piece. */
export interface PieceLoad { id: number; shell: string; plate: number; q: number; caseId: number | undefined; dir: Vec3 }

export interface PlateLoadLayer { plate: number; q: number; caseId: number | undefined; ids: number[]; dir: Vec3 }

/**
 * The loads drawn once over a plate's outline: for each value and case, as many layers as every
 * shell of the plate carries that load, one load of each shell to a layer. What is left over on
 * some shells only is drawn where it is.
 */
export function plateLoadLayers(loads: readonly PieceLoad[], shellsOf: ReadonlyMap<number, number>): PlateLoadLayer[] {
  const byKey = new Map<string, { first: PieceLoad; byShell: Map<string, number[]> }>();
  for (const l of loads) {
    const key = `${l.plate}:${l.caseId ?? ''}:${l.q}:${l.dir.join(',')}`;
    const e = byKey.get(key) ?? byKey.set(key, { first: l, byShell: new Map() }).get(key)!;
    (e.byShell.get(l.shell) ?? e.byShell.set(l.shell, []).get(l.shell)!).push(l.id);
  }
  const out: PlateLoadLayer[] = [];
  for (const { first, byShell } of byKey.values()) {
    if (byShell.size < (shellsOf.get(first.plate) ?? Infinity)) continue;
    const depth = Math.min(...[...byShell.values()].map((ids) => ids.length));
    for (let k = 0; k < depth; k++) out.push({ plate: first.plate, q: first.q, caseId: first.caseId, dir: first.dir, ids: [...byShell.values()].map((ids) => ids[k]!) });
  }
  return out;
}
