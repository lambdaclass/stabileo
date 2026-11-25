import { withScenarioSurfaceIntent } from '../engine/accounting-source';
import { plainDeepCopy } from '../utils/plain-deep-copy';
/**
 * "What if…?" — the session behind the Explore panel.
 *
 * ── Why it is a store and not the panel's own state ─────────────────
 *
 * The panel is docked in the right-hand column, and that column shows one
 * thing at a time: picking a diagram in the ribbon swaps it for Results. The
 * panel then unmounted with the session inside it — the baseline it was to
 * restore went with it, and the model stayed as the sliders had left it. The
 * session lives here, so the column can show something else and come back.
 *
 * ── How it recomputes ──────────────────────────────────────────────
 *
 * Every change rebuilds the model from the baseline taken on entry (so
 * nothing accumulates) and lets live calculation solve it: entering turns
 * live calc on, leaving puts it back as it was. The solve is then the app's
 * ordinary one — combinations, sliding joints, the error when a change makes
 * a mechanism — and a re-solve keeps the diagram, case and combination on
 * screen (resultsStore.restoreView). The panel used to solve on its own,
 * which skipped all of that and landed every slider move on the deformed
 * shape.
 */
import { recheckStore } from './recheck.svelte';
import type { SolveStamp } from '../provenance/solve-stamp';
import { scaledLoad } from '../model/loads/load-magnitudes';
import { tick } from 'svelte';
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import type { ModelSnapshot } from './history.svelte';
import type { Release, Section, SupportType } from './model.svelte';
import { solverProperties } from '../section/state';
import { liveSolveBusy } from '../engine/live-calc-state';
import { modelCoords, shownCoords } from '../axes/display';
import { is3DWorkspace } from '../utils/workspace';

export interface MemberFactors { e: number; a: number; iy: number }

let baseline = $state<ModelSnapshot | null>(null);
let liveWasOn = false;
let loadFactors = $state<number[]>([]);
let all = $state<MemberFactors>({ e: 1, a: 1, iy: 1 });
let members = $state<Record<number, MemberFactors>>({});
let releases = $state<Record<number, { i?: Release; j?: Release }>>({});
let supportTypes = $state<Record<number, SupportType>>({});
/** A point load on a member at another distance from its node I (m). */
let loadAt = $state<Record<number, number>>({});
/** A load on a node, carried to another node. */
let loadNode = $state<Record<number, number>>({});
/** A support carried to another node, by support id. */
let supportNode = $state<Record<number, number>>({});
/** A point along a member (0 < t < 1 from node I), where a nodal load or a support was carried. */
export interface Along { elementId: number; t: number }
/** A nodal load carried onto a member, by load index. */
let loadAlong = $state<Record<number, Along>>({});
/** A support carried onto a member, by support id. */
let supportAlong = $state<Record<number, Along>>({});
/** What the canvas showed on entry, put back on leaving. */
let viewAtOpen: { showLoads: boolean; showLoads3D: boolean; hideLoadsWithDiagram: boolean } | null = null;
/** A node moved, in the coordinates the reader sees (`shownCoords`). */
let nodeShift = $state<Record<number, number[]>>({});
/** The response before any change, for the panel's comparison. */
let reference = $state.raw<Record<string, number> | null>(null);
let frame: { cancel: () => void } | null = null;
let pending = false;
/*
 * The model version this session last produced. Anything else moving it —
 * an edit on the canvas, undo, opening a file, loading an example — changed
 * the model under the session, and its baseline no longer describes it.
 */
let ownVersion = -1;
/** The project's solve stamp when Explore opened, put back when it closes. */
let stampAtOpen: SolveStamp | undefined;

const ONE: MemberFactors = { e: 1, a: 1, iy: 1 };

function restoreView(): void {
  if (!viewAtOpen) return;
  uiStore.showLoads = viewAtOpen.showLoads;
  uiStore.showLoads3D = viewAtOpen.showLoads3D;
  uiStore.hideLoadsWithDiagram = viewAtOpen.hideLoadsWithDiagram;
  viewAtOpen = null;
}

function restoreBaseline(snap: ModelSnapshot): void {
  modelStore.restore(snap);
  if (snap.presentation3D) uiStore.viewportPresentation3D = snap.presentation3D;
}

