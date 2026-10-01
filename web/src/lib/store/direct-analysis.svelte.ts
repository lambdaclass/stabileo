/**
 * The last direct analysis, and whether it still describes the model.
 *
 * It belongs to the model, active combinations and settings it was run on. Changes make it
 * stale; incomplete or stale results cannot feed design. Kept apart from the linear results,
 * which the deflection checks and every diagram read, because its displacements are those
 * of a structure at 80 % of its stiffness.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { activeCombinations } from './active-results';
import {
  runDirectAnalysis, workerPDelta, DEFAULT_DIRECT_SETTINGS,
  type DirectAnalysisResult, type DirectAnalysisSettings,
} from '../engine/direct-analysis';
import { pdelta3DInWorker } from '../engine/solver-pool';
import type { AnalysisResults3D } from '../engine/types-3d';

class DirectAnalysisStore {
  result = $state<DirectAnalysisResult | null>(null);
  version = $state(-1);
  running = $state(false);
  error = $state<string | null>(null);
  settings = $state<DirectAnalysisSettings>({ ...DEFAULT_DIRECT_SETTINGS });
  private solvedInputs = $state<string | null>(null);

  private inputs(): string {
    return JSON.stringify([
      modelStore.modelVersion, uiStore.includeSelfWeight, uiStore.axisConvention3D,
      activeCombinations(), this.settings,
    ]);
  }

  get fresh(): boolean {
    return !this.running && this.result !== null && this.solvedInputs === this.inputs();
  }

  get designReady(): boolean {
    if (!this.fresh) return false;
    const combos = activeCombinations();
    return combos.length > 0 && combos.every(({ id }) => {
      const info = this.result!.info.get(id);
      return info?.stable === true && info.converged && this.result!.perCombo.has(id);
    });
  }

  /** The second-order forces per combination, or null when there are none for this model. */
  forces(): Map<number, AnalysisResults3D> | null {
    return this.designReady ? this.result!.perCombo : null;
  }

  async run(): Promise<void> {
    if (this.running) return;
    const m = modelStore.model;
    const combos = activeCombinations();
    this.error = null;
    this.result = null;
    this.solvedInputs = null;
    if (combos.length === 0) { this.error = 'noCombinations'; return; }
    this.running = true;
    const version = modelStore.modelVersion;
    const inputs = this.inputs();
    try {
      const r = await runDirectAnalysis(
        {
          nodes: m.nodes, elements: m.elements, supports: m.supports, loads: m.loads,
          materials: m.materials, sections: m.sections, plates: m.plates, quads: m.quads,
          constraints: m.constraints, connectors: m.connectors,
          // The project's rules, as Solve reads them: self-weight as stated, shear deformation, groups.
          analysis: m.analysis, groups: m.groups,
        } as never,
        m.loadCases, combos,
        {
          includeSelfWeight: uiStore.includeSelfWeight,
          leftHand: uiStore.axisConvention3D === 'leftHand',
          settings: $state.snapshot(this.settings) as DirectAnalysisSettings,
          run: workerPDelta(pdelta3DInWorker),
        },
      );
      if (typeof r === 'string') { this.error = r; this.result = null; return; }
      this.result = r;
      this.version = version;
      this.solvedInputs = inputs;
    } catch (err) {
      this.error = (err as Error)?.message ?? String(err);
      this.result = null;
    } finally {
      this.running = false;
    }
  }

  clear() { this.result = null; this.version = -1; this.solvedInputs = null; this.error = null; }
  /** A new project: the default settings and no run. */
  reset() { this.clear(); this.settings = { ...DEFAULT_DIRECT_SETTINGS }; }
}

export const directAnalysis = new DirectAnalysisStore();
