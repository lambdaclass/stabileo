/**
 * Resizing from the sheets: the dimension a row would need to verify with the forces it has now,
 * or, for a column or a wall with room to spare, the smallest that still does; and the way to the
 * element in the model, where its dimensions are changed. Nothing is changed from here.
 *
 * Beams and slabs are never offered smaller: the sheets do not check deflections.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { plateOfShell } from './physical-plates';
import { redesignerOf, type SheetRow } from './rc-sheets.svelte';
import type { BeamRow } from '../rc-sheets/beam-row';
import type { ColumnRow } from '../rc-sheets/column-row';
import type { LineLayout } from '../rc-sheets/beam-line';

export type ResizeWhat = 'beamH' | 'column' | 'slabH' | 'wallT' | 'punchSlab' | 'punchColumn';
/** `to` null: not even at the limit searched (twice the size). Lengths in m. */
export interface ResizeHint { what: ResizeWhat; direction: 'grow' | 'shrink'; from: number[]; to: number[] | null }

const passes = (r: SheetRow) => r.status !== 'fail';
/** Below this strength ratio a column or a wall is worth trying smaller. */
const ROOM = 0.6;
const round = (x: number) => Math.round(x * 1000) / 1000;

/** The first size from `start`, stepped by `step` up to `limit`, whose row passes; null when none does. */
function grow(key: string, start: number[], step: number, limit: number[], make: (v: number[]) => unknown): number[] | null {
  const redesign = redesignerOf(key);
  if (!redesign) return null;
  for (let k = 1; k <= 60; k++) {
    const v = start.map((x) => round(x + k * step));
    if (v.some((x, i) => x > limit[i]! + 1e-9)) return null;
    if (passes(redesign(make(v) as never))) return v;
  }
  return null;
}

/** The smallest size below `start` whose row still passes, not under `floor`; null when none is smaller. */
function shrink(key: string, start: number[], step: number, floor: number, make: (v: number[]) => unknown): number[] | null {
  const redesign = redesignerOf(key);
  if (!redesign) return null;
  let best: number[] | null = null;
  for (let k = 1; k <= 20; k++) {
    const v = start.map((x) => round(x - k * step));
    if (v.some((x) => x < floor - 1e-9)) break;
    if (!passes(redesign(make(v) as never))) break;
    best = v;
  }
  return best;
}

export function resizeHints(row: SheetRow): ResizeHint[] {
  if (row.status === 'none') return [];
  const fail = row.status === 'fail';
  switch (row.family) {
    case 'beam': {
      if (!fail) return [];
      const d = row.demand;
      return [{ what: 'beamH', direction: 'grow', from: [d.h], to: grow(row.key, [d.h], 0.05, [Math.min(2 * d.h, 2)], ([h]) => ({ ...d, h })) }];
    }
    case 'column': {
      const d = row.demand;
      if (fail) return [{ what: 'column', direction: 'grow', from: [d.b, d.h], to: grow(row.key, [d.b, d.h], 0.05, [2 * d.b, 2 * d.h], ([b, h]) => ({ ...d, b, h })) }];
      if (!row.generous && row.checks.ratio >= ROOM) return [];
      const floor = row.verifications.some((v) => v.label === 'rcSheets.v.seisColDim') ? 0.3 : 0.2;
      const to = shrink(row.key, [d.b, d.h], 0.05, floor, ([b, h]) => ({ ...d, b, h }));
      return to ? [{ what: 'column', direction: 'shrink', from: [d.b, d.h], to }] : [];
    }
    case 'slab': {
      if (!fail) return [];
      const d = row.demand;
      return [{ what: 'slabH', direction: 'grow', from: [d.h], to: grow(row.key, [d.h], 0.01, [2 * d.h], ([h]) => ({ ...d, h })) }];
    }
    case 'wall': {
      const d = row.demand;
      if (fail) return [{ what: 'wallT', direction: 'grow', from: [d.thickness], to: grow(row.key, [d.thickness], 0.05, [2 * d.thickness], ([t]) => ({ ...d, thickness: t })) }];
      if (!row.generous && row.utilization >= ROOM) return [];
      const to = shrink(row.key, [d.thickness], 0.05, 0.1, ([t]) => ({ ...d, thickness: t }));
      return to ? [{ what: 'wallT', direction: 'shrink', from: [d.thickness], to }] : [];
    }
    case 'punching': {
      if (!fail) return [];
      const d = row.demand;
      return [
        { what: 'punchSlab', direction: 'grow', from: [d.thickness], to: grow(row.key, [d.thickness], 0.01, [2 * d.thickness], ([t]) => ({ ...d, thickness: t })) },
        { what: 'punchColumn', direction: 'grow', from: [d.joint.b, d.joint.h], to: grow(row.key, [d.joint.b, d.joint.h], 0.05, [2 * d.joint.b, 2 * d.joint.h], ([b, h]) => ({ ...d, joint: { ...d.joint, b, h } })) },
      ];
    }
  }
}

