import type { ModelGroup } from '../../store/model.svelte';
import type { GeneratedData } from '../../store/generated-structures';
import { compose, type Affine } from './affine';

/** The generated record has model IDs that must follow edits, unlike opaque group data. */
export function generatedMetadata(group: ModelGroup): GeneratedData | null {
  return group.kind === 'generated' && group.data ? group.data as unknown as GeneratedData : null;
}

export function copyGeneratedMetadata(
  data: GeneratedData, T: Affine, nodes: ReadonlyMap<number, number>,
  elements: ReadonlyMap<number, number>, sections: ReadonlyMap<number, number>, created: ReadonlySet<number>,
): GeneratedData | null {
  // An incomplete fragment cannot safely retain a regenerable record.
  if (data.nodes.some((n) => !nodes.has(n.id))) return null;
  return {
    ...data, transform: compose(T, data.transform),
    nodes: data.nodes.map((n) => { const id = nodes.get(n.id)!; return { id, owned: created.has(id) }; }),
    elements: data.elements.map((e) => {
      if (!e) return null;
      const id = elements.get(e.id);
      if (id === undefined) return null;
      // Both of a variable member's sections, or a regeneration takes its end J for the user's.
      const sectionJ = e.sectionJ !== undefined ? { sectionJ: sections.get(e.sectionJ) ?? e.sectionJ } : {};
      return { ...e, id, sectionId: sections.get(e.sectionId) ?? e.sectionId, ...sectionJ };
    }),
  };
}
