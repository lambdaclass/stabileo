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
import { tick } from 'svelte';
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import type { ModelSnapshot } from './history.svelte';
import type { Release, Section, SupportType } from './model.svelte';
import { solverProperties } from '../section/state';
import { defaultDofs } from './support-dofs';
import { get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical } from '../geometry/coordinate-system';

export interface MemberFactors { e: number; a: number; iy: number }

let baseline = $state<ModelSnapshot | null>(null);
let liveWasOn = false;
let loadFactors = $state<number[]>([]);
let all = $state<MemberFactors>({ e: 1, a: 1, iy: 1 });
let members = $state<Record<number, MemberFactors>>({});
let releases = $state<Record<number, { i?: Release; j?: Release }>>({});
let supportTypes = $state<Record<number, SupportType>>({});
let timer: ReturnType<typeof setTimeout> | undefined;
/*
 * The model version this session last produced. Anything else moving it —
 * an edit on the canvas, undo, opening a file, loading an example — changed
 * the model under the session, and its baseline no longer describes it.
 */
let ownVersion = -1;

const is3D = () => uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro';
const ONE: MemberFactors = { e: 1, a: 1, iy: 1 };

function scaleLoads(snap: ModelSnapshot): void {
  const loads = modelStore.model.loads;
  for (let i = 0; i < loads.length; i++) {
    const f = loadFactors[i] ?? 1;
    const base = snap.loads[i]?.data as Record<string, number> | undefined;
    if (!base || f === 1) continue;
    const d = loads[i].data as unknown as Record<string, number>;
    switch (loads[i].type) {
      case 'nodal':
        d.fx = base.fx * f;
        d.fz = get2DDisplayNodalLoadVertical(base as never) * f;
        d.my = get2DDisplayNodalLoadMoment(base as never) * f;
        break;
      case 'distributed': d.qI = base.qI * f; d.qJ = base.qJ * f; break;
      case 'pointOnElement': d.p = base.p * f; if (base.px) d.px = base.px * f; break;
      case 'thermal': d.dtUniform = base.dtUniform * f; d.dtGradient = base.dtGradient * f; break;
      case 'nodal3d':
        for (const k of ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) d[k] = (base[k] ?? 0) * f;
        break;
      case 'distributed3d':
        for (const k of ['qYI', 'qYJ', 'qZI', 'qZJ']) d[k] = (base[k] ?? 0) * f;
        break;
    }
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

function apply(): void {
  const snap = baseline;
  if (!snap) return;
  modelStore.restore(snap);
  const m = modelStore.model;
  scaleLoads(snap);

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

  for (const [key, r] of Object.entries(releases)) {
    const el = m.elements.get(Number(key));
    if (el) m.elements.set(el.id, { ...el, ...(r.i ? { releaseI: r.i } : {}), ...(r.j ? { releaseJ: r.j } : {}) });
  }

  for (const [key, type] of Object.entries(supportTypes)) {
    const s = m.supports.get(Number(key));
    if (!s) continue;
    m.supports.set(s.id, is3D() ? { ...s, type, dofRestraints: defaultDofs(type) } : { ...s, type });
  }

  m.materials = new Map(m.materials);
  m.sections = new Map(m.sections);
  m.elements = new Map(m.elements);
  m.supports = new Map(m.supports);
  m.loads = [...m.loads];
  ownVersion = modelStore.modelVersion;
  // restore() moved the model version, so live calc re-solves what is now here.
  // PRO has no live calc; solve it directly.
  if (uiStore.analysisMode === 'pro') {
    void import('../engine/live-calc').then(({ runLiveCalc }) => runLiveCalc('pro', uiStore.axisConvention3D));
  }
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(apply, 60);
}

export const whatIf = {
  get active() { return baseline !== null; },
  get loadFactors() { return loadFactors; },
  get all() { return all; },
  get members() { return members; },
  get releases() { return releases; },
  get supportTypes() { return supportTypes; },
  get baseline() { return baseline; },

  /** Enter: remember the model and whether live calc was on, and turn it on. */
  open(): void {
    if (baseline) return;
    baseline = modelStore.snapshot();
    loadFactors = modelStore.model.loads.map(() => 1);
    all = { ...ONE };
    members = {};
    releases = {};
    supportTypes = {};
    liveWasOn = uiStore.liveCalc;
    uiStore.liveCalc = true;
    uiStore.showWhatIf = true;
    ownVersion = modelStore.modelVersion;
  },

  /** True when the model version moved and this session did not move it. */
  changedFromOutside(version: number): boolean {
    return baseline !== null && version !== ownVersion;
  },

  /** Leave: the model as it was, and live calc as it was — with results. */
  async close(): Promise<void> {
    clearTimeout(timer);
    const snap = baseline;
    baseline = null;
    uiStore.showWhatIf = false;
    if (!snap) return;
    const was = liveWasOn;
    uiStore.liveCalc = was;
    modelStore.restore(snap);
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
    clearTimeout(timer);
    if (!baseline) return;
    baseline = null;
    uiStore.liveCalc = liveWasOn;
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

  /** Everything back to the model as it was on entry. */
  reset() {
    loadFactors = loadFactors.map(() => 1);
    all = { ...ONE };
    members = {};
    releases = {};
    supportTypes = {};
    schedule();
  },

  /** Whether a member differs from the baseline in anything the panel changes. */
  isMemberChanged(id: number): boolean {
    const f = members[id];
    return !!releases[id] || (!!f && (f.e !== 1 || f.a !== 1 || f.iy !== 1));
  },
};