/**
 * The fields of each load type that are its magnitude: what the load slider
 * multiplies. Positions (`a`, `b`), directions (`angle`, `isGlobal`) and ids
 * stay as they are.
 *
 * Every load type the model defines has an entry, and each entry names only
 * fields that type has: a load type added to `Load` without one here fails
 * the typecheck, instead of keeping its baseline value whatever the slider
 * says (which is what a 2D point moment and a 3D point load on a member did).
 * Legacy aliases (`fy`, `mz` on a plane load) are scaled too, so the load
 * scales whichever of the pair the solver reads.
 *
 * What the slider reaches is what the panel lists under "Loads": one slider
 * per entry of `model.loads`. A temperature load is one of them (listed as
 * "Thermal"), so it scales like any other: twice the ΔT, twice the response.
 * A support settlement is not a load but a property of the support (`dx`,
 * `dz`, `dry`… on `Support`), shown under "Supports" with no slider, so the
 * load sliders leave it as it is. With settlements in the model the response
 * is then the settlement's plus k times the loads'; without them, all loads
 * × k gives displacements, reactions and member forces × k. Self-weight,
 * likewise, is not an entry of `model.loads` and has no slider.
 */
// The registry is shared with the load operations (`model/loads/load-magnitudes.ts`).

/**
 * Each load of the model times its slider's factor. `apply` has just rebuilt
 * the model from the baseline, as a deep copy, so the loads here are the
 * baseline's and scaling them in place does not accumulate. Scaling what
 * `restore` wrote, rather than the snapshot's own fields, also scales the
 * canonical fields it fills in (a legacy nodal load's `fz`/`my`).
 */
function scaleLoads(): void {
  const loads = modelStore.model.loads;
  for (let i = 0; i < loads.length; i++) {
    const f = loadFactors[i] ?? 1;
    if (f === 1) continue;
    // What every scaling of a load scales: a shell's values per corner and its variation too (a
    // soil or a fluid on a wall is q = 0, all of it in the variation).
    const original = loads[i]!;
    const intent = original.type === 'surface3d' && original.data.fromDef !== undefined
      ? { baseline: plainDeepCopy(original.data), factor: f }
      : undefined;
    const scaled = scaledLoad(original, f);
    loads[i] = intent && scaled.type === 'surface3d' ? withScenarioSurfaceIntent(scaled, intent) : scaled;
  }
}

/**
 * A section with its area and strong-axis inertia scaled. It is written as a
 * properties-only section: a geometry-backed one reports its polygons'
 * values to the solver whatever its fields say, so scaling the fields alone
 * did nothing to a profile from the library.
 */
function scaledSection(sec: Section, fa: number, fi: number): Section {
  const p = solverProperties(sec);
  const out = { ...sec, a: p.a * fa, iy: p.iy * fi, iz: p.iz } as Section;
  if (p.j != null) (out as { j?: number }).j = p.j;
  delete (out as { canonical?: unknown }).canonical;
  return out;
}

function moveNodes(): void {
  const m = modelStore.model;
  const space = is3DWorkspace(uiStore.analysisMode);
  for (const [key, d] of Object.entries(nodeShift)) {
    const n = m.nodes.get(Number(key));
    if (!n || d.every((v) => v === 0)) continue;
    const at = shownCoords(n, space).map((v, i) => v + (d[i] ?? 0));
    const { x, y, z } = modelCoords(at, space);
    m.nodes.set(n.id, space ? { ...n, x, y, z } : { ...n, x, y });
  }
  m.nodes = new Map(m.nodes);
}

function memberLength(elementId: number): number {
  const m = modelStore.model;
  const el = m.elements.get(elementId);
  const a = el && m.nodes.get(el.nodeI), b = el && m.nodes.get(el.nodeJ);
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)) : 0;
}

/* Positions apply after the nodes moved, so a load stays on the member it was on, within its new length. */
function moveLoads(): void {
  const loads = modelStore.model.loads;
  for (const [key, a] of Object.entries(loadAt)) {
    const i = Number(key), l = loads[i];
    if (!l || (l.type !== 'pointOnElement' && l.type !== 'pointOnElement3d')) continue;
    const d = l.data as { elementId: number; a: number };
    loads[i] = { ...l, data: { ...l.data, a: Math.min(Math.max(a, 0), memberLength(d.elementId)) } } as typeof l;
  }
  for (const [key, nodeId] of Object.entries(loadNode)) {
    const i = Number(key), l = loads[i];
    if (i in loadAlong) continue;
    if (!l || (l.type !== 'nodal' && l.type !== 'nodal3d') || !modelStore.model.nodes.has(nodeId)) continue;
    loads[i] = { ...l, data: { ...l.data, nodeId } } as typeof l;
  }
}

