/**
 * Placement: putting a fragment into the model where the pointer says, with a ghost.
 *
 * Everything that brings structure in (paste, a generated structure, a template, an imported
 * file, move and copy by two points) starts a placement with a fragment and ends it with a commit
 * or a cancel. Between the two the model is not touched: the ghost is moved by a matrix, the
 * merge preview is read against the model, and there is no history. The commit is one undo step,
 * welds included; redo repeats it exactly, because the snapshot carries the id counters.
 *
 *   T = translate(target) · rotZ(rotation) · mirror · translate(−anchor)
 *
 * The anchor is one of the fragment's own points (Tab cycles them); the target is a node under
 * the pointer, else a point on the active level snapped to the grid. R turns 90° about the
 * anchor, Shift+R back; F mirrors across the plane through the anchor normal to X. Enter places
 * at typed coordinates; Esc cancels; Shift+click places and keeps going.
 */
import { applyPoint, compose, reflection, rotation, translation, type Affine, type Vec3 } from '../model/edit/affine';
import { closure, fragmentBounds, type EntitySet, type Fragment } from '../model/edit/fragment';
import { insertFragment, NodeIndex, DEFAULT_WELD, type EditReport } from '../model/edit/transformed-copy';
import { transformInPlace } from '../model/edit/transform-in-place';
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';

export type PlacementMode = 'insert' | 'move';

export interface PlacementStart {
  fragment: Fragment;
  /** What is being placed, for the HUD. */
  label: string;
  mode?: PlacementMode;
  /** Move: the entities that move (the fragment is their picture for the ghost). */
  moveSet?: EntitySet;
  /** Candidate anchors; default: the fragment's nodes, lowest-leftmost first. */
  anchors?: Vec3[];
  /** Where the ghost starts; default: the anchor itself, so nothing moves until the pointer does. */
  target?: Vec3;
  withLoads?: boolean;
  withSupports?: boolean;
  /** Called after each commit (and not on cancel). */
  onCommit?: (r: EditReport | null) => void;
}

export interface MergePreview {
  /** Fragment nodes that land on a model node, as positions after the transform. */
  welds: Vec3[];
  /** Of those, the ones where the fragment carries a support the model's will override. */
  supportKept: number;
}

