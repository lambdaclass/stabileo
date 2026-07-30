/**
 * Design-table view model: filtering, sorting, counts, next-failing navigation.
 * Pure, so it is testable without a DOM.
 */

import { describe, it, expect } from 'vitest';
import {
  matchesFilter, matchesSearch, sortRows, filterCounts, nextFailingId,
  type DesignRow, type RowFilter,
} from '../design-view';

function row(over: Partial<DesignRow> = {}): DesignRow {
  return {
    elementId: 1, elementType: 'beam', sectionName: 'RC Beam 350×650', sectionId: 2,
    elevation: 3.4, elevationLabel: 'L1 +3.40 m',
    utilization: 0.5, status: 'ok', governingCheck: 'Bottom Span (My+)', comboName: '1.2D+1.6L',
    outcome: 'VERIFIED', hasReinforcement: true, edited: false, auto: true,
    provisional: false, certified: true, sloped: false, provided: null,
    ...over,
  };
}

const rows: DesignRow[] = [
  row({ elementId: 1, status: 'ok', utilization: 0.42 }),
  row({ elementId: 2, status: 'fail', utilization: 1.8, outcome: 'SECTION_INADEQUATE', certified: false, provisional: true }),
  row({ elementId: 3, status: 'warn', utilization: 0.97 }),
  row({ elementId: 4, status: 'unavailable', utilization: null, hasReinforcement: false, certified: false, auto: false }),
  row({ elementId: 5, status: 'stale', utilization: 0.6, elevation: 6.8, elevationLabel: 'L2 +6.80 m' }),
  row({ elementId: 6, status: 'ok', utilization: 0.8, edited: true, auto: false, certified: false, elementType: 'column', sectionName: 'RC Col 500×500' }),
];

describe('row filters', () => {
  const selected = new Set([2, 6]);

  it('"selected" actually filters by the current selection', () => {
    // The pre-PR15 filter returned every row regardless of selection.
    const got = rows.filter(r => matchesFilter(r, 'selected', selected)).map(r => r.elementId);
    expect(got).toEqual([2, 6]);
  });

  it('maps each status filter to exactly its rows', () => {
    const of = (f: RowFilter) => rows.filter(r => matchesFilter(r, f, selected)).map(r => r.elementId);
    expect(of('all')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(of('fail')).toEqual([2]);
    expect(of('warn')).toEqual([3]);
    expect(of('ok')).toEqual([1, 6]);
    expect(of('stale')).toEqual([5]);
    expect(of('undesigned')).toEqual([4]);
    expect(of('edited')).toEqual([6]);
    expect(of('provisional')).toEqual([2]);
  });

  it('counts every filter without double counting', () => {
    const c = filterCounts(rows, selected);
    expect(c.all).toBe(6);
    expect(c.selected).toBe(2);
    expect(c.fail).toBe(1);
    expect(c.ok).toBe(2);
    expect(c.undesigned).toBe(1);
  });
});

describe('search', () => {
  it('matches element id, section, type and elevation label', () => {
    expect(matchesSearch(rows[0], '')).toBe(true);
    expect(matchesSearch(rows[0], '1')).toBe(true);
    expect(matchesSearch(rows[0], 'beam')).toBe(true);
    expect(matchesSearch(rows[0], '350')).toBe(true);
    expect(matchesSearch(rows[0], 'L1')).toBe(true);
    expect(matchesSearch(rows[0], 'zzz')).toBe(false);
    expect(matchesSearch(rows[5], 'col')).toBe(true);
  });
});

describe('sorting', () => {
  it('sorts by utilization with nulls last when descending', () => {
    const desc = sortRows(rows, 'utilization', false).map(r => r.elementId);
    expect(desc[0]).toBe(2);                 // 1.8 is worst
    expect(desc[desc.length - 1]).toBe(4);   // null utilization last
  });

  it('sorts by status with failures first', () => {
    const s = sortRows(rows, 'status', true).map(r => r.status);
    expect(s[0]).toBe('fail');
    expect(s[1]).toBe('warn');
  });

  it('sorts by elevation and section', () => {
    expect(sortRows(rows, 'elevation', true)[0].elevation).toBe(3.4);
    expect(sortRows(rows, 'elevation', false)[0].elevation).toBe(6.8);
    expect(sortRows(rows, 'section', true)[0].sectionName.startsWith('RC Beam')).toBe(true);
  });

  it('is deterministic: ties break on element id, never Map order', () => {
    const tied = [row({ elementId: 9, utilization: 0.5 }), row({ elementId: 3, utilization: 0.5 }), row({ elementId: 7, utilization: 0.5 })];
    expect(sortRows(tied, 'utilization', true).map(r => r.elementId)).toEqual([3, 7, 9]);
    expect(sortRows([...tied].reverse(), 'utilization', true).map(r => r.elementId)).toEqual([3, 7, 9]);
  });
});

describe('next-failing navigation', () => {
  it('starts at the first failing/warning row and wraps', () => {
    expect(nextFailingId(rows, null)).toBe(2);
    expect(nextFailingId(rows, 2)).toBe(3);
    expect(nextFailingId(rows, 3)).toBe(2);      // wraps back
  });
  it('returns null when nothing needs attention', () => {
    expect(nextFailingId([row({ status: 'ok' })], null)).toBeNull();
  });
});
