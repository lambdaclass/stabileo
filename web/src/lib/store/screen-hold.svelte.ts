import type { AnalysisResults, Element, Section, Material, Node, StructureModel } from './model.svelte';
import type { AnalysisSettings } from '../engine/analysis-settings';
import type { DiagramType } from './results.svelte';
import type { BucklingResult } from '../engine/result-types';
import type { PlaneLoadView } from './displayed-loads-2d';
import type { Displacement, FullEnvelope } from '../engine/types';
import type { AnalysisResults3D, FullEnvelope3D, Displacement3D } from '../engine/types-3d';

export interface ScreenView {
  planarMode: { displacements: Displacement[]; result: BucklingResult | null } | null;
  planeLoadView: PlaneLoadView;
  results: AnalysisResults | null;
  results3D: AnalysisResults3D | null;
  diagram: DiagramType;
  envelopeActive: boolean;
  fullEnvelope: FullEnvelope | null;
  fullEnvelope3D: FullEnvelope3D | null;
  showReactions: boolean;
  overlayResults3D: AnalysisResults3D | null;
  overlayLabel: string;
  modeDisplacements: Displacement3D[] | null;
}

export interface ResultTopology {
  displacements: ReadonlyArray<{ nodeId: number }>;
  elementForces: ReadonlyArray<{ elementId: number }>;
}

export interface ScreenModelSnapshot extends Pick<StructureModel, 'loads' | 'supports' | 'groups' | 'loadCases' | 'combinations' | 'plates' | 'quads'> {
  includeSelfWeight: boolean;
  planeAnalysis: StructureModel['analysis'];
  fits(results: ResultTopology): boolean;
  nodes: Map<number, Node>;
  analysis: AnalysisSettings;
  elements: Map<number, Element>;
  sections: Map<number, Section>;
  materials: Map<number, Material>;
}

type Held = ScreenView & { since: number; topology: ResultTopology };

/** A held picture is drawn only on a model that still has every node and member it names. */
export function createScreenHold(live: Readonly<ScreenView>, drawable: (d: DiagramType, view: ScreenView) => boolean) {
  let hold = $state.raw<Held | null>(null);
  let capture: (() => ScreenModelSnapshot) | undefined;
  let published: ScreenModelSnapshot | undefined;

  const isLive = () => live.results !== null || live.results3D !== null || live.modeDisplacements !== null || live.planarMode !== null;
  const shown = (): Held | null => {
    const h = hold;
    if (!h || isLive()) return null;
    return published?.fits(h.topology) ? h : null;
  };

  const view = {
    get model() { return shown() ? published : undefined; },
    get held() { return shown() !== null; },
    /** When the held picture was taken (performance.now()), 0 with none held. */
    get heldSince() { return shown()?.since ?? 0; },
    get results() { const h = shown(); return h ? h.results : live.results; },
    get results3D() { const h = shown(); return h ? h.results3D : live.results3D; },
    get diagram() { const h = shown(); return h ? h.diagram : live.diagram; },
    get envelopeActive() { const h = shown(); return h ? h.envelopeActive : live.envelopeActive; },
    get fullEnvelope() { const h = shown(); return h ? h.fullEnvelope : live.fullEnvelope; },
    get fullEnvelope3D() { const h = shown(); return h ? h.fullEnvelope3D : live.fullEnvelope3D; },
    get overlayResults3D() { return (shown() ?? live).overlayResults3D; },
    get overlayLabel() { return (shown() ?? live).overlayLabel; },
    get planarMode() { return (shown() ?? live).planarMode; },
    get planeLoadView() { return (shown() ?? live).planeLoadView; },
    get modeDisplacements() { return (shown() ?? live).modeDisplacements; },
    get showReactions() { const h = shown(); return h ? h.showReactions : live.showReactions; },
  };

  return {
    view,
    /** With nothing published, keeps the picture an earlier clear held. */
    keep(): void {
      if (!isLive()) return;
      const view = { ...live };
      const topology = view.results ?? view.results3D ?? { displacements: view.modeDisplacements ?? [], elementForces: [] };
      const visible = view.planarMode || view.modeDisplacements || drawable(view.diagram, view) || (view.diagram === 'none' && view.showReactions);
      hold = visible ? { ...view, topology, since: performance.now() } : null;
    },
    release(): void { hold = null; },
    /** A diagram picked while the re-solve is pending. */
    pick(diagram: DiagramType): void {
      if (!hold || hold.diagram === diagram) return;
      hold = drawable(diagram, hold) || (diagram === 'none' && hold.showReactions) ? { ...hold, diagram, planarMode: null, modeDisplacements: null } : null;
    },
    setModelCapture(fn: () => ScreenModelSnapshot): void { capture = fn; },
    publish(): void { hold = null; published = capture?.(); },
  };
}
