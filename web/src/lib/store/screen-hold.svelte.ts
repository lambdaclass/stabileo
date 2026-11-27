import type { AnalysisResults, Element, Section, Material, Node } from './model.svelte';
import type { DiagramType } from './results.svelte';
import type { FullEnvelope } from '../engine/types';
import type { AnalysisResults3D, FullEnvelope3D } from '../engine/types-3d';

export interface ScreenView {
  results: AnalysisResults | null;
  results3D: AnalysisResults3D | null;
  diagram: DiagramType;
  envelopeActive: boolean;
  envelope2D: FullEnvelope | null;
  envelope3D: FullEnvelope3D | null;
  showReactions: boolean;
}

export interface ScreenModel {
  geometry: string;
  nodes: ReadonlyMap<number, Node>;
  elements: ReadonlyMap<number, Pick<Element, 'nodeI' | 'nodeJ' | 'type' | 'materialId' | 'sectionId'>>;
  sections: ReadonlyMap<number, Section>;
  materials: ReadonlyMap<number, Material>;
}

type Held = ScreenView & { model: ScreenModel };

export function createScreenHold(live: Readonly<ScreenView>, drawable: (d: DiagramType) => boolean) {
  let hold = $state.raw<Held | null>(null);
  let readModel: (() => ScreenModel) | undefined;
  const models = new WeakMap<object, ScreenModel>();

  const isLive = () => live.results !== null || live.results3D !== null;
  const held = $derived.by((): Held | null => {
    const h = hold;
    if (!h || isLive()) return null;
    return h.model.geometry === readModel?.().geometry ? h : null;
  });

  const view = {
    get model() { return held?.model; },
    get held() { return held !== null; },
    get results() { const h = held; return h ? h.results : live.results; },
    get results3D() { const h = held; return h ? h.results3D : live.results3D; },
    get diagram() { const h = held; return h ? h.diagram : live.diagram; },
    get envelopeActive() { const h = held; return h ? h.envelopeActive : live.envelopeActive; },
    get envelope2D() { const h = held; return h ? h.envelope2D : live.envelope2D; },
    get envelope3D() { const h = held; return h ? h.envelope3D : live.envelope3D; },
    get showReactions() { const h = held; return h ? h.showReactions : live.showReactions; },
  };

  return {
    view,
    /** With nothing published, keeps the picture an earlier clear held. */
    keep(): void {
      if (!isLive()) return;
      const result = live.results ?? live.results3D;
      const model = result && models.get(result);
      hold = model && drawable(live.diagram) ? { ...live, model } : null;
    },
    release(): void { hold = null; },
    /** A diagram picked while the re-solve is pending. */
    pick(diagram: DiagramType): void {
      if (!hold) return;
      hold = drawable(diagram) ? { ...hold, diagram } : null;
    },
    setModelReader(reader: () => ScreenModel): void { readModel = reader; },
    published(results: Iterable<AnalysisResults | AnalysisResults3D | undefined>): void {
      hold = null;
      const model = readModel?.();
      if (model) for (const result of results) if (result) models.set(result, model);
    },
  };
}
