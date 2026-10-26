/** The sheets' display: labels, colour by diameter, screen and plan, per-layer style. */
import { describe, it, expect } from 'vitest';
import { barLabel, displayPrimitives, displayStyle } from '../display';
import { DIAMETER_COLORS } from '../layers';
import { sheetToSvg } from '../to-svg';
import type { Primitive } from '../primitives';

const ps: Primitive[] = [
  { kind: 'line', layer: 'RC-BAR', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, dia: 12 },
  { kind: 'text', layer: 'RC-TEXT', at: { x: 0, y: 2 }, text: 'A1', height: 2.5, dia: 12 },
  { kind: 'line', layer: 'RC-DIM', a: { x: 0, y: 0 }, b: { x: 0, y: 5 } },
];

describe('a bar\'s label', () => {
  it('reads «mark count Ø dia c/spacing L=length» by default', () => {
    expect(barLabel({ mark: 'IX1', count: 6, dia: 10, spacing: 20, length: '4,12' })).toBe('IX1 6Ø10 c/20 L=4,12');
  });
  it('takes the office\'s order and affixes', () => {
    expect(barLabel({ mark: 3, count: 6, dia: 10, length: '4,12' }, { barLabel: { order: ['count', 'mark', 'dia', 'length'], prefix: { mark: 'P(', dia: 'Ø' }, suffix: { mark: ')', length: ' m' } } })).toBe('6 P(3) Ø10 4,12 m');
  });
});

describe('colour by diameter, screen and plan', () => {
  it('a bar goes to its diameter\'s layer and colour', () => {
    const out = displayPrimitives(ps, { colorByDiameter: true }, 'plan');
    expect(out.map((p) => p.layer)).toEqual(['RC-BAR-D12', 'RC-TEXT-D12', 'RC-DIM']);
    expect(sheetToSvg(20, 20, out)).toContain(`data-layer="RC-BAR-D12"`);
    expect(DIAMETER_COLORS[12]).toBe(1);
  });
  it('a layer hidden on the plan stays on the screen', () => {
    const d = { hidden: { plan: ['RC-DIM'] } };
    expect(displayPrimitives(ps, d, 'plan').map((p) => p.layer)).toEqual(['RC-BAR', 'RC-TEXT']);
    expect(displayPrimitives(ps, d, 'screen')).toHaveLength(3);
  });
  it('text scaled and weight and colour set per layer', () => {
    const d = { layers: { 'RC-TEXT': { text: 1.5 }, 'RC-BAR': { weight: 0.5, color: 5 } } };
    expect((displayPrimitives(ps, d, 'plan')[1] as { height: number }).height).toBeCloseTo(3.75, 9);
    expect(displayStyle(d)('RC-BAR')).toMatchObject({ weight: 0.5, color: 5 });
    expect(displayStyle(d)('RC-DIM').weight).toBe(0.18);
  });
});