function createPlacementStore() {
  let active = $state(false);
  let label = $state('');
  let mode = $state<PlacementMode>('insert');
  let fragment = $state.raw<Fragment | null>(null);
  let moveSet: EntitySet | null = null;
  let anchors = $state.raw<Vec3[]>([]);
  let anchorIndex = $state(0);
  let rotationDeg = $state(0);
  let mirrored = $state(false);
  let target = $state.raw<Vec3>([0, 0, 0]);
  let targetLabel = $state('');
  let withLoads = $state(true);
  let withSupports = $state(true);
  let onCommit: PlacementStart['onCommit'] = undefined;
  let lastReport = $state.raw<EditReport | null>(null);
  /** Bumped whenever the transform changes, for the ghost to follow. */
  let revision = $state(0);

  let index: NodeIndex | null = null;
  const supportedNodes = new Set<number>();

  function buildIndex() {
    index = new NodeIndex(DEFAULT_WELD);
    supportedNodes.clear();
    const moving = moveSet ? closure(moveSet).nodes : new Set<number>();
    for (const n of modelStore.nodes.values()) if (!moving.has(n.id)) index.add(n.id, [n.x, n.y, n.z ?? 0]);
    for (const s of modelStore.supports.values()) supportedNodes.add(s.nodeId);
  }

  const anchor = (): Vec3 => anchors[anchorIndex] ?? [0, 0, 0];

  function transform(): Affine {
    const a = anchor();
    let T = translation([-a[0], -a[1], -a[2]]);
    if (mirrored) T = compose(reflection([0, 0, 0], [1, 0, 0]), T);
    if (rotationDeg) T = compose(rotation([0, 0, 0], [0, 0, 1], rotationDeg), T);
    return compose(translation(target), T);
  }

  const store = {
    get active() { return active; },
    get label() { return label; },
    get mode() { return mode; },
    get fragment() { return fragment; },
    get anchors() { return anchors; },
    get anchorIndex() { return anchorIndex; },
    get anchor() { return anchor(); },
    get rotation() { return rotationDeg; },
    get mirrored() { return mirrored; },
    get target() { return target; },
    get targetLabel() { return targetLabel; },
    get revision() { return revision; },
    get lastReport() { return lastReport; },
    get withLoads() { return withLoads; },
    set withLoads(v: boolean) { withLoads = v; },
    get withSupports() { return withSupports; },
    set withSupports(v: boolean) { withSupports = v; },
    transform,

    start(s: PlacementStart): void {
      if (s.fragment.nodes.length === 0) return;
      fragment = s.fragment;
      label = s.label;
      mode = s.mode ?? 'insert';
      moveSet = s.moveSet ?? null;
      anchors = s.anchors && s.anchors.length ? s.anchors : defaultAnchors(s.fragment);
      anchorIndex = 0;
      rotationDeg = 0;
      mirrored = false;
      target = s.target ?? anchors[0]!;
      targetLabel = '';
      withLoads = s.withLoads ?? true;
      withSupports = s.withSupports ?? true;
      onCommit = s.onCommit;
      lastReport = null;
      buildIndex();
      active = true;
      revision++;
    },

    setTarget(p: Vec3, lbl = ''): void {
      if (!active) return;
      target = p;
      targetLabel = lbl;
      revision++;
    },

    cycleAnchor(step = 1): void {
      if (!active || anchors.length === 0) return;
      // Keep the ghost where it is on screen: the new anchor goes to the pointer.
      anchorIndex = (anchorIndex + step + anchors.length) % anchors.length;
      revision++;
    },

    rotate(deg: number): void {
      if (!active) return;
      rotationDeg = (((rotationDeg + deg) % 360) + 360) % 360;
      revision++;
    },

    mirror(): void {
      if (!active) return;
      mirrored = !mirrored;
      revision++;
    },

    /** Which fragment nodes would weld where the ghost is now. */
    mergePreview(): MergePreview {
      const out: MergePreview = { welds: [], supportKept: 0 };
      if (!active || !fragment || !index) return out;
      const T = transform();
      const pos = (id: number): Vec3 | undefined => { const n = modelStore.nodes.get(id); return n ? [n.x, n.y, n.z ?? 0] : undefined; };
      const fragSupported = new Set(fragment.supports.map((s) => s.nodeId));
      for (const n of fragment.nodes) {
        const p = applyPoint(T, [n.x, n.y, n.z]);
        const hit = index.find(p, pos);
        if (hit === null) continue;
        out.welds.push(p);
        if (withSupports && fragSupported.has(n.id)) out.supportKept++;
      }
      return out;
    },

    /** Place the fragment where the ghost is. `keepGoing` leaves placement active for another. */
    commit(keepGoing = false): EditReport | null {
      if (!active || !fragment) return null;
      const T = transform();
      let report: EditReport | null = null;
      if (mode === 'move' && moveSet) {
        const r = transformInPlace(moveSet, T, { leftHand: uiStore.axisConvention3D === 'leftHand' });
        void r;
        const c = closure(moveSet);
        uiStore.setSelection(new Set(c.nodes), new Set(c.elements), true,
          new Set([...[...c.quads].map((id) => `q${id}`), ...[...c.plates].map((id) => `p${id}`)]));
        keepGoing = false;
      } else {
        report = insertFragment(fragment, [T], { withLoads, withSupports, leftHand: uiStore.axisConvention3D === 'leftHand' });
        uiStore.setSelection(new Set(report.nodes), new Set(report.elements), true,
          new Set([...report.quads.map((id) => `q${id}`), ...report.plates.map((id) => `p${id}`)]));
      }
      lastReport = report;
      onCommit?.(report);
      if (keepGoing) { buildIndex(); revision++; } else store.cancel();
      return report;
    },

    /** Place with the anchor exactly at `p` (typed coordinates). */
    commitAt(p: Vec3, keepGoing = false): EditReport | null {
      store.setTarget(p, '');
      return store.commit(keepGoing);
    },

    cancel(): void {
      active = false;
      fragment = null;
      moveSet = null;
      anchors = [];
      index = null;
      onCommit = undefined;
      revision++;
    },
  };
  return store;
}

/** The fragment's nodes as anchors: the lowest, then left-to-right, front-to-back. Bounded. */
export function defaultAnchors(frag: Fragment): Vec3[] {
  const pts = frag.nodes.map((n) => [n.x, n.y, n.z] as Vec3);
  pts.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  const seen = new Set<string>();
  const out: Vec3[] = [];
  for (const p of pts) {
    const k = p.map((v) => v.toFixed(4)).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= 64) break;
  }
  if (out.length === 0) {
    const b = fragmentBounds(frag);
    out.push(b.min);
  }
  return out;
}

export const placementStore = createPlacementStore();
