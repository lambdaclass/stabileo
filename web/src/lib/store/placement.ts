/**
 * The project's placement written into the model: each horizontal beam's and slab's vertical
 * offset from the level reference, each column storey's offset in plan from its stack's fixed
 * point. Only what the placement owns is written: the vertical part of a beam's offset (its
 * offset across, a perimeter beam's, stays) and the plan offset of the stacks given a fixed point.
 */
import { modelStore } from './model.svelte';
import { designData, patchDesignData, storedDesignData } from './design-data';
import { physicalPlates, setPlateOffset } from './physical-plates';
import { plateLoops } from '../model/physical/plate';
import { beamDrop, columnShift, slabDrop, type LevelReference, type Placement } from '../model/placement';
import { stackKey, type FixedPointKind } from '../rc-sheets/fixed-points';
import { memberRoll } from '../engine/local-axes-3d';
import type { MemberOffset } from '../model/element-3d-metadata';

const TOL = 1e-6;
type P3 = { x: number; y: number; z: number };

export const placementData = (): Placement => { void modelStore.designData; return designData().placement ?? {}; };

/** The fixed point the project states for a column stack, the centre when none. */
export const columnFixedPoint = (stack: string): FixedPointKind => placementData().columns?.[stack] ?? 'c';

function savePlacement(next: Placement): void {
  const columns = next.columns && Object.keys(next.columns).length ? next.columns : undefined;
  const p: Placement = { ...(next.reference ? { reference: next.reference } : {}), ...(columns ? { columns } : {}) };
  const stored = storedDesignData() as Record<string, unknown>;
  const sheets = stored.rcSheets as { fixedPoints?: unknown } | undefined;
  const rcSheets = sheets && 'fixedPoints' in sheets ? (({ fixedPoints: _gone, ...rest }) => rest)(sheets) : sheets;
  patchDesignData({ placement: Object.keys(p).length ? p : undefined, ...(rcSheets ? { rcSheets: rcSheets as never } : {}) });
}

/** State the level reference and move the beams and slabs to it; one undo step. */
export function setLevelReference(reference: LevelReference): void {
  modelStore.batch(() => { savePlacement({ ...placementData(), reference }); applyPlacement(); });
}

/** State the fixed point of one stack, or of every stack when `stack` is null, and move the storeys above to it; one undo step. */
export function setColumnFixedPoint(stack: string | null, kind: FixedPointKind): void {
  modelStore.batch(() => {
    const p = placementData();
    const columns = stack === null ? Object.fromEntries(columnStacks().map((s) => [s.key, kind])) : { ...(p.columns ?? {}), [stack]: kind };
    savePlacement({ ...p, columns });
    applyPlacement();
  });
}

const at = (id: number): P3 | null => { const n = modelStore.nodes.get(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : null; };
const sectionOf = (e: { sectionId: number }) => modelStore.sections.get(e.sectionId) as { b?: number; h?: number } | undefined;

/** Every column stack: its storeys from the lowest up, keyed by where they stand in plan. */
export function columnStacks(): Array<{ key: string; storeys: number[] }> {
  const by = new Map<string, Array<{ id: number; z: number }>>();
  for (const e of modelStore.elements.values()) {
    if (e.type === 'truss') continue;
    const a = at(e.nodeI), b = at(e.nodeJ);
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > 1e-3 || Math.abs(b.z - a.z) < TOL) continue;
    const lo = a.z < b.z ? a : b, key = stackKey([lo.x, lo.y]);
    (by.get(key) ?? by.set(key, []).get(key)!).push({ id: e.id, z: lo.z });
  }
  return [...by].map(([key, list]) => ({ key, storeys: list.sort((p, q) => p.z - q.z).map((s) => s.id) })).sort((p, q) => p.key.localeCompare(q.key));
}

