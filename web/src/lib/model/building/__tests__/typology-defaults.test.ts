/**
 * A new PRO model offers IPN 300 in Acero A36 first, then H-30 and two rectangles. A frame placed
 * with a concrete typology must be built in the concrete, not in the first section of the list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { seedProStarterLibrary } from '../../../pro/pro-starter-library';
import { fittingChoice, typologyFamily, sectionFits, familyOfMaterial } from '../typology-defaults';

const lists = () => ({ materials: [...modelStore.materials.values()], sections: [...modelStore.sections.values()] });

describe('the typology proposes its material and section', () => {
  beforeEach(() => { modelStore.clear(); seedProStarterLibrary(); });

  it('a new model starts on the steel default, which does not fit a concrete typology', () => {
    const { materials, sections } = lists();
    expect(materials[0]!.name).toMatch(/A36/);
    expect(sections[0]!.name).toBe('IPN 300');
    expect(familyOfMaterial(materials[0]!)).toBe('steel');
    expect(sectionFits('concrete', sections[0]!)).toBe(false);
  });

  it('concrete columns take H-30 and the 30 × 30; dropped beams the 20 × 50', () => {
    const { materials, sections } = lists();
    const start = { materialId: materials[0]!.id, sectionId: sections[0]!.id };
    const col = fittingChoice(typologyFamily('column', 'concrete')!, 'column', materials, sections, start);
    const beam = fittingChoice(typologyFamily('beam', 'dropped')!, 'beam', materials, sections, start);
    const name = (id: number | null, l: Array<{ id: number; name: string }>) => l.find((x) => x.id === id)?.name;
    expect(name(col.materialId, materials)).toBe('H-30');
    expect(name(col.sectionId, sections)).toMatch(/30x30/);
    expect(name(beam.materialId, materials)).toBe('H-30');
    expect(name(beam.sectionId, sections)).toMatch(/20x50/);
  });

  it('steel keeps the steel default, and a fitting current choice is kept', () => {
    const { materials, sections } = lists();
    const start = { materialId: materials[0]!.id, sectionId: sections[0]!.id };
    expect(fittingChoice('steel', 'column', materials, sections, start)).toEqual(start);
    const r50 = sections.find((s) => /20x50/.test(s.name))!;
    const h30 = materials.find((m) => m.name === 'H-30')!;
    expect(fittingChoice('concrete', 'column', materials, sections, { materialId: h30.id, sectionId: r50.id }).sectionId).toBe(r50.id);
  });
});
