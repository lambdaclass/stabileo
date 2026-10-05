/**
 * The calc report's load list: every non-zero component of a load, named by its axis.
 *
 * Two ways a real load was reported as «no load»: a 2D nodal load read by its legacy alias
 * names (fy, mz) when the store writes fx, fz, my; and a line load dropped when its I end was
 * zero, which is every triangular load that starts at nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store';
import { loadComponentsText, reportNumber } from '../calc-report-loads';

beforeEach(() => { historyStore.clear(); modelStore.clear(); });

describe('a 2D nodal load is read by the names the store writes', () => {
  it('a load added as (0, −10, 5) reports its force and its moment, not «no load»', () => {
    uiStore.analysisMode = '2d';
    const a = modelStore.addNode(0, 0); modelStore.addNode(0, 3);
    modelStore.addNodalLoad(a, 0, -10, 5);
    const l = modelStore.loads.find((x) => x.type === 'nodal')!;
    expect(loadComponentsText('nodal', l.data as never)).toBe('Fz=-10 kN, My=5 kN·m');
  });

  it('old data stored under the legacy aliases still reads', () => {
    expect(loadComponentsText('nodal', { fx: 2, fy: -10, mz: 5 })).toBe('Fx=2 kN, Fz=-10 kN, My=5 kN·m');
  });

  it('the store names win over a stale alias', () => {
    expect(loadComponentsText('nodal', { fx: 0, fz: -3, my: 0, fy: -10, mz: 5 })).toBe('Fz=-3 kN');
  });

  it('a load with every component zero gives nothing, which the dialog says in words', () => {
    expect(loadComponentsText('nodal', { fx: 0, fz: 0, my: 0 })).toBe('');
  });
});

describe('a 3D nodal load names all six components', () => {
  it('each moment by its axis', () => {
    expect(loadComponentsText('nodal3d', { fx: 0, fy: 1, fz: -2, mx: 0, my: 3, mz: -4 }))
      .toBe('Fy=1 kN, Fz=-2 kN, My=3 kN·m, Mz=-4 kN·m');
  });
});

describe('a 3D line load is kept when either end carries load', () => {
  it('a triangular load from zero (qz 0 → 5) is reported, not dropped', () => {
    expect(loadComponentsText('distributed3d', { qYI: 0, qYJ: 0, qZI: 0, qZJ: 5 })).toBe('qz=0 → 5 kN/m');
  });

  it('and one falling to zero (qy 5 → 0) as well', () => {
    expect(loadComponentsText('distributed3d', { qYI: 5, qYJ: 0, qZI: 0, qZJ: 0 })).toBe('qy=5 → 0 kN/m');
  });

  it('as the store writes it, in global axes', () => {
    uiStore.analysisMode = '3d';
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addDistributedLoad3D(e, 0, 0, 0, -6, undefined, undefined, undefined, { frame: 'global' });
    const l = modelStore.loads.find((x) => x.type === 'distributed3d')!;
    expect(loadComponentsText('distributed3d', l.data as never)).toBe('qZ=0 → -6 kN/m');
  });

  it('a missing J end reads as uniform, and a load with no component gives nothing', () => {
    expect(loadComponentsText('distributed3d', { qXI: 2, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0 })).toBe('qx=2 → 2 kN/m');
    expect(loadComponentsText('distributed3d', { qYI: 0, qYJ: 0, qZI: 0, qZJ: 0 })).toBe('');
  });
});

describe('numbers in the load list', () => {
  it('four significant figures, and never «-0»', () => {
    expect(reportNumber(1.23456)).toBe('1.235');
    expect(reportNumber(-0)).toBe('0');
  });
});
