/**
 * The keyboard during a placement: the bar's keys drive it, but a field being typed into
 * elsewhere — the generator's X, rotation or bays during a live preview — gets its keys.
 */
import { describe, it, expect } from 'vitest';
import { placementKeyAction } from '../placement-keys';

describe('a key during a placement', () => {
  it('reaches a field outside the bar: digits, Backspace, r, f, Tab, Enter', () => {
    for (const key of ['3', '0', 'Backspace', '.', 'r', 'f', 'Tab', 'Enter']) {
      expect(placementKeyAction({ key }, 'otherField'), key).toBe('pass');
    }
    expect(placementKeyAction({ key: 'Escape' }, 'otherField')).toBe('cancel');
  });

  it('drives the placement anywhere else, and holds other shortcuts', () => {
    expect(placementKeyAction({ key: 'r' }, 'none')).toBe('rotate');
    expect(placementKeyAction({ key: 'f' }, 'none')).toBe('mirror');
    expect(placementKeyAction({ key: 'Tab' }, 'none')).toBe('cycleAnchor');
    expect(placementKeyAction({ key: 'Enter' }, 'none')).toBe('commit');
    expect(placementKeyAction({ key: 'Enter' }, 'hudField')).toBe('commitAt');
    expect(placementKeyAction({ key: '5' }, 'hudField')).toBe('pass');
    expect(placementKeyAction({ key: 'w' }, 'none')).toBe('pass');
    expect(placementKeyAction({ key: 'z', ctrlKey: true }, 'none')).toBe('hold');
  });
});

describe('the weld preview', () => {
  it('is computed once per revision, however many readers ask', async () => {
    const { placementStore } = await import('../placement.svelte');
    placementStore.start({
      fragment: { nodes: [{ id: 1, x: 0, y: 0, z: 0 }], elements: [], quads: [], plates: [], supports: [], loads: [], groups: [], materials: [], sections: [], loadCases: [] } as never,
      label: 'x', anchors: [[0, 0, 0]], anchorIndex: 0, rotation: 0,
    } as never);
    const a = placementStore.mergePreview();
    expect(placementStore.mergePreview()).toBe(a);
    placementStore.rotate(90);
    expect(placementStore.mergePreview()).not.toBe(a);
    placementStore.cancel();
  });
});
