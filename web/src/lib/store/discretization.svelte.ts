/**
 * The discretization (mesh) error of the 3D linear static result on screen
 * (docs/verification/DISCRETIZATION.md). An ESTIMATE, never a certificate: the certificate
 * (`certificate.svelte.ts`) bounds the algebraic error of the assembled system; this estimates how
 * far that system's solution is from the structure the mesh stands for.
 *
 *   · `estimate`: Zienkiewicz–Zhu / SPR energy-norm estimate per shell element and for the model,
 *     computed in the background after every published 3D base solve that has shells.
 *   · `study`: the convergence check (uniform refinement, Richardson extrapolation), run on demand
 *     because it re-solves the model on meshes 4× and 16× its size.
 */
import { estimableInputOf, type CertifiableInput } from '../engine/solver-service';
import { runCertify, hasCertify } from '../engine/certify-jobs';
import { errorText } from '../utils/error-text';
import { toDisplay, unitLabel, type Quantity, type UnitSystem } from '../utils/units';
import { resultsStore } from './results.svelte';

export interface ElementErrorIndicator {
  kind: 'plate' | 'quad' | 'quad9' | 'curvedShell' | 'solidShell';
  elementId: number;
  eta: number;
  energyNorm: number;
  /** Element error on the scale of the global percentage (see the engine docs); absent when
   *  the element is not estimated (alone in its recovery patches). */
  localPercent?: number | null;
}

export interface DiscretizationEstimate {
  certified: false;
  method: string;
  relativeError?: number | null;
  /** `unloaded` or `noStrainEnergy` when the shells' error could not be estimated (never 0 %). */
  unestimableReason?: 'unloaded' | 'noStrainEnergy' | 'tooCoarse' | 'nonFinite' | null;
  errorNorm: number;
  solutionNorm: number;
  threshold: number;
  exceedsThreshold: boolean;
  elements: ElementErrorIndicator[];
  frameMembers: number;
  /** Members neither exact nor estimated (warping torsion). */
  inexactMembers?: number[];
  /** Shell elements alone in their recovery patches: not estimated. */
  isolatedElements?: number[];
  notes: string[];
}

export interface QuantityConvergence {
  quantity: 'maxDisplacement' | 'maxMoment' | 'maxStress' | 'reaction' | 'maxFrameMoment';
  nodeId?: number;
  values: number[];
  relativeChange: number;
  /** Absent (undefined over the WASM boundary) when there is none. */
  observedOrder?: number | null;
  extrapolated?: number | null;
  estimatedError?: number | null;
  status: 'converging' | 'converged' | 'assumedOrder' | 'irregularOrder' | 'oscillating' | 'notConverging' | 'incomplete' | 'zero';
}

export interface ConvergenceStudy {
  certified: false;
  geometry: 'smooth' | 'faceted';
  levels: Array<{ nodes: number; shellElements: number; energyEstimate: number | null }>;
  quantities: QuantityConvergence[];
  maxEstimatedError?: number | null;
  threshold: number;
  exceedsThreshold: boolean;
  caveats: string[];
  /** Supports refinement put on nodes the model does not have (caveat `supportsInferred`). */
  supportsInferred?: number;
}

/**
 * What the panel may claim about an estimate (pure, so each claim is tested): a percentage only
 * when one was estimated; "members are exact" only when the engine says so for every member AND
 * no member of variable section was cut into prismatic pieces for the solve (an approximation the
 * engine cannot see); otherwise how many members are not estimated, and why.
 */
export interface DiscretizationClaims {
  percent: number | null;
  unestimable: 'unloaded' | 'noStrainEnergy' | 'tooCoarse' | 'nonFinite' | null;
  /** The i18n key of the warning for an estimate that could not be made, if it warrants one. */
  warnUnestimable: string | null;
  framesExact: boolean;
  warpingMembers: number;
  variableMembers: number;
  curvedBeams: boolean;
  isolatedElements: number;
}

export function discretizationClaims(e: DiscretizationEstimate, variableMembers: number): DiscretizationClaims {
  const percent = e.relativeError == null || !Number.isFinite(e.relativeError) ? null : e.relativeError;
  const unestimable = percent === null ? e.unestimableReason ?? null : null;
  return {
    percent,
    unestimable,
    warnUnestimable: unestimable === 'noStrainEnergy' ? 'discretization.warningUnestimable'
      : unestimable === 'tooCoarse' ? 'discretization.warningTooCoarse' : null,
    framesExact: e.notes.includes('framesExact') && variableMembers === 0,
    warpingMembers: e.inexactMembers?.length ?? 0,
    variableMembers,
    curvedBeams: e.notes.includes('curvedBeamsSegmented'),
    isolatedElements: e.isolatedElements?.length ?? 0,
  };
}

