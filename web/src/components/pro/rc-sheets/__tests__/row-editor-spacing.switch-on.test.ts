import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import RcRowEditor from '../RcRowEditor.svelte';
import { columnRow, type ColumnDemand } from '../../../../lib/rc-sheets/column-row';
import { makeFmt } from '../../../../lib/rc-sheets/format';

const col: ColumnDemand = { key: 'column:1:0', name: 'C1', b: 0.3, h: 0.3, length: 3, lu: 2.7, psiTop: 1, psiBot: 1, cases: [{ combo: 'U', pu: 900, mxTop: 40, mxBot: -20, myTop: 20, myBot: -10, vx: 10, vy: 10 }] };
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [16] };
const faces = { corner: 16, nx: 2, dx: 16, ny: 2, dy: 16, tieDia: 8, tieSpacing: 0.15 };
const editor = (inner: { nx: number; ny: number; dia: number }) => render(RcRowEditor, { props: { row: columnRow(col, ctx, { ...faces, inner }, makeFmt('.')) } }).body;

it('the column editor warns where the rows typed inside the faces leave bars too close, and not where they fit', () => {
  expect(editor({ nx: 2, ny: 2, dia: 16 })).toContain('data-testid="rc-col-spacing-warn"');
  expect(editor({ nx: 2, ny: 0, dia: 16 })).not.toContain('data-testid="rc-col-spacing-warn"');
});
