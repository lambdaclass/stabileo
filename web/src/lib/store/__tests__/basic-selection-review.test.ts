/**
 * What a selection holds after Basic's table rows, deletions, undo and the
 * walk: only what the reader picked, and nothing that no longer exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '..';
import { frameRow } from '../../actions/table-row-select';
import { deleteSelection } from '../../actions/delete-selection';
import { editingKind, pruneStaleSelection } from '../selection-prune';
import { selectWalkItem } from '../../actions/selection-walk';

let n1 = 0, n2 = 0, beam = 0, sup = 0, udl = 0;

beforeEach(() => {
  modelStore.clear();
  uiStore.clearSelection();
  n1 = modelStore.addNode(0, 0);
  n2 = modelStore.addNode(6, 0);
  beam = modelStore.addElement(n1, n2, 'frame');
  sup = modelStore.addSupport(n1, 'pinned');
  udl = modelStore.addDistributedLoad(beam, -10);
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

/** A double click on a table row, away from its controls. */
const dbl = () => ({ target: null, shiftKey: false, ctrlKey: false, metaKey: false }) as unknown as MouseEvent;

describe('a double click on a support or load row', () => {
  it('frames the support alone, and Delete then takes only the support', () => {
    const framed = vi.fn();
    window.addEventListener('stabileo-zoom-to-selection', framed);
    frameRow(dbl(), 'support', sup);
    expect(framed).toHaveBeenCalledOnce();
    expect([...uiStore.selectedSupports]).toEqual([sup]);
    expect(uiStore.selectedNodes.size).toBe(0);
    deleteSelection();
    expect(modelStore.supports.has(sup)).toBe(false);
    expect(modelStore.nodes.has(n1)).toBe(true);
    expect(modelStore.elements.has(beam)).toBe(true);
  });

  it('frames the load alone, and Delete then takes only the load', () => {
    frameRow(dbl(), 'load', udl);
    expect([...uiStore.selectedLoads]).toEqual([udl]);
    expect(uiStore.selectedElements.size).toBe(0);
    deleteSelection();
    expect(modelStore.loads.some((l) => l.data.id === udl)).toBe(false);
    expect(modelStore.elements.has(beam)).toBe(true);
    expect(modelStore.nodes.size).toBe(2);
  });
});

describe('a selected support or load that goes away', () => {
  it('deleted from its table: the bar stops editing it, and the selection lets it go', () => {
    uiStore.selectSupport(sup);
    expect(editingKind()).toBe('support');
    modelStore.removeSupport(sup);
    expect(editingKind()).toBeNull();
    pruneStaleSelection();
    expect(uiStore.selectedSupports.size).toBe(0);
  });

  it('undone: the support the undo took is no longer selected', () => {
    historyStore.clear();
    const n3 = modelStore.addNode(3, 0);
    const s2 = modelStore.addSupport(n3, 'fixed');
    uiStore.selectSupport(s2);
    historyStore.undo();
    expect(modelStore.supports.has(s2)).toBe(false);
    expect(uiStore.selectedSupports.has(s2)).toBe(false);
    expect(editingKind()).toBeNull();
  });

  it('a load deleted while selected: neither "edit load" nor a ghost in the selection', () => {
    uiStore.selectLoad(udl);
    expect(editingKind()).toBe('load');
    modelStore.removeLoad(udl);
    expect(editingKind()).toBeNull();
    pruneStaleSelection();
    expect(uiStore.selectedLoads.size).toBe(0);
  });
});

describe('the walk through a mixed selection', () => {
  it('selects exactly one item of one kind at each step', () => {
    uiStore.selectedSupports = new Set([sup]);
    uiStore.selectedLoads = new Set([udl]);
    selectWalkItem('elements', beam);
    expect([...uiStore.selectedElements]).toEqual([beam]);
    expect(uiStore.selectedSupports.size).toBe(0);
    expect(uiStore.selectedLoads.size).toBe(0);
    selectWalkItem('loads', udl);
    expect([...uiStore.selectedLoads]).toEqual([udl]);
    expect(uiStore.selectedElements.size + uiStore.selectedNodes.size + uiStore.selectedSupports.size).toBe(0);
    // Wrapping from the last load back to the first member drops the load.
    selectWalkItem('elements', beam);
    expect(uiStore.selectedLoads.size).toBe(0);
    selectWalkItem('nodes', n2);
    expect([...uiStore.selectedNodes]).toEqual([n2]);
    expect(uiStore.selectedElements.size).toBe(0);
  });
});

describe('Select all and Invert with something hidden', () => {
  it('take only what the view shows', async () => {
    const { viewVisibility, visibleModel } = await import('../view-state.svelte');
    const { selectAll, invertSelection } = await import('../../model/select-ops');
    const n3 = modelStore.addNode(12, 0);
    const other = modelStore.addElement(n2, n3, 'frame');
    const s3 = modelStore.addSupport(n3, 'rollerX');
    const onOther = modelStore.addDistributedLoad(other, -5);
    viewVisibility.hide({ nodes: [], elements: [other], shells: [] });
    try {
      const kinds = new Set(['elements', 'nodes', 'supports', 'loads']);
      const all = selectAll(visibleModel() as never, kinds);
      expect([...all.elements]).toEqual([beam]);
      expect(all.nodes.has(n3)).toBe(false);
      expect([...all.supports!]).toEqual([sup]);
      expect([...all.loads!]).toEqual([udl]);
      const inv = invertSelection(visibleModel() as never, kinds, { nodes: new Set(), elements: new Set([beam]), shells: new Set() });
      expect(inv.elements.size).toBe(0);
      expect(inv.supports!.has(s3)).toBe(false);
      expect(inv.loads!.has(onOther)).toBe(false);
    } finally {
      viewVisibility.showAll();
    }
  });
});

describe('2D zoom to fit', () => {
  it('fills the width with a horizontal beam, as it did before the zoom range grew', () => {
    uiStore.zoomToFit([{ x: 0, y: 0 }, { x: 20, y: 0 }], 1600, 900);
    // (1600 − 2·120) / 20 = 68 px/m, not the 33 px/m of a 20 × 20 m square.
    expect(uiStore.zoom).toBeCloseTo(68);
    uiStore.zoomToFit([{ x: 0, y: 0 }, { x: 0, y: 6 }], 1600, 900);
    expect(uiStore.zoom).toBeCloseTo(110);
    // A part a few centimetres long still fills the width.
    uiStore.zoomToFit([{ x: 0, y: 0 }, { x: 0.05, y: 0 }], 1600, 900);
    expect(uiStore.zoom).toBeCloseTo(27_200);
  });
  it('keeps a usable scale on a canvas smaller than its margins', () => {
    // A phone in landscape: 640 × 220, less than the 240 px margin tall.
    uiStore.zoomToFit([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 }], 640, 220);
    expect(uiStore.zoom).toBeGreaterThan(20);
    const s = uiStore.worldToScreen(6, 3);
    expect(s.x).toBeLessThanOrEqual(640);
    expect(s.y).toBeGreaterThanOrEqual(0);
  });
});