/** A fraction as a percentage, without the sign: 2 decimals below 0.1 %, 1 below 10 %, else none. */
export function percentText(x: number): string {
  const p = 100 * x;
  return p < 0.1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : p.toFixed(0);
}

/** An estimated fraction as the panel prints it: «~1.2 %», and «< 0.01 %» where «~0.00 %» would read as none. */
export function approxPercent(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  if (x === 0) return '0 %';
  return 100 * Math.abs(x) < 0.01 ? '< 0.01 %' : `~${percentText(x)} %`;
}

/**
 * Where the legend puts the threshold (% of the bar, whose ends are 0 and `max`), and whether its
 * label fits there without running into the end labels: the mark is drawn either way.
 */
export function thresholdTick(thr: number, max: number): { at: number; label: boolean } {
  if (!(max > 0) || !Number.isFinite(thr)) return { at: 0, label: false };
  const at = Math.min(100, Math.max(0, (100 * thr) / max));
  return { at, label: at >= 15 && at <= 85 };
}

/**
 * The study table's unit for a quantity in the reader's system: the SI value times `factor`, in
 * `unit`. A shell moment is per unit width, so it scales as a force and is labelled as the
 * system's moment per its length (kN·m/m, tf·m/m, kip·ft/ft).
 */
export function studyUnit(q: QuantityConvergence['quantity'], us: UnitSystem): { factor: number; unit: string } {
  const of = (k: Quantity) => ({ factor: toDisplay(1, k, us), unit: unitLabel(k, us) });
  switch (q) {
    case 'maxDisplacement': return of('displacement');
    case 'maxStress': return of('areaLoad');
    case 'reaction': return of('force');
    case 'maxFrameMoment': return of('moment');
    case 'maxMoment': {
      const m = unitLabel('moment', us);
      return { factor: toDisplay(1, 'force', us), unit: `${m}/${m.slice(m.lastIndexOf('·') + 1)}` };
    }
  }
}

type Estimate =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'done'; estimate: DiscretizationEstimate }
  | { status: 'failed'; reason: string };

type Study =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; study: ConvergenceStudy }
  | { status: 'failed'; reason: string };

const ESTIMATE_EXPORT = 'estimate_discretization_3d';
const STUDY_EXPORT = 'convergence_study_3d';
const SETTLE_MS = 300;
/** The dimension of the solves this store estimates (shells exist in 3D only). */
const SPACE = '3d' as const;

/**
 * The 3D viewport's key for a shell indicator. The viewport draws plates as `p{id}` and every
 * quad as `q{id}`, curved ones included: the web sends a curved quad to the engine as a curved
 * shell with the quad's own id (`solver-service.ts`). MITC9 quads and solid-shells have no
 * element in the web model, so no viewport mesh to paint (null).
 */
export function viewportShellKey(kind: ElementErrorIndicator['kind'], id: number): string | null {
  switch (kind) {
    case 'plate': return `p${id}`;
    case 'quad':
    case 'curvedShell': return `q${id}`;
    case 'quad9':
    case 'solidShell': return null;
  }
}

/** Convergence statuses from which no error can be read (the engine's `is_inconclusive`). */
export function isInconclusive(status: QuantityConvergence['status']): boolean {
  return status === 'oscillating' || status === 'notConverging' || status === 'irregularOrder' || status === 'incomplete';
}

/** Whether a 3D wire input has shell-type elements (the estimate is about them). */
function hasShells(wire: Record<string, any>): boolean {
  const n = (k: string) => Object.keys(wire[k] ?? {}).length;
  return n('plates') + n('quads') + n('quad9s') + n('curvedShells') + n('solidShells') > 0;
}

