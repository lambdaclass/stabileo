import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { plainDeepCopy } from '../utils/plain-deep-copy';
import type { ScreenModel } from './screen-hold.svelte';

const current = $derived.by((): ScreenModel => {
  void modelStore.modelVersion;
  const nodes = new Map([...modelStore.nodes].map(([id, node]) => [id, { ...node }]));
  const elements = new Map([...modelStore.elements].map(([id, e]) => [id, {
    id, type: e.type, nodeI: e.nodeI, nodeJ: e.nodeJ, materialId: e.materialId, sectionId: e.sectionId,
    releaseI: { ...e.releaseI }, releaseJ: { ...e.releaseJ },
  }]));
  const loads = plainDeepCopy(modelStore.loads);
  const sections = new Map([...modelStore.sections].map(([id, section]) => [id, plainDeepCopy(section)]));
  const materials = new Map([...modelStore.materials].map(([id, material]) => [id, plainDeepCopy(material)]));
  const space = uiStore.is3DWorkspace;
  const geometry = JSON.stringify([
    uiStore.analysisMode, uiStore.drawPlane2D, [...nodes], [...modelStore.supports],
    [...modelStore.elements.values()].map(e => [e.id, e.type, e.nodeI, e.nodeJ, e.offset, e.rollAngle, e.localYx, e.localYy, e.localYz]),
    space && [uiStore.viewportPresentation3D, uiStore.axisConvention3D, [...modelStore.plates], [...modelStore.quads],
      [...elements], [...sections], [...materials], loads],
  ]);
  return { geometry, nodes, elements, sections, materials, loads };
});

export const screenModel = () => current;
