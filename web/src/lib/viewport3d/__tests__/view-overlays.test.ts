/**
 * The view's overlays and colours: constraints drawn between their nodes, I/J marks per member,
 * notes at their points, members coloured by category; and a saved view keeping its display in
 * the model code.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';

// The text sprites need a canvas; stubbed as the other scene tests do.
const canvasStub = {
  width: 0, height: 0,
  getContext: () => ({ fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle', fillText: () => {}, measureText: () => ({ width: 10 }) }),
};
if (typeof document === 'undefined') Object.defineProperty(globalThis, 'document', { value: { createElement: () => canvasStub }, configurable: true });
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { viewState } from '../../store/view-state.svelte';
import { buildViewOverlays } from '../view-overlays';
import { colourCategory, categoryHex, firstGroupIndex } from '../../viewport/element-colour';
import { addNote } from '../../model/annotations';
import { modelToCode, codeToModel } from '../../model/code/format';

beforeEach(() => { modelStore.clear(); viewState.showConstraints = false; viewState.showMemberEnds = false; viewState.labelsOnSelection = false; });

describe('overlays', () => {
  it('a diaphragm is a line from the master to each slave; ends are marked; notes are drawn', () => {
    const m = modelStore.addNode(0, 0, 3), a = modelStore.addNode(4, 0, 3), b = modelStore.addNode(0, 4, 3), c = modelStore.addNode(4, 4, 3);
    modelStore.addElement(a, c, 'frame');
    modelStore.model.constraints = [{ type: 'diaphragm', masterNode: m, slaveNodes: [a, b, c] } as never];
    modelStore.setNotes(addNote([], { x: 1, y: 1, z: 3 }, 'junta'));
    expect(buildViewOverlays(false)!.children.filter((o) => o.userData.note)).toHaveLength(1);

    viewState.showConstraints = true;
    viewState.showMemberEnds = true;
    const g = buildViewOverlays(false)!;
    const lines = g.children.find((o) => o.userData.constraintKind === 'diaphragm') as THREE.LineSegments;
    expect(lines.geometry.getAttribute('position').count).toBe(6);
    expect(g.children.filter((o) => o.userData.memberEnd)).toHaveLength(2);
  });

  it('nothing to draw is no group', () => {
    expect(buildViewOverlays(false)).toBeNull();
  });
});

describe('colours by category', () => {
  it('by section, material or group; uniform is none', () => {
    const e = { id: 7, materialId: 2, sectionId: 3 };
    expect(colourCategory(e, 'bySection')).toBe(3);
    expect(colourCategory(e, 'byMaterial')).toBe(2);
    expect(colourCategory(e, 'uniform')).toBeNull();
    const idx = firstGroupIndex([{ id: 4, members: { elements: [7] } }, { id: 5, members: { elements: [7, 8] } }]);
    expect(colourCategory(e, 'byGroup', (id) => idx.get(id))).toBe(4);
    expect(categoryHex(1)).toBe(0x7fd4cc);
    expect(categoryHex(9)).toBe(categoryHex(1));
  });
});

describe('saved views', () => {
  it('keep projection, zoom, hidden members, labels and colours in the model code', () => {
    modelStore.saveView('Norte', { x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0 }, {
      camera: 'orthographic', orthoZoom: 2.5, hidden: { elements: [3], shells: ['q1'] },
      labels: { nodes: true, members: false, memberLabel: 'section', lengths: false, shells: true }, colourBy: 'bySection',
    });
    const back = codeToModel(modelToCode(modelStore.snapshot() as never));
    expect(back.errors).toEqual([]);
    expect((back.snapshot as { views?: unknown[] }).views).toEqual(modelStore.views);
  });
});