function createDiscretizationStore() {
  let estimate = $state<Estimate>({ status: 'idle' });
  let study = $state<Study>({ status: 'idle' });
  /** Paint shells by their element error indicator. */
  let showMap = $state(false);
  let input: CertifiableInput | null = null;
  /** Why the store is idle (diagnostics for tests: `2d`, `cleared`, `notCertifiable`, `noExport`, `noShells`). */
  let idleWhy: string | null = null;
  /**
   * The results object the estimate belongs to, as published (after normalisation). Any other
   * result on screen — a load case, a combination, a P-Δ or spectral result that replaced the
   * base solve — is not what was estimated.
   */
  let estimated = $state.raw<object | null>(null);
  /*
   * A convergence check in flight, its result wanted or not: a re-solve discards it, but the
   * worker job cannot be stopped, and each is a 16× re-solve. One at a time.
   */
  let studyInFlight = $state(false);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function run(gen: number, wire: Record<string, any>): Promise<void> {
    let next: Estimate;
    try {
      next = { status: 'done', estimate: await runCertify(ESTIMATE_EXPORT, [wire]) };
    } catch (e) {
      next = { status: 'failed', reason: errorText(e, 'error') };
    }
    if (gen !== generation) return;
    estimate = next;
    // A map that can no longer be drawn must not keep the viewport (its toggle is hidden then).
    if (!mapDrawable(next)) showMap = false;
  }

  function mapDrawable(e: Estimate): boolean {
    return e.status === 'done' && e.estimate.relativeError != null && Number.isFinite(e.estimate.relativeError);
  }

  return {
    get estimate() { return estimate; },
    get study() { return study; },
    get showMap() { return showMap; },
    get idleReason() { return idleWhy; },
    /** A superseded convergence check still running: no new one until it ends. */
    get studyFinishing() { return studyInFlight && study.status !== 'running'; },
    /** Whether the error map may take over the viewport: switched on, and an estimate to draw. */
    mapActive(): boolean { return showMap && mapDrawable(estimate) && this.applies(); },
    set showMap(v: boolean) { showMap = v; },

    /** A base static solve was published (or cleared): estimate it in the background. */
    track(results: object | null, dim: '2d' | '3d'): void {
      generation++;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      study = { status: 'idle' };
      input = null;
      estimated = null;
      const pub = generation;
      // `setResults3D` publishes the normalised results right after this hook returns.
      queueMicrotask(() => { if (pub === generation) estimated = resultsStore.results3D; });
      const idle = (why: string) => { estimate = { status: 'idle' }; showMap = false; idleWhy = why; };
      if (dim !== SPACE) return idle('2d');
      const found = results ? estimableInputOf(results) : null;
      if (!found) return idle(results ? 'notCertifiable' : 'cleared');
      if (found.dim !== SPACE) return idle('2d');
      if (!hasCertify(ESTIMATE_EXPORT)) return idle('noExport');
      const wire = found.wire();
      if (!hasShells(wire)) return idle('noShells:' + Object.keys(wire).map((k) => k + '=' + (wire[k] && typeof wire[k] === 'object' ? Object.keys(wire[k]).length : wire[k])).join(','));
      idleWhy = null;
      input = found;
      estimate = { status: 'pending' };
      const gen = generation;
      timer = setTimeout(() => { timer = null; void run(gen, wire); }, SETTLE_MS);
    },

    /** Whether the estimate applies to what is on screen (the base solve, not a case or combination). */
    applies(): boolean {
      const shown = resultsStore.results3D;
      return shown !== null && shown === estimated && resultsStore.activeView !== 'envelope'
        && resultsStore.activeView !== 'combo' && resultsStore.activeCaseId === null;
    },

    canRunStudy(): boolean {
      return input !== null && this.applies() && hasCertify(STUDY_EXPORT) && !studyInFlight;
    },

    /** Run the convergence check on the base solve (re-solves on refined meshes). */
    async runStudy(geometry: 'smooth' | 'faceted' = 'smooth'): Promise<void> {
      if (!input || !this.applies() || studyInFlight) return;
      const gen = generation;
      study = { status: 'running' };
      studyInFlight = true;
      let next: Study;
      try {
        next = { status: 'done', study: await runCertify(STUDY_EXPORT, [input.wire(), { geometry }]) };
      } catch (e) {
        next = { status: 'failed', reason: errorText(e, 'error') };
      } finally {
        studyInFlight = false;
      }
      if (gen === generation) study = next;
    },

    /** The scale of the error map (%): 0 to the larger of twice the threshold and the largest value. */
    mapRange(): { min: number; max: number } {
      let max = 0;
      for (const v of this.elementMap().values()) if (v > max) max = v;
      const thr = estimate.status === 'done' ? 100 * estimate.estimate.threshold : 5;
      return { min: 0, max: Math.max(2 * thr, max) };
    },

    /** Element indicators keyed as the 3D viewport keys shells (`p12`, `q7`). */
    elementMap(): Map<string, number> {
      const m = new Map<string, number>();
      // No map for an estimate that could not be made: zeros there would read as "no error".
      if (estimate.status !== 'done' || estimate.estimate.relativeError == null) return m;
      for (const e of estimate.estimate.elements) {
        // Not estimated is not "no error": such an element keeps its colour.
        if (e.localPercent == null || !Number.isFinite(e.localPercent)) continue;
        const key = viewportShellKey(e.kind, e.elementId);
        if (key !== null) m.set(key, e.localPercent);
      }
      return m;
    },
  };
}

export const discretizationStore = createDiscretizationStore();
