/**
 * Stairs and post-tensioned slabs against hand values.
 *
 * The stair: ten risers of 175 mm on 280 mm treads, a 180 mm waist, one metre of landing at each
 * end, cast with its beams: its plan loads, the simply supported moment of the piecewise load,
 * the steel and its spacing, the top steel of Tabla 6.5.2, the thickness of Tabla 7.3.1.1 and
 * the bars along the soffit. The strip: 20 tendons on 8 m, an 8 m span and a 250 mm slab, its
 * losses, its balancing load and its stresses at midspan, worked out independently.
 */
import { describe, expect, it } from 'vitest';
import { barSpacing, piecewiseBeam, stairDesign, type StairDesignSpec } from '../stairs';
import { controlPoints, ptSpacingRow, ptStripRows, stressingOrder, tendonForces, tendonProfile, unbondedFps, type TendonSystem } from '../post-tensioned';
import { slabVc } from '../one-way-shear';

const stair: StairDesignSpec = { riser: 0.175, tread: 0.28, steps: 10, waist: 0.18, width: 1.2, landingBottom: 1, landingTop: 1, ends: 'monolithic', finishes: 1, live: 4 };
const mat = { fc: 25, fy: 420, cover: 0.025, barDia: 12, distDia: 8 };

describe('stairs', () => {
  it('plan loads, the piecewise span and its moment, by hand', () => {
    const d = stairDesign(stair, mat);
    expect(d.geometry.angleDeg).toBeCloseTo(34.778, 3);
    expect(d.loads.deadFlight).toBeCloseTo(8.666, 3);
    expect(d.loads.deadLanding).toBeCloseTo(5.5, 9);
    expect(d.loads.wuFlight).toBeCloseTo(16.799, 3);
    expect(d.geometry.span).toBeCloseTo(4.52, 9);
    expect(d.mu).toBeCloseTo(41.003, 2);
    expect(d.muNeg).toBeCloseTo(12.87, 2);
    expect(d.reactions.foot.dead).toBeCloseTo(16.419, 3);
    expect(d.reactions.head.live).toBeCloseTo(9.04, 3);
  });

  it('the steel, its spacing, the top steel, the thickness and the shear', () => {
    const d = stairDesign(stair, mat);
    expect(d.asBottom! * 1e4).toBeCloseTo(7.670, 2);
    const by = (c: string) => d.rows.find((r) => r.clause === c)!;
    expect(by('22.3').derivation!.join(' ')).toContain('Ø12 @ 125 mm');
    expect(by('6.5.2').demand).toBeCloseTo(3.24, 2); // As,min governs the top steel
    expect(by('7.3.1.1').demand).toBeCloseTo(0.2112, 3);
    expect(by('7.3.1.1').status).toBe('fail');
    expect(by('22.5.5.1(c)').capacity).toBeCloseTo(67.279, 1);
    expect(by('24.4.3.2').ratio!).toBeLessThanOrEqual(1); // Ø8 @ 150 mm
  });

  it('the bars cross at the head of the flight, each past it by ld', () => {
    const d = stairDesign(stair, mat);
    const [b1, b2, top, dist] = d.bars;
    expect(b1!.role).toBe('bottom');
    // Level along the bottom landing, up the flight and past its head to the landing's top cover, then level.
    expect(b1!.legs.map((l) => l.angleDeg)).toEqual([0, d.geometry.angleDeg, 0]);
    const rising = b1!.legs[1]!.length - d.geometry.slope;
    expect(rising * Math.sin(d.geometry.angleRad)).toBeCloseTo(0.18 - 2 * 0.025, 3);
    expect(b2!.role).toBe('bottomHead');
    expect(b2!.legs[0]!.length).toBeCloseTo(rising + b1!.legs[2]!.length, 3); // both run ld past the bend
    expect(top!.role).toBe('top');
    expect(dist!.role).toBe('distribution');
    expect(b1!.count).toBe(10); // 1,15 m at 12,5 cm
  });

  it('helpers: a spacing in 25 mm steps, a simple span, the shear of a slab', () => {
    expect(barSpacing(7.67e-4, 12, 0.3)).toBeCloseTo(0.125, 9);
    const b = piecewiseBeam([{ length: 4, w: 10 }]);
    expect(b.mMax).toBeCloseTo(20, 6);
    expect(b.xMax).toBeCloseTo(2, 6);
    expect(slabVc(25, 1, 0.149, 0.00607).lambdaS).toBe(1);
  });
});

