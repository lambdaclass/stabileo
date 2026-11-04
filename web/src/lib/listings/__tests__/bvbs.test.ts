/** BVBS records: header, geometry, checksum, from a bar's path. */
import { describe, it, expect } from 'vitest';
import { bvbsChecksum, bvbsRecord, legsOf, mandrelOf } from '../bvbs';

const seg = (a: [number, number, number], b: [number, number, number]) => ({ start: { x: a[0], y: a[1], z: a[2] }, end: { x: b[0], y: b[1], z: b[2] } });

describe('BVBS', () => {
  it('a straight bar: one leg, its length in mm, the closing angle 0', () => {
    expect(legsOf({ segments: [seg([0, 0, 0], [4.2, 0, 0])] } as never)).toEqual([{ l: 4200, w: 0 }]);
  });

  it('a bar with a 90° hook at each end: three legs, a turn each way it bends', () => {
    const legs = legsOf({ segments: [seg([0, 0, 0.3], [0, 0, 0]), seg([0, 0, 0], [5, 0, 0]), seg([5, 0, 0], [5, 0, 0.3])] } as never);
    expect(legs.map((x) => Math.round(x.l))).toEqual([300, 5000, 300]);
    expect(legs.map((x) => Math.abs(Math.round(x.w)))).toEqual([90, 90, 0]);
    // Both bends turn the same way (a U).
    expect(Math.sign(legs[0]!.w)).toBe(Math.sign(legs[1]!.w));
  });

  it('the checksum is 96 less the ASCII sum modulo 32, and closes the record', () => {
    expect(bvbsChecksum('A')).toBe(96 - (65 % 32));
    const body = 'BF2D@HjEdificio Sur@rE-03@iB@pB12@l5600@n4@e8.840@d16@gADN 420@s96@v@a@Gl300@w90@l5000@w90@l300@w0@C';
    const r = bvbsRecord({ mark: 'B12', count: 4, diameterMm: 16, lengthMm: 5600, weightKg: 8.84, legs: [{ l: 300, w: 90 }, { l: 5000, w: 90 }, { l: 300, w: 0 }], mandrelMm: mandrelOf(16, false) },
      { project: 'Edificio Sur', plan: 'E-03', index: 'B', grade: 'ADN 420' });
    expect(r).toBe(`${body}${bvbsChecksum(body)}@\r\n`);
    // An accent or an «@» in a text never breaks the record.
    expect(bvbsRecord({ mark: 'P@1', count: 1, diameterMm: 8, lengthMm: 1000, weightKg: 0.4, legs: [{ l: 1000, w: 0 }], mandrelMm: 32 }, { project: 'Ñandú', plan: 'x', index: '', grade: 'ADN' })).toMatch(/^BF2D@HjNandu@rx@i@pP1@/);
  });

  it('mandrels: 4 db for ties up to Ø16, 6 db up to Ø25, 8 db above', () => {
    expect([mandrelOf(8, true), mandrelOf(16, false), mandrelOf(32, false)]).toEqual([32, 96, 256]);
  });
});
