import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { physicalGroups } from './physical';
import { elementsBetween } from './rc-sheets-reinforcement';
import { rowsCode } from './rc-sheets-schedule';
import type { SheetRows } from './rc-sheets.svelte';
import { computeLocalAxes3D, memberRoll } from '../engine/local-axes-3d';
import { memberOffsetAt } from '../engine/member-offsets';
import { rebar3d, type Frame, type Rebar3d, type Rebar3dFrames, type V3 } from '../rc-sheets/rebar-3d';
import { ghost3d, type Ghost3d } from '../rc-sheets/rebar-3d-ghost';
import type { PieceOptions } from '../rc-sheets/schedule/pieces';
import type { SheetFamily } from '../rc-sheets/types';

export type Rebar3dFamily = Exclude<SheetFamily, 'punching'>;
export const REBAR_FAMILIES: readonly Rebar3dFamily[] = ['beam', 'column', 'slab', 'wall'];

const GHOST_KEY = 'stabileo-rc-rebar-3d-ghost';

export function readGhostPreference(): boolean {
  try { return globalThis.localStorage?.getItem(GHOST_KEY) !== '0'; } catch { return true; }
}

export function saveGhostPreference(on: boolean): void {
  try { globalThis.localStorage?.setItem(GHOST_KEY, on ? '1' : '0'); } catch { return; }
}

export const rebarView = $state<{ on: boolean; row: { key: string; name: string; keys?: readonly string[] } | null; level: string; families: Record<Rebar3dFamily, boolean>; ghost: boolean }>({
  on: false, row: null, level: '', families: { beam: true, column: true, slab: true, wall: true }, ghost: readGhostPreference(),
});

export function showRebarOf(row: { key: string; name: string; keys?: readonly string[] }): void {
  rebarView.row = { key: row.key, name: row.name, ...(row.keys ? { keys: [...row.keys] } : {}) };
  rebarView.level = '';
  rebarView.on = true;
}

type Node = { x: number; y: number; z?: number };
const v3 = (n: Node): V3 => [n.x, n.y, n.z ?? 0];
const plus = (a: V3, o: { x: number; y: number; z: number }): V3 => [a[0] + o.x, a[1] + o.y, a[2] + o.z];
const unit = (a: V3, b: V3): V3 => { const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
const groupElements = (g: number) => physicalGroups().find((x) => x.id === g)?.members.elements ?? [];

type ElementLike = NonNullable<ReturnType<typeof modelStore.elements.get>>;

function axesAlong(e: ElementLike, a: V3, b: V3): { ey: V3; ez: V3 } | null {
  const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
  try {
    const ax = computeLocalAxes3D({ id: 0, x: a[0], y: a[1], z: a[2] }, { id: 0, x: b[0], y: b[1], z: b[2] }, localY, memberRoll(e, modelStore.sections));
    return { ey: ax.ey, ez: ax.ez };
  } catch { return null; }
}

function elementAxes(id: number | undefined): { ey: V3; ez: V3 } | null {
  const e = id === undefined ? undefined : modelStore.elements.get(id);
  const nI = e && modelStore.nodes.get(e.nodeI), nJ = e && modelStore.nodes.get(e.nodeJ);
  return e && nI && nJ ? axesAlong(e, v3(nI), v3(nJ)) : null;
}

const offsetAt = (elementId: number, node: number) => {
  const e = modelStore.elements.get(elementId);
  return e ? memberOffsetAt(e, node, modelStore.nodes, modelStore.sections) : { x: 0, y: 0, z: 0 };
};

export function modelFrames(rows: SheetRows): Rebar3dFrames {
  return {
    line(l) {
      const spans = rows.beam.filter((r) => r.demand.line?.group === l.group).map((r) => r.demand.line!).sort((p, q) => p.index - q.index);
      const first = spans[0], last = spans[spans.length - 1];
      const A = first && modelStore.nodes.get(first.startNode), B = last && modelStore.nodes.get(last.endNode);
      if (!first || !last || !A || !B) return null;
      const e0 = elementsBetween(groupElements(l.group), first.startNode, first.endNode)[0], e1 = elementsBetween(groupElements(l.group), last.startNode, last.endNode).at(-1);
      const el = e0 === undefined ? undefined : modelStore.elements.get(e0);
      if (!el || e1 === undefined) return null;
      const a = plus(v3(A), offsetAt(el.id, first.startNode)), b = plus(v3(B), offsetAt(e1, last.endNode));
      const ax = axesAlong(el, a, b);
      return ax ? { o: a, x: unit(a, b), y: ax.ey, z: ax.ez } : null;
    },
    column(r) {
      const n = r.demand.nodes, P = n && modelStore.nodes.get(n.bottom), Q = n && modelStore.nodes.get(n.top);
      if (!n || !P || !Q) return null;
      const ids = elementsBetween(groupElements(Number(r.key.split(':')[1])), n.bottom, n.top);
      const ax = elementAxes(ids[0]);
      if (!ax) return null;
      const o = plus(v3(P), offsetAt(ids[0]!, n.bottom));
      return { o, x: ax.ey, y: ax.ez, z: unit(o, plus(v3(Q), offsetAt(ids.at(-1)!, n.top))) };
    },
    wall(r) {
      const p = r.demand.plan;
      if (!p) return null;
      const o: V3 = [p.x1, p.y1, r.demand.z ?? 0], x = unit(o, [p.x2, p.y2, o[2]]);
      return { o, x, y: [-x[1], x[0], 0], z: [0, 0, 1] };
    },
    slabSoffit(r) {
      return r.demand.bounds ? r.demand.bounds.z - r.h / 2 : null;
    },
  };
}

export const pieceOptions = (rows: SheetRows): PieceOptions => {
  const dd = designData();
  return { code: rowsCode(rows), slabCover: dd.covers.slab, endZones: dd.columnEndZones === true };
};

let memo: { rows: SheetRows; key: string; bars: Rebar3d[] } | null = null;

export function sheetBars3d(rows: SheetRows): Rebar3d[] {
  const o = pieceOptions(rows), key = JSON.stringify(o);
  if (memo && memo.rows === rows && memo.key === key) return memo.bars;
  const bars = rebar3d(rows, modelFrames(rows), o);
  memo = { rows, key, bars };
  return bars;
}

let ghostMemo: { rows: SheetRows; ghosts: Ghost3d[] } | null = null;

export function sheetGhosts3d(rows: SheetRows): Ghost3d[] {
  if (ghostMemo?.rows !== rows) ghostMemo = { rows, ghosts: ghost3d(rows, modelFrames(rows)) };
  return ghostMemo.ghosts;
}

type Shown = Pick<Rebar3d, 'element' | 'rows' | 'family' | 'level'>;
type ViewFilter = Pick<typeof rebarView, 'row' | 'level' | 'families'>;

export function shownBars<T extends Shown>(bars: readonly T[], v: ViewFilter): T[] {
  if (v.row) {
    const keys = v.row.keys ?? [v.row.key];
    return bars.filter((b) => keys.some((k) => b.rows.includes(k) || b.element === k));
  }
  return bars.filter((b) => b.family !== 'punching' && v.families[b.family] && (!v.level || (b.level ?? '') === v.level));
}

export function shownGhosts(ghosts: readonly Ghost3d[], bars: readonly Shown[], v: ViewFilter): Ghost3d[] {
  const drawn = new Set(bars.flatMap((b) => [b.element, ...b.rows]));
  return shownBars(ghosts, v).filter((g) => drawn.has(g.element));
}

export type { Frame };
