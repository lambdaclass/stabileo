/**
 * Hiding and isolating change what the view draws, never what the model holds.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { viewVisibility, visibleElements, visibleNodes, visibleQuads } from '../view-state.svelte';

let cols: number[] = [], beam = 0, slab = 0;

beforeEach(() => {
  modelStore.clear();
  viewVisibility.showAll();
  const b = [modelStore.addNode(0, 0, 0), modelStore.addNode(6, 0, 0)];
  const t = [modelStore.addNode(0, 0, 3), modelStore.addNode(6, 0, 3), modelStore.addNode(6, 4, 3), modelStore.addNode(0, 4, 3)];
  cols = [modelStore.addElement(b[0]!, t[0]!, 'frame'), modelStore.addElement(b[1]!, t[1]!, 'frame')];
  beam = modelStore.addElement(t[0]!, t[1]!, 'frame');
  slab = modelStore.addQuad(t as never, [...modelStore.materials.keys()][0]!, 0.2);
});

describe('view visibility', () => {
  it('with nothing hidden, the model maps themselves', () => {
    expect(visibleElements()).toBe(modelStore.elements);
    expect(visibleNodes()).toBe(modelStore.nodes);
  });

  it('show only the columns: the rest is not drawn, and nothing is deleted', () => {
    viewVisibility.isolate({ nodes: [], elements: cols, shells: [] });
    expect([...visibleElements().keys()]).toEqual(cols);
    expect(visibleQuads().size).toBe(0);
    // The columns' own nodes stay, the slab-only corners go.
    expect(visibleNodes().size).toBe(4);
    expect(modelStore.elements.size).toBe(3);
    expect(modelStore.quads.size).toBe(1);
  });

  it('hiding accumulates, takes the nodes only hidden things use, and show all brings everything back', () => {
    viewVisibility.hide({ nodes: [], elements: [beam], shells: [`q${slab}`] });
    expect(visibleElements().has(beam)).toBe(false);
    expect(visibleQuads().has(slab)).toBe(false);
    // Corners 3 and 4 of the slab carried nothing else.
    expect(visibleNodes().size).toBe(4);
    viewVisibility.hide({ nodes: [], elements: [cols[0]!], shells: [] });
    expect(visibleElements().size).toBe(1);
    viewVisibility.showAll();
    expect(viewVisibility.active).toBe(false);
    expect(visibleElements()).toBe(modelStore.elements);
  });
});
