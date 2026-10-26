/**
 * Bars cut where a person cut them in the frame editor: the detailing places the curtailed bottom
 * bars and the support top bars at the edited points, and says so when a cut is shorter than
 * §9.7.3 allows.
 */
import { describe, it, expect } from 'vitest';
import { generateBeamBars, type BeamGenerationInput, type MomentStation } from '../generate-beam';

function envelope(L = 6, mMid = 200, mEnd = 150, v = 180): MomentStation[] {
  return Array.from({ length: 11 }, (_, i) => {
    const s = i / 10;
    return { x: s * L, mPos: Math.max(0, mMid * 4 * s * (1 - s)), mNeg: Math.max(0, mEnd * (1 - 4 * s * (1 - s))), v: v * Math.abs(1 - 2 * s) };
  });
}

const input = (over: Partial<BeamGenerationInput> = {}): BeamGenerationInput => ({
  elementId: 7, L: 6, b: 0.3, h: 0.6, d: 0.55, cover: 0.025, stirrupDia: 8, fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
  stations: envelope(), supportI: 'continuous', supportJ: 'continuous', vn: 400,
  bottom: { count: 6, diameterMm: 20 }, topStart: { count: 4, diameterMm: 16 }, topEnd: { count: 4, diameterMm: 16 },
  lateralSystem: false, ld: (d) => 0.04 * d,
  origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
  bentUp: { seismicDesign: 'notRequired', optOut: false, assumption: 'Zona sísmica 0' },
  ...over,
});

const span = (b: { segments: Array<{ start: { x: number }; end: { x: number } }> }) =>
  [Math.min(...b.segments.map((s) => Math.min(s.start.x, s.end.x))), Math.max(...b.segments.map((s) => Math.max(s.start.x, s.end.x)))];

describe('cuts from the frame editor', () => {
  it('the bottom bars stop where the person cut them, as many as the line says', () => {
    const g = generateBeamBars(input({ cuts: { bottomFrom: 0.3, bottomTo: 5.7, bottomShort: 2 } }));
    const cut = g.bars.filter((b) => b.id.includes('-bot-cut-'));
    expect(cut).toHaveLength(2);
    for (const b of cut) expect(span(b)).toEqual([0.3, 5.7]);
    expect(g.bars.filter((b) => b.id.includes('-bot-cont-'))).toHaveLength(4);
    expect(g.unsupported.some((u) => u.includes('Corte editado'))).toBe(false);
  });

  it('a cut shorter than §9.7.3.3 allows is said', () => {
    const g = generateBeamBars(input({ cuts: { bottomFrom: 2.5, bottomTo: 3.5, bottomShort: 2 } }));
    expect(g.unsupported.some((u) => u.startsWith('Corte editado de 2Ø20 inferiores'))).toBe(true);
  });

  it('the top bars at a support reach where the person stretched them', () => {
    const own = generateBeamBars(input());
    const ownTop = own.bars.find((b) => b.id.startsWith('e7-topI-'))!;
    const reach = span(ownTop)[1]! + 0.4;
    const g = generateBeamBars(input({ cuts: { topI: reach } }));
    const top = g.bars.filter((b) => b.id.startsWith('e7-topI-'));
    expect(top.length).toBeGreaterThan(0);
    for (const b of top) expect(span(b)[1]).toBeCloseTo(reach, 9);
    expect(g.unsupported.some((u) => u.includes('superior I'))).toBe(false);
    const short = generateBeamBars(input({ cuts: { topI: 0.3 } }));
    expect(short.unsupported.some((u) => u.startsWith('Corte editado de la armadura superior I'))).toBe(true);
  });
});