/** A continuous beam's depth: the deepest any of its failing spans needs. */
export function lineResizeHint(spans: readonly BeamRow[]): ResizeHint | null {
  const hints = spans.filter((s) => s.status === 'fail').flatMap((s) => resizeHints(s));
  if (!hints.length) return null;
  const from = Math.max(...spans.map((s) => s.demand.h));
  const to = hints.some((h) => h.to === null) ? null : [Math.max(...hints.map((h) => h.to![0]!))];
  return { what: 'beamH', direction: 'grow', from: [from], to };
}

const groupOf = (key: string) => Number(key.split(':')[1]);
const membersOf = (g: number) => [...(modelStore.model.groups.get(g)?.members.elements ?? [])];

/** The storey's own members of a column stack: those between its bottom and top nodes. */
function storeyMembers(row: ColumnRow): number[] {
  const n = row.demand.nodes;
  const all = membersOf(groupOf(row.key));
  if (!n) return all;
  const z0 = modelStore.nodes.get(n.bottom)?.z ?? -Infinity, z1 = modelStore.nodes.get(n.top)?.z ?? Infinity;
  return all.filter((id) => {
    const e = modelStore.elements.get(id);
    const a = e && modelStore.nodes.get(e.nodeI), b = e && modelStore.nodes.get(e.nodeJ);
    return !!a && !!b && Math.min(a.z ?? 0, b.z ?? 0) >= Math.min(z0, z1) - 1e-6 && Math.max(a.z ?? 0, b.z ?? 0) <= Math.max(z0, z1) + 1e-6;
  });
}

export type GotoTarget = 'members' | 'plates';

/** Where a row's element is changed: its members in the Members tab, or its plates in the Shells tab. */
export function rowTargets(row: SheetRow | LineLayout): GotoTarget[] {
  if ('spanAdopted' in row) return ['members'];
  if (row.family === 'beam' || row.family === 'column') return ['members'];
  if (row.family === 'punching') return ['plates', 'members'];
  return ['plates'];
}

/** Selects the row's element in the model and opens the tab where its dimensions are changed. */
export function goToRow(row: SheetRow | LineLayout, target: GotoTarget): boolean {
  let members: number[] = [], plates: number[] = [];
  if ('spanAdopted' in row) members = membersOf(row.group);
  else if (row.family === 'beam') members = membersOf(row.demand.line?.group ?? groupOf(row.key));
  else if (row.family === 'column') members = storeyMembers(row);
  else if (row.family === 'slab' || row.family === 'wall') plates = [groupOf(row.key)];
  else if (row.family === 'punching') {
    members = [row.demand.joint.elementBelow, row.demand.joint.elementAbove].filter((x): x is number => x != null);
    plates = [...new Set(row.demand.adjoining.map((a) => plateOfShell(`q${a.elementId}`) ?? plateOfShell(`p${a.elementId}`)).filter((x): x is number => x != null))];
  }
  if (target === 'members' && members.length) {
    uiStore.selectElements(members);
    uiStore.proActiveTab = 'elements';
    return true;
  }
  if (target === 'plates' && plates.length) {
    uiStore.selectPlates(plates);
    uiStore.proActiveTab = 'shells';
    return true;
  }
  return false;
}
