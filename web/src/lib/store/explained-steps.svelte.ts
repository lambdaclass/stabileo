/**
 * The "Explained step by step" panel: the catalog of methods, or one method's
 * document built from the current model.
 *
 * A document is a snapshot: it is built when opened and says so when the
 * model changes afterwards (the viewer offers to rebuild), rather than
 * rebuilding under the reader's eyes while they are on step 5.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import type { StepDoc, Txt } from '../engine/steps/doc';
import { tx } from '../engine/steps/doc';
import { planeModel } from '../engine/steps/plane-model';
import { solveReference } from '../engine/steps/reference';
import type { MethodContext } from '../engine/steps/registry';
import { methodById } from '../engine/steps/methods';

type View = 'catalog' | 'doc';

let view = $state<View | null>(null);
let methodId = $state<string | null>(null);
let doc = $state.raw<StepDoc | null>(null);
let error = $state.raw<Txt | null>(null);
let builtAt = $state(-1);
let builtWithSelfWeight = $state(false);
let step = $state(0);
/** A wizard was opened from the catalog: closing it returns there. */
let returnToCatalog = $state(false);

/** The reader's choices of each method's assumptions, by method id (kept while the session lasts). */
let options = $state<Record<string, Record<string, boolean>>>({});

/** The model as the methods read it, or null when there is nothing to read. */
export function methodContext(methodId?: string): MethodContext | null {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input || input.elements.size === 0) return null;
  return {
    input,
    pm: planeModel(input),
    ref: solveReference(input),
    selection: { members: [...uiStore.selectedElements], nodes: [...uiStore.selectedNodes] },
    options: { ...(methodId ? optionsOf(methodId) : {}) },
  };
}

/** A method's assumptions: each as the reader set it, else its default. */
function optionsOf(id: string): Record<string, boolean> {
  const m = methodById(id);
  const out: Record<string, boolean> = {};
  for (const o of m?.options ?? []) out[o.id] = options[id]?.[o.id] ?? o.default;
  return out;
}

function build(id: string): void {
  const m = methodById(id);
  doc = null; error = null;
  if (!m?.build) { error = tx('steps.view.failed'); return; }
  const ctx = methodContext(id);
  if (!ctx) { error = tx('steps.catalog.emptyModel'); return; }
  const ok = m.applies(ctx);
  if (!ok.ok) { error = ok.reason; return; }
  try {
    doc = m.build(ctx);
  } catch (e) {
    console.error('explained step by step:', e);
    error = tx('steps.view.failed');
  }
  builtAt = modelStore.modelVersion;
  builtWithSelfWeight = uiStore.includeSelfWeight;
  step = 0;
}

export const explainedSteps = {
  get isOpen() { return view !== null; },
  get view() { return view; },
  get methodId() { return methodId; },
  get doc() { return doc; },
  get error() { return error; },
  /** 0 is the set-up (intro), then the steps from 1. */
  get step() { return step; },
  set step(v: number) { step = Math.max(0, Math.min(v, doc ? doc.steps.length : 0)); },
  get stale() {
    return view === 'doc' && (builtAt !== modelStore.modelVersion || builtWithSelfWeight !== uiStore.includeSelfWeight);
  },

  openCatalog(): void { view = 'catalog'; methodId = null; doc = null; error = null; returnToCatalog = false; },
  get returnToCatalog() { return returnToCatalog; },
  /** A wizard is being opened from the catalog (the catalog itself closes). */
  leaveForWizard(): void { view = null; methodId = null; doc = null; error = null; returnToCatalog = true; },
  openMethod(id: string): void { methodId = id; view = 'doc'; build(id); },
  refresh(): void { if (methodId) build(methodId); },
  /** The open method's assumptions, as shown over its document. */
  get options(): Record<string, boolean> { return methodId ? optionsOf(methodId) : {}; },
  /** Switch one of the open method's assumptions; the document is rebuilt on the same step. */
  setOption(id: string, on: boolean): void {
    if (!methodId) return;
    options = { ...options, [methodId]: { ...(options[methodId] ?? {}), [id]: on } };
    const keep = step;
    build(methodId);
    this.step = keep;
  },
  back(): void { this.openCatalog(); },
  close(): void { view = null; methodId = null; doc = null; error = null; returnToCatalog = false; },
};
