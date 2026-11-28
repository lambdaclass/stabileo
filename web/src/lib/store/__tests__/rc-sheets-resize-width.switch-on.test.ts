/**
 * A beam no depth up to twice its own verifies, its web too narrow for the shear: the hint says so
 * and offers the width it verifies with, for the span and for its continuous line.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../rc-sheets.svelte', () => ({
  redesignerOf: () => (d: { b: number; h: number }) => ({ status: d.b >= 0.3 - 1e-9 ? 'ok' : 'fail' }),
}));

const { resizeHints, lineResizeHint } = await import('../rc-sheets-resize');

const span = (k: number) => ({ family: 'beam', key: `beam:6:${k}`, status: 'fail', demand: { b: 0.2, h: 0.6 } }) as never;

describe('a beam too narrow for its shear', () => {
  it('fails at every depth up to twice and verifies 30 cm wide', () => {
    expect(resizeHints(span(0))).toEqual([
      { what: 'beamH', direction: 'grow', from: [0.6], to: null },
      { what: 'beamB', direction: 'grow', from: [0.2], to: [0.3] },
    ]);
  });

  it('gives its line the width', () => {
    expect(lineResizeHint([span(0), span(1)])).toEqual({ what: 'beamB', direction: 'grow', from: [0.2], to: [0.3] });
  });
});
