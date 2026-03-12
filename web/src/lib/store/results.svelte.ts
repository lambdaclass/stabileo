// Results store

import type { AnalysisResults, InfluenceLineResult, Section, Material } from './model.svelte';
import type { ElementForces, FullEnvelope, SolverDiagnostic, ConstraintForce, AssemblyDiagnostic, SolveTimings } from '../engine/types';
import type { AnalysisResults3D, Displacement3D, Reaction3D, ElementForces3D, FullEnvelope3D } from '../engine/types-3d';
import type { MovingLoadEnvelope } from '../engine/moving-loads';
import type { PDeltaResult } from '../engine/pdelta';
import type { PDeltaResult3D } from '../engine/pdelta-3d';
import type { ModalResult } from '../engine/modal';
import type { ModalResult3D } from '../engine/modal-3d';
import type { BucklingResult } from '../engine/buckling';
import type { BucklingResult3D } from '../engine/buckling-3d';
import type { PlasticResult } from '../engine/plastic';
import type { SpectralResult } from '../engine/spectral';
import type { SpectralResult3D } from '../engine/spectral-3d';

export type DiagramType = 'none' | 'moment' | 'shear' | 'axial' | 'deformed' | 'colorMap' | 'axialColor' | 'verification' | 'influenceLine' | 'modeShape' | 'bucklingMode' | 'plasticHinges'
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

