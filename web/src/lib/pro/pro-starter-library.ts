/**
 * What a new PRO model offers before anything is drawn: beside the steel default (Acero A36,
 * IPN 300), concrete H-30 and two rectangular sections, 30 × 30 and 20 × 50, so the most common
 * columns and beams are a pick in the section and material lists rather than a trip to the
 * catalogue. The steel default stays the one a member takes until something else is chosen.
 *
 * Only an untouched model is given them: one with no geometry and only the default section and
 * material. A project opened, an example or a model brought from Basic keeps what it has.
 */
import { modelStore } from '../store/model.svelte';
import { getMaterialPresets } from '../data/material-presets';
import { toMaterialFields } from '../material/material-choice';
import { computeSectionProperties, generateSectionName } from '../data/section-shapes';
import type { Section } from '../store/model.svelte';

/** Width × depth, m. */
export const STARTER_RECT_SECTIONS: ReadonlyArray<readonly [number, number]> = [[0.3, 0.3], [0.2, 0.5]];

function untouched(): boolean {
  return modelStore.nodes.size === 0 && modelStore.elements.size === 0
    && modelStore.model.quads.size === 0 && modelStore.model.plates.size === 0
    && modelStore.sections.size === 1 && modelStore.materials.size === 1;
}

/** Add the starter materials and sections to an untouched model; whether it did. */
export function seedProStarterLibrary(): boolean {
  if (!untouched()) return false;
  const h30 = getMaterialPresets().find((p) => p.name === 'H-30' && p.category === 'hormigon');
  modelStore.batch(() => {
    if (h30) modelStore.addMaterial(toMaterialFields({ kind: 'preset', preset: h30 }) as never);
    for (const [b, h] of STARTER_RECT_SECTIONS) {
      const props = computeSectionProperties('rect', { b, h });
      if (props) modelStore.addSection({ ...props, name: generateSectionName('rect', { b, h }) } as Omit<Section, 'id'>);
    }
  });
  return true;
}
