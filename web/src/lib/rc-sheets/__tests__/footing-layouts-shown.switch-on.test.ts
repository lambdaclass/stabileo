/**
 * The footings a family shows before and after a layout is adopted: with none adopted, the
 * recommendation's (or the one previewed), so the family opens on a building that models no
 * footing; with one adopted, its rows and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { shownFootings, type FoundationLayout } from '../footing-layouts';
import type { FootingRow } from '../footing-types';

const row = (key: string) => ({ key }) as FootingRow;
const layout = (system: FoundationLayout['system'], keys: string[]) => ({ system, rows: keys.map(row) }) as FoundationLayout;
const layouts = [layout('auto', ['a1', 'a2']), layout('mat', ['m1'])];

describe('the footings a family shows', () => {
  it('are the recommendation\'s with none adopted, the previewed layout\'s when one is picked, and none without layouts', () => {
    expect(shownFootings({ foundation: null, footing: [], footingLayouts: layouts }).map((r) => r.key)).toEqual(['a1', 'a2']);
    expect(shownFootings({ footing: [], footingLayouts: layouts }, 'mat').map((r) => r.key)).toEqual(['m1']);
    expect(shownFootings({ foundation: null, footing: [] })).toEqual([]);
  });

  it('are the adopted layout\'s rows once one is adopted, whatever is previewed', () => {
    const adopted = [row('x1')];
    expect(shownFootings({ foundation: 'mat', footing: adopted, footingLayouts: layouts }, 'auto')).toBe(adopted);
  });
});
