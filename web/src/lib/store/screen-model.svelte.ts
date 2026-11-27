import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { plainDeepCopy } from '../utils/plain-deep-copy';
import type { ScreenModel } from './screen-hold.svelte';

const current = $derived.by((): ScreenModel => {
  void modelStore.modelVersion;
  const elements = new Map([...modelStore.elements].map(([id, { nodeI, nodeJ, type, sectionId, materialId }]) =>
    [id, { nodeI, nodeJ, type, sectionId, materialId }]));
  const sections = new Map([...modelStore.sections].map(([id, section]) => [id, plainDeepCopy(section)]));
  const materials = new Map([...modelStore.materials].map(([id, material]) => [id, plainDeepCopy(material)]));
  const space = uiStore.is3DWorkspace;
  const geometry = JSON.stringify([
    uiStore.analysisMode, uiStore.drawPlane2D, [...modelStore.nodes],
    [...modelStore.elements.values()].map(e => [e.id, e.type, e.nodeI, e.nodeJ, e.offset, e.rollAngle, e.localYx, e.localYy, e.localYz]),
    space && [uiStore.viewportPresentation3D, uiStore.axisConvention3D, [...modelStore.plates], [...modelStore.quads],
      [...elements], [...sections], [...materials]],
  ]);
  return { geometry, elements, sections, materials };
});

export const screenModel = () => current;
