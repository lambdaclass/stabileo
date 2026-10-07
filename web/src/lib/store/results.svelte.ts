// Results store

import type { AnalysisResults, InfluenceLineResult, Section, Material } from './model.svelte';
import type { ElementForces, FullEnvelope, ConstraintForce, SolverDiagnostic, SolveTimings } from '../engine/types';
import { modelFindings } from '../engine/model-findings';
import type { AnalysisResults3D, Displacement3D, Reaction3D, ElementForces3D, FullEnvelope3D } from '../engine/types-3d';
import type { GoverningPerElement, GoverningPerElement3D } from '../engine/governing-case';
import type { MovingLoadEnvelope } from '../engine/moving-loads';
import type { PDeltaResult, PDeltaResult3D, ModalResult, ModalResult3D, BucklingResult, BucklingResult3D, PlasticResult, SpectralResult, SpectralResult3D } from '../engine/result-types';
import { get2DDisplayDisplacementVertical } from '../geometry/coordinate-system';
import { readSolverDiagnostic } from '../engine/engine-diagnostics';
import { t } from '../i18n';
// Counts published structural analyses so browser tests can assert that a
// reinforcement-only edit triggers none. Covers the worker/parallel solve paths too.
import { noteStructuralSolve } from '../utils/solve-counter';
import { resultsToDrawnAxes, envelopeToDrawnAxes, type SignOf } from '../engine/transverse-sign-2d';

export type DiagramType = 'none' | 'moment' | 'shear' | 'axial' | 'deformed' | 'colorMap' | 'axialColor' | 'verification' | 'influenceLine' | 'modeShape' | 'bucklingMode' | 'plasticHinges' | 'despiece'
  // 3D-specific diagram types
  | 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'torsion';

/** Stress results for one element (both ends, extreme fiber) */
export interface ElementStress {
  /** Normal stress at start/end: σ = N/A ± M·y/Iz (MPa) */
  sigmaStart: number;
  sigmaEnd: number;
  /** Shear stress at start/end: τ_max ≈ 1.5·V/A for rectangular, V/A otherwise (MPa) */
  tauStart: number;
  tauEnd: number;
  /** Von Mises equivalent: σ_vm = √(σ² + 3τ²) (MPa) */
  vonMisesStart: number;
  vonMisesEnd: number;
  /** Utilization ratio = max(σ_vm) / fy (0..∞, <1 = OK) */
  ratio: number | null; // null if no fy
}

/** Compute stresses for one element from its internal forces + section/material */
export function computeElementStress(ef: ElementForces, sec: Section, mat: Material): ElementStress {
  const A = sec.a;  // m²
  const Iz = sec.iy ?? sec.iz; // m⁴ — 2D uses iy (about Y horizontal = strong axis for IPN)

  // Distance to extreme fiber (y_max)
  // If rectangular section with h: y = h/2
  // Otherwise estimate from Iz and A: y ≈ √(3·Iz/A) (assuming Iz ≈ b·h³/12 and A = b·h → h = √(12·Iz/A))
  const h = sec.h ?? (A > 1e-15 ? Math.sqrt(12 * Iz / A) : 0.1);
  const yMax = h / 2;

  // Normal stress: σ = |N/A| + |M|·y/Iz (extreme fiber, absolute max)
  // Forces are in kN and kN·m, A in m², Iz in m⁴ → σ in kPa → /1000 for MPa
  const sigmaStart = A > 1e-15 && Iz > 1e-15
    ? (Math.abs(ef.nStart) / A + Math.abs(ef.mStart) * yMax / Iz) / 1000 : 0;
  const sigmaEnd = A > 1e-15 && Iz > 1e-15
    ? (Math.abs(ef.nEnd) / A + Math.abs(ef.mEnd) * yMax / Iz) / 1000 : 0;

  // Shear stress: τ_max
  // For rectangular: τ_max = 1.5·V/A
  // For general section: τ ≈ V/A (conservative lower bound, actual depends on shape)
  const shearFactor = (sec.b !== undefined && sec.h !== undefined) ? 1.5 : 1.0;
  const tauStart = A > 1e-15 ? (shearFactor * Math.abs(ef.vStart) / A) / 1000 : 0;
  const tauEnd = A > 1e-15 ? (shearFactor * Math.abs(ef.vEnd) / A) / 1000 : 0;

  // Von Mises: σ_vm = √(σ² + 3·τ²)
  const vonMisesStart = Math.sqrt(sigmaStart ** 2 + 3 * tauStart ** 2);
  const vonMisesEnd = Math.sqrt(sigmaEnd ** 2 + 3 * tauEnd ** 2);

  const maxVM = Math.max(vonMisesStart, vonMisesEnd);
  const ratio = mat.fy ? maxVM / mat.fy : null;

  return { sigmaStart, sigmaEnd, tauStart, tauEnd, vonMisesStart, vonMisesEnd, ratio };
}

export type ResultsView = 'single' | 'combo' | 'envelope';

/** How the advanced analyses' results reach the model's members (`engine/variable-members.ts`). */
export interface Normalise3DAdvanced {
  pdelta: (r: PDeltaResult3D) => PDeltaResult3D;
  modes: <R extends ModalResult3D | BucklingResult3D>(r: R) => R;
}

/** Diagrams that draw one advanced function's result, and nothing without it. */
const FUNCTION_DIAGRAMS: readonly DiagramType[] = ['modeShape', 'bucklingMode', 'plasticHinges', 'influenceLine', 'despiece'];
const STATIC_DIAGRAMS_2D: readonly DiagramType[] = ['deformed', 'moment', 'shear', 'axial', 'colorMap', 'axialColor'];
const STATIC_DIAGRAMS_3D: readonly DiagramType[] = ['deformed', 'momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion', 'axialColor', 'colorMap'];

/**
 * The view an advanced function replaced when it opened.
 *
 * Opening P-Δ, the plastic collapse or a moving load puts that function's own
 * results where the static ones were (`results`, `results3D`) and switches the
 * diagram; the free-body view and the influence line switch the diagram. Closing
 * any of them has to put back what was there — the static results if the model
 * had been solved, none if it had not, and the diagram the reader had — and the
 * only reliable way to know what was there is to have kept it. Recomputing it
 * (re-solving on close, falling to the deformed shape) got it wrong in both
 * directions: it solved models nobody had solved, and it dropped the diagram
 * the reader was looking at.
 */
interface HeldView {
  results: AnalysisResults | null;
  singleResults: AnalysisResults | null;
  perCase: Map<number, AnalysisResults>;
  perCombo: Map<number, AnalysisResults>;
  envelope: FullEnvelope | null;
  activeView: ResultsView;
  activeComboId: number | null;
  activeCaseId: number | null;
  results3D: AnalysisResults3D | null;
  singleResults3D: AnalysisResults3D | null;
  perCase3D: Map<number, AnalysisResults3D>;
  perCombo3D: Map<number, AnalysisResults3D>;
  envelope3D: FullEnvelope3D | null;
  diagram: DiagramType;
  lastDiagram: DiagramType;
  showReactions: boolean;
}

