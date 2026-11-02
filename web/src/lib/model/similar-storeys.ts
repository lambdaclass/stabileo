/**
 * Master and similar storeys: a level can repeat another (`Level.similarTo`), and an edit made on
 * one storey can reach the same object on the storeys it applies to — this one, its similar ones,
 * or all. "The same object" on another storey is the one of the same kind at the same place in plan
 * and the same heights above its level, within a tolerance; what has no counterpart is reported.
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
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number }>;
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
const key = (v: number, tol: number) => Math.round(v / tol);

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

/** A point's place relative to its level, as a key: plan position and height above the level. */
const placeKey = (p: P, level: Level, tol: number) => `${key(p.x, tol)},${key(p.y, tol)},${key(zOf(p) - level.z, tol)}`;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * A member's place on its level. An end on the level below is "below" whatever the storey's
 * height, so a column of a taller similar storey is still the same column.
 */
function memberKey(a: P, b: P, lv: Level, levels: readonly Level[], tol: number): string {
  const all = sorted(levels);
  const under = all[all.findIndex((l) => l.id === lv.id) - 1];
  const at = (p: P) => (under && Math.abs(zOf(p) - under.z) <= tol ? `${key(p.x, tol)},${key(p.y, tol)},below` : placeKey(p, lv, tol));
  return pairKey(at(a), at(b));
}

/** Lookups of the model's objects by their place on each level. */
export interface StoreyIndex {
  elements: Map<string, number>;
  nodes: Map<string, number>;
  shells: Map<string, string>;
}

export function storeyIndex(m: StoreyModel, levels: readonly Level[], tol = STOREY_TOL): StoreyIndex {
  const idx: StoreyIndex = { elements: new Map(), nodes: new Map(), shells: new Map() };
  for (const [id, e] of m.elements) {
    const lv = elementLevel(m, id, levels, tol);
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    if (lv && a && b) idx.elements.set(`${lv.id}#${memberKey(a, b, lv, levels, tol)}`, id);
  }
  for (const [id, n] of m.nodes) {
    const lv = nodeLevel(m, id, levels, tol);
    if (lv) idx.nodes.set(`${lv.id}#${placeKey(n, lv, tol)}`, id);
  }
  for (const [prefix, map] of [['q', m.quads], ['p', m.plates]] as const) {
    for (const [id, s] of map ?? []) {
      const k = `${prefix}${id}`;
      const lv = shellLevel(m, k, levels, tol);
      const pts = s.nodes.map((n) => m.nodes.get(n)).filter((p): p is P => !!p);
      if (lv && pts.length === s.nodes.length) idx.shells.set(`${lv.id}#${prefix}#${pts.map((p) => placeKey(p, lv, tol)).sort().join('|')}`, k);
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
      const k = memberKey(a, b, lv, levels, tol);
      for (const other of scopeLevels(levels, lv.id, scope)) {
        if (other.id === lv.id) continue;
        reached.add(other.id);
        const hit = idx.elements.get(`${other.id}#${k}`);
        if (hit !== undefined) elements.add(hit); else unmatched.push({ kind: 'element', id, level: other.id });
      }
    }
    for (const id of [...nodes]) {
      const n = m.nodes.get(id), lv = nodeLevel(m, id, levels, tol);
      if (!n || !lv) continue;
      reached.add(lv.id);
      const k = placeKey(n, lv, tol);
      for (const other of scopeLevels(levels, lv.id, scope)) {
        if (other.id === lv.id) continue;
        reached.add(other.id);
        const hit = idx.nodes.get(`${other.id}#${k}`);
        if (hit !== undefined) nodes.add(hit); else unmatched.push({ kind: 'node', id, level: other.id });
      }
    }
    for (const sk of [...shells]) {
      const s = sk.startsWith('p') ? m.plates?.get(+sk.slice(1)) : m.quads?.get(+sk.slice(1));
      const lv = shellLevel(m, sk, levels, tol);
      const pts = (s?.nodes ?? []).map((n) => m.nodes.get(n)).filter((p): p is P => !!p);
      if (!s || !lv || pts.length !== s.nodes.length) continue;
      reached.add(lv.id);
      const k = `${sk[0]}#${pts.map((p) => placeKey(p, lv, tol)).sort().join('|')}`;
      for (const other of scopeLevels(levels, lv.id, scope)) {
        if (other.id === lv.id) continue;
        reached.add(other.id);
        const hit = idx.shells.get(`${other.id}#${k}`);
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