function inside(pt: P3, poly: readonly P3[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2)) : 0;
    if (Math.hypot(a.x + t * dx - pt.x, a.y + t * dy - pt.y) < 1e-3) return true;
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The level slabs: each plate declared a slab and lying flat, its outline and thickness. */
function levelSlabs(): Array<{ id: number; z: number; outline: P3[]; t: number; offset?: { x: number; y: number; z: number } }> {
  return physicalPlates().flatMap((pl) => {
    if (pl.physical.kind !== 'slab' || pl.physical.stair) return [];
    const outline = plateLoops(pl.group).outer.map(at);
    if (outline.length < 3 || outline.some((p) => !p) || outline.some((p) => Math.abs(p!.z - outline[0]!.z) > TOL)) return [];
    return [{ id: pl.id, z: outline[0]!.z, outline: outline as P3[], t: pl.surface.thickness, ...(pl.surface.offset?.frame === 'global' ? { offset: pl.surface.offset } : {}) }];
  });
}

const vecOf = (o: MemberOffset | undefined, end: 'i' | 'j') => (o?.frame === 'global' ? o[end] : undefined) ?? { x: 0, y: 0, z: 0 };
const same = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && Math.abs(p.z - q.z) < 1e-9;

function writeOffset(id: number, i: P3, j: P3): boolean {
  const e = modelStore.elements.get(id)!;
  if (same(vecOf(e.offset, 'i'), i) && same(vecOf(e.offset, 'j'), j)) return false;
  const zero = (v: P3) => same(v, { x: 0, y: 0, z: 0 });
  modelStore.setElementOffset(id, zero(i) && zero(j) ? null : { frame: 'global', ...(zero(i) ? {} : { i }), ...(zero(j) ? {} : { j }) });
  return true;
}

/**
 * Write the placement into the model: the members it owns moved to where it puts them, nothing
 * else touched. A member offset along its own axes is left alone, the placement owning global
 * offsets only. Returns how many members and plates moved.
 */
export function applyPlacement(): number {
  const p = placementData();
  let moved = 0;
  modelStore.batch(() => {
    if (p.reference) {
      const slabs = levelSlabs();
      for (const s of slabs) {
        const z = slabDrop(p.reference, s.t), cur = s.offset ?? { x: 0, y: 0, z: 0 };
        if (Math.abs(cur.z - z) < 1e-9) continue;
        const next = { frame: 'global' as const, x: cur.x, y: cur.y, z };
        setPlateOffset(s.id, next.x || next.y || next.z ? next : undefined);
        moved++;
      }
      for (const e of [...modelStore.elements.values()]) {
        if (e.type === 'truss' || (e.offset && e.offset.frame !== 'global')) continue;
        const a = at(e.nodeI), b = at(e.nodeJ), h = sectionOf(e)?.h;
        if (!a || !b || !h || Math.abs(a.z - b.z) > TOL || Math.hypot(b.x - a.x, b.y - a.y) < TOL) continue;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: a.z };
        const t = Math.max(0, ...slabs.filter((s) => Math.abs(s.z - a.z) < TOL && inside(mid, s.outline)).map((s) => s.t));
        const z = Math.round(beamDrop(p.reference, h, t) * 1e9) / 1e9 + 0;
        const i = { ...vecOf(e.offset, 'i'), z }, j = { ...vecOf(e.offset, 'j'), z };
        if (writeOffset(e.id, i, j)) moved++;
      }
    }
    for (const stack of columnStacks()) {
      const kind = p.columns?.[stack.key];
      if (!kind) continue;
      const [baseId, ...up] = stack.storeys, base = modelStore.elements.get(baseId!)!, bs = sectionOf(base);
      if (!bs?.b || !bs.h || (base.offset && base.offset.frame !== 'global')) continue;
      const bo = vecOf(base.offset, 'i');
      for (const id of up) {
        const e = modelStore.elements.get(id)!, s = sectionOf(e);
        if (!s?.b || !s.h || (e.offset && e.offset.frame !== 'global')) continue;
        const [x, y] = columnShift(kind, { b: bs.b, h: bs.h, rotDeg: memberRoll(base, modelStore.sections as never), offset: [bo.x, bo.y] }, { b: s.b, h: s.h, rotDeg: memberRoll(e, modelStore.sections as never) });
        if (writeOffset(id, { ...vecOf(e.offset, 'i'), x, y }, { ...vecOf(e.offset, 'j'), x, y })) moved++;
      }
    }
  });
  return moved;
}
