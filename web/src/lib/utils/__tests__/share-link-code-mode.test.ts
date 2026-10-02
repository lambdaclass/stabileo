/**
 * A code link's mode, opened or pasted.
 *
 * A link is written in 2D, 3D or PRO, never in the educational mode, so a link naming another
 * mode leaves the reader where they are. The pasted code link ("Pegar enlace") assigned the
 * mode it named directly, and one naming `mode edu` switched the reader into it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFromShareLink, loadFromURLHash } from '../url-sharing';
import { encodeCode, CODE_HASH } from '../../model/code/share';
import { modelToCode } from '../../model/code/format';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';

beforeEach(() => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('location', { hash: '', pathname: '/', search: '', origin: 'https://x' });
  vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
  uiStore.analysisMode = '2d';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  modelStore.clear();
  uiStore.analysisMode = '2d';
});

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

describe('a code link naming a mode no link is written with', () => {
  it('opened from the address bar keeps the reader\'s mode', () => {
    location.hash = codeLink('edu');
    loadFromURLHash();
    expect(uiStore.analysisMode).toBe('2d');
  });

  it('pasted (loadFromShareLink) keeps the reader\'s mode too', () => {
    expect(loadFromShareLink('https://x/' + codeLink('edu'))).toBe(true);
    expect(uiStore.analysisMode).toBe('2d');
  });
});
