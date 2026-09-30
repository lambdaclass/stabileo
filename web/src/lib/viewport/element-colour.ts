/**
 * Members coloured by what they are made of or belong to: their section, their material or their
 * group, from one palette, for the 2D canvas and the 3D scene alike. Uniform returns null, and
 * each viewport keeps its own type colours (frame, truss).
 */
export const ELEMENT_PALETTE = [
  '#7fd4cc', '#e9c46a', '#e76f51', '#2a9d8f',
  '#f4a261', '#264653', '#a8dadc', '#e63946',
] as const;

export type ElementColorMode = 'uniform' | 'byMaterial' | 'bySection' | 'byGroup';

/** The category a member falls in under `mode`, or null (uniform, or no group). */
export function colourCategory(
  elem: { id: number; materialId: number; sectionId: number },
  mode: ElementColorMode | string,
  groupOf?: (elementId: number) => number | undefined,
): number | null {
  if (mode === 'byMaterial') return elem.materialId;
  if (mode === 'bySection') return elem.sectionId;
  if (mode === 'byGroup') return groupOf?.(elem.id) ?? null;
  return null;
}

/** The palette colour of a category, as CSS. */
export function categoryCss(category: number): string {
  return ELEMENT_PALETTE[(((category - 1) % ELEMENT_PALETTE.length) + ELEMENT_PALETTE.length) % ELEMENT_PALETTE.length]!;
}

/** The same, as a 0xRRGGBB number for the 3D scene. */
export function categoryHex(category: number): number {
  return parseInt(categoryCss(category).slice(1), 16);
}

/** Each member's first group, for `byGroup`. */
export function firstGroupIndex(groups: Iterable<{ id: number; members: { elements?: number[] } }>): Map<number, number> {
  const out = new Map<number, number>();
  for (const g of groups) for (const id of g.members.elements ?? []) if (!out.has(id)) out.set(id, g.id);
  return out;
}