function createResultsStore() {
  let results = $state<AnalysisResults | null>(null);
  let diagramType = $state<DiagramType>('none');
  /** Remembers last user-visible diagram so live-calc can restore it after clear() */
  let _lastDiagramType: DiagramType = 'none';
  /*
   * What was on screen when the results were last cleared — the diagram and
   * the case, combination or envelope it was drawn for — so that a re-solve
   * of the edited model puts it back instead of falling to the deformed shape
   * of the unit-factor loads. An edit clears the results before the re-solve
   * runs (and, under live calc, several edits in a row clear them several
   * times), so this is taken from the first clear that had results to lose.
   */
  /*
   * Plane results are published in the drawn axes: V, M and the transverse
   * loads of a member whose drawn z is opposite to the solver's transverse
   * axis change sign here (transverse-sign-2d.ts). The member geometry comes
   * from the model, through a provider wired in the store barrel.
   */
  let _signOf: SignOf = () => 1;
  const drawn = (r: AnalysisResults): AnalysisResults => resultsToDrawnAxes(r, _signOf);
  let _viewBeforeClear: { diagram: DiagramType; view: ResultsView; caseId: number | null; comboId: number | null } | null = null;
  /** What an open advanced function replaced; see `HeldView`. Null when none is open. */
  let _held: HeldView | null = null;
  let deformedScale = $state<number>(1); // Scale factor for deformed shape (applied directly to displacements)
  let diagramScale = $state<number>(1); // Multiplier for M/V/N diagram size (1 = default 60px height)
  let animateDeformed = $state<boolean>(false);
  /**
   * The top of the colour scale currently painted, and its unit.
   *
   * Published by whoever paints the map rather than recomputed for the legend.
   * The alternative — a second function deriving the same maximum — is two
   * answers to one question, and they drift: the 3D heat map samples each
   * member at seventeen points (sixteen segments) through the section-stress
   * evaluation, and reproducing
   * that in a legend would mean maintaining the same arithmetic twice.
   *
   * Null when nothing is painted.
   *
   * `source` names WHICH picture the number came from — `colorMap:vonMises`,
   * not just "a colour map". The legend refuses to draw when it does not match
   * what is on screen right now, which is what stops a stale bar from outliving
   * its picture: switching from a map to a bending diagram leaves this value
   * behind, because the code that publishes it is the code that paints, and
   * that code no longer runs. Making every OTHER path remember to clear it is
   * the version of this that breaks again the next time a path is added.
   */
  let colourScale = $state<{ max: number; unit: string; source: string } | null>(null);
  let colorMapKind = $state<'moment' | 'shear' | 'axial' | 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'torsion' | 'stressRatio' | 'vonMises' | 'sigmaMax' | 'tauMax' | 'shellVonMises' | 'shellBending' | 'stress'>('moment');
  // Which shell quantity the shell contour paints (selectable in PRO results).
  let shellContourComponent = $state<import('../engine/shell-stress').ShellContourComponent>('vonMises');

  /*
   * ── Which KINDS the stress view paints ────────────────────────────
   *
   * Stress used to be two separate entries in one dropdown — von Mises for
   * members, "shell contour" for plates — so a model made of both could only
   * ever be half painted, and the reader had to know which half they were
   * looking at. A structure has stresses in everything that carries load, so
   * the view paints everything by default and these turn a kind off for a
   * reader who wants one on its own.
   */
  let stressShowMembers = $state<boolean>(true);
  let stressShowShells = $state<boolean>(true);
  let showDiagramValues = $state<boolean>(true);
  // 2D diagram side convention. OFF (default): positive N/V/M drawn on the
  // "structural" side (sagging/tension — down for horizontal, right for vertical).
  // ON: positive values drawn toward the member's local positive axis (local +z).
  let drawPositiveTowardLocalAxes = $state<boolean>(false);
  let animSpeed = $state<number>(1.0); // animation speed multiplier (0.25 - 3x)

  // Combination results
  let singleResults = $state<AnalysisResults | null>(null); // base solve (all loads, no combination factors)
  let perCase = $state<Map<number, AnalysisResults>>(new Map());
  let perCombo = $state<Map<number, AnalysisResults>>(new Map());
  let envelope = $state<FullEnvelope | null>(null);
  let activeView = $state<ResultsView>('single');
  let activeComboId = $state<number | null>(null);
  let activeCaseId = $state<number | null>(null); // individual load case selection

  // Influence line
  let influenceLine = $state<InfluenceLineResult | null>(null);
  let ilAnimating = $state<boolean>(false);
  let ilAnimProgress = $state<number>(0); // 0..1 progress along structure
  let ilAnimSpeed = $state<number>(1.0);

  // Combination dirty flag (set when combos/cases are modified after solving)
  let combinationsDirty = $state<boolean>(false);

  // Overlay comparison
  let overlayResults = $state<AnalysisResults | null>(null);
  let overlayResults3D = $state<AnalysisResults3D | null>(null);
  let overlayLabel = $state<string>('');

  // Advanced analysis results
  let movingLoadEnvelope = $state<MovingLoadEnvelope | null>(null);
  let activeMovingLoadPosition = $state<number>(0);
  let pdeltaResult = $state<PDeltaResult | null>(null);
  let modalResult = $state<ModalResult | null>(null);
  let activeModeIndex = $state<number>(0);
  let bucklingResult = $state<BucklingResult | null>(null);
  let activeBucklingMode = $state<number>(0);
  let plasticResult = $state<PlasticResult | null>(null);
  let plasticStep = $state<number>(0);
  let spectralResult = $state<SpectralResult | null>(null);
  // 3D advanced analysis results
  let pdeltaResult3D = $state<PDeltaResult3D | null>(null);
  let modalResult3D = $state<ModalResult3D | null>(null);
  let bucklingResult3D = $state<BucklingResult3D | null>(null);
  let spectralResult3D = $state<SpectralResult3D | null>(null);
  let showReactions = $state<boolean>(false);
  let showConstraintForces = $state<boolean>(false);
  let movingLoadShowEnvelope = $state<boolean>(false);

  // Moving load progress tracking
  let movingLoadRunning = $state<boolean>(false);
  let movingLoadProgress = $state<{ current: number; total: number } | null>(null);
  let movingLoadAbortController: AbortController | null = null;

  // Section stress query (click on element to analyze)
  let stressQuery = $state<{
    elementId: number;
    t: number; // position along element [0,1]
    worldX: number;
    worldY: number;
    worldZ?: number; // 3D only
  } | null>(null);

  // 3D analysis results
  let results3D = $state<AnalysisResults3D | null>(null);
  let singleResults3D = $state<AnalysisResults3D | null>(null);

  // The gates' findings describe the model, not the result on screen, so they
  // are read from the single solve: `results` becomes a combination or the
  // envelope when the view changes, and those carry no structured diagnostics
  // — the findings vanished the moment a combination was picked. Converted
  // once per solve: the cache is keyed on the engine's list itself. (A
  // `$derived` here did not recompute when read outside an effect: after
  // `setResults` it still returned the first, empty conversion. Checked.)
  const findingsCache = new WeakMap<object, SolverDiagnostic[]>();
  const findingsOf = (r: { structuredDiagnostics?: AnalysisResults['structuredDiagnostics']; solverDiagnostics?: unknown[] } | null | undefined): SolverDiagnostic[] => {
    const list = r?.structuredDiagnostics;
    if (!list) return [];
    let found = findingsCache.get(list);
    if (!found) { found = modelFindings(list, r?.solverDiagnostics as { category?: string }[] | undefined); findingsCache.set(list, found); }
    return found;
  };
  let perCase3D = $state<Map<number, AnalysisResults3D>>(new Map());
  let perCombo3D = $state<Map<number, AnalysisResults3D>>(new Map());
  let unstableCombinations3D = $state<number[]>([]);
  let envelope3D = $state<FullEnvelope3D | null>(null);
  /** A named envelope on screen in place of the active one, valid only over the solve it was
   *  built from (`over`): any republish or clear makes it lapse without being reset. */
  let viewedEnvelope3D = $state<{ env: FullEnvelope3D; name: string; over: FullEnvelope3D } | null>(null);

  // Governing-case provenance (which combo governs each element per force component)
  let governing2D = $state<Map<number, GoverningPerElement>>(new Map());
  let governing3D = $state<Map<number, GoverningPerElement3D>>(new Map());

  // Diagnostics (2D + 3D parallel)
  let diagnostics2D = $state<SolverDiagnostic[]>([]);
  let constraintForces2D = $state<ConstraintForce[]>([]);
  let diagnostics3DArr = $state<SolverDiagnostic[]>([]);
  let constraintForces3DArr = $state<ConstraintForce[]>([]);

  // Solve timings
  let solveTimings2D = $state<SolveTimings | null>(null);
  let solveTimings3D = $state<SolveTimings | null>(null);

  // Results-publish notification — set externally by store/index.ts so
  // verificationStore can stamp a solve-generation counter without this store
  // importing verificationStore (mirrors modelStore's `_onMutation` wiring).
  let _onResultsPublish: (() => void) | null = null;
  /**
   * What a 3D result is put through before it is published: members of variable section back to
   * one member each (`engine/variable-members.ts`), whichever analysis produced it. Idempotent.
   */
  let _normalise3D: ((r: AnalysisResults3D) => AnalysisResults3D) | null = null;
  let _normaliseEnvelope3D: ((e: FullEnvelope3D) => FullEnvelope3D) | null = null;
  /** The same for the advanced analyses' own results: P-Delta's two, and modal and buckling shapes. */
  let _normaliseAdvanced3D: Normalise3DAdvanced | null = null;

  // Diagram-shown notification — set by view-mode.ts so that putting a result
  // on screen disarms an armed build tool, without this store importing the UI
  // store (the mirror image of uiStore's `_onEditToolArmed`).
  let _onDiagramShown: (() => void) | null = null;

  // ─── The view an advanced function replaced (see HeldView) ─────────

  const takeView = (): HeldView => ({
    results, singleResults, perCase, perCombo, envelope, activeView, activeComboId, activeCaseId,
    results3D, singleResults3D, perCase3D, perCombo3D, envelope3D,
    diagram: diagramType, lastDiagram: _lastDiagramType, showReactions,
  });

  /** Whether any advanced function still has something open. */
  const advancedOpen = (): boolean =>
    pdeltaResult !== null || modalResult !== null || bucklingResult !== null || plasticResult !== null
    || spectralResult !== null || movingLoadEnvelope !== null || movingLoadRunning || influenceLine !== null
    || pdeltaResult3D !== null || modalResult3D !== null || bucklingResult3D !== null || spectralResult3D !== null
    || diagramType === 'despiece';

  /**
   * Keep the view as it is now, before a function replaces it. The OLDEST view
   * wins while a function is open, so opening a second one over the first
   * (which `clearAdvanced` closes) still goes back to the static view. A view
   * held by a function that has since closed without releasing it — an open
   * that failed after holding — is stale, and is taken again.
   */
  const hold = (): void => {
    if (_held && advancedOpen()) return;
    _held = takeView();
  };

  /** The static results the current view selects, from what the store holds. */
  const staticResults2D = (): AnalysisResults | null => {
    if (activeView === 'envelope' && envelope) return envelope.maxAbsResults;
    if (activeView === 'combo' && activeComboId !== null && perCombo.has(activeComboId)) return perCombo.get(activeComboId)!;
    if (activeCaseId !== null && perCase.has(activeCaseId)) return perCase.get(activeCaseId)!;
    return singleResults;
  };
  const staticResults3D = (): AnalysisResults3D | null => {
    if (activeView === 'envelope' && envelope3D) return envelope3D.maxAbsResults3D;
    if (activeView === 'combo' && activeComboId !== null && perCombo3D.has(activeComboId)) return perCombo3D.get(activeComboId)!;
    if (activeCaseId !== null && perCase3D.has(activeCaseId)) return perCase3D.get(activeCaseId)!;
    return singleResults3D;
  };

  /** Whether `d` has something to draw in the given dimension, with the store as it is. */
  const drawable = (d: DiagramType, is3D: boolean): boolean => {
    switch (d) {
      case 'none': return true;
      case 'modeShape': return (is3D ? modalResult3D : modalResult) !== null;
      case 'bucklingMode': return (is3D ? bucklingResult3D : bucklingResult) !== null;
      case 'plasticHinges': return !is3D && plasticResult !== null;
      case 'influenceLine': return !is3D && influenceLine !== null;
      default: {
        const valid = is3D ? STATIC_DIAGRAMS_3D : STATIC_DIAGRAMS_2D;
        return (d === 'despiece' || valid.includes(d)) && (is3D ? results3D : results) !== null;
      }
    }
  };

  /**
   * Put back the view held when the function opened, or — with none held (a
   * function restored with a saved model, or opened from a toast) — the static
   * view the store still has, with a diagram that has something to draw.
   */
  const release = (is3D: boolean): void => {
    const h = _held;
    _held = null;
    if (h) {
      results = h.results; singleResults = h.singleResults;
      perCase = h.perCase; perCombo = h.perCombo; envelope = h.envelope;
      activeView = h.activeView; activeComboId = h.activeComboId; activeCaseId = h.activeCaseId;
      results3D = h.results3D; singleResults3D = h.singleResults3D;
      perCase3D = h.perCase3D; perCombo3D = h.perCombo3D; envelope3D = h.envelope3D;
      diagramType = h.diagram; _lastDiagramType = h.lastDiagram; showReactions = h.showReactions;
      return;
    }
    if (is3D) results3D = staticResults3D(); else results = staticResults2D();
    if (FUNCTION_DIAGRAMS.includes(diagramType) || !drawable(diagramType, is3D)) {
      const valid = is3D ? STATIC_DIAGRAMS_3D : STATIC_DIAGRAMS_2D;
      diagramType = (is3D ? results3D : results) === null ? 'none'
        : valid.includes(_lastDiagramType) ? _lastDiagramType : 'deformed';
    }
  };

  /** A fresh static publish while a function is open: it is now the static view to go back to. */
  const rebase2D = (): void => {
    if (!_held) return;
    _held = { ..._held, results: staticResults2D(), singleResults, perCase, perCombo, envelope, activeView, activeComboId, activeCaseId };
  };
  const rebase3D = (): void => {
    if (!_held) return;
    _held = { ..._held, results3D: staticResults3D(), singleResults3D, perCase3D, perCombo3D, envelope3D, activeView, activeComboId, activeCaseId };
  };

  /**
   * A function that only draws over the results (a mode shape) opened over one that replaced
   * them (P-Δ, the collapse, a load train): `clearAdvanced` closes the first but left its results
   * in place, and the diagrams and section queries read them as the static solve. Put back the
   * static results the held view keeps.
   */
  const staticUnder2D = (): void => { results = _held ? _held.results : staticResults2D(); };
  const staticUnder3D = (): void => { results3D = _held ? _held.results3D : staticResults3D(); };

  return {
    /** Wired in store/index.ts. Fired on every fresh-solve results publish
     *  (setResults3D / setCombinationResults3D) so verificationStore can advance
     *  its solve-generation counter — including a plain re-solve with no
     *  structural mutation (self-weight / axis-convention toggle). */
    _setOnResultsPublish(fn: () => void) { _onResultsPublish = fn; },
    _setNormalise3D(r: (x: AnalysisResults3D) => AnalysisResults3D, e: (x: FullEnvelope3D) => FullEnvelope3D, adv?: Normalise3DAdvanced) {
      _normalise3D = r; _normaliseEnvelope3D = e; _normaliseAdvanced3D = adv ?? null;
    },

    /** Wired by view-mode.ts's installViewModeRules(). Fired whenever the
     *  diagramType setter puts a diagram on screen, so EVERY entry point —
     *  keyboard shortcuts, mobile panel, toolbars, url-sharing — gets the
     *  editing/reading exclusion, not just the ones that call showDiagram(). */
    _setOnDiagramShown(fn: () => void) { _onDiagramShown = fn; },

    get results() { return results; },
    /** True when ANY result of any kind is present. Used by the mutation hook
     *  to decide whether an edit must clear stale results. Covers 2D + 3D base,
     *  per-case/per-combo/envelope, every advanced result (2D + 3D), and the
     *  moving-load envelope plus an in-flight moving-load run — an advanced-only
     *  or moving-load-only run leaves `results`/`results3D` null, so guarding on
     *  those alone would skip invalidation entirely. */
    get hasAnyResults(): boolean {
      return (
        results !== null ||
        results3D !== null ||
        singleResults !== null ||
        singleResults3D !== null ||
        perCase.size > 0 ||
        perCombo.size > 0 ||
        perCase3D.size > 0 ||
        perCombo3D.size > 0 ||
        envelope !== null ||
        envelope3D !== null ||
        pdeltaResult !== null ||
        modalResult !== null ||
        bucklingResult !== null ||
        plasticResult !== null ||
        spectralResult !== null ||
        pdeltaResult3D !== null ||
        modalResult3D !== null ||
        bucklingResult3D !== null ||
        spectralResult3D !== null ||
        movingLoadEnvelope !== null ||
        movingLoadRunning
      );
    },
    get diagramType() { return diagramType; },
    /**
     * Putting a diagram on screen is a MODE change, so it carries the rule
     * with it — like `uiStore.currentTool`, the dependency is inverted through
     * a hook rather than importing the UI store.
     *
     * Note the rule fires only through THIS setter. The store's own methods
     * (setResults, setModalResult, …) write the field directly; those are
     * fresh-solve publishes, which already reset the workspace around them.
     */
    set diagramType(v: DiagramType) {
      diagramType = v;
      if (v !== 'none') {
        _lastDiagramType = v;
        // Picked while a re-solve is pending: that is the view to come back to.
        if (_viewBeforeClear) _viewBeforeClear = { ..._viewBeforeClear, diagram: v };
        _onDiagramShown?.();
      }
    },
    get deformedScale() { return deformedScale; },
    set deformedScale(v: number) { deformedScale = v; },
    get diagramScale() { return diagramScale; },
    set diagramScale(v: number) { diagramScale = Math.max(0.1, Math.min(10, v)); },
    get animateDeformed() { return animateDeformed; },
    set animateDeformed(v: boolean) { animateDeformed = v; },
    get colourScale() { return colourScale; },
    /** Only writes on a real change: this is called from a draw loop. */
    setColourScale(v: { max: number; unit: string; source: string } | null) {
      if (v === null) { if (colourScale !== null) colourScale = null; return; }
      if (!colourScale || colourScale.max !== v.max || colourScale.unit !== v.unit
        || colourScale.source !== v.source) colourScale = v;
    },

    get colorMapKind() { return colorMapKind; },
    set colorMapKind(v: 'moment' | 'shear' | 'axial' | 'momentY' | 'momentZ' | 'shearY' | 'shearZ' | 'torsion' | 'stressRatio' | 'vonMises' | 'sigmaMax' | 'tauMax' | 'shellVonMises' | 'shellBending' | 'stress') { colorMapKind = v; },
    get stressShowMembers() { return stressShowMembers; },
    set stressShowMembers(v: boolean) { stressShowMembers = v; },
    get stressShowShells() { return stressShowShells; },
    set stressShowShells(v: boolean) { stressShowShells = v; },
    get shellContourComponent() { return shellContourComponent; },
    set shellContourComponent(v: import('../engine/shell-stress').ShellContourComponent) { shellContourComponent = v; },
    get showDiagramValues() { return showDiagramValues; },
    set showDiagramValues(v: boolean) { showDiagramValues = v; },
    get drawPositiveTowardLocalAxes() { return drawPositiveTowardLocalAxes; },
    set drawPositiveTowardLocalAxes(v: boolean) { drawPositiveTowardLocalAxes = v; },
    get animSpeed() { return animSpeed; },
    set animSpeed(v: number) { animSpeed = Math.max(0.25, Math.min(3, v)); },

    // Combination state
    get perCase() { return perCase; },
    get perCombo() { return perCombo; },
    get envelope() { return envelope; },
    get activeView() { return activeView; },
    set activeView(v: ResultsView) {
      activeView = v;
      // Update displayed 2D results based on view
      if (v === 'envelope' && envelope) {
        results = envelope.maxAbsResults;
      } else if (v === 'combo' && activeComboId !== null) {
        results = perCombo.get(activeComboId) ?? null;
      } else if (v === 'single') {
        if (activeCaseId !== null && perCase.size > 0) {
          results = perCase.get(activeCaseId) ?? singleResults;
        } else if (singleResults) {
          results = singleResults;
        }
      }
      // Also update 3D results if 3D combos exist
      if (perCombo3D.size > 0) {
        this._update3DView(v);
      }
    },
    get activeComboId() { return activeComboId; },
    set activeComboId(v: number | null) {
      activeComboId = v;
      if (activeView === 'combo' && v !== null) {
        results = perCombo.get(v) ?? null;
        if (perCombo3D.size > 0) {
          results3D = perCombo3D.get(v) ?? null;
        }
      }
    },
    get activeCaseId() { return activeCaseId; },
    set activeCaseId(v: number | null) {
      activeCaseId = v;
      if (v !== null && perCase.size > 0) {
        activeView = 'single';
        results = perCase.get(v) ?? null;
      }
      if (v !== null && perCase3D.size > 0) {
        activeView = 'single';
        results3D = perCase3D.get(v) ?? singleResults3D;
      }
    },
    get singleResults() { return singleResults; },
    get singleResults3D() { return singleResults3D; },
    get hasCombinations() { return perCombo.size > 0 || perCombo3D.size > 0; },
    get isEnvelopeActive() { return activeView === 'envelope' && (envelope !== null || envelope3D !== null); },
    get fullEnvelope() { return envelope; },

    get combinationsDirty() { return combinationsDirty; },
    set combinationsDirty(v: boolean) { combinationsDirty = v; },

    get influenceLine() { return influenceLine; },
    get ilAnimating() { return ilAnimating; },
    set ilAnimating(v: boolean) { ilAnimating = v; if (v && ilAnimProgress >= 1) ilAnimProgress = 0; },
    get ilAnimProgress() { return ilAnimProgress; },
    set ilAnimProgress(v: number) { ilAnimProgress = v; },
    get ilAnimSpeed() { return ilAnimSpeed; },
    set ilAnimSpeed(v: number) { ilAnimSpeed = Math.max(0.25, Math.min(3, v)); },

    get overlayResults() { return overlayResults; },
    get overlayResults3D() { return overlayResults3D; },
    get overlayLabel() { return overlayLabel; },
    /** The member sign the plane results are published with; see transverse-sign-2d.ts. */
    _setTransverseSignProvider(fn: SignOf) { _signOf = fn; },

    setOverlay(r: AnalysisResults | null, label: string = '') {
      // Already in the drawn axes: every source the Compare menu offers — the
      // base solve, a case, a combination, the envelope — was converted when it
      // was published. Converting again drew it against the main diagram with
      // V and M reversed on every member drawn against the solver's axis.
      overlayResults = r;
      overlayResults3D = null;
      overlayLabel = label;
    },
    setOverlay3D(r: AnalysisResults3D | null, label: string = '') {
      overlayResults3D = r;
      overlayResults = null;
      overlayLabel = label;
    },

    // Advanced analysis
    get movingLoadEnvelope() { return movingLoadEnvelope; },
    get activeMovingLoadPosition() { return activeMovingLoadPosition; },
    set activeMovingLoadPosition(v: number) {
      activeMovingLoadPosition = v;
      if (movingLoadEnvelope && movingLoadEnvelope.positions[v]) {
        results = movingLoadEnvelope.positions[v].results;
      }
    },
    setMovingLoadEnvelope(env: MovingLoadEnvelope) {
      env = {
        ...env,
        positions: env.positions.map((p) => ({ ...p, results: drawn(p.results) })),
        elements: new Map([...env.elements].map(([id, e]) => [id, _signOf(id) < 0
          ? { ...e, mMaxPos: -e.mMaxNeg, mMaxNeg: -e.mMaxPos, vMaxPos: -e.vMaxNeg, vMaxNeg: -e.vMaxPos }
          : e])),
        ...(env.fullEnvelope ? { fullEnvelope: envelopeToDrawnAxes(env.fullEnvelope, _signOf) } : {}),
      };
      hold();
      this.clearAdvanced();
      movingLoadEnvelope = env;
      activeMovingLoadPosition = 0;
      activeView = 'single';        // Reset view to avoid combo state interference
      perCase = new Map();
      perCombo = new Map();
      envelope = null;
      /*
       * Open on the envelope the run announced ("N positions, envelope
       * computed"), not on its first position: the train starts at the end of
       * its path, which is usually over a support, and a point load on a
       * support bends nothing — an unloaded frame showed an empty view after a
       * successful run. The positions are one press away (◀ ▶, "Moving load").
       */
      movingLoadShowEnvelope = !!env.fullEnvelope;
      if (env.positions.length > 0) {
        results = env.positions[0].results;
      }
      diagramType = 'moment';        // More useful default than 'deformed' for load trains
    },

    /** Clear all advanced analysis results (called before running a new one) */
    clearAdvanced() {
      pdeltaResult = null;
      modalResult = null;
      activeModeIndex = 0;
      bucklingResult = null;
      activeBucklingMode = 0;
      plasticResult = null;
      plasticStep = 0;
      spectralResult = null;
      movingLoadEnvelope = null;
      activeMovingLoadPosition = 0;
      movingLoadShowEnvelope = false;
      pdeltaResult3D = null;
      modalResult3D = null;
      bucklingResult3D = null;
      spectralResult3D = null;
    },

    /**
     * Closing one function: its result goes, and the view it replaced comes
     * back (`release`). The list's toggle-off and the panel's "← Back" both
     * come through here, so the two cannot disagree about what closing means.
     */
    clearPDelta() {
      pdeltaResult = null;
      release(false);
    },
    clearModal() {
      modalResult = null;
      activeModeIndex = 0;
      spectralResult = null; // spectral depends on modal
      release(false);
    },
    clearBuckling() {
      bucklingResult = null;
      activeBucklingMode = 0;
      release(false);
    },
    clearPlastic() {
      plasticResult = null;
      plasticStep = 0;
      release(false);
    },
    clearSpectral() {
      spectralResult = null;
    },
    clearMovingLoad() {
      if (movingLoadRunning) this.cancelMovingLoad();
      movingLoadEnvelope = null;
      activeMovingLoadPosition = 0;
      movingLoadShowEnvelope = false;
      release(false);
    },
    /** Close the influence line: the line goes and the view it replaced comes back. */
    clearInfluenceLine() {
      influenceLine = null;
      ilAnimating = false;
      ilAnimProgress = 0;
      release(false);
    },
    /**
     * For a function that only changes the view (the free-body view): keep it
     * before the function changes it, and put it back when it closes.
     */
    holdView() { hold(); },
    releaseView(is3D: boolean) { release(is3D); },
    /** Whether a view is held for an open function (tests and diagnostics). */
    get holdsView() { return _held !== null; },

    /**
     * The workspace changed dimension (2D ↔ 3D). The functions of the one it
     * left do not exist in the new one — their results are the other solver's,
     * and the entries that would close them are disabled or read the other
     * slot — so they close here, and a diagram with nothing to draw in the new
     * dimension is put away instead of hiding the model's loads.
     */
    leaveDimension(to3D: boolean) {
      const h = _held;
      _held = null;
      if (to3D) {
        pdeltaResult = null; modalResult = null; bucklingResult = null; plasticResult = null; plasticStep = 0;
        spectralResult = null; movingLoadEnvelope = null; activeMovingLoadPosition = 0; movingLoadShowEnvelope = false;
        if (movingLoadRunning) this.cancelMovingLoad();
        influenceLine = null; ilAnimating = false; ilAnimProgress = 0;
        // The static 2D view the functions replaced, as it was; whether it survives the switch is the workspace's call.
        if (h) { results = h.results; singleResults = h.singleResults; perCase = h.perCase; perCombo = h.perCombo; envelope = h.envelope; }
      } else {
        pdeltaResult3D = null; modalResult3D = null; bucklingResult3D = null; spectralResult3D = null;
        if (h) { results3D = h.results3D; singleResults3D = h.singleResults3D; perCase3D = h.perCase3D; perCombo3D = h.perCombo3D; envelope3D = h.envelope3D; }
      }
      activeModeIndex = 0;
      activeBucklingMode = 0;
      if (h) { activeView = h.activeView; activeComboId = h.activeComboId; activeCaseId = h.activeCaseId; _lastDiagramType = h.lastDiagram; showReactions = h.showReactions; }
      if (!drawable(diagramType, to3D)) {
        const valid = to3D ? STATIC_DIAGRAMS_3D : STATIC_DIAGRAMS_2D;
        const back = h && valid.includes(h.diagram) ? h.diagram : 'deformed';
        diagramType = (to3D ? results3D : results) === null ? 'none' : back;
      }
      if (_viewBeforeClear && FUNCTION_DIAGRAMS.includes(_viewBeforeClear.diagram)) {
        _viewBeforeClear = { ..._viewBeforeClear, diagram: h?.diagram ?? _lastDiagramType };
      }
    },

    get pdeltaResult() { return pdeltaResult; },
    setPDeltaResult(r: PDeltaResult) {
      r = { ...r, results: drawn(r.results), ...(r.linearResults ? { linearResults: drawn(r.linearResults) } : {}) };
      hold();
      this.clearAdvanced();
      pdeltaResult = r;
      results = r.results;
      diagramType = 'deformed';
    },

    get modalResult() { return modalResult; },
    get activeModeIndex() { return activeModeIndex; },
    set activeModeIndex(v: number) { activeModeIndex = v; },
    setModalResult(r: ModalResult) {
      hold();
      this.clearAdvanced();
      staticUnder2D();
      modalResult = r;
      activeModeIndex = 0;
      diagramType = 'modeShape';
    },

    get bucklingResult() { return bucklingResult; },
    get activeBucklingMode() { return activeBucklingMode; },
    set activeBucklingMode(v: number) { activeBucklingMode = v; },
    setBucklingResult(r: BucklingResult) {
      hold();
      this.clearAdvanced();
      staticUnder2D();
      bucklingResult = r;
      activeBucklingMode = 0;
      diagramType = 'bucklingMode';
    },

    // Section stress query
    get stressQuery() { return stressQuery; },
    set stressQuery(v: { elementId: number; t: number; worldX: number; worldY: number; worldZ?: number } | null) { stressQuery = v; },

    get plasticResult() { return plasticResult; },
    get plasticStep() { return plasticStep; },
    set plasticStep(v: number) { plasticStep = v; },
    setPlasticResult(r: PlasticResult) {
      r = {
        ...r,
        steps: (r.steps ?? []).map((st) => ({ ...st, results: st.results && drawn(st.results) })),
        hinges: (r.hinges ?? []).map((h) => ((h as { kind?: string }).kind === 'axial' ? h : { ...h, moment: _signOf(h.elementId) * h.moment })),
      };
      hold();
      this.clearAdvanced();
      plasticResult = r;
      plasticStep = r.steps.length - 1;
      if (r.steps.length > 0) {
        results = r.steps[r.steps.length - 1].results;
      }
      diagramType = 'plasticHinges';
    },

    get spectralResult() { return spectralResult; },
    setSpectralResult(r: SpectralResult) {
      // Spectral needs modal, so don't clear modal
      hold();
      pdeltaResult = null;
      bucklingResult = null;
      activeBucklingMode = 0;
      plasticResult = null;
      plasticStep = 0;
      staticUnder2D();
      spectralResult = r;
    },

    // ─── 3D Advanced Analysis Results ─────────────────────────────
    get pdeltaResult3D() { return pdeltaResult3D; },
    setPDeltaResult3D(r: PDeltaResult3D) {
      if (_normaliseAdvanced3D) r = _normaliseAdvanced3D.pdelta(r);
      hold();
      this.clearAdvanced();
      pdeltaResult3D = r;
      results3D = r.results;
      diagramType = 'deformed';
    },
    clearPDelta3D() {
      pdeltaResult3D = null;
      release(true);
    },

    get modalResult3D() { return modalResult3D; },
    setModalResult3D(r: ModalResult3D) {
      if (_normaliseAdvanced3D) r = _normaliseAdvanced3D.modes(r);
      hold();
      this.clearAdvanced();
      staticUnder3D();
      modalResult3D = r;
      activeModeIndex = 0;
      diagramType = 'modeShape';
    },
    clearModal3D() {
      modalResult3D = null;
      activeModeIndex = 0;
      spectralResult3D = null;
      release(true);
    },

    get bucklingResult3D() { return bucklingResult3D; },
    setBucklingResult3D(r: BucklingResult3D) {
      if (_normaliseAdvanced3D) r = _normaliseAdvanced3D.modes(r);
      hold();
      this.clearAdvanced();
      staticUnder3D();
      bucklingResult3D = r;
      activeBucklingMode = 0;
      diagramType = 'bucklingMode';
    },
    clearBuckling3D() {
      bucklingResult3D = null;
      activeBucklingMode = 0;
      release(true);
    },

    get spectralResult3D() { return spectralResult3D; },
    setSpectralResult3D(r: SpectralResult3D) {
      if (_normalise3D) r = { ...r, results: _normalise3D(r.results) };
      hold();
      this.clearAdvanced();
      spectralResult3D = r;
      results3D = r.results;
      diagramType = 'deformed';
    },
    clearSpectral3D() {
      spectralResult3D = null;
    },

    get showReactions() { return showReactions; },
    set showReactions(v: boolean) { showReactions = v; },

    get showConstraintForces() { return showConstraintForces; },
    set showConstraintForces(v: boolean) { showConstraintForces = v; },

    get movingLoadShowEnvelope() { return movingLoadShowEnvelope; },
    set movingLoadShowEnvelope(v: boolean) { movingLoadShowEnvelope = v; },

    // Moving load progress
    get movingLoadRunning() { return movingLoadRunning; },
    get movingLoadProgress() { return movingLoadProgress; },
    startMovingLoadAnalysis(): AbortController {
      movingLoadRunning = true;
      movingLoadProgress = { current: 0, total: 0 };
      const ac = new AbortController();
      movingLoadAbortController = ac;
      return ac;
    },
    updateMovingLoadProgress(current: number, total: number) {
      movingLoadProgress = { current, total };
    },
    cancelMovingLoad() {
      movingLoadAbortController?.abort();
      movingLoadRunning = false;
      movingLoadProgress = null;
      movingLoadAbortController = null;
    },
    finishMovingLoad() {
      movingLoadRunning = false;
      movingLoadProgress = null;
      movingLoadAbortController = null;
    },

    /** `null` closes the line (`clearInfluenceLine`); it used to be read as a line and throw. */
    setInfluenceLine(il: InfluenceLineResult | null) {
      if (!il) { this.clearInfluenceLine(); return; }
      hold();
      if ((il.quantity === 'M' || il.quantity === 'V') && il.targetElementId !== undefined && _signOf(il.targetElementId) < 0) {
        il = { ...il, points: il.points.map((p) => ({ ...p, value: -p.value })) };
      }
      influenceLine = il;
      diagramType = 'influenceLine';
      ilAnimating = false;
      ilAnimProgress = 0;
    },

    setResults(r: AnalysisResults, preserveDiagram = false) {
      r = drawn(r);
      results = r;
      singleResults = r; // Save base solve for "Cargas simples" option
      deformedScale = 1; // reset to default on fresh solve
      // Preserve current diagram type during live-calc re-solves
      const validDiagrams: DiagramType[] = ['deformed', 'moment', 'shear', 'axial', 'colorMap', 'axialColor'];
      if (preserveDiagram) {
        // clear() may have reset diagramType to 'none' — restore last user-chosen diagram
        if (diagramType === 'none' && validDiagrams.includes(_lastDiagramType)) {
          diagramType = _lastDiagramType;
        }
        // Keep current diagram if valid, otherwise fall back to deformed
        if (!validDiagrams.includes(diagramType) && diagramType !== 'none') {
          diagramType = 'deformed';
          _lastDiagramType = 'deformed';
        }
      } else if (!validDiagrams.includes(diagramType)) {
        diagramType = 'deformed';
        _lastDiagramType = 'deformed';
      }
      activeView = 'single';
      activeCaseId = null;
      // Clear combo results when doing a single solve
      perCase = new Map();
      perCombo = new Map();
      envelope = null;
      activeComboId = null;
      // Extract diagnostics and constraint forces from results
      diagnostics2D = [];
      constraintForces2D = r.constraintForces ?? [];
      solveTimings2D = r.timings ?? null;
      rebase2D();
    },

    setCombinationResults(pc: Map<number, AnalysisResults>, pco: Map<number, AnalysisResults>, env: FullEnvelope) {
      pc = new Map([...pc].map(([k, v]) => [k, drawn(v)]));
      pco = new Map([...pco].map(([k, v]) => [k, drawn(v)]));
      env = envelopeToDrawnAxes(env, _signOf);
      perCase = pc;
      perCombo = pco;
      envelope = env;
      activeCaseId = null; // reset individual case selection
      /*
       * Default to "Cargas simples" — all loads at unit factor.
       *
       * The fallback used to be the ENVELOPE, which is the wrong thing to land
       * on: an envelope is a summary of every case at once, so no single
       * diagram it shows corresponds to a state the structure is ever in. It
       * is what you check against at the end, not what you open on.
       *
       * With no base solve available the first individual CASE is the honest
       * default — a real load state, and one whose diagram means something.
       */
      if (singleResults) {
        results = singleResults;
        activeView = 'single';
      } else {
        const firstCase = pc.keys().next().value;
        if (firstCase !== undefined) {
          results = pc.get(firstCase)!;
          activeCaseId = firstCase;
          activeView = 'single';
        } else {
          results = env.maxAbsResults;
          activeView = 'envelope';
        }
      }
      activeComboId = pco.keys().next().value ?? null;
      // Preserve current diagram type if it's a results-based view
      const resultsDiagrams: DiagramType[] = ['deformed', 'moment', 'shear', 'axial', 'colorMap', 'axialColor'];
      if (!resultsDiagrams.includes(diagramType)) {
        diagramType = 'moment';
      }
      combinationsDirty = false;
      rebase2D();
    },

    clear() {
      if (results || results3D) {
        // With a function open, the view to come back to is the one it replaced, not the function's own.
        const shown = FUNCTION_DIAGRAMS.includes(diagramType) && _held ? _held.diagram : diagramType;
        _viewBeforeClear = {
          diagram: shown !== 'none' ? shown : _lastDiagramType,
          view: _held?.activeView ?? activeView, caseId: _held ? _held.activeCaseId : activeCaseId,
          comboId: _held ? _held.activeComboId : activeComboId,
        };
      }
      // The held view described the results this clear throws away.
      _held = null;
      results = null;
      singleResults = null;
      diagramType = 'none';
      perCase = new Map();
      perCombo = new Map();
      envelope = null;
      activeView = 'single';
      activeComboId = null;
      activeCaseId = null;
      combinationsDirty = false;
      influenceLine = null;
      ilAnimating = false;
      ilAnimProgress = 0;
      overlayResults = null;
      overlayResults3D = null;
      overlayLabel = '';
      movingLoadEnvelope = null;
      pdeltaResult = null;
      modalResult = null;
      activeModeIndex = 0;
      bucklingResult = null;
      activeBucklingMode = 0;
      plasticResult = null;
      plasticStep = 0;
      spectralResult = null;
      // 3D advanced results were previously only nulled in clearAdvanced()
      // (called on a new advanced run), so a plain model edit left stale mode
      // shapes / P-Delta / buckling / spectral 3D results rendered as current.
      pdeltaResult3D = null;
      modalResult3D = null;
      bucklingResult3D = null;
      spectralResult3D = null;
      movingLoadShowEnvelope = false;
      movingLoadRunning = false;
      movingLoadProgress = null;
      // Abort any in-flight moving-load solve before dropping the controller,
      // otherwise a running analysis can resurrect pre-edit forces after clear().
      movingLoadAbortController?.abort();
      movingLoadAbortController = null;
      showReactions = false;
      showConstraintForces = false;
      // NOTE: stressQuery is NOT cleared here — it represents user intent ("what to inspect").
      // When results disappear, Viewport effects cascade: no results → selectMode='elements' → stressQuery=null.
      // This allows the panel to survive live-calc re-solves where results are only briefly null.
      results3D = null;
      singleResults3D = null;
      perCase3D = new Map();
      perCombo3D = new Map();
      unstableCombinations3D = [];
      envelope3D = null;
      governing2D = new Map();
      governing3D = new Map();
      diagnostics2D = [];
      constraintForces2D = [];
      diagnostics3DArr = [];
      constraintForces3DArr = [];
      solveTimings2D = null;
      solveTimings3D = null;
    },

    /** The view a clear took away, still waiting for a re-solve to restore it. */
    get pendingView() { return _viewBeforeClear; },

    /**
     * Another project replaced this one (a tab, a file, an example): the view
     * taken from the old one's results does not describe the new one — its
     * case or combination ids name something else there.
     */
    forgetView() { _viewBeforeClear = null; },

    /**
     * After a re-solve: show again what was on screen before the edit cleared
     * it — the same diagram, and the same case, combination or envelope when
     * the new results have it. Once: the next clear takes a fresh one.
     */
    restoreView(is3D: boolean) {
      const v = _viewBeforeClear;
      _viewBeforeClear = null;
      if (!v) return;
      const valid: DiagramType[] = is3D
        ? ['deformed', 'momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion', 'axialColor', 'colorMap']
        : ['deformed', 'moment', 'shear', 'axial', 'colorMap', 'axialColor'];
      if (valid.includes(v.diagram)) { diagramType = v.diagram; _lastDiagramType = v.diagram; }
      const cases = is3D ? perCase3D : perCase;
      const combos = is3D ? perCombo3D : perCombo;
      if (v.view === 'envelope' && (is3D ? envelope3D : envelope)) {
        this.activeView = 'envelope';
      } else if (v.view === 'combo' && v.comboId !== null && combos.has(v.comboId)) {
        activeComboId = v.comboId;
        this.activeView = 'combo';
      } else if (v.caseId !== null && cases.has(v.caseId)) {
        this.activeCaseId = v.caseId;
      }
    },

    // ─── 3D Results ─────────────────────────────────────────────

    get results3D() { return results3D; },

    setResults3D(r: AnalysisResults3D, preserveDiagram = false) {
      if (_normalise3D) r = _normalise3D(r);
      noteStructuralSolve();
      _onResultsPublish?.();
      results3D = r;
      singleResults3D = r;
      showReactions = false;
      showConstraintForces = false;
      deformedScale = 1; // reset to default on fresh solve
      // Preserve current diagram type during live-calc re-solves
      const valid3DDiagrams: DiagramType[] = ['deformed', 'momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion', 'axialColor', 'colorMap'];
      if (preserveDiagram) {
        if (diagramType === 'none' && valid3DDiagrams.includes(_lastDiagramType)) {
          diagramType = _lastDiagramType;
        }
        if (!valid3DDiagrams.includes(diagramType) && diagramType !== 'none') {
          diagramType = 'deformed';
          _lastDiagramType = 'deformed';
        }
      } else if (!valid3DDiagrams.includes(diagramType)) {
        diagramType = 'deformed';
        _lastDiagramType = 'deformed';
      }
      // Reset 3D combos on fresh solve
      activeView = 'single';
      activeCaseId = null;
      perCase3D = new Map();
      perCombo3D = new Map();
      unstableCombinations3D = [];
      envelope3D = null;
      governing3D = new Map();
      // Extract diagnostics and constraint forces from results
      diagnostics3DArr = [];
      constraintForces3DArr = r.constraintForces ?? [];
      solveTimings3D = r.timings ?? null;
      rebase3D();
    },

    clear3D() {
      _held = null;
      results3D = null;
      singleResults3D = null;
      perCase3D = new Map();
      perCombo3D = new Map();
      unstableCombinations3D = [];
      envelope3D = null;
      governing3D = new Map();
      diagnostics3DArr = [];
      constraintForces3DArr = [];
      solveTimings3D = null;
      pdeltaResult3D = null;
      modalResult3D = null;
      bucklingResult3D = null;
      spectralResult3D = null;
      showReactions = false;
      showConstraintForces = false;
      // Reset diagram state so stale deformed/diagrams are removed from scene
      diagramType = 'none';
      animateDeformed = false;
    },

    // 3D combination state
    get perCase3D() { return perCase3D; },
    get perCombo3D() { return perCombo3D; },
    get unstableCombinations3D(): readonly number[] { return unstableCombinations3D; },
    get envelope3D() { return envelope3D; },
    get hasCombinations3D() { return perCombo3D.size > 0; },
    /** The envelope on SCREEN: a named one when shown, else the active one. Design reads
     *  `envelope3D`, which is always the active list's. */
    get fullEnvelope3D() {
      return viewedEnvelope3D && envelope3D && viewedEnvelope3D.over === envelope3D ? viewedEnvelope3D.env : envelope3D;
    },
    get viewedEnvelopeName(): string | null {
      return viewedEnvelope3D && envelope3D && viewedEnvelope3D.over === envelope3D ? viewedEnvelope3D.name : null;
    },
    /** Show a named envelope (built over the current solve) in place of the active one, or go back (`null`). */
    viewEnvelope3D(env: FullEnvelope3D | null, name = '') {
      viewedEnvelope3D = env && envelope3D ? { env, name, over: envelope3D } : null;
      if (activeView === 'envelope') this._update3DView('envelope');
    },

    // Governing-case provenance
    get governing2D() { return governing2D; },
    get governing3D() { return governing3D; },
    setGoverning2D(g: Map<number, GoverningPerElement>) { governing2D = g; },
    setGoverning3D(g: Map<number, GoverningPerElement3D>) { governing3D = g; },

    setCombinationResults3D(pc: Map<number, AnalysisResults3D>, pco: Map<number, AnalysisResults3D>, env: FullEnvelope3D, unstable: readonly number[] = []) {
      if (_normalise3D) {
        const n = _normalise3D;
        pc = new Map([...pc].map(([k, r]) => [k, n(r)]));
        pco = new Map([...pco].map(([k, r]) => [k, n(r)]));
        if (_normaliseEnvelope3D && env) env = _normaliseEnvelope3D(env);
      }
      noteStructuralSolve();
      _onResultsPublish?.();
      perCase3D = pc;
      perCombo3D = pco;
      unstableCombinations3D = [...unstable];
      envelope3D = env;
      showReactions = false;
      showConstraintForces = false;
      activeCaseId = null;
      activeComboId = pco.keys().next().value ?? null;
      // Default: show the simple (all loads combined) view so the user sees
      // the full structural response. They can switch to combo/envelope later.
      if (singleResults3D) {
        results3D = singleResults3D;
        activeView = 'single';
      } else if (activeComboId !== null && pco.has(activeComboId)) {
        // TODO: deliberate divergence from the 2D path (setCombinationResults),
        // which lands on the first individual CASE when no base solve exists —
        // a combination is a factored mix, not a state the structure is ever
        // in. Reconcile the two, most likely by porting the 2D fallback here.
        results3D = pco.get(activeComboId)!;
        activeView = 'combo';
      } else {
        results3D = env.maxAbsResults3D;
        activeView = 'envelope';
      }
      const valid3DDiagrams: DiagramType[] = ['deformed', 'momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion', 'axialColor', 'colorMap', 'none'];
      if (!valid3DDiagrams.includes(diagramType)) {
        // My: the bending of a beam under gravity (local z is up), as the "3" key and the 2D M.
        diagramType = 'momentY';
      }
      combinationsDirty = false;
      rebase3D();
    },

    /** Switch 3D results based on activeView change (called from activeView setter) */
    _update3DView(v: ResultsView) {
      if (v === 'envelope' && envelope3D) {
        results3D = (this.fullEnvelope3D ?? envelope3D).maxAbsResults3D;
      } else if (v === 'combo' && activeComboId !== null && perCombo3D.size > 0) {
        results3D = perCombo3D.get(activeComboId) ?? null;
      } else if (v === 'single') {
        if (activeCaseId !== null && perCase3D.size > 0) {
          results3D = perCase3D.get(activeCaseId) ?? singleResults3D;
        } else if (singleResults3D) {
          results3D = singleResults3D;
        }
      }
    },

    getDisplacement3D(nodeId: number): Displacement3D | undefined {
      return results3D?.displacements.find(d => d.nodeId === nodeId);
    },

    getReaction3D(nodeId: number): Reaction3D | undefined {
      return results3D?.reactions.find(r => r.nodeId === nodeId);
    },

    getElementForces3D(elementId: number): ElementForces3D | undefined {
      return results3D?.elementForces.find(f => f.elementId === elementId);
    },

    get maxDisplacement3D(): number {
      if (!results3D) return 0;
      return Math.max(...results3D.displacements.map(d =>
        Math.sqrt(d.ux ** 2 + d.uy ** 2 + d.uz ** 2)
      ));
    },

    // ─── Solve Timings ─────────────────────────────────────────
    get solveTimings() { return solveTimings2D; },
    get solveTimings3DData() { return solveTimings3D; },

    // ─── Diagnostics ───────────────────────────────────────────
    get diagnostics() { return diagnostics2D; },
    get diagnostics3D() { return diagnostics3DArr; },
    get constraintForces() { return constraintForces2D; },
    get constraintForces3D() { return constraintForces3DArr; },

    /** Add diagnostics (appends to existing list) */
    addDiagnostics(diags: SolverDiagnostic[], is3D: boolean = false) {
      if (is3D) {
        diagnostics3DArr = [...diagnostics3DArr, ...diags];
      } else {
        diagnostics2D = [...diagnostics2D, ...diags];
      }
    },

    /** Set constraint forces */
    setConstraintForces(forces: ConstraintForce[], is3D: boolean = false) {
      if (is3D) {
        constraintForces3DArr = forces;
      } else {
        constraintForces2D = forces;
      }
    },

    clearDiagnostics(is3D: boolean = false) {
      if (is3D) {
        diagnostics3DArr = [];
        constraintForces3DArr = [];
      } else {
        diagnostics2D = [];
        constraintForces2D = [];
      }
    },

    getDisplacement(nodeId: number) {
      return results?.displacements.find(d => d.nodeId === nodeId);
    },

    getReaction(nodeId: number) {
      return results?.reactions.find(r => r.nodeId === nodeId);
    },

    getElementForces(elementId: number) {
      return results?.elementForces.find(f => f.elementId === elementId);
    },

    get maxMoment(): number {
      if (!results) return 0;
      return Math.max(...results.elementForces.map(f =>
        Math.max(Math.abs(f.mStart), Math.abs(f.mEnd))
      ));
    },

    get maxShear(): number {
      if (!results) return 0;
      return Math.max(...results.elementForces.map(f =>
        Math.max(Math.abs(f.vStart), Math.abs(f.vEnd))
      ));
    },

    // Read through `engine-diagnostics.ts`: the engine's own lines come without a source and in English.
    get solverDiagnostics(): SolverDiagnostic[] { return (results?.solverDiagnostics ?? []).map((d) => readSolverDiagnostic(d, t)); },
    get solverDiagnostics3D(): SolverDiagnostic[] { return (results3D?.solverDiagnostics ?? []).map((d) => readSolverDiagnostic(d, t)); },

    // What the pre-solve gates found about the model (see model-findings.ts).
    // With no single solve (combinations published on their own), a load case
    // carries the gates' findings; a combination or the envelope does not.
    get structuredDiagnostics(): SolverDiagnostic[] {
      return findingsOf(singleResults ?? perCase.values().next().value ?? results);
    },
    get structuredDiagnostics3D(): SolverDiagnostic[] {
      return findingsOf(singleResults3D ?? perCase3D.values().next().value ?? results3D);
    },

    get maxDisplacement(): number {
      if (!results) return 0;
      return Math.max(...results.displacements.map(d =>
        Math.sqrt(d.ux ** 2 + get2DDisplayDisplacementVertical(d) ** 2)
      ));
    },
  };
}

export const resultsStore = createResultsStore();
