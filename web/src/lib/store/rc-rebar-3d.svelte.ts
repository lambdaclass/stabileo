import { modelStore } from './model.svelte';
import { designData } from './design-data';
import { physicalGroups } from './physical';
import { elementsBetween } from './rc-sheets-reinforcement';
import { rowsCode } from './rc-sheets-schedule';
import type { SheetRows } from './rc-sheets.svelte';
import { computeLocalAxes3D, memberRoll } from '../engine/local-axes-3d';
import { memberOffsetAt } from '../engine/member-offsets';
import { rebar3d, type Frame, type Rebar3d, type Rebar3dFrames, type V3 } from '../rc-sheets/rebar-3d';
import { WORLD } from '../rc-sheets/rebar-3d-geometry';
import { ghost3d, type Ghost3d } from '../rc-sheets/rebar-3d-ghost';
import type { PieceOptions } from '../rc-sheets/schedule/pieces';
import type { SheetFamily } from '../rc-sheets/types';
import { storeyOf } from '../rc-sheets/storeys';

export type Rebar3dFamily = SheetFamily;
export const REBAR_FAMILIES: readonly Rebar3dFamily[] = ['beam', 'column', 'slab', 'wall', 'punching', 'footing'];

const GHOST_KEY = 'stabileo-rc-rebar-3d-ghost';

export function readGhostPreference(): boolean {
  try { return globalThis.localStorage?.getItem(GHOST_KEY) !== '0'; } catch { return true; }
}

export function saveGhostPreference(on: boolean): void {
  try { globalThis.localStorage?.setItem(GHOST_KEY, on ? '1' : '0'); } catch { return; }
}

export const rebarView = $state<{ on: boolean; row: { key: string; name: string; keys?: readonly string[] } | null; level: string; families: Record<Rebar3dFamily, boolean>; ghost: boolean }>({
  on: false, row: null, level: '', families: { beam: true, column: true, slab: true, wall: true, footing: true, punching: true, stair: true }, ghost: readGhostPreference(),
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
  const footings = new Map<string, { demand: { at: { x: number; y: number } } }>([...rows.footing.flatMap((r) => (r.demand.group?.members ?? []).map((m) => [m.key, { demand: m }] as const)), ...rows.footing.map((r) => [r.key, r] as const)]);
  let groups: Map<number, readonly number[]> | undefined, spansBy: Map<number, NonNullable<SheetRows['beam'][number]['demand']['line']>[]> | undefined;
  const groupElements = (g: number) => (groups ??= new Map(physicalGroups().map((x) => [x.id, x.members.elements ?? []]))).get(g) ?? [];
  const spansOf = (g: number) => {
    if (!spansBy) {
      spansBy = new Map();
      for (const r of rows.beam) { const l = r.demand.line; if (!l) continue; let a = spansBy.get(l.group); if (!a) spansBy.set(l.group, (a = [])); a.push(l); }
      for (const a of spansBy.values()) a.sort((p, q) => p.index - q.index);
    }
    return spansBy.get(g) ?? [];
  };
  return {
    line(l) {
      const spans = spansOf(l.group);
      const first = spans[0], last = spans[spans.length - 1];
      const A = first && modelStore.nodes.get(first.startNode), B = last && modelStore.nodes.get(last.endNode);
      if (!first || !last || !A || !B) return null;
      const members = groupElements(l.group), e0 = elementsBetween(members, first.startNode, first.endNode)[0], e1 = elementsBetween(members, last.startNode, last.endNode).at(-1);
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
    footing(r) {
      const at = r.demand.at, under = r.founding;
      return { o: [at.x + r.adopted.ex, at.y + r.adopted.ey, under], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    },
    strap(r, s) {
      const other = footings.get(s.partnerKey);
      if (!other || !s.line) return null;
      const own = s.from ?? r.demand.at, k = s.axis === 'x' ? 0 : 1;
      const fromOther = s.lineFrom === s.partnerKey && s.lineFrom !== r.key;
      const at = fromOther ? (k === 0 ? { x: other.demand.at.x, y: own.y } : { x: own.x, y: other.demand.at.y }) : own, far = fromOther ? own : other.demand.at;
      const toward = Math.sign((k === 0 ? far.x - at.x : far.y - at.y)) || 1;
      const under = r.founding, hMax = Math.max(...s.line.spans.map((sp) => sp.h));
      const x: V3 = k === 0 ? [toward, 0, 0] : [0, toward, 0];
      return { o: [at.x, at.y, under + r.adopted.h - hMax / 2], x, y: [-x[1], x[0], 0], z: [0, 0, 1] };
    },
    slabSoffit(r) {
      return r.demand.bounds ? r.demand.bounds.z - r.h / 2 : null;
    },
    punching(r) {
      const n = modelStore.nodes.get(r.demand.joint.nodeId);
      return n ? { ...WORLD, o: v3(n) } : null;
    },
  };
}

export const pieceOptions = (rows: SheetRows): PieceOptions => {
  const dd = designData();
  return { code: rowsCode(rows), slabCover: dd.covers.slab, endZones: dd.columnEndZones === true };
};

function withStoreys<T extends Pick<Rebar3d, 'family' | 'level' | 'storey'>>(items: T[], rows: Pick<SheetRows, 'levels'>): T[] {
  for (const b of items) b.storey = storeyOf(b.family, b.level, rows.levels ?? []);
  return items;
}

let memo: { rows: SheetRows; key: string; bars: Rebar3d[] } | null = null;

export function sheetBars3d(rows: SheetRows): Rebar3d[] {
  const o = pieceOptions(rows), key = JSON.stringify(o);
  if (memo && memo.rows === rows && memo.key === key) return memo.bars;
  const bars = withStoreys(rebar3d(rows, modelFrames(rows), o), rows);
  memo = { rows, key, bars };
  return bars;
}

let ghostMemo: { rows: SheetRows; ghosts: Ghost3d[] } | null = null;

export function sheetGhosts3d(rows: SheetRows): Ghost3d[] {
  if (ghostMemo?.rows !== rows) ghostMemo = { rows, ghosts: withStoreys(ghost3d(rows, modelFrames(rows)), rows) };
  return ghostMemo.ghosts;
}

type Shown = Pick<Rebar3d, 'element' | 'rows' | 'family' | 'level' | 'storey'>;
type ViewFilter = Pick<typeof rebarView, 'row' | 'level' | 'families'>;

export function shownBars<T extends Shown>(bars: readonly T[], v: ViewFilter): T[] {
  if (v.row) {
    const keys = v.row.keys ?? [v.row.key];
    return bars.filter((b) => keys.some((k) => b.rows.includes(k) || b.element === k));
  }
  return bars.filter((b) => v.families[b.family] && (!v.level || (b.storey ?? b.level ?? '') === v.level));
}

export function shownGhosts(ghosts: readonly Ghost3d[], bars: readonly Shown[], v: ViewFilter): Ghost3d[] {
  const drawn = new Set(bars.flatMap((b) => [b.element, ...b.rows]));
  return shownBars(ghosts, v).filter((g) => drawn.has(g.element));
}

export type { Frame };
