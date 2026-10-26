/**
 * Skin reinforcement of a deep beam (§9.7.2.3). For ADN 420 fs = ⅔·420 = 280 MPa, so §24.3.2 gives
 * s ≤ min(380 − 2.5·cc, 300) mm; with 25 mm of cover and a Ø8 stirrup cc = 33 mm and s ≤ 297.5 mm,
 * proposed at 275 mm.
 */
import { describe, it, expect } from 'vitest';
import { proposeSkin, skinMaxSpacing, skinRequired } from '../skin';
import { generateBeamBars, type BeamGenerationInput, type MomentStation } from '../../../engine/detailing/generate-beam';

describe('skin reinforcement (§9.7.2.3)', () => {
  it('past 900 mm of depth only', () => {
    expect(skinRequired(0.9)).toBe(false);
    expect(skinRequired(0.95)).toBe(true);
    expect(proposeSkin('2025', 0.8, 420, 0.025, 8)).toBeNull();
  });

  it('spaced as the bars nearest a tension face', () => {
    expect(skinMaxSpacing('2025', 420, 0.025, 8)).toBeCloseTo(0.2975, 9);
    expect(proposeSkin('2025', 1.0, 420, 0.025, 8)).toEqual({ diameter: 10, spacing: 0.275 });
    expect(proposeSkin('2025', 1.4, 420, 0.025, 8)?.diameter).toBe(12);
  });

  it('the detailing places them on both side faces, inside the legs, within the spacing', () => {
    const stations: MomentStation[] = Array.from({ length: 11 }, (_, i) => {
      const s = i / 10;
      return { x: 8 * s, mPos: 600 * 4 * s * (1 - s), mNeg: Math.max(0, 400 * (1 - 4 * s * (1 - s))), v: 300 * Math.abs(1 - 2 * s) };
    });
    const input: BeamGenerationInput = {
      elementId: 3, L: 8, b: 0.3, h: 1.0, d: 0.94, cover: 0.025, stirrupDia: 8,
      fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025', stations,
      supportI: 'continuous', supportJ: 'continuous', vn: 800,
      bottom: { count: 4, diameterMm: 20 }, topStart: { count: 3, diameterMm: 16 }, topEnd: { count: 3, diameterMm: 16 },
      lateralSystem: false, ld: (d) => 0.04 * d,
      origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
      supportFaceI: 0.2, supportFaceJ: 0.2,
      bentUp: { seismicDesign: 'notRequired', optOut: false, assumption: 'Zona sísmica 0' },
      skin: { diameter: 10, spacing: 0.275 },
    };
    const gen = generateBeamBars(input);
    const skin = gen.bars.filter((b) => b.id.includes('-skin-'));
    const plain = generateBeamBars({ ...input, skin: undefined });
    expect(plain.bars.some((b) => b.id.includes('-skin-'))).toBe(false);
    // The supports hog, so both halves are tension faces somewhere: the whole side.
    expect(skin.length % 2).toBe(0);
    const left = skin.filter((b) => b.id.includes('-skin-l-'));
    expect(left.length).toBe(skin.length / 2);
    // Across: half width less cover, the stirrup and half the bar, 0.15 − 0.025 − 0.008 − 0.005 = 0.112 m.
    for (const b of skin) {
      const p = b.segments[0]!.start;
      expect(Math.abs(p.y)).toBeCloseTo(0.112, 9);
      expect(p.x).toBeCloseTo(0.2, 9);
      expect(b.segments[b.segments.length - 1]!.end.x).toBeCloseTo(7.8, 9);
      expect(b.diameterMm).toBe(10);
    }
    // Rows evenly between the bottom and top bars, no gap past the spacing.
    const zs = left.map((b) => b.segments[0]!.start.z).sort((a, b) => a - b);
    const bottom = gen.bars.find((b) => b.id.includes('-bot-cont-'))!.segments.find((s) => s.kind === 'straight')!.start.z;
    const gaps = [zs[0]! - bottom, ...zs.slice(1).map((z, i) => z - zs[i]!)];
    for (const g of gaps) expect(g).toBeLessThanOrEqual(0.275 + 1e-9);
    expect(zs[zs.length - 1]!).toBeGreaterThan(0);
    expect(gen.refs.some((r) => r.clause === '9.7.2.3')).toBe(true);
  });
});
