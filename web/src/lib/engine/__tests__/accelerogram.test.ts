/**
 * Ground-motion records: read in any of the three shapes, and replayed at the speed they
 * happened.
 *
 * The engine samples acceleration by step index, so a record handed over at its own dt would
 * play faster or slower than the ground moved. `resample` is what keeps time honest, and these
 * pin it on values whose interpolation is exact.
 */
import { describe, it, expect } from 'vitest';
import { G } from '../dynamics/requests';
import { parseGroundRecord, resample, recordSummary, RecordError } from '../dynamics/accelerogram';
import { timeHistoryView } from '../../store/time-history-view.svelte';

const AT2 = `PEER NGA STRONG MOTION DATABASE RECORD
SOME EARTHQUAKE 1999, STATION, 090
ACCELERATION TIME SERIES IN UNITS OF G
NPTS=    5, DT=   .0100 SEC
  0.1000E+00  -0.2000E+00   0.3000E+00
  0.0000E+00   0.5000E+00
`;

describe('parseGroundRecord', () => {
  it('reads a PEER AT2: header, then values in g', () => {
    const r = parseGroundRecord(AT2, 'm/s2');
    expect(r.format).toBe('at2');
    expect(r.times).toEqual([0, 0.01, 0.02, 0.03, 0.04].map((v) => expect.closeTo(v, 12)));
    // In g whatever the unit selector says: the format defines it.
    expect(r.accel[4]).toBeCloseTo(0.5 * G, 12);
  });

  it('reads the older AT2 header, numbers first', () => {
    const old = AT2.replace('NPTS=    5, DT=   .0100 SEC', '    5    .0100    NPTS, DT');
    const r = parseGroundRecord(old, 'g');
    expect(r.times.length).toBe(5);
    expect(r.times[1]).toBeCloseTo(0.01, 12);
  });

  it('reads a time–acceleration table in the unit stated', () => {
    const r = parseGroundRecord('t;a\n0;0\n0.02;1.5\n0.04;-1.5\n', 'm/s2');
    expect(r.format).toBe('table');
    expect(r.times).toEqual([0, 0.02, 0.04]);
    expect(r.accel).toEqual([0, 1.5, -1.5]);
    expect(parseGroundRecord('0 0.1\n0.02 0.2', 'g').accel[1]).toBeCloseTo(0.2 * G, 12);
  });

  it('reads a single column at the dt it is given, and refuses without one', () => {
    const r = parseGroundRecord('0.1\n0.2\n0.3', 'g', 0.005);
    expect(r.format).toBe('column');
    expect(r.times[2]).toBeCloseTo(0.01, 12);
    expect(() => parseGroundRecord('0.1\n0.2', 'g')).toThrow(RecordError);
  });

  it('refuses a table whose times go backwards, and an empty file', () => {
    expect(() => parseGroundRecord('0 1\n0.02 2\n0.01 3', 'g')).toThrow(/notIncreasing/);
    expect(() => parseGroundRecord('no numbers here', 'g')).toThrow(/empty/);
  });
});

describe('resample', () => {
  const ramp = { times: [0, 0.1, 0.2], accel: [0, 1, 0], format: 'table' as const };

  it('interpolates onto the analysis dt, so the record lasts as long as it did', () => {
    expect(resample(ramp, 0.05, 5)).toEqual([0, 0.5, 1, 0.5, 0].map((v) => expect.closeTo(v, 12)));
  });

  it('holds the ground still once the record ends', () => {
    expect(resample(ramp, 0.1, 5)).toEqual([0, 1, 0, 0, 0].map((v) => expect.closeTo(v, 12)));
  });

  it('starts at the first sample even when the table does not start at zero', () => {
    const late = { ...ramp, times: [5, 5.1, 5.2] };
    expect(resample(late, 0.05, 3)).toEqual([0, 0.5, 1].map((v) => expect.closeTo(v, 12)));
  });

  it('summarises duration and peak ground acceleration', () => {
    expect(recordSummary(ramp)).toEqual({ duration: 0.2, pga: 1, points: 3 });
  });
});

describe('timeHistoryView', () => {
  const result = {
    timeSteps: [0, 0.01, 0.02],
    nodeHistories: [
      { nodeId: 2, ux: [0, 0.003, -0.004], uy: [0, 0, 0], uz: [0, 0, 0], rx: [0, 0, 0], ry: [0, 1e-4, 0], rz: [0, 0, 0] },
    ],
    peakDisplacements: [{ nodeId: 2, ux: 0.004, uy: 0, uz: 0 }],
    peakReactions: [],
    nSteps: 2,
    method: 'Newmark',
  };

  it('gives the displacement field at the step on screen, rotations included', () => {
    timeHistoryView.set(result, 7);
    timeHistoryView.setStep(1);
    expect(timeHistoryView.frame()).toEqual([{ nodeId: 2, ux: 0.003, uy: 0, uz: 0, rx: 0, ry: 1e-4, rz: 0 }]);
    expect(timeHistoryView.time).toBe(0.01);
    expect(timeHistoryView.peak).toBeCloseTo(0.004, 12);
  });

  it('keeps the step inside the record, and forgets everything on clear', () => {
    timeHistoryView.set(result, 7);
    timeHistoryView.setStep(99);
    expect(timeHistoryView.step).toBe(2);
    timeHistoryView.setStep(-3);
    expect(timeHistoryView.step).toBe(0);
    timeHistoryView.setShown(true);
    timeHistoryView.clear();
    expect(timeHistoryView.result).toBeNull();
    expect(timeHistoryView.shown).toBe(false);
  });
});
