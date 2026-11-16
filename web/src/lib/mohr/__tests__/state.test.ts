import { describe, it, expect } from 'vitest';
import { encode2D, decode2D, encode3D, decode3D, appHref, readAppLink, wrapAngle, DEFAULT_2D, DEFAULT_3D, fibreTensor, toUnit, fromUnit, unitScales, UNITS, PER_MPA, UNIT_DIGITS, UNIT_STEP, type Mohr2DState, type Mohr3DState } from '../state';
import { mergeCoincident, labelRows, ticks, equalFrame, divergingColor, gutter } from '../plot';

describe('URL state', () => {
  it('2D round-trip', () => {
    const s: Mohr2DState = { sx: -12.5, sy: 0.000123, txy: 1e6, theta: -37.25, unit: 'kgf/cm²', tauDown: true };
    expect(decode2D(new URLSearchParams(encode2D(s).toString()))).toEqual(s);
  });

  it('3D round-trip', () => {
    const s: Mohr3DState = { s: { xx: 1, yy: -2.5, zz: 3, xy: 4, xz: -5, yz: 6.125 }, phi: -150, theta: 135, unit: 'kN/cm²' };
    expect(decode3D(new URLSearchParams(encode3D(s).toString()))).toEqual(s);
  });

  it('an empty or broken query falls back to the defaults', () => {
    expect(decode2D(new URLSearchParams(''))).toEqual(DEFAULT_2D);
    expect(decode3D(new URLSearchParams('s=1,2,x&phi=abc&u=psi'))).toEqual(DEFAULT_3D);
    expect(decode2D(new URLSearchParams('sx=&th=900')).theta).toBe(180);
    expect(decode2D(new URLSearchParams('sx=Infinity')).sx).toBe(DEFAULT_2D.sx);
  });

  it('the application link carries the same state', () => {
    const s: Mohr2DState = { sx: 5, sy: 6, txy: 7, theta: 8, unit: 'kPa', tauDown: false };
    const href = appHref('plane', s);
    expect(href).toMatch(/^\/app\/basic\?mohr=plane&/);
    const link = readAppLink(new URL(href, 'https://x').searchParams);
    expect(link).toEqual({ kind: 'plane', state: s });
    expect(appHref('space', DEFAULT_3D, true)).toMatch(/e2e=1$/);
    expect(readAppLink(new URL(appHref('space', DEFAULT_3D), 'https://x').searchParams)).toEqual({ kind: 'space', state: DEFAULT_3D });
    expect(readAppLink(new URLSearchParams('mohr=4d'))).toBeNull();
  });

  it('wraps angles into (−180, 180]', () => {
    expect(wrapAngle(181)).toBe(-179);
    expect(wrapAngle(-180)).toBe(180);
    expect(wrapAngle(540)).toBe(180);
    expect(wrapAngle(0)).toBe(0);
  });

  it('a beam fibre is σx with its two shears', () => {
    expect(fibreTensor(10, 2, -3)).toEqual({ xx: 10, yy: 0, zz: 0, xy: 2, xz: -3, yz: 0 });
  });
});

