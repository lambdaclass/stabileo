import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { modelStore, uiStore } from '../index';
import { viewCategories, HALFTONE_OPACITY } from '../view-categories.svelte';
import { visibleElements, visibleModel, visibleNodes, visibleSupports } from '../view-state.svelte';
import { toneObject } from '../../viewport3d/category-tone';

function frame() {
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3);
  modelStore.addElement(a, b); modelStore.addElement(b, c);
  modelStore.addSupport(a, 'fixed3d' as never);
  modelStore.addNodalLoad3D(c, 0, 0, -10, 0, 0, 0, 1);
}

describe('categories in the PRO view', () => {
  beforeEach(() => { uiStore.analysisMode = 'pro'; viewCategories.reset(); frame(); });

  it('a hidden category leaves what the view offers to select', () => {
    viewCategories.set('members', 'hidden');
    expect(visibleElements().size).toBe(0);
    expect(visibleNodes().size).toBe(3);
    viewCategories.set('loads', 'hidden');
    viewCategories.set('supports', 'hidden');
    const m = visibleModel();
    expect(m.loads).toEqual([]);
    expect(visibleSupports().size).toBe(0);
    expect(modelStore.elements.size).toBe(2);
  });

  it('halftone draws but still offers it', () => {
    viewCategories.set('members', 'halftone');
    expect(visibleElements().size).toBe(2);
    expect(viewCategories.hiddenKey).toBe('');
  });

  it("is PRO's: Basic draws everything whatever PRO chose", () => {
    viewCategories.set('members', 'hidden');
    uiStore.analysisMode = '3d';
    expect(visibleElements().size).toBe(2);
    expect(viewCategories.state('members')).toBe('visible');
  });

  it('a named view keeps the states and the style, and one saved before them shows everything', () => {
    viewCategories.set('shells', 'halftone');
    viewCategories.set('loads', 'hidden');
    expect(viewCategories.snapshot()).toEqual({ shells: 'halftone', loads: 'hidden' });
    const p = { x: 1, y: 2, z: 3 }, tg = { x: 0, y: 0, z: 0 };
    const id = modelStore.saveView('A', p, tg, { camera: 'perspective', labels: { nodes: true, members: false, memberLabel: 'id', lengths: false, shells: false }, categories: viewCategories.snapshot(), style: 'sections' });
    viewCategories.reset();
    viewCategories.restore(modelStore.views.find((v) => v.id === id)!.display!.categories);
    expect(viewCategories.state('shells')).toBe('halftone');
    expect(viewCategories.state('loads')).toBe('hidden');
    expect(modelStore.views.find((v) => v.id === id)!.display!.style).toBe('sections');
    viewCategories.restore(undefined);
    expect(viewCategories.anyChanged).toBe(false);
  });

  it('a view is updated in place with the display of now', () => {
    const p = { x: 1, y: 2, z: 3 }, tg = { x: 0, y: 0, z: 0 };
    const d = { camera: 'perspective' as const, labels: { nodes: true, members: false, memberLabel: 'id', lengths: false, shells: false } };
    const id = modelStore.saveView('A', p, tg, d);
    modelStore.updateView(id, { x: 9, y: 9, z: 9 }, tg, { ...d, categories: { members: 'halftone' }, style: 'physical' });
    const v = modelStore.views.find((x) => x.id === id)!;
    expect(v.name).toBe('A');
    expect(v.position).toEqual({ x: 9, y: 9, z: 9 });
    expect(v.display!.categories).toEqual({ members: 'halftone' });
  });
});

describe('halftone on the drawn objects', () => {
  it('lowers the opacity of every material once, and gives it back', () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ opacity: 0.8 });
    const helper = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ opacity: 0 }));
    helper.userData.pickingHelper = true;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(), mat), helper);
    toneObject(g, 'halftone');
    toneObject(g, 'halftone');
    expect(mat.opacity).toBeCloseTo(0.8 * HALFTONE_OPACITY);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(helper.material.transparent).toBe(false);
    toneObject(g, 'visible');
    expect(mat.opacity).toBeCloseTo(0.8);
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
    toneObject(g, 'hidden');
    expect(g.visible).toBe(false);
  });
});
