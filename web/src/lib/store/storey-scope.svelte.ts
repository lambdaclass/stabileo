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
export interface Replication { copies: number[]; skipped: string[]; resized: string[] }

let scope = $state<StoreyScope>('this');
let last = $state<StoreyExpansion | null>(null);
let lastReplication = $state<Replication | null>(null);
let produced = '';
let origin: Selection | null = null;

const LENGTH_STATED = ['unbracedLength', 'bracing'] as const;
const NOT_COPIED = new Set(['id', 'nodeI', 'nodeJ', 'name', 'arc', 'keptOver']);

const model = () => ({ nodes: modelStore.nodes, elements: modelStore.elements, quads: modelStore.quads, plates: modelStore.plates });
const levels = () => modelStore.grid?.levels ?? [];

export const storeyScope = {
  get scope() { return scope; },
  set scope(v: StoreyScope) {
    const back = origin && produced && currentKey() === produced ? origin : null;
    scope = v; last = null; lastReplication = null; produced = ''; origin = null;
    if (back) uiStore.setSelection(new Set(back.nodes), new Set(back.elements), false, new Set(back.shells));
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
    const sel = { elements: uiStore.selectedElements, nodes: uiStore.selectedNodes, shells: uiStore.selectedShells };
    if (sel.elements.size + sel.nodes.size + sel.shells.size === 0) { last = null; produced = ''; origin = null; return 0; }
    if (selectionKey(sel.nodes, sel.elements, sel.shells) === produced) return 0;
    origin = { nodes: new Set(sel.nodes), elements: new Set(sel.elements), shells: new Set(sel.shells) };
    const x = expandToStoreys(model(), levels(), sel, scope);
    last = x;
    produced = selectionKey(x.nodes, x.elements, x.shells);
    if (x.added > 0) uiStore.setSelection(new Set(x.nodes), new Set(x.elements), false, new Set(x.shells));
    return x.added;
  },
  /**
   * Draw member `id`'s copies on the storeys in scope, inside the caller's undo step: the same plan
   * position and heights above each level, and every property of the member but its name and the
   * references to other objects. A copy of another length drops what is stated in metres along the
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
    const out: Replication = { copies: [], skipped: [], resized: [] };
    for (const other of scopeLevels(levels(), lv.id, scope)) {
      if (other.id === lv.id) continue;
      const ends = placeMemberOn(a, b, lv, other, levels());
      if (!ends) { out.skipped.push(other.id); continue; }
      const [i, j] = ends.map(nodeAt) as [number, number];
      if (i === j || joined(i, j)) continue;
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

const currentKey = () => selectionKey(uiStore.selectedNodes, uiStore.selectedElements, uiStore.selectedShells);

function selectionKey(nodes: Iterable<number>, elements: Iterable<number>, shells: Iterable<string | number>): string {
  const ids = (s: Iterable<string | number>) => [...s].map(String).sort().join(',');
  return `${ids(nodes)}|${ids(elements)}|${ids(shells)}`;
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