describe('units', () => {
  it('converts MPa to each unit and back', () => {
    expect(toUnit(80, 'MPa')).toBe(80);
    expect(toUnit(80, 'kPa')).toBe(80000);
    expect(toUnit(80, 'kN/cm²')).toBeCloseTo(8, 12);
    expect(toUnit(80, 'kgf/cm²')).toBeCloseTo(815.773, 3);
    expect(toUnit(9.80665, 'kgf/cm²')).toBeCloseTo(100, 10);
    for (const u of UNITS) for (const v of [-37.1, 0, 1e-4, 92.53, 1e6]) expect(Math.abs(fromUnit(toUnit(v, u), u) - v)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(v)));
  });

  it('every unit has its digits and a round step of about 1 MPa', () => {
    for (const u of UNITS) {
      expect(UNIT_DIGITS[u]).toBeGreaterThanOrEqual(0);
      const mpa = fromUnit(UNIT_STEP[u], u);
      expect(mpa).toBeGreaterThan(0.5);
      expect(mpa).toBeLessThan(1.5);
      expect(PER_MPA[u]).toBeGreaterThan(0);
    }
  });

  it('links keep MPa whatever unit is shown, so changing the unit never changes the state', () => {
    const mpa: Mohr2DState = { sx: 80, sy: 20, txy: 30, theta: 0, unit: 'MPa', tauDown: false };
    for (const unit of UNITS) {
      const p = encode2D({ ...mpa, unit });
      expect(p.get('sx')).toBe('80');
      expect(p.get('v')).toBe('2');
      expect(decode2D(new URLSearchParams(p.toString()))).toEqual({ ...mpa, unit });
    }
    expect(encode3D({ ...DEFAULT_3D, unit: 'kPa' }).get('s')).toBe('80,20,-30,30,15,-10');
  });

  it('a link from before the unit change still means the numbers it shows, in its unit', () => {
    const old = decode2D(new URLSearchParams('sx=100&sy=20&txy=30&th=90&u=kncm2&tdown=1'));
    expect(old).toEqual({ sx: 1000, sy: 200, txy: 300, theta: 90, unit: 'kN/cm²', tauDown: true });
    expect(decode2D(new URLSearchParams('sx=1000&u=kgfcm2')).sx).toBeCloseTo(98.0665, 9);
    expect(decode2D(new URLSearchParams('sx=5&u=mpa')).sx).toBe(5);
    const old3 = decode3D(new URLSearchParams('s=80000,20000,-30000,30000,15000,-10000&phi=10&th=20&u=kpa'));
    expect(old3.s).toEqual({ xx: 80, yy: 20, zz: -30, xy: 30, yz: 15, xz: -10 });
    expect(old3.unit).toBe('kPa');
  });
});

describe('plot helpers', () => {
  it('merges coincident principal values into one label', () => {
    expect(mergeCoincident([{ key: 's1', value: 100 }, { key: 's2', value: 100 }, { key: 's3', value: 0 }], 1e-6))
      .toEqual([{ keys: ['s1', 's2'], value: 100 }, { keys: ['s3'], value: 0 }]);
    expect(mergeCoincident([{ key: 'a', value: -60 }, { key: 'b', value: -60 }, { key: 'c', value: -60 }], 1e-6)).toHaveLength(1);
  });

  it('puts close labels on separate rows', () => {
    expect(labelRows([0, 10, 100], 40)).toEqual([0, 1, 0]);
    expect(labelRows([200, 0, 100], 40)).toEqual([0, 0, 0]);
  });

  it('leaves room for the widest tick label', () => {
    expect(gutter(60, true)).toBe(40);
    expect(gutter(59396, true)).toBeGreaterThan(gutter(60, true) + 25);
    expect(gutter(0.06, false)).toBeGreaterThanOrEqual(40);
    expect(gutter(60, true, [1, 1000, 0.1])).toBe(gutter(60000, true));
    for (const u of UNITS) expect(gutter(toUnit(42, u), true, unitScales(u))).toBe(gutter(42, true, unitScales('MPa')));
  });

  it('nice ticks', () => {
    expect(ticks(-37, 92)).toEqual([-20, 0, 20, 40, 60, 80]);
    expect(ticks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });

  it('one unit is the same length on both axes, and a point gets a finite frame', () => {
    const f = equalFrame({ left: 0, top: 0, width: 200, height: 100 }, [0, 100], [-10, 10]);
    expect(f.x(100) - f.x(0)).toBeCloseTo(f.y(-10) - f.y(90), 9);
    const point = equalFrame({ left: 0, top: 0, width: 200, height: 100 }, [40, 40], [0, 0]);
    expect([point.x(40), point.y(0), point.scale].every(Number.isFinite)).toBe(true);
    const down = equalFrame({ left: 0, top: 0, width: 100, height: 100 }, [-1, 1], [-1, 1], true);
    expect(down.y(1)).toBeGreaterThan(down.y(-1));
  });

  it('colours compression blue and tension red', () => {
    expect(divergingColor(-5, 5)).toBe('rgb(74, 143, 212)');
    expect(divergingColor(5, 5)).toBe('rgb(232, 112, 95)');
    expect(divergingColor(0, 0)).toBe('rgb(143, 163, 179)');
  });
});
