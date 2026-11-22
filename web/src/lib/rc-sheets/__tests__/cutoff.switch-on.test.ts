import { describe, it, expect } from 'vitest';
import { evaluateCutoff } from '../cutoff';
import { CIRSOC_LINE } from '../beam-line';

function envelope(L = 6, mMid = 200, mEnd = 150, v = 180): Array<{ x: number; mPos: number; mNeg: number; v: number }> {
  const out: Array<{ x: number; mPos: number; mNeg: number; v: number }> = [];
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * L;
    const s = x / L;
    out.push({
      x,
      mPos: Math.max(0, mMid * 4 * s * (1 - s)),
      mNeg: Math.max(0, mEnd * (1 - 4 * s * (1 - s))),
      v: v * Math.abs(1 - 2 * s),
    });
  }
  return out;
}

describe('§9.7.3 where a bar may stop', () => {
  const st = envelope();

  it('extends by max(d, 12 d_b) per §9.7.3.3', () => {
    // d = 0.55 governs over 12 × 0.020 = 0.24.
    const c = evaluateCutoff({
      theoretical: 2.0, d: 0.55, diameterMm: 20, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: false,
      edition: '2025', towardEnd: true,
    });
    expect(c.actual).toBeCloseTo(2.55, 9);
    expect(c.refs[0].clause).toBe('9.7.3.3');
  });

  it('lets 12 d_b govern for a large bar in a shallow beam', () => {
    // 12 × 0.032 = 0.384 > d = 0.30.
    const c = evaluateCutoff({
      theoretical: 2.0, d: 0.30, diameterMm: 32, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: false,
      edition: '2025', towardEnd: true,
    });
    expect(c.actual).toBeCloseTo(2.384, 6);
  });

  it('does not apply §9.7.3.5 outside a tension zone', () => {
    const c = evaluateCutoff({
      theoretical: 2.0, d: 0.55, diameterMm: 20, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: false,
      edition: '2025', towardEnd: true,
    });
    expect(c.legality).toBe('notInTension');
  });

  it('legalises via §9.7.3.5(a) when shear is low', () => {
    // Cut near midspan, where the envelope shear is small.
    const c = evaluateCutoff({
      theoretical: 2.9, d: 0.55, diameterMm: 20, stations: st, vn: 400,
      b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: true,
      edition: '2025', towardEnd: true,
    });
    expect(c.legality).toBe('lowShear');
    expect(c.note).toMatch(/9\.7\.3\.5\(a\)/);
  });

  it('legalises via §9.7.3.5(b) with double area and moderate shear', () => {
    const c = evaluateCutoff({
      theoretical: 0.8, d: 0.55, diameterMm: 25, stations: envelope(6, 200, 150, 300),
      vn: 400, b: 0.30, fy: 420, continuingDoubleArea: true, inTensionZone: true,
      edition: '2025', towardEnd: false,
    });
    expect(['doubleArea', 'lowShear']).toContain(c.legality);
  });

  it('falls back to §9.7.3.5(c) extra stirrups when (a) and (b) both fail', () => {
    const c = evaluateCutoff({
      theoretical: 0.2, d: 0.55, diameterMm: 20, stations: envelope(6, 200, 150, 390),
      vn: 400, b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: true,
      edition: '2025', towardEnd: false,
    });
    expect(c.legality).toBe('extraStirrups');
    expect(c.extraStirrups!.length).toBeCloseTo(0.75 * 0.55, 9);
    expect(c.extraStirrups!.maxSpacing).toBeCloseTo(0.55 / 8, 9);
    expect(c.extraStirrups!.minAvOverS).toBeCloseTo(0.41 * 0.30 / 420, 9);
    expect(c.note).toMatch(/βb adoptado = 1/);
  });

  it('never invents a convenient cut-off position', () => {
    // The actual position is always the theoretical one plus the mandated extension,
    // in the stated direction — never nudged to make a rule pass.
    for (const toward of [true, false]) {
      const c = evaluateCutoff({
        theoretical: 1.5, d: 0.55, diameterMm: 20, stations: st, vn: 400,
        b: 0.30, fy: 420, continuingDoubleArea: false, inTensionZone: true,
        edition: '2025', towardEnd: toward,
      });
      expect(c.actual).toBeCloseTo(toward ? 1.5 + 0.55 : 1.5 - 0.55, 9);
    }
  });

  it('the sheets ask the extra stirrups for fyt capped at 420 MPa (§20.2.1.3), whatever the steel', () => {
    const input = { theoretical: 0.2, d: 0.55, diameterMm: 20, stations: envelope(6, 200, 150, 390), vn: 400, b: 0.30, continuingDoubleArea: false, inTensionZone: true, towardEnd: false };
    const at500 = CIRSOC_LINE.cutoff({ ...input, fy: 500 });
    expect(at500.extraStirrups!.minAvOverS).toBeCloseTo(0.41 * 0.30 / 420, 12);
    expect(at500).toEqual(CIRSOC_LINE.cutoff({ ...input, fy: 420 }));
  });
});
