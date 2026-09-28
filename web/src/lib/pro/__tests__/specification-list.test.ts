/**
 * Specifications › List is read from the entities, never stored: one row per distinct value of a
 * specification, naming every entity that holds it. And the tab that used to be Constraints opens
 * Specifications at its Links section, so a link or a saved layout that names it still lands.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { specificationRows } from '../specification-list';
import type { StructureModel } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';

const t = (k: string) => k;

function model(over: Partial<StructureModel>): StructureModel {
  return {
    nodes: new Map(), elements: new Map(), supports: new Map(), quads: new Map(), plates: new Map(),
    ...over,
  } as unknown as StructureModel;
}
const el = (id: number, extra: Record<string, unknown> = {}) =>
  [id, { id, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, ...extra }] as const;

describe('specificationRows', () => {
  it('groups members by value, and a plain frame member lists nothing', () => {
    const rows = specificationRows(model({
      elements: new Map([
        el(1), el(2, { behaviour: 'cable' }), el(3, { behaviour: 'cable' }),
        el(4, { type: 'truss' }), el(5, { behaviour: 'tensionOnly' }),
      ]) as never,
    }), t);
    const axial = rows.filter((r) => r.what === 'spec.members.axial');
    expect(axial.map((r) => [r.value, r.ids])).toEqual([
      ['spec.axial.cable', [2, 3]],
      ['spec.axial.truss', [4]],
      ['behaviour.tensionOnly', [5]],
    ]);
    expect(rows.some((r) => r.ids.includes(1))).toBe(false);
  });

  it('names the released components of each end', () => {
    const rows = specificationRows(model({
      elements: new Map([
        el(1, { releaseI: { my: true, mz: true, t: false } }),
        el(2, { releaseI: { my: true, mz: true, t: false }, releaseJ: { my: false, mz: false, t: true } }),
      ]) as never,
    }), t);
    expect(rows.find((r) => r.what === 'spec.members.releases I')).toMatchObject({ value: 'My · Mz', ids: [1, 2] });
    expect(rows.find((r) => r.what === 'spec.members.releases J')).toMatchObject({ value: 'T', ids: [2] });
  });

  it('lists supports that lift and shells by their selection key', () => {
    const rows = specificationRows(model({
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed3d', uplift: true }], [2, { id: 2, nodeId: 2, type: 'fixed3d' }]]) as never,
      quads: new Map([[7, { id: 7, nodes: [1, 2, 3, 4], curved: true }]]) as never,
    }), t);
    expect(rows.find((r) => r.kind === 'support')).toMatchObject({ value: 'spec.list.lifts', ids: [1] });
    expect(rows.find((r) => r.kind === 'shell')).toMatchObject({ ids: [7], shellKeys: ['q7'] });
  });
});

describe('the Specifications tab', () => {
  beforeEach(() => { uiStore.proActiveTab = 'elements'; });

  it('opens at its Links section when asked for the old Constraints tab', () => {
    uiStore.proActiveTab = 'constraints';
    expect(uiStore.proActiveTab).toBe('specifications');
    expect(uiStore.specSection).toBe('links');
  });

  it('points the pointer at what each section edits', () => {
    uiStore.proActiveTab = 'specifications';
    uiStore.specSection = 'supports';
    expect(uiStore.selectMode).toBe('supports');
    uiStore.specSection = 'members';
    expect(uiStore.selectMode).toBe('elements');
  });
});