function createResultsStore() {
  let results = $state<AnalysisResults | null>(null);
  let diagramType = $state<DiagramType>('none');
  /** Remembers last user-visible diagram so live-calc can restore it after clear() */
  let _lastDiagramType: DiagramType = 'none';
  let deformedScale = $state<number>(100); // Scale factor for deformed shape (1x = true 1:1 real scale)
  let diagramScale = $state<number>(1); // Multiplier for M/V/N diagram size (1 = default 60px height)
  let animateDeformed = $state<boolean>(false);
  let colorMapKind = $state<'moment' | 'shear' | 'axial' | 'stressRatio' | 'vonMises' | 'shellVonMises' | 'shellBending'>('moment');
  let showDiagramValues = $state<boolean>(true);
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
  let showReactions = $state<boolean>(true);
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
  let perCase3D = $state<Map<number, AnalysisResults3D>>(new Map());
  let perCombo3D = $state<Map<number, AnalysisResults3D>>(new Map());
  let envelope3D = $state<FullEnvelope3D | null>(null);

  // Diagnostics (2D + 3D parallel)
  let diagnostics2D = $state<SolverDiagnostic[]>([]);
  let constraintForces2D = $state<ConstraintForce[]>([]);
  let diagnostics3DArr = $state<SolverDiagnostic[]>([]);
  let constraintForces3DArr = $state<ConstraintForce[]>([]);

  // Solve timings
  let solveTimings2D = $state<SolveTimings | null>(null);
  let solveTimings3D = $state<SolveTimings | null>(null);

  return {
    get results() { return results; },
    get diagramType() { return diagramType; },
    set diagramType(v: DiagramType) {
      diagramType = v;
      if (v !== 'none') _lastDiagramType = v;
    },
    get deformedScale() { return deformedScale; },
    set deformedScale(v: number) { deformedScale = v; },
    get diagramScale() { return diagramScale; },
    set diagramScale(v: number) { diagramScale = Math.max(0.1, Math.min(10, v)); },
    get animateDeformed() { return animateDeformed; },
    set animateDeformed(v: boolean) { animateDeformed = v; },
    get colorMapKind() { return colorMapKind; },
    set colorMapKind(v: 'moment' | 'shear' | 'axial' | 'stressRatio' | 'vonMises' | 'shellVonMises' | 'shellBending') { colorMapKind = v; },
    get showDiagramValues() { return showDiagramValues; },
    set showDiagramValues(v: boolean) { showDiagramValues = v; },
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
    setOverlay(r: AnalysisResults | null, label: string = '') {
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
      this.clearAdvanced();
      movingLoadEnvelope = env;
      activeMovingLoadPosition = 0;
      activeView = 'single';        // Reset view to avoid combo state interference
      perCase = new Map();
      perCombo = new Map();
      envelope = null;
      movingLoadShowEnvelope = false;
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

    /** Individual clear methods (for toggle-off behavior) */
    clearPDelta() {
      pdeltaResult = null;
    },
    clearModal() {
      modalResult = null;
      activeModeIndex = 0;
      spectralResult = null; // spectral depends on modal
      if (diagramType === 'modeShape') diagramType = 'deformed';
    },
    clearBuckling() {
      bucklingResult = null;
      activeBucklingMode = 0;
      if (diagramType === 'bucklingMode') diagramType = 'deformed';
    },
    clearPlastic() {
      plasticResult = null;
      plasticStep = 0;
      if (diagramType === 'plasticHinges') diagramType = 'deformed';
    },
    clearSpectral() {
      spectralResult = null;
    },
    clearMovingLoad() {
      movingLoadEnvelope = null;
      activeMovingLoadPosition = 0;
      movingLoadShowEnvelope = false;
    },

    get pdeltaResult() { return pdeltaResult; },
    setPDeltaResult(r: PDeltaResult) {
      this.clearAdvanced();
      pdeltaResult = r;
      results = r.results;
      diagramType = 'deformed';
    },

    get modalResult() { return modalResult; },
    get activeModeIndex() { return activeModeIndex; },
    set activeModeIndex(v: number) { activeModeIndex = v; },
    setModalResult(r: ModalResult) {
      this.clearAdvanced();
      modalResult = r;
      activeModeIndex = 0;
      diagramType = 'modeShape';
    },

    get bucklingResult() { return bucklingResult; },
    get activeBucklingMode() { return activeBucklingMode; },
    set activeBucklingMode(v: number) { activeBucklingMode = v; },
    setBucklingResult(r: BucklingResult) {
      this.clearAdvanced();
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
      pdeltaResult = null;
      bucklingResult = null;
      activeBucklingMode = 0;
      plasticResult = null;
      plasticStep = 0;
      spectralResult = r;
    },

    // ─── 3D Advanced Analysis Results ─────────────────────────────
    get pdeltaResult3D() { return pdeltaResult3D; },
    setPDeltaResult3D(r: PDeltaResult3D) {
      this.clearAdvanced();
      pdeltaResult3D = r;
      results3D = r.results;
      diagramType = 'deformed';
    },
    clearPDelta3D() {
      pdeltaResult3D = null;
    },

    get modalResult3D() { return modalResult3D; },
    setModalResult3D(r: ModalResult3D) {
      this.clearAdvanced();
      modalResult3D = r;
      activeModeIndex = 0;
      diagramType = 'modeShape';
    },
    clearModal3D() {
      modalResult3D = null;
      activeModeIndex = 0;
      spectralResult3D = null;
      if (diagramType === 'modeShape') diagramType = 'deformed';
    },

    get bucklingResult3D() { return bucklingResult3D; },
    setBucklingResult3D(r: BucklingResult3D) {
      this.clearAdvanced();
      bucklingResult3D = r;
      activeBucklingMode = 0;
      diagramType = 'bucklingMode';
    },
    clearBuckling3D() {
      bucklingResult3D = null;
      activeBucklingMode = 0;
      if (diagramType === 'bucklingMode') diagramType = 'deformed';
    },

    get spectralResult3D() { return spectralResult3D; },
    setSpectralResult3D(r: SpectralResult3D) {
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

    setInfluenceLine(il: InfluenceLineResult) {
      influenceLine = il;
      diagramType = 'influenceLine';
      ilAnimating = false;
      ilAnimProgress = 0;
    },

    setResults(r: AnalysisResults, preserveDiagram = false) {
      results = r;
      singleResults = r; // Save base solve for "Cargas simples" option
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
    },

    setCombinationResults(pc: Map<number, AnalysisResults>, pco: Map<number, AnalysisResults>, env: FullEnvelope) {
      perCase = pc;
      perCombo = pco;
      envelope = env;
      activeCaseId = null; // reset individual case selection
      // Default: show "Cargas simples" (all loads ×1) if available
      if (singleResults) {
        results = singleResults;
        activeView = 'single';
      } else {
        results = env.maxAbsResults;
        activeView = 'envelope';
      }
      activeComboId = pco.keys().next().value ?? null;
      // Preserve current diagram type if it's a results-based view
      const resultsDiagrams: DiagramType[] = ['deformed', 'moment', 'shear', 'axial', 'colorMap', 'axialColor'];
      if (!resultsDiagrams.includes(diagramType)) {
        diagramType = 'moment';
      }
      combinationsDirty = false;
    },

    clear() {
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
      movingLoadShowEnvelope = false;
      movingLoadRunning = false;
      movingLoadProgress = null;
      movingLoadAbortController = null;
      // NOTE: stressQuery is NOT cleared here — it represents user intent ("what to inspect").
      // When results disappear, Viewport effects cascade: no results → selectMode='elements' → stressQuery=null.
      // This allows the panel to survive live-calc re-solves where results are only briefly null.
      results3D = null;
      singleResults3D = null;
      perCase3D = new Map();
      perCombo3D = new Map();
      envelope3D = null;
      diagnostics2D = [];
      constraintForces2D = [];
      diagnostics3DArr = [];
      constraintForces3DArr = [];
      solveTimings2D = null;
      solveTimings3D = null;
    },

    // ─── 3D Results ─────────────────────────────────────────────

    get results3D() { return results3D; },

    setResults3D(r: AnalysisResults3D, preserveDiagram = false) {
      results3D = r;
      singleResults3D = r;
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
      envelope3D = null;
      // Extract diagnostics and constraint forces from results
      diagnostics3DArr = [];
      constraintForces3DArr = r.constraintForces ?? [];
      solveTimings3D = r.timings ?? null;
    },

    clear3D() {
      results3D = null;
      singleResults3D = null;
      perCase3D = new Map();
      perCombo3D = new Map();
      envelope3D = null;
      diagnostics3DArr = [];
      constraintForces3DArr = [];
      solveTimings3D = null;
      pdeltaResult3D = null;
      modalResult3D = null;
      bucklingResult3D = null;
      spectralResult3D = null;
      // Reset diagram state so stale deformed/diagrams are removed from scene
      diagramType = 'none';
      animateDeformed = false;
    },

    // 3D combination state
    get perCase3D() { return perCase3D; },
    get perCombo3D() { return perCombo3D; },
    get envelope3D() { return envelope3D; },
    get hasCombinations3D() { return perCombo3D.size > 0; },
    get fullEnvelope3D() { return envelope3D; },

    setCombinationResults3D(pc: Map<number, AnalysisResults3D>, pco: Map<number, AnalysisResults3D>, env: FullEnvelope3D) {
      perCase3D = pc;
      perCombo3D = pco;
      envelope3D = env;
      activeCaseId = null;
      activeComboId = pco.keys().next().value ?? null;
      // Default: show first combination if available (avoids nonsensical
      // all-loads-combined view when contradictory cases exist, e.g. wind ±X)
      if (activeComboId !== null && pco.has(activeComboId)) {
        results3D = pco.get(activeComboId)!;
        activeView = 'combo';
      } else if (singleResults3D) {
        results3D = singleResults3D;
        activeView = 'single';
      } else {
        results3D = env.maxAbsResults3D;
        activeView = 'envelope';
      }
      const valid3DDiagrams: DiagramType[] = ['deformed', 'momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion', 'axialColor', 'colorMap', 'none'];
      if (!valid3DDiagrams.includes(diagramType)) {
        diagramType = 'momentZ';
      }
      combinationsDirty = false;
    },

    /** Switch 3D results based on activeView change (called from activeView setter) */
    _update3DView(v: ResultsView) {
      if (v === 'envelope' && envelope3D) {
        results3D = envelope3D.maxAbsResults3D;
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

    // Solver diagnostics from results objects (assembly + solver)
    get solverDiagnostics(): SolverDiagnostic[] { return results?.solverDiagnostics ?? []; },
    get solverDiagnostics3D(): SolverDiagnostic[] { return results3D?.solverDiagnostics ?? []; },

    get maxDisplacement(): number {
      if (!results) return 0;
      return Math.max(...results.displacements.map(d =>
        Math.sqrt(d.ux ** 2 + d.uy ** 2)
      ));
    },
  };
}

export const resultsStore = createResultsStore();
