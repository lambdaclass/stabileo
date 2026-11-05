/**
 * Which storeys an edit reaches: this one, its similar ones, or all (`model/similar-storeys.ts`).
 * With a scope wider than "this", what is selected on one storey is selected on the others it
 * reaches, so every edit and assignment of the selection applies there too, and a member drawn on
 * a storey is drawn on them as well. PRO's; a view setting, not saved.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import type { Element } from './model.svelte';
import { expandToStoreys, placeMemberOn, elementLevel, scopeLevels, STOREY_TOL, type StoreyExpansion, type StoreyScope } from '../model/similar-storeys';

type Selection = { nodes: Set<number>; elements: Set<number>; shells: Set<string> };
export interface Replication { copies: number[]; skipped: string[]; resized: string[]; existing: string[] }

let scope = $state<StoreyScope>('this');
let last = $state<StoreyExpansion | null>(null);
let lastReplication = $state<Replication | null>(null);
let produced: Selection | null = null;
let added: Selection | null = null;

const LENGTH_STATED = ['unbracedLength', 'bracing'] as const;
const NOT_COPIED = new Set(['id', 'nodeI', 'nodeJ', 'name', 'arc', 'keptOver']);

const model = () => ({ nodes: modelStore.nodes, elements: modelStore.elements, quads: modelStore.quads, plates: modelStore.plates });
const levels = () => modelStore.grid?.levels ?? [];

export const storeyScope = {
  get scope() { return scope; },
  set scope(v: StoreyScope) {
    const back = added ? minus(current(), added) : null;
    scope = v; last = null; lastReplication = null; produced = null; added = null;
    if (back && selectionKey(back) !== selectionKey(current())) uiStore.setSelection(back.nodes, back.elements, false, back.shells);
    if (v !== 'this') this.expandSelection();
  },
  /** What the last expansion took: how many objects, on which storeys, and what had no counterpart. */
  get last() { return last; },
  /** What the last member drawn under the scope was copied to, the storeys it could not reach, and those where its length changed. */
  get lastReplication() { return lastReplication; },
  get active() { return uiStore.analysisMode === 'pro' && scope !== 'this' && levels().length > 1; },
  /** Take the selection to the storeys in scope. Returns how many objects it added. */
  expandSelection(): number {
    if (!this.active) return 0;
    const sel = current();
    if (sel.elements.size + sel.nodes.size + sel.shells.size === 0) { last = null; produced = null; added = null; return 0; }
    if (produced && selectionKey(sel) === selectionKey(produced)) return 0;
    const kept = added && produced && (contains(sel, produced) || contains(produced, sel)) ? minus(sel, added) : sel;
    const own = size(kept) ? kept : sel;
    const x = expandToStoreys(model(), levels(), own, scope);
    last = x;
    const reached: Selection = { nodes: new Set(x.nodes), elements: new Set(x.elements), shells: new Set(x.shells) };
    produced = reached;
    added = minus(reached, own);
    if (selectionKey(reached) !== selectionKey(sel)) uiStore.setSelection(new Set(reached.nodes), new Set(reached.elements), false, new Set(reached.shells));
    return x.added;
  },
  /**
   * Draw member `id`'s copies on the storeys in scope, inside the caller's undo step: the same plan
   * position and heights above each level, and every property of the member but its name, the tag
   * of the arc it was drawn in and its references to other objects. A copy of another length drops what is stated in metres along the
   * member. Their ids; `lastReplication` says what was skipped.
   */
  replicateMember(id: number): number[] {
    if (!this.active) return [];
    const e = modelStore.elements.get(id);
    const lv = elementLevel(model(), id, levels());
    if (!e || !lv) return [];
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    if (!a || !b) return [];
    const props = Object.fromEntries(Object.entries($state.snapshot(e)).filter(([k]) => !NOT_COPIED.has(k))) as Partial<Element>;
    const length = dist(a, b);
    const out: Replication = { copies: [], skipped: [], resized: [], existing: [] };
    for (const other of scopeLevels(levels(), lv.id, scope)) {
      if (other.id === lv.id) continue;
      const ends = placeMemberOn(a, b, lv, other, levels());
      if (!ends) { out.skipped.push(other.id); continue; }
      const [i, j] = ends.map(nodeAt) as [number, number];
      if (i === j) continue;
      if (joined(i, j)) { out.existing.push(other.id); continue; }
      const patch: Partial<Element> = structuredClone(props);
      if (Math.abs(dist(ends[0], ends[1]) - length) > STOREY_TOL && LENGTH_STATED.some((k) => patch[k] !== undefined)) {
        for (const k of LENGTH_STATED) delete patch[k];
        out.resized.push(other.id);
      }
      const nid = modelStore.addElement(i, j, e.type);
      modelStore.updateElement(nid, patch);
      out.copies.push(nid);
    }
    lastReplication = out;
    return out.copies;
  },
};

const dist = (p: { x: number; y: number; z?: number }, q: { x: number; y: number; z?: number }) => Math.hypot(q.x - p.x, q.y - p.y, (q.z ?? 0) - (p.z ?? 0));

const current = (): Selection => ({ nodes: new Set(uiStore.selectedNodes), elements: new Set(uiStore.selectedElements), shells: new Set(uiStore.selectedShells) });

function selectionKey(s: Selection): string {
  const ids = (x: Iterable<string | number>) => [...x].map(String).sort().join(',');
  return `${ids(s.nodes)}|${ids(s.elements)}|${ids(s.shells)}`;
}

function contains(a: Selection, b: Selection): boolean {
  return [...b.nodes].every((v) => a.nodes.has(v)) && [...b.elements].every((v) => a.elements.has(v)) && [...b.shells].every((v) => a.shells.has(v));
}

const size = (s: Selection) => s.nodes.size + s.elements.size + s.shells.size;

function minus(a: Selection, b: Selection): Selection {
  return {
    nodes: new Set([...a.nodes].filter((v) => !b.nodes.has(v))),
    elements: new Set([...a.elements].filter((v) => !b.elements.has(v))),
    shells: new Set([...a.shells].filter((v) => !b.shells.has(v))),
  };
}

/** Whether a member already joins nodes `i` and `j`, either way round. */
function joined(i: number, j: number): boolean {
  for (const e of modelStore.elements.values()) if ((e.nodeI === i && e.nodeJ === j) || (e.nodeI === j && e.nodeJ === i)) return true;
  return false;
}

/** The node at a point, or a new one there. */
function nodeAt(p: { x: number; y: number; z: number }): number {
  for (const [id, n] of modelStore.nodes) {
    if (Math.abs(n.x - p.x) <= STOREY_TOL && Math.abs(n.y - p.y) <= STOREY_TOL && Math.abs((n.z ?? 0) - p.z) <= STOREY_TOL) return id;
  }
  return modelStore.addNode(p.x, p.y, p.z);
}
