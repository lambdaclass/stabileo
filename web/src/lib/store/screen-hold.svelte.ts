import type { AnalysisResults } from './model.svelte';
import type { DiagramType } from './results.svelte';
import type { FullEnvelope } from '../engine/types';
import type { AnalysisResults3D, FullEnvelope3D } from '../engine/types-3d';

export interface ScreenView {
  results: AnalysisResults | null;
  results3D: AnalysisResults3D | null;
  diagram: DiagramType;
  envelopeActive: boolean;
  fullEnvelope: FullEnvelope | null;
  fullEnvelope3D: FullEnvelope3D | null;
  showReactions: boolean;
}

export interface ResultTopology {
  displacements: ReadonlyArray<{ nodeId: number }>;
  elementForces: ReadonlyArray<{ elementId: number }>;
}

type Held = ScreenView & { since: number };

/** A held picture is drawn only on a model that still has every node and member it names. */
export function createScreenHold(live: Readonly<ScreenView>, drawable: (d: DiagramType) => boolean) {
  let hold = $state.raw<Held | null>(null);
  let fits: (r: ResultTopology) => boolean = () => true;

  const isLive = () => live.results !== null || live.results3D !== null;
  const shown = (): Held | null => {
    const h = hold;
    if (!h || isLive()) return null;
    const r = h.results ?? h.results3D;
    return r && fits(r) ? h : null;
  };

  const view = {
    get held() { return shown() !== null; },
    /** When the held picture was taken (performance.now()), 0 with none held. */
    get heldSince() { return shown()?.since ?? 0; },
    get results() { const h = shown(); return h ? h.results : live.results; },
    get results3D() { const h = shown(); return h ? h.results3D : live.results3D; },
    get diagram() { const h = shown(); return h ? h.diagram : live.diagram; },
    get envelopeActive() { const h = shown(); return h ? h.envelopeActive : live.envelopeActive; },
    get fullEnvelope() { const h = shown(); return h ? h.fullEnvelope : live.fullEnvelope; },
    get fullEnvelope3D() { const h = shown(); return h ? h.fullEnvelope3D : live.fullEnvelope3D; },
    get showReactions() { const h = shown(); return h ? h.showReactions : live.showReactions; },
  };

  return {
    view,
    /** With nothing published, keeps the picture an earlier clear held. */
    keep(): void {
      if (!isLive()) return;
      hold = drawable(live.diagram) ? { ...live, since: performance.now() } : null;
    },
    release(): void { hold = null; },
    /** A diagram picked while the re-solve is pending. */
    pick(diagram: DiagramType): void {
      if (!hold) return;
      hold = drawable(diagram) ? { ...hold, diagram } : null;
    },
    setTopologyCheck(fn: (r: ResultTopology) => boolean): void { fits = fn; },
  };
}
