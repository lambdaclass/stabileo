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

export type ResizeWhat = 'beamH' | 'column' | 'slabH' | 'wallT' | 'punchSlab' | 'punchColumn' | 'punchCapital' | 'punchDrop';
/**
 * `to` null: not even at the limit searched (twice the size). Lengths in m. A capital's `to` is its
 * projection beyond the column face; a drop panel's, its depth under the slab and its extent from
 * the column face.
 */
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
      const asColumn = (a: number) => ({ ...d, joint: { ...d.joint, b: d.joint.b + 2 * a, h: d.joint.h + 2 * a } });
      return [
        { what: 'punchSlab', direction: 'grow', from: [d.thickness], to: grow(row.key, [d.thickness], 0.01, [2 * d.thickness], ([t]) => ({ ...d, thickness: t })) },
        { what: 'punchColumn', direction: 'grow', from: [d.joint.b, d.joint.h], to: grow(row.key, [d.joint.b, d.joint.h], 0.05, [2 * d.joint.b, 2 * d.joint.h], ([b, h]) => ({ ...d, joint: { ...d.joint, b, h } })) },
        // The critical section from the capital's edge (§22.6.4.1), the capital within 45°: as deep as it projects.
        { what: 'punchCapital', direction: 'grow', from: [0], to: grow(row.key, [0], 0.05, [1], ([a]) => asColumn(a)) },
        { what: 'punchDrop', direction: 'grow', from: [0, 0], to: dropPanel(row.key, d) },
      ];
    }
  }
}

/**
 * The least drop panel (shear cap) a punching joint verifies with: its depth under the slab, from
 * h/4 (§8.2.4(a)), so that the section at the column holds with slab and drop together; and its
 * extent from the column face, at least that depth (§8.2.5), so that the section at d/2 beyond its
 * edge holds with the slab alone (§22.6.4.1). Null when no depth up to h or extent up to 1.5 m does.
 */
function dropPanel(key: string, d: import('../rc-sheets/punching-row').PunchingDemand): number[] | null {
  const redesign = redesignerOf(key);
  if (!redesign) return null;
  const h = d.thickness;
  let depth: number | null = null;
  for (let x = Math.max(0.05, Math.ceil((h / 4) * 100) / 100); x <= h + 1e-9; x = round(x + 0.01)) {
    if (passes(redesign({ ...d, thickness: round(h + x) } as never))) { depth = x; break; }
  }
  if (depth === null) return null;
  for (let e = Math.max(depth, 0.1); e <= 1.5 + 1e-9; e = round(e + 0.05)) {
    if (passes(redesign({ ...d, joint: { ...d.joint, b: d.joint.b + 2 * e, h: d.joint.h + 2 * e } } as never))) return [depth, round(e)];
  }
  return null;
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
