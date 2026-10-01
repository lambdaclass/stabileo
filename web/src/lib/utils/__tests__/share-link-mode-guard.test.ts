/**
 * `analysisMode` is typed as a union, which says nothing about a value that
 * came from a link, a `.ded`, an autosave or a tab. Every reader compares it
 * with `===`, so a string outside the union leaves the app in none of its four
 * modes. The store is the one place every path goes through, so it refuses
 * there; the share loaders additionally accept only what a link is written
 * with, and the axis-convention note is decided from the mode the model was
 * actually loaded in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LZString from 'lz-string';
import { loadFromURLHash } from '../url-sharing';
import { encodeCode, CODE_HASH } from '../../model/code/share';
import { modelToCode } from '../../model/code/format';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';

beforeEach(() => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('location', { hash: '', pathname: '/', search: '' });
  vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
  uiStore.analysisMode = '2d';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  modelStore.clear();
  uiStore.analysisMode = '2d';
});

describe('the store refuses a mode outside its union', () => {
  it.each(['banana', 'PRO', '', null, undefined, 3])('keeps the current mode when handed %j', value => {
    uiStore.analysisMode = 'pro';
    uiStore.analysisMode = value as never;
    expect(uiStore.analysisMode).toBe('pro');
  });

  it('still switches between the four modes', () => {
    for (const mode of ['3d', 'edu', 'pro', '2d'] as const) {
      uiStore.analysisMode = mode;
      expect(uiStore.analysisMode).toBe(mode);
    }
  });
});

describe('a PRO code link', () => {
  const codeLink = (mode: string) => {
    const code = modelToCode({
      name: 'code', analysisMode: '3d',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]],
      materials: [], sections: [], elements: [], supports: [], loads: [],
      nextId: { node: 3, material: 1, section: 1, element: 1, support: 1, load: 1 },
    } as never).replace(/^mode .*$/m, `mode ${mode}`);
    expect(code).toContain(`mode ${mode}`);
    return CODE_HASH + encodeCode(code);
  };

  it('does not put the app in a mode it does not have', () => {
    location.hash = codeLink('banana');
    loadFromURLHash();
    expect(uiStore.analysisMode).toBe('2d');
  });

  it('still switches to the mode it was written in', () => {
    location.hash = codeLink('pro');
    expect(loadFromURLHash()).toBe('data');
    expect(uiStore.analysisMode).toBe('pro');
  });
});

describe('the axis-convention note on a legacy 3D link', () => {
  const legacy3D = (analysisMode: string) => LZString.compressToEncodedURIComponent(JSON.stringify({
    name: 'legacy', analysisMode,
    nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]],
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3 }]],
    sections: [[1, { id: 1, name: 's', a: 0.01, iz: 0.001 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [], loads: [],
    nextId: { node: 3, material: 2, section: 2, element: 2, support: 1, load: 1 },
  }));

  it('follows the mode the model was loaded in, not the one the link claimed', () => {
    // 'PRO' is refused, so the model opens in the current 2D mode: no 3D note.
    const toast = vi.spyOn(uiStore, 'toast');
    location.hash = '#data=' + legacy3D('PRO');
    expect(loadFromURLHash()).toBe('data');
    expect(uiStore.analysisMode).toBe('2d');
    expect(toast).not.toHaveBeenCalled();
  });

  it('is still shown when the link opens in a 3D mode', () => {
    const toast = vi.spyOn(uiStore, 'toast');
    location.hash = '#data=' + legacy3D('pro');
    expect(loadFromURLHash()).toBe('data');
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('is shown when the app is already 3D and the link says nothing valid', () => {
    uiStore.analysisMode = '3d';
    const toast = vi.spyOn(uiStore, 'toast');
    location.hash = '#data=' + legacy3D('PRO');
    expect(loadFromURLHash()).toBe('data');
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
