/**
 * A wall whose boundary hoops need a thickness of 25 cm and whose base the model does not hold at
 * one node: the hint still offers the thickness the rest verifies with, saying the base stays to
 * be held; a wall failing for its base alone gets no thickness.
 */
import { describe, it, expect, vi } from 'vitest';

const fails = (label: string) => ({ label, ok: false });
const ok = (label: string) => ({ label, ok: true });

vi.mock('../rc-sheets.svelte', () => ({
  redesignerOf: () => (d: { thickness: number }) => ({
    status: 'fail',
    verifications: [fails('rcSheets.v.wallBase'), d.thickness >= 0.25 - 1e-9 ? ok('rcSheets.v.wallTieFloor') : fails('rcSheets.v.wallTieFloor')],
  }),
}));

const { resizeHints } = await import('../rc-sheets-resize');

const wall = (checks: Array<{ label: string; ok: boolean }>) => ({
  family: 'wall', key: 'wall:9:0', status: 'fail', verifications: checks,
  demand: { thickness: 0.2, base: { nodes: 7, held: 6, unheld: [812] } },
}) as never;

describe('a wall with a loose base node', () => {
  it('is offered the thickness its boundary hoops fit in, apart from its base', () => {
    expect(resizeHints(wall([fails('rcSheets.v.wallBase'), fails('rcSheets.v.wallTieFloor')]))).toEqual([
      { what: 'wallT', direction: 'grow', from: [0.2], to: [0.25], apartFromBase: true },
    ]);
  });

  it('gets no thickness when only its base fails', () => {
    expect(resizeHints(wall([fails('rcSheets.v.wallBase'), ok('rcSheets.v.wallTieFloor')]))).toEqual([]);
  });
});
