/**
 * TBDY 2018 (Resmi Gazete 30364 mükerrer, 18-03-2018,
 * https://www.resmigazete.gov.tr/eskiler/2018/03/20180318M1-2-1.pdf), checked by hand against
 * the equations as printed: Denk. 2.1–2.3, 4.1, 4.8, 4.19, 4.22, 4.23 and 4.27.
 */
import { describe, it, expect } from 'vitest';
import {
  baseShear, designClass, designSpectrum, empiricalPeriod, equivalentMethodAllowed, findSystem, heightClass, ra, sae, saR,
  siteCoefficients, storeyForces, systemRefusal,
} from '../tbdy-spectrum';

describe('Tablo 2.1 and 2.2, with linear interpolation (2.3.3.1)', () => {
  it('reads the printed columns and interpolates between them', () => {
    expect(siteCoefficients('ZC', 1.0, 0.3)).toEqual({ fs: 1.2, f1: 1.5 });
    expect(siteCoefficients('ZD', 0.6, 0.25).fs).toBeCloseTo(1.4 + (1.2 - 1.4) * 0.4, 9);
    expect(siteCoefficients('ZD', 0.6, 0.25).f1).toBeCloseTo(2.1, 9);
    expect(siteCoefficients('ZE', 0.1, 0.05)).toEqual({ fs: 2.4, f1: 4.2 });
    expect(siteCoefficients('ZE', 2.0, 0.9)).toEqual({ fs: 0.8, f1: 2.0 });
  });
});

describe('Sae(T), Denk. 2.2, and SaR(T) = Sae/Ra, Denk. 4.8 with Ra from 4.1', () => {
  const s = designSpectrum('ZC', 1.0, 0.3);
  it('SDS = 1,2, SD1 = 0,45, TA = 0,075 s, TB = 0,375 s, TL = 6 s', () => {
    expect(s.sds).toBeCloseTo(1.2, 12);
    expect(s.sd1).toBeCloseTo(0.45, 12);
    expect(s.ta).toBeCloseTo(0.075, 12);
    expect(s.tb).toBeCloseTo(0.375, 12);
    expect(s.tl).toBe(6);
  });
  it('the four branches', () => {
    expect(sae(0, s)).toBeCloseTo(0.48, 12);
    expect(sae(0.05, s)).toBeCloseTo((0.4 + 0.6 * 0.05 / 0.075) * 1.2, 12);
    expect(sae(0.2, s)).toBeCloseTo(1.2, 12);
    expect(sae(1.0, s)).toBeCloseTo(0.45, 12);
    expect(sae(8, s)).toBeCloseTo(0.45 * 6 / 64, 12);
  });
  it('Ra = R/I past TB, D + (R/I − D)·T/TB below it (A11: R = 8, D = 3)', () => {
    expect(ra(1.0, 8, 3, 1, s.tb)).toBe(8);
    expect(ra(0.2, 8, 3, 1, s.tb)).toBeCloseTo(3 + 5 * 0.2 / 0.375, 12);
    expect(ra(0.2, 8, 3, 1.5, s.tb)).toBeCloseTo(3 + (8 / 1.5 - 3) * 0.2 / 0.375, 12);
    expect(saR(1.0, s, 8, 3, 1)).toBeCloseTo(0.05625, 12);
    expect(saR(0.2, s, 8, 3, 1)).toBeCloseTo(1.2 / (3 + 5 * 0.2 / 0.375), 12);
    expect(saR(0, s, 8, 3, 1)).toBeCloseTo(0.48 / 3, 12);
  });
});

describe('Tablo 3.2, 3.3, 4.1 and 4.4', () => {
  it('DTS by SDS and BKS', () => {
    expect(designClass(0.32, 3)).toBe('4');
    expect(designClass(0.33, 1)).toBe('3a');
    expect(designClass(0.6, 2)).toBe('2');
    expect(designClass(1.2, 1)).toBe('1a');
  });
  it('BYS by HN; the DTS 3 limits below 56 m also hold for DTS 4 (one cell for both columns)', () => {
    expect(heightClass(12, '1')).toBe(6);
    expect(heightClass(7, '1')).toBe(8);
    expect(heightClass(71, '1')).toBe(1);
    expect(heightClass(12, '3')).toBe(7);
    expect(heightClass(30, '4')).toBe(5);
    expect(heightClass(60, '4')).toBe(3);
    expect(heightClass(100, '4')).toBe(2);
  });
  it('the system limits of Tablo 4.1 and 4.3.4', () => {
    expect(systemRefusal(findSystem('A11')!, '1', 6, 4, 12)).toBeNull();
    expect(systemRefusal(findSystem('A31')!, '1', 7, 3, 9)).toBe('limitedFrame');
    expect(systemRefusal(findSystem('A31')!, '3a', 7, 3, 9)).toBe('limitedInA');
    expect(systemRefusal(findSystem('A31')!, '3', 6, 5, 16)).toBe('height');
    expect(systemRefusal(findSystem('A21')!, '2a', 6, 4, 12)).toBe('mixedInA');
    expect(systemRefusal(findSystem('A16')!, '1', 8, 2, 8)).toBe('singleStorey');
  });
  it('the equivalent lateral load method by Tablo 4.4', () => {
    expect(equivalentMethodAllowed('1', 4, true)).toBe(true);
    expect(equivalentMethodAllowed('1', 4, false)).toBe(false);
    expect(equivalentMethodAllowed('3', 5, true)).toBe(true);
    expect(equivalentMethodAllowed('4', 5, false)).toBe(false);
  });
});

describe('VtE and its storeys for a 4-storey frame where the minimum governs', () => {
  const s = designSpectrum('ZC', 1.0, 0.1);
  const H = 12;
  const tpa = empiricalPeriod(0.1, H);
  it('TpA = 0,1 · 12^0,75 = 0,6447 s; SaR = 0,15/0,6447/8 = 0,02908 < 0,04·I·SDS = 0,048', () => {
    expect(tpa).toBeCloseTo(0.644742, 5);
    expect(saR(tpa, s, 8, 3, 1)).toBeCloseTo(0.15 / tpa / 8, 9);
    const v = baseShear(4000, saR(tpa, s, 8, 3, 1), 1, s.sds);
    expect(v.minimumGoverns).toBe(true);
    expect(v.vt).toBeCloseTo(0.04 * 4000 * 1.2, 9);
  });
  it('ΔFN = 0,0075·N·VtE on top, the rest by wi·Hi (Denk. 4.22, 4.23)', () => {
    const { forces, deltaFN } = storeyForces([3, 6, 9, 12].map((h) => ({ h, w: 1000 })), 192);
    expect(deltaFN).toBeCloseTo(5.76, 9);
    expect(forces[0]).toBeCloseTo(186.24 * 3 / 30, 9);
    expect(forces[1]).toBeCloseTo(37.248, 9);
    expect(forces[2]).toBeCloseTo(55.872, 9);
    expect(forces[3]).toBeCloseTo(74.496 + 5.76, 9);
    expect(forces.reduce((a, b) => a + b, 0)).toBeCloseTo(192, 9);
  });
});
