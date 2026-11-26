import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { planDraw } from '../plan-draw.svelte';
import { familyOfMaterial } from '../../model/building/typology-defaults';

beforeEach(() => {
  planDraw.stop();
  modelStore.clear(); historyStore.clear();
  modelStore.setGrid({ axes: [], levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }] });
  uiStore.nodeCreateZ = 0;
});

describe('drawing on the plan', () => {
  it('builds a steel column in steel, a concrete one in concrete', () => {
    const steel = [...modelStore.materials.values()].find((m) => familyOfMaterial(m) === 'steel')
      ?? modelStore.materials.get(modelStore.addMaterial({ name: 'S275', e: 210000, nu: 0.3, rho: 78.5, fy: 275 } as never))!;
    if (![...modelStore.materials.values()].some((m) => familyOfMaterial(m) === 'concrete')) modelStore.addMaterial({ name: 'H-30', e: 30000, nu: 0.2, rho: 25, fc: 30 } as never);
    planDraw.start('column');
    planDraw.setMode('point');
    planDraw.column.typology = 'steel';
    planDraw.add({ x: 0, y: 0 });
    planDraw.column.typology = 'concrete';
    planDraw.add({ x: 5, y: 0 });
    const fam = [...modelStore.elements.values()].map((e) => familyOfMaterial(modelStore.materials.get(e.materialId)!));
    expect(fam).toEqual(['steel', 'concrete']);
    expect(steel).toBeDefined();
  });

  it('drops what was half drawn when the way of drawing changes', () => {
    planDraw.start('column');
    planDraw.setMode('corners');
    planDraw.add({ x: 0, y: 0 });
    expect(planDraw.points).toHaveLength(1);
    planDraw.setMode('point');
    expect(planDraw.points).toHaveLength(0);
    planDraw.add({ x: 2, y: 2 });
    const n = [...modelStore.nodes.values()].find((p) => (p.z ?? 0) === 0)!;
    expect([n.x, n.y]).toEqual([2, 2]);
  });

  it('squares a line with Shift, but not the two corners of a column', () => {
    planDraw.start('column');
    planDraw.setMode('corners');
    planDraw.ortho = true;
    planDraw.add({ x: 0, y: 0 });
    planDraw.add({ x: 0.4, y: 0.3 });
    expect(modelStore.elements.size).toBe(1);
    planDraw.start('beam');
    uiStore.nodeCreateZ = 3;
    planDraw.ortho = true;
    planDraw.add({ x: 0, y: 0 });
    planDraw.hover = { x: 4, y: 0.2 };
    expect(planDraw.hover).toEqual({ x: 4, y: 0 });
  });

  it('does not chain from a beam that was refused', () => {
    uiStore.nodeCreateZ = 3;
    planDraw.start('beam');
    planDraw.add({ x: 0, y: 0 });
    planDraw.add({ x: 0.01, y: 0 });
    expect(planDraw.points).toHaveLength(0);
  });

  it('stopping gives back the view it found', () => {
    uiStore.renderMode3D = 'wireframe';
    planDraw.start('beam');
    expect(uiStore.renderMode3D).toBe('sections');
    planDraw.stop();
    expect(uiStore.renderMode3D).toBe('wireframe');
  });
});