function moveSupports(): void {
  const m = modelStore.model;
  const taken = new Set([...m.supports.values()].map((s) => s.nodeId));
  for (const [key, nodeId] of Object.entries(supportNode)) {
    if (Number(key) in supportAlong) continue;
    const s = m.supports.get(Number(key));
    if (!s || s.nodeId === nodeId || taken.has(nodeId) || !m.nodes.has(nodeId)) continue;
    taken.delete(s.nodeId);
    taken.add(nodeId);
    m.supports.set(s.id, { ...s, nodeId });
  }
  m.supports = new Map(m.supports);
}

/** The node nearest a point of the model, as a cut at that point left it (a cut may reuse a node). */
function nodeAt(p: { x: number; y: number; z: number }): number | null {
  let best: number | null = null, d = Infinity;
  for (const n of modelStore.model.nodes.values()) {
    const e = Math.hypot(n.x - p.x, n.y - p.y, (n.z ?? 0) - p.z);
    if (e < d) { d = e; best = n.id; }
  }
  return best;
}

/*
 * Last, after every other change: cutting a member renumbers the loads on it, and the placements
 * are found again by the point they asked for, since a cut near an existing node reuses it.
 */
function placeAlong(): void {
  const m = modelStore.model;
  const byMember = new Map<number, Array<{ t: number; place: (nodeId: number) => void }>>();
  const add = (a: Along, place: (nodeId: number) => void) => {
    if (!m.elements.has(a.elementId)) return;
    const t = Math.min(Math.max(a.t, 0.02), 0.98);
    byMember.set(a.elementId, [...(byMember.get(a.elementId) ?? []), { t, place }]);
  };
  for (const [key, a] of Object.entries(loadAlong)) {
    const load = m.loads[Number(key)];
    if (!load || (load.type !== 'nodal' && load.type !== 'nodal3d')) continue;
    add(a, (nodeId) => {
      const i = modelStore.model.loads.indexOf(load);
      if (i >= 0) modelStore.model.loads[i] = { ...load, data: { ...load.data, nodeId } } as typeof load;
    });
  }
  for (const [key, a] of Object.entries(supportAlong)) {
    const id = Number(key);
    add(a, (nodeId) => {
      const sup = modelStore.model.supports.get(id);
      const taken = [...modelStore.model.supports.values()].some((o) => o.id !== id && o.nodeId === nodeId);
      if (sup && !taken) modelStore.model.supports.set(id, { ...sup, nodeId });
    });
  }
  for (const [elementId, list] of byMember) {
    const el = m.elements.get(elementId);
    const a = el && m.nodes.get(el.nodeI), b = el && m.nodes.get(el.nodeJ);
    if (!a || !b) continue;
    const at = (t: number) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: (a.z ?? 0) + t * ((b.z ?? 0) - (a.z ?? 0)) });
    const points = list.map((p) => at(p.t));
    modelStore.withoutUndo(() => modelStore.splitMember(elementId, list.map((p) => p.t), { keepOriginalId: true, reuseNodeTol: 0.01 }));
    list.forEach((p, k) => { const n = nodeAt(points[k]!); if (n !== null) p.place(n); });
  }
  modelStore.model.supports = new Map(modelStore.model.supports);
  modelStore.model.loads = [...modelStore.model.loads];
}

