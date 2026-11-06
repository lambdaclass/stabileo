/**
 * Master and similar storeys: a level can repeat another (`Level.similarTo`), and an edit made on
 * one storey can reach the same object on the storeys it applies to — this one, its similar ones,
 * or all. "The same object" on another storey is the one of the same kind at the same place in plan
 * and the same heights above its level, within a tolerance; a member's counterpart is also of its type
 * (frame or truss). What has no counterpart is reported.
 *
 * A member belongs to the storey whose level its upper end sits on (a column to the floor it holds
 * up, a beam to its floor); a node to the level it sits on or the one under it; a slab or wall to the
 * level of its highest corner.
 *
 * Pure.
 */
import type { Level } from './grid';

export type StoreyScope = 'this' | 'similar' | 'all';

type P = { x: number; y: number; z?: number };
export interface StoreyModel {
  nodes: ReadonlyMap<number, P>;
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number; type?: string }>;
  quads?: ReadonlyMap<number, { nodes: readonly number[] }>;
  plates?: ReadonlyMap<number, { nodes: readonly number[] }>;
}

/** Plan and height tolerance, m. */
export const STOREY_TOL = 0.01;

const sorted = (levels: readonly Level[]) => [...levels].sort((a, b) => a.z - b.z);

/** The master a level repeats, followed to its root; a cycle reads as its own. */
export function masterOf(levels: readonly Level[], id: string): string {
  const by = new Map(levels.map((l) => [l.id, l]));
  const seen = new Set<string>();
  let cur = id;
  while (by.get(cur)?.similarTo && !seen.has(cur)) { seen.add(cur); cur = by.get(cur)!.similarTo!; }
  return by.has(cur) ? cur : id;
}

/** The levels an edit on `id` reaches under `scope`, low to high. */
export function scopeLevels(levels: readonly Level[], id: string, scope: StoreyScope): Level[] {
  const all = sorted(levels);
  if (scope === 'all') return all;
  if (scope === 'this') return all.filter((l) => l.id === id);
  const m = masterOf(levels, id);
  return all.filter((l) => masterOf(levels, l.id) === m);
}

/** The level at `z`, within the tolerance. */
export function levelAt(levels: readonly Level[], z: number, tol = STOREY_TOL): Level | null {
  return levels.find((l) => Math.abs(l.z - z) <= tol) ?? null;
}

/** The level at or under `z`: the storey a point at `z` is in. */
export function levelUnder(levels: readonly Level[], z: number, tol = STOREY_TOL): Level | null {
  let best: Level | null = null;
  for (const l of sorted(levels)) if (l.z <= z + tol) best = l;
  return best;
}

const zOf = (p: P) => p.z ?? 0;

/** The storey of a member: the level its upper end sits on, else the one under it. */
export function elementLevel(m: StoreyModel, id: number, levels: readonly Level[], tol = STOREY_TOL): Level | null {
  const e = m.elements.get(id);
  const a = e && m.nodes.get(e.nodeI), b = e && m.nodes.get(e.nodeJ);
  if (!a || !b) return null;
  const top = Math.max(zOf(a), zOf(b));
  return levelAt(levels, top, tol) ?? levelUnder(levels, top, tol);
}

export function nodeLevel(m: StoreyModel, id: number, levels: readonly Level[], tol = STOREY_TOL): Level | null {
  const n = m.nodes.get(id);
  return n ? levelAt(levels, zOf(n), tol) ?? levelUnder(levels, zOf(n), tol) : null;
}

export function shellLevel(m: StoreyModel, key: string, levels: readonly Level[], tol = STOREY_TOL): Level | null {
  const s = key.startsWith('p') ? m.plates?.get(+key.slice(1)) : m.quads?.get(+key.slice(1));
  const zs = (s?.nodes ?? []).map((n) => m.nodes.get(n)).filter((p): p is P => !!p).map(zOf);
  if (!zs.length) return null;
  const top = Math.max(...zs);
  return levelAt(levels, top, tol) ?? levelUnder(levels, top, tol);
}

/** A point's place on a level: plan position and height above the level; `-Infinity` for "on the level below". */
type Place = [number, number, number];

const levelBelow = (lv: Level, levels: readonly Level[]): Level | undefined => {
  const all = sorted(levels);
  return all[all.findIndex((l) => l.id === lv.id) - 1];
};

const place = (p: P, lv: Level): Place => [p.x, p.y, zOf(p) - lv.z];

/**
 * A member's ends on its level. An end on the level below is "below" whatever the storey's
 * height, so a column of a taller similar storey is still the same column.
 */
function memberPlaces(a: P, b: P, lv: Level, levels: readonly Level[], tol: number): Place[] {
  const under = levelBelow(lv, levels);
  const at = (p: P): Place => (under && Math.abs(zOf(p) - under.z) <= tol ? [p.x, p.y, -Infinity] : place(p, lv));
  return [at(a), at(b)];
}