const sys: TendonSystem = { fpu: 1860, fpy: 1675, eps: 195000, aps: 98.7, jackRatio: 0.8, mu: 0.06, k: 0.0033, seating: 6, longTermLoss: 100, fci: 20, liveEnds: 'one' };
const layout = { count: 20, yLeft: 0.125, yLow: 0.035, yRight: 0.125 };

describe('post-tensioned slabs', () => {
  it('the parabola: drape, curvature, the chairs at the tenths', () => {
    const p = tendonProfile(layout, 8);
    expect(p.drape).toBeCloseTo(0.09, 12);
    expect(p.curvature).toBeCloseTo(0.01125, 12);
    expect(p.y(4)).toBeCloseTo(0.035, 12);
    expect(controlPoints(layout, 8).map((c) => c.y)).toEqual([0.125, 0.093, 0.067, 0.049, 0.039, 0.035, 0.039, 0.049, 0.067, 0.093, 0.125]);
  });

  it('losses: friction, a wedge set reaching the far end, elastic shortening and the long term', () => {
    const f = tendonForces(sys, layout, 8, 0.25, 8);
    expect(f.pj).toBeCloseTo(146.866, 3);
    expect(f.xSet).toBe(8);
    expect((f.pAnchor * 1000) / sys.aps).toBeCloseTo(1295.18, 1);
    expect(f.pInitial).toBeCloseTo(130.120, 2);
    expect(f.esLoss).toBeCloseTo(6.036, 2);
    expect(f.fse).toBeCloseTo(1212.30, 1);
  });

  it('balancing load, stresses at midspan, bonded minimum and strength', () => {
    const L = 8, h = 0.25, wD = 25 * h + 1;
    const ats = [0.5, 1.5, 2.5, 3.5, 4, 4.5, 5.5, 6.5, 7.5];
    const service = ats.map((x) => ({ at: x, dead: (wD * x * (L - x)) / 2, livePos: (2 * x * (L - x)) / 2, liveNeg: 0 }));
    const factored = ats.map((x) => ({ at: x, pos: ((1.2 * wD + 1.6 * 2) * x * (L - x)) / 2, neg: 0 }));
    const r = ptStripRows(sys, layout, { h, span: L, width: 8, fc: 30, fy: 420, transverse: 8, service, factored, wDead: wD, wSelf: 25 * h });
    expect(r.pe).toBeCloseTo(299.136, 2);
    expect(r.wb).toBeCloseTo(3.3653, 3);
    const by = (k: string) => r.rows.find((x) => x.titleKey === `check.pt.${k}`)!;
    expect(by('precompression').capacity).toBeCloseTo(1.197, 3);
    expect(by('jacking').status).toBe('nearLimit'); // 0,80·fpu is the limit itself
    expect(by('classU').demand).toBeCloseTo(3.323, 2);
    expect(by('classU').status).toBe('fail');
    expect(by('sustained').demand).toBeCloseTo(4.18, 2);
    expect(by('totalC').demand).toBeCloseTo(5.716, 2);
    expect(by('transferT').demand).toBeCloseTo(0.707, 2);
    expect(by('bondedPos').demand).toBeCloseTo(7.271, 2);
    expect(by('bondedPos').status).toBe('notVerified');
    expect(by('bondedNeg').demand).toBeCloseTo(15, 6);
    const s = by('strengthPos');
    expect(s.inputs.find((i) => i.symbol === 'fps')!.value).toBeCloseTo(1543.702, 2);
    expect(s.capacity).toBeCloseTo(71.145, 2);
    expect(s.inputs.find((i) => i.symbol === 'M2')!.value).toBeCloseTo(0, 6);
  });

  it('fps refuses a tendon below half its strength; spacing and stressing order', () => {
    expect(unbondedFps(900, 1860, 1675, 30, 0.002, 30)).toBeNull();
    expect(unbondedFps(1200, 1860, 1675, 30, 0.002, 40)).toBeCloseTo(1200 + 70 + 50, 9);
    const row = ptSpacingRow(0.2, [{ dir: 'x', layout: { ...layout, banded: true }, width: 8 }, { dir: 'y', layout: { ...layout, count: 6 }, width: 8 }]);
    expect(row.demand).toBeCloseTo(1.333, 3);
    expect(row.capacity).toBeCloseTo(1.5, 9);
    expect(row.location).toBe('y');
    expect(stressingOrder(5)).toEqual([3, 2, 4, 1, 5]);
  });
});
