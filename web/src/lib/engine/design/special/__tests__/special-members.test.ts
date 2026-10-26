/**
 * Corbels (CIRSOC 201-2025 16.5), coupling beams (INPRES-CIRSOC 103 Parte II 3.8.1) and web
 * openings in beams (Vierendeel chords) against values worked out by hand.
 */
import { describe, expect, it } from 'vitest';
import { corbelDesign } from '../corbel';
import { couplingBeamDesign } from '../coupling-beam';
import { beamOpeningDesign } from '../beam-opening';

describe('corbel', () => {
  const c = corbelDesign({ bw: 0.3, h: 0.45, d: 0.4, av: 0.15, Vu: 400, Nuc: 80, fc: 30, fy: 420, monolithic: true });
  const by = (k: string) => c.rows.find((r) => r.titleKey === `check.corbel.${k}`)!;

  it('the moment at the face, Af, An and Avf by hand', () => {
    expect(c.mu).toBeCloseTo(64, 9);
    expect(c.af! * 1e4).toBeCloseTo(5.270, 2);
    expect(c.an * 1e4).toBeCloseTo(2.540, 2);
    expect(c.avf * 1e4).toBeCloseTo(9.070, 2);
  });

  it('primary steel by 16.5.5.1(a), stirrups by 16.5.5.2, the shear limit by 16.5.2.4(b)', () => {
    expect(c.asPrimary * 1e4).toBeCloseTo(8.587, 2); // (2/3)·Avf + An governs
    expect(c.ah * 1e4).toBeCloseTo(3.023, 2);
    expect(by('shearLimit').capacity).toBeCloseTo(684, 6);
    expect(by('shearLimit').demand).toBeCloseTo(533.333, 2);
    expect(by('span').ratio).toBeCloseTo(0.375, 3);
    // Nothing placed to hold the required area against: stated, not verified (it read ok).
    expect(by('primary').status).toBe('notVerified');
    const placed = corbelDesign({ bw: 0.3, h: 0.45, d: 0.4, av: 0.15, Vu: 400, Nuc: 80, fc: 30, fy: 420, monolithic: true, ascProvided: 10e-4 });
    expect(placed.rows.find((r) => r.titleKey === 'check.corbel.primary')!.status).toBe('ok');
  });

  it('Nuc from the sustained reaction (16.2.2.3(b)); a long shear span fails 16.5.1.1', () => {
    expect(corbelDesign({ bw: 0.3, h: 0.45, d: 0.4, av: 0.15, Vu: 400, sustained: 200, fc: 30, fy: 420, monolithic: true }).nuc).toBeCloseTo(64, 9);
    const long = corbelDesign({ bw: 0.3, h: 0.45, d: 0.4, av: 0.5, Vu: 400, Nuc: 80, fc: 30, fy: 420, monolithic: true });
    expect(long.rows.find((r) => r.clause === '16.5.1.1')!.status).toBe('fail');
  });
});

describe('coupling beam', () => {
  it('above the threshold of 3.8.1.2: diagonals by eq. (3-28) and the mesh', () => {
    const d = couplingBeamDesign({ ln: 1.5, h: 0.8, bw: 0.3, d: 0.74, Vu: 900, fc: 30, fy: 420 });
    expect(d.vn).toBeCloseTo(5.405, 3);
    expect(d.vLimit).toBeCloseTo(1.027, 3);
    expect(d.diagonal).toBe(true);
    expect(d.alphaDeg).toBeCloseTo(24.386, 2);
    expect(d.ash! * 1e4).toBeCloseTo(28.833, 2);
    expect(d.mesh * 1e4).toBeCloseTo(5, 6);
  });

  it('below it, a frame beam', () => {
    const d = couplingBeamDesign({ ln: 3, h: 0.6, bw: 0.25, d: 0.55, Vu: 60, fc: 30, fy: 420 });
    expect(d.diagonal).toBe(false);
    expect(d.ash).toBeNull();
    expect(d.rows.map((r) => r.status)).toEqual(['ok', 'unsupported']);
  });
});

describe('web opening', () => {
  const o = beamOpeningDesign({ b: 0.3, h: 0.7, cover: 0.025, stirrupDia: 8, barDia: 16, fc: 25, fy: 420, x: 2, lo: 0.6, ho: 0.25, Mu: 150, Vu: 120 });

  it('chord forces, shear split and secondary moments', () => {
    expect(o.z).toBeCloseTo(0.618, 9);
    expect(o.bottom.axial).toBeCloseTo(-242.718, 2);
    expect(o.top.shear).toBeCloseTo(60, 9);
    expect(o.top.moment).toBeCloseTo(18, 9);
    expect(o.bottom.asFace! * 1e4).toBeCloseTo(6.541, 2);
  });

  it('the compression chord, the chords\' shear and the stirrups beside it', () => {
    const by = (k: string) => o.rows.find((r) => r.titleKey === `check.opening.${k}`)!;
    expect(by('topCompression').capacity).toBeCloseTo(317.743, 2);
    expect(by('topCompression').status).toBe('ok');
    expect(o.bottom.avs! * 1e4).toBeCloseTo(8.561, 2); // tension takes Vc down to 13,8 kN
    expect(o.top.avs).toBeCloseTo(0, 9);
    expect(by('bottomShearMax').capacity).toBeCloseTo(146.999, 2);
    expect(o.avSide * 1e4).toBeCloseTo(3.810, 2);
  });

  it('an opening that leaves no chord for a layer of steel stops at the geometry', () => {
    const big = beamOpeningDesign({ b: 0.3, h: 0.5, cover: 0.025, stirrupDia: 8, barDia: 16, fc: 25, fy: 420, x: 2, lo: 0.6, ho: 0.4, Mu: 50, Vu: 50 });
    expect(big.rows).toHaveLength(1);
    expect(big.rows[0]!.status).toBe('fail');
  });
});