const samePlace = (a: Place, b: Place, tol: number) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol
  && (a[2] === b[2] || (Number.isFinite(a[2]) && Number.isFinite(b[2]) && Math.abs(a[2] - b[2]) <= tol));

/** The same set of places, in any order, within the tolerance. */
function samePlaces(a: readonly Place[], b: readonly Place[], tol: number): boolean {
  if (a.length !== b.length) return false;
  const used = new Set<number>();
  return a.every((p) => {
    const i = b.findIndex((q, j) => !used.has(j) && samePlace(p, q, tol));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

/**
 * Objects by their places on one level. Each is filed under the cell of every place it has, and a
 * lookup reads the cells around the first place it asks for, so two places closer than the
 * tolerance always meet, whichever side of a cell boundary they fall on.
 */
class PlaceGrid<T> {
  private readonly cells = new Map<string, Array<{ places: Place[]; value: T }>>();
  private n = 0;
  constructor(private readonly tol: number) {}
  get size(): number { return this.n; }
  private cell(p: Place, dx = 0, dy = 0, dh = 0): string {
    const c = (v: number) => Math.floor(v / this.tol);
    return `${c(p[0]) + dx},${c(p[1]) + dy},${Number.isFinite(p[2]) ? c(p[2]) + dh : 'below'}`;
  }
  add(places: Place[], value: T): void {
    const entry = { places, value };
    for (const k of new Set(places.map((p) => this.cell(p)))) (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(entry);
    this.n++;
  }
  find(places: readonly Place[]): T | undefined {
    const q = places[0];
    if (!q) return undefined;
    const hs = Number.isFinite(q[2]) ? [-1, 0, 1] : [0];
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dh of hs) {
      for (const e of this.cells.get(this.cell(q, dx, dy, dh)) ?? []) if (samePlaces(e.places, places, this.tol)) return e.value;
    }
    return undefined;
  }
}

/** Lookups of the model's objects by their places, level by level; a shell's level key carries its kind. */
export class StoreyIndex {
  readonly elements = new Map<string, PlaceGrid<number>>();
  readonly nodes = new Map<string, PlaceGrid<number>>();
  readonly shells = new Map<string, PlaceGrid<string>>();
  constructor(private readonly tol: number) {}
  static add<T>(by: Map<string, PlaceGrid<T>>, level: string, places: Place[], value: T, tol: number): void {
    (by.get(level) ?? by.set(level, new PlaceGrid<T>(tol)).get(level)!).add(places, value);
  }
  addElement(level: string, places: Place[], id: number): void { StoreyIndex.add(this.elements, level, places, id, this.tol); }
  addNode(level: string, places: Place[], id: number): void { StoreyIndex.add(this.nodes, level, places, id, this.tol); }
  addShell(level: string, places: Place[], key: string): void { StoreyIndex.add(this.shells, level, places, key, this.tol); }
  static count(by: Map<string, PlaceGrid<unknown>>): number {
    let n = 0;
    for (const g of by.values()) n += g.size;
    return n;
  }
}

const memberKey = (level: string, e: { type?: string }) => `${level}#${e.type ?? 'frame'}`;

export function storeyIndex(m: StoreyModel, levels: readonly Level[], tol = STOREY_TOL): StoreyIndex {
  const idx = new StoreyIndex(tol);
  for (const [id, e] of m.elements) {
    const lv = elementLevel(m, id, levels, tol);
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    if (lv && a && b) idx.addElement(memberKey(lv.id, e), memberPlaces(a, b, lv, levels, tol), id);
  }
  for (const [id, n] of m.nodes) {
    const lv = nodeLevel(m, id, levels, tol);
    if (lv) idx.addNode(lv.id, [place(n, lv)], id);
  }
  for (const [prefix, map] of [['q', m.quads], ['p', m.plates]] as const) {
    for (const [id, s] of map ?? []) {
      const k = `${prefix}${id}`;
      const lv = shellLevel(m, k, levels, tol);
      const pts = s.nodes.map((n) => m.nodes.get(n)).filter((p): p is P => !!p);
      if (lv && pts.length === s.nodes.length) idx.addShell(`${lv.id}#${prefix}`, pts.map((p) => place(p, lv)), k);
    }
  }
  return idx;
}

export interface StoreyExpansion {
  elements: number[];
  nodes: number[];
  shells: string[];
  /** Objects taken on the other storeys. */
  added: number;
  /** Storeys reached, the selection's own included. */
  levels: string[];
  /** Objects with no counterpart on a storey in scope: what, and on which level. */
  unmatched: Array<{ kind: 'element' | 'node' | 'shell'; id: number | string; level: string }>;
}

/** A selection taken to the same objects on every storey `scope` reaches from each object's own. */
export function expandToStoreys(
  m: StoreyModel,
  levels: readonly Level[],
  sel: { elements: Iterable<number>; nodes: Iterable<number>; shells: Iterable<string> },
  scope: StoreyScope,
  tol = STOREY_TOL,
  idx: StoreyIndex = storeyIndex(m, levels, tol),
): StoreyExpansion {
  const elements = new Set(sel.elements), nodes = new Set(sel.nodes), shells = new Set(sel.shells);
  const before = elements.size + nodes.size + shells.size;
  const reached = new Set<string>();
  const unmatched: StoreyExpansion['unmatched'] = [];
  if (scope !== 'this') {
    for (const id of [...elements]) {
      const e = m.elements.get(id), lv = elementLevel(m, id, levels, tol);
      const a = e && m.nodes.get(e.nodeI), b = e && m.nodes.get(e.nodeJ);
      if (!lv || !a || !b) continue;
      reached.add(lv.id);
      const k = memberPlaces(a, b, lv, levels, tol);
      for (const other of scopeLevels(levels, lv.id, scope)) {
        if (other.id === lv.id) continue;
        reached.add(other.id);
        const hit = idx.elements.get(memberKey(other.id, e))?.find(k);
        if (hit !== undefined) elements.add(hit); else unmatched.push({ kind: 'element', id, level: other.id });
      }
    }
    for (const id of [...nodes]) {
      const n = m.nodes.get(id), lv = nodeLevel(m, id, levels, tol);
      if (!n || !lv) continue;
      reached.add(lv.id);
      const k = [place(n, lv)];
      for (const other of scopeLevels(levels, lv.id, scope)) {
        if (other.id === lv.id) continue;
        reached.add(other.id);
        const hit = idx.nodes.get(other.id)?.find(k);
        if (hit !== undefined) nodes.add(hit); else unmatched.push({ kind: 'node', id, level: other.id });
      }
    }
    for (const sk of [...shells]) {
      const s = sk.startsWith('p') ? m.plates?.get(+sk.slice(1)) : m.quads?.get(+sk.slice(1));
      const lv = shellLevel(m, sk, levels, tol);
      const pts = (s?.nodes ?? []).map((n) => m.nodes.get(n)).filter((p): p is P => !!p);
      if (!s || !lv || pts.length !== s.nodes.length) continue;
      reached.add(lv.id);
      const k = pts.map((p) => place(p, lv));
      for (const other of scopeLevels(levels, lv.id, scope)) {
        if (other.id === lv.id) continue;
        reached.add(other.id);
        const hit = idx.shells.get(`${other.id}#${sk[0]}`)?.find(k);
        if (hit !== undefined) shells.add(hit); else unmatched.push({ kind: 'shell', id: sk, level: other.id });
      }
    }
  }
  return {
    elements: [...elements], nodes: [...nodes], shells: [...shells],
    added: elements.size + nodes.size + shells.size - before,
    levels: sorted(levels).filter((l) => reached.has(l.id)).map((l) => l.id),
    unmatched,
  };
}

/** A point on `from` placed on `to`: the same plan position and height above its level. */
export function placeOn(p: P, from: Level, to: Level): { x: number; y: number; z: number } {
  return { x: p.x, y: p.y, z: zOf(p) - from.z + to.z };
}

/**
 * A member's ends on `from` placed on `to`. An end on the level below `from` goes to the level
 * below `to`, so a column of a 3 m storey copied to a 4 m one spans that storey; null when `to` has
 * no level below for it.
 */
export function placeMemberOn(a: P, b: P, from: Level, to: Level, levels: readonly Level[], tol = STOREY_TOL): [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] | null {
  const under = levelBelow(from, levels), toUnder = levelBelow(to, levels);
  const end = (p: P) => {
    if (under && Math.abs(zOf(p) - under.z) <= tol) return toUnder ? { x: p.x, y: p.y, z: toUnder.z } : null;
    return placeOn(p, from, to);
  };
  const [i, j] = [end(a), end(b)];
  return i && j ? [i, j] : null;
}

/** Problems with the levels' similarity: a level similar to itself or in a cycle, a master that is not a level. */
export function similarityIssues(levels: readonly Level[]): Array<{ level: string; issue: 'cycle' | 'missing' }> {
  const ids = new Set(levels.map((l) => l.id));
  const out: Array<{ level: string; issue: 'cycle' | 'missing' }> = [];
  for (const l of levels) {
    if (!l.similarTo) continue;
    if (!ids.has(l.similarTo)) { out.push({ level: l.id, issue: 'missing' }); continue; }
    const by = new Map(levels.map((x) => [x.id, x]));
    const seen = new Set<string>([l.id]);
    let cur = l.similarTo;
    while (cur) {
      if (seen.has(cur)) { out.push({ level: l.id, issue: 'cycle' }); break; }
      seen.add(cur);
      cur = by.get(cur)?.similarTo ?? '';
    }
  }
  return out;
}