function apply(): void {
  const snap = baseline;
  if (!snap) return;
  restoreBaseline(snap);
  const m = modelStore.model;
  moveNodes();
  scaleLoads();
  moveLoads();

  if (all.e !== 1) for (const mat of m.materials.values()) mat.e *= all.e;
  if (all.a !== 1 || all.iy !== 1) {
    for (const [id, sec] of m.sections) m.sections.set(id, scaledSection(sec, all.a, all.iy));
  }

  /* A member of its own: its own copy of the material and section, scaled. */
  let nextMat = Math.max(0, ...m.materials.keys()) + 1;
  let nextSec = Math.max(0, ...m.sections.keys()) + 1;
  for (const [key, f] of Object.entries(members)) {
    const id = Number(key);
    const el = m.elements.get(id);
    if (!el || (f.e === 1 && f.a === 1 && f.iy === 1)) continue;
    const patch: Record<string, number> = {};
    if (f.e !== 1) {
      const mat = m.materials.get(el.materialId);
      if (mat) { m.materials.set(nextMat, { ...mat, id: nextMat, e: mat.e * f.e }); patch.materialId = nextMat++; }
    }
    if (f.a !== 1 || f.iy !== 1) {
      const sec = m.sections.get(el.sectionId);
      if (sec) { m.sections.set(nextSec, { ...scaledSection(sec, f.a, f.iy), id: nextSec }); patch.sectionId = nextSec++; }
    }
    m.elements.set(id, { ...el, ...patch });
  }

  modelStore.withoutUndo(() => {
    for (const [key, type] of Object.entries(supportTypes)) {
      modelStore.updateSupport(Number(key), { type });
    }
  });
  moveSupports();

  for (const [key, r] of Object.entries(releases)) {
    const el = m.elements.get(Number(key));
    if (el) m.elements.set(el.id, { ...el, ...(r.i ? { releaseI: r.i } : {}), ...(r.j ? { releaseJ: r.j } : {}) });
  }

  m.materials = new Map(m.materials);
  m.sections = new Map(m.sections);
  m.elements = new Map(m.elements);
  m.loads = [...m.loads];
  placeAlong();
  ownVersion = modelStore.modelVersion;
  // restore() moved the model version, so live calc re-solves what is now here.
  // PRO has no live calc; solve it directly.
  if (uiStore.analysisMode === 'pro') {
    void import('../engine/live-calc').then(({ runLiveCalc }) => runLiveCalc('pro', uiStore.axisConvention3D));
  }
}

function nextFrame(run: () => void): { cancel: () => void } {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(run);
    return { cancel: () => cancelAnimationFrame(id) };
  }
  const id = setTimeout(run, 16);
  return { cancel: () => clearTimeout(id) };
}

// An edit landing mid-solve makes that solve stale and drops it: a drag faster than the solver would publish nothing.
function pump(): void {
  frame = null;
  if (!pending) return;
  if (liveSolveBusy()) { frame = nextFrame(pump); return; }
  pending = false;
  apply();
}

function schedule(): void {
  pending = true;
  frame ??= nextFrame(pump);
}

function cancelScheduled(): void {
  frame?.cancel();
  frame = null;
  pending = false;
}

