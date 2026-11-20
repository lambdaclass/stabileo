import { describe, expect, it } from 'vitest';
import { shownBars } from '../rc-rebar-3d.svelte';

const bar = (element: string, family: 'column' | 'wall' | 'beam', rows: string[] = []) => ({ element, family, rows, level: 'N0' });
const families = { beam: true, column: true, slab: true, wall: true, footing: true, punching: true };

describe('the 3D view of one element', () => {
  const bars = [bar('wall:M1', 'wall'), bar('wall:M2', 'wall'), bar('column:C1', 'column', ['wall:M1']), bar('column:C2', 'column'), bar('beam:V1', 'beam')];

  it('shows a pier\'s walls and its column together', () => {
    const shown = shownBars(bars, { row: { key: 'pier:M1+M2', name: 'M1 + M2 + C1', keys: ['wall:M1', 'wall:M2', 'column:C1'] }, level: '', families });
    expect(shown.map((b) => b.element)).toEqual(['wall:M1', 'wall:M2', 'column:C1']);
  });

  it('shows one row alone by its key', () => {
    expect(shownBars(bars, { row: { key: 'column:C2', name: 'C2' }, level: '', families }).map((b) => b.element)).toEqual(['column:C2']);
  });
});
