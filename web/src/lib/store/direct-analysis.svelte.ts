/**
 * The last direct analysis, and whether it still describes the model.
 *
 * It belongs to the model version it was run on: an edit makes it stale, and a stale one is not
 * handed to a design. Kept apart from the linear results, which the deflection checks and every
 * diagram read, because its displacements are those of a structure at 80 % of its stiffness.
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

  get fresh(): boolean {
    return this.result !== null && this.version === modelStore.modelVersion;
  }

  /** The second-order forces per combination, or null when there are none for this model. */
  forces(): Map<number, AnalysisResults3D> | null {
    return this.fresh ? this.result!.perCombo : null;
  }

  async run(): Promise<void> {
    const m = modelStore.model;
    const combos = activeCombinations();
    this.error = null;
    if (combos.length === 0) { this.error = 'noCombinations'; return; }
    this.running = true;
    const version = modelStore.modelVersion;
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
    } catch (err) {
      this.error = (err as Error)?.message ?? String(err);
      this.result = null;
    } finally {
      this.running = false;
    }
  }

  clear() { this.result = null; this.version = -1; this.error = null; }
}

export const directAnalysis = new DirectAnalysisStore();
