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
import { loadComponentsText, reportNumber, distributedText, pointOnElementText, thermalText } from '../calc-report-loads';
import { serializeLoads } from '../pro-report-inputs';

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

describe('a partial line load says where it sits', () => {
  it('qZ = −5 from a = 1 to b = 2 is not read as the full length', () => {
    expect(loadComponentsText('distributed3d', { qYI: 0, qYJ: 0, qZI: -5, qZJ: -5, a: 1, b: 2 }))
      .toBe('qz=-5 → -5 kN/m, a=1 m, b=2 m');
  });

  it('a start with no end runs to the end of the member', () => {
    expect(loadComponentsText('distributed3d', { qYI: 0, qYJ: 0, qZI: -5, qZJ: -5, a: 1 })).toBe('qz=-5 → -5 kN/m, a=1 m, b=L');
  });

  it('a full-length load says nothing about a range', () => {
    expect(loadComponentsText('distributed3d', { qYI: 0, qYJ: 0, qZI: -5, qZJ: -5 })).toBe('qz=-5 → -5 kN/m');
  });
});

describe('a 2D line load names its range, its angle and its axes', () => {
  const words = { global: 'global axes' };

  it('a uniform load on the whole member', () => {
    expect(distributedText({ qI: -10, qJ: -10 }, words)).toBe('q=-10 → -10 kN/m');
  });

  it('a partial, inclined load in global axes, as the store writes it', () => {
    uiStore.analysisMode = '2d';
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addDistributedLoad(e, -10, 0, 30, true, undefined, 1, 4);
    const l = modelStore.loads.find((x) => x.type === 'distributed')!;
    expect(distributedText(l.data as never, words)).toBe('q=-10 → 0 kN/m, a=1 m, b=4 m, θ=30°, global axes');
  });

  it('numbers to four significant figures', () => {
    expect(distributedText({ qI: 1 / 3, qJ: 2 / 3 }, words)).toBe('q=0.3333 → 0.6667 kN/m');
  });
});

describe('a 2D point load on a member names every component', () => {
  const words = { global: 'global axes' };

  it('its axial force and its moment, not only P', () => {
    uiStore.analysisMode = '2d';
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addPointLoadOnElement(e, 1.5, -10, { px: 2, my: 5 });
    const l = modelStore.loads.find((x) => x.type === 'pointOnElement')!;
    expect(pointOnElementText(l.data as never, words)).toBe('P=-10 kN, Px=2 kN, My=5 kN·m, a=1.5 m');
  });

  it('rounded, with the legacy moment alias, the angle and the axes', () => {
    expect(pointOnElementText({ a: 2 / 3, p: 1 / 3, mz: 1, angle: 45, isGlobal: true }, words))
      .toBe('P=0.3333 kN, My=1 kN·m, a=0.6667 m, θ=45°, global axes');
  });

  it('a load with every component zero gives nothing, which the dialog says in words', () => {
    expect(pointOnElementText({ a: 1, p: 0 }, words)).toBe('');
  });
});

describe('the PRO report load table gives every length its unit', () => {
  it('a partial 3D line load: b in metres, like a', () => {
    uiStore.analysisMode = '3d';
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addDistributedLoad3D(e, 0, 0, -5, -5, 1, 3);
    const row = serializeLoads((k) => k).find((r) => r.target.endsWith(` ${e}`))!;
    expect(row.values).toBe('qzI=-5, qzJ=-5 kN/m, a=1 m, b=3 m');
  });

  it('a partial 2D line load keeps its range, and a point load its axial force and moment', () => {
    uiStore.analysisMode = '2d';
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addDistributedLoad(e, -10, -10, undefined, undefined, undefined, 1, 4);
    modelStore.addPointLoadOnElement(e, 1.5, -10, { px: 2, my: 5 });
    const rows = serializeLoads((k) => k);
    expect(rows.find((r) => r.type === 'file.loadDistributed')!.values).toBe('q=-10 kN/m, a=1 m, b=4 m');
    expect(rows.find((r) => r.type === 'file.loadPointOnElement')!.values).toBe('P=-10, Px=2 kN, My=5 kN·m, a=1.5 m');
  });
});

describe('numbers in the load list', () => {
  it('four significant figures, and never «-0»', () => {
    expect(reportNumber(1.23456)).toBe('1.235');
    expect(reportNumber(-0)).toBe('0');
  });
});

describe('the load list follows the report units', () => {
  it('a 2D nodal load in tonnes-force', () => {
    expect(loadComponentsText('nodal', { fz: -9.80665, my: 9.80665 }, 'MKS')).toBe('Fz=-1 tf, My=1 tf·m');
  });

  it('a partial line load in kip/ft and feet', () => {
    expect(distributedText({ qI: -10, a: 1, b: 2 }, { global: 'global' }, 'Imperial'))
      .toBe('q=-0.6852 → -0.6852 kip/ft, a=3.281 ft, b=6.562 ft');
  });

  it('a temperature change is a difference: 20 °C reads 36 °F, not 68 °F', () => {
    expect(thermalText({ dtUniform: 20, dtGradient: -10 }, 'Imperial')).toBe('ΔTg=36°F, ∇T=-18°F');
    expect(thermalText({ dtUniform: 20, dtGradient: 0 })).toBe('ΔTg=20°C, ∇T=0°C');
  });

  it('a PRO report keeps PRO\'s names: ΔT the change, ΔTgz and ΔTgy the gradients', () => {
    // In PRO «ΔTg» is a gradient; Basic's names there would read the uniform change as one.
    expect(thermalText({ dtUniform: 20, dtGradient: -10 }, 'SI', 'pro')).toBe('ΔT=20°C, ΔTgz=-10°C');
    expect(thermalText({ dtUniform: 0, dtGradient: 0, dtGradientY: 5 }, 'SI', 'pro')).toBe('ΔT=0°C, ΔTgz=0°C, ΔTgy=5°C');
  });
});