export const whatIf = {
  get active() { return baseline !== null; },
  get loadFactors() { return loadFactors; },
  get all() { return all; },
  get members() { return members; },
  get releases() { return releases; },
  get supportTypes() { return supportTypes; },
  get loadAt() { return loadAt; },
  get loadNode() { return loadNode; },
  get supportNode() { return supportNode; },
  get nodeShift() { return nodeShift; },
  get reference() { return reference; },
  /** The response before any change: taken once, on the first results of an unchanged model. */
  setReference(r: Record<string, number>) { reference = r; },
  /** Whether anything differs from the model as it was on entry. */
  get changed(): boolean {
    return loadFactors.some((f) => f !== 1) || all.e !== 1 || all.a !== 1 || all.iy !== 1
      || Object.keys(members).some((id) => this.isMemberChanged(Number(id))) || Object.keys(releases).length > 0
      || Object.keys(supportTypes).length > 0 || Object.keys(loadAt).length > 0 || Object.keys(loadNode).length > 0
      || Object.keys(supportNode).length > 0 || Object.values(nodeShift).some((d) => d.some((v) => v !== 0))
      || Object.keys(loadAlong).length > 0 || Object.keys(supportAlong).length > 0;
  },
  get baseline() { return baseline; },

  /** Enter: remember the model and whether live calc was on, and turn it on. */
  open(): void {
    if (baseline) return;
    baseline = { ...modelStore.snapshot(), presentation3D: uiStore.viewportPresentation3D };
    stampAtOpen = recheckStore.capture();
    loadFactors = modelStore.model.loads.map(() => 1);
    all = { ...ONE };
    members = {};
    releases = {};
    supportTypes = {};
    loadAt = {};
    loadNode = {};
    supportNode = {};
    nodeShift = {};
    loadAlong = {};
    supportAlong = {};
    reference = null;
    viewAtOpen = { showLoads: uiStore.showLoads, showLoads3D: uiStore.showLoads3D, hideLoadsWithDiagram: uiStore.hideLoadsWithDiagram };
    liveWasOn = uiStore.liveCalc;
    uiStore.liveCalc = true;
    uiStore.showWhatIf = true;
    ownVersion = modelStore.modelVersion;
    // The first rebuild pays one-time costs; paid here, the first slider move is as quick as the rest.
    schedule();
  },

  /** True when the model version moved and this session did not move it. */
  changedFromOutside(version: number): boolean {
    return baseline !== null && version !== ownVersion;
  },

  /** Leave: the model as it was, and live calc as it was — with results. */
  async close(): Promise<void> {
    cancelScheduled();
    const snap = baseline;
    baseline = null;
    uiStore.showWhatIf = false;
    if (!snap) return;
    const was = liveWasOn;
    uiStore.liveCalc = was;
    restoreView();
    restoreBaseline(snap);
    // What the what-if solves stamped belongs to a model that no longer exists (recheck.svelte.ts).
    recheckStore.restoreStamp(stampAtOpen);
    if (!was) {
      // Live calc is off again, so nothing re-solves the restored model on
      // its own; solve it once, after the edit has cleared the old results.
      await tick();
      const { runLiveCalc } = await import('../engine/live-calc');
      await runLiveCalc(uiStore.analysisMode, uiStore.axisConvention3D);
    }
  },

  /** The model was replaced under the session (a project or example load): drop it, keep the new model. */
  abandon(): void {
    cancelScheduled();
    if (!baseline) return;
    baseline = null;
    uiStore.liveCalc = liveWasOn;
    restoreView();
  },

  setLoadFactor(i: number, f: number) { loadFactors[i] = f; schedule(); },
  setAll(k: keyof MemberFactors, f: number) { all[k] = f; schedule(); },
  memberFactors(id: number): MemberFactors { return members[id] ?? ONE; },
  setMember(id: number, k: keyof MemberFactors, f: number) {
    members[id] = { ...(members[id] ?? ONE), [k]: f };
    schedule();
  },
  setRelease(id: number, end: 'i' | 'j', r: Release) {
    releases[id] = { ...(releases[id] ?? {}), [end]: r };
    schedule();
  },
  setSupportType(id: number, type: SupportType) { supportTypes[id] = type; schedule(); },
  setLoadAt(i: number, a: number) { loadAt[i] = a; schedule(); },
  setLoadNode(i: number, nodeId: number) { delete loadAlong[i]; loadNode[i] = nodeId; schedule(); },
  setSupportNode(id: number, nodeId: number) { delete supportAlong[id]; supportNode[id] = nodeId; schedule(); },
  get loadAlong() { return loadAlong; },
  get supportAlong() { return supportAlong; },
  /** A nodal load carried onto a member, at `t` of its length from node I. */
  setLoadAlong(i: number, elementId: number, t: number) { delete loadNode[i]; loadAlong[i] = { elementId, t }; schedule(); },
  setSupportAlong(id: number, elementId: number, t: number) { delete supportNode[id]; supportAlong[id] = { elementId, t }; schedule(); },

  /** Whether the canvas draws the loads, with or without a diagram on screen. */
  get loadsShown(): boolean {
    return (is3DWorkspace(uiStore.analysisMode) ? uiStore.showLoads3D : uiStore.showLoads) && !uiStore.hideLoadsWithDiagram;
  },
  showLoads(on: boolean) {
    if (is3DWorkspace(uiStore.analysisMode)) uiStore.showLoads3D = on; else uiStore.showLoads = on;
    if (on) uiStore.hideLoadsWithDiagram = false;
  },
  setNodeShift(id: number, axis: number, d: number) {
    const cur = [...(nodeShift[id] ?? [0, 0, 0])];
    cur[axis] = d;
    nodeShift[id] = cur;
    schedule();
  },

  /** Everything back to the model as it was on entry. */
  reset() {
    loadFactors = loadFactors.map(() => 1);
    all = { ...ONE };
    members = {};
    releases = {};
    supportTypes = {};
    loadAt = {};
    loadNode = {};
    supportNode = {};
    nodeShift = {};
    loadAlong = {};
    supportAlong = {};
    schedule();
  },

  /** Whether a member differs from the baseline in anything the panel changes. */
  isMemberChanged(id: number): boolean {
    const f = members[id];
    return !!releases[id] || (!!f && (f.e !== 1 || f.a !== 1 || f.iy !== 1));
  },
};
