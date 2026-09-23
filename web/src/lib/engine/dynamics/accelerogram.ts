/**
 * Ground-motion records, read and resampled onto the analysis time step.
 *
 * The engine samples ground acceleration BY STEP INDEX: value k is the acceleration at k·dt,
 * with no time vector, and anything past the end of the series counts as zero. A record is
 * rarely sampled at the dt the analysis wants, so feeding one in as it stands would replay it
 * faster or slower than it happened. Every record goes through `resample` first.
 *
 * Three shapes are read:
 *   · PEER NGA `.AT2` — four header lines, the fourth carrying NPTS and DT, then values in g.
 *   · Two columns — time, acceleration — separated by spaces, tabs, commas or semicolons.
 *   · One column — acceleration only, at a dt the caller states.
 *
 * Pure: no store, no runes, no i18n. Errors are thrown as codes the panel translates.
 */

import { G } from './requests';

export type AccelUnit = 'g' | 'm/s2';

export interface GroundRecord {
  /** Sample times, s, strictly increasing, starting at the first sample. */
  times: number[];
  /** Acceleration, m/s². */
  accel: number[];
  /** Where the record came from, for the panel to say. */
  format: 'at2' | 'table' | 'column';
}

export class RecordError extends Error {
  constructor(readonly code: 'empty' | 'notIncreasing' | 'needDt' | 'badAt2', detail = '') {
    super(`${code}${detail ? `: ${detail}` : ''}`);
  }
}

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function numbersIn(line: string): number[] {
  // A comma is a separator here, never a decimal mark: records are machine-written.
  return (line.match(NUM) ?? []).map(Number).filter(Number.isFinite);
}

/**
 * Read a record.
 *
 * `unit` applies to tables and columns; an AT2 is in g by definition. `columnDt` is required for
 * a single column, since the values alone do not say how far apart they are.
 */
export function parseGroundRecord(text: string, unit: AccelUnit, columnDt?: number): GroundRecord {
  const lines = text.split(/\r?\n/);
  const scale = unit === 'g' ? G : 1;

  const header = lines.slice(0, 6).findIndex((l) => /NPTS/i.test(l) && /DT/i.test(l));
  if (header >= 0) {
    const h = lines[header]!;
    // Two spellings are in circulation: `NPTS= 4000, DT= .0050 SEC`, and the older
    // `4000   .0050   NPTS, DT`, where the numbers come first and in that order.
    const named = (key: string) => h.match(new RegExp(`${key}\\s*=\\s*([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?)`, 'i'))?.[1];
    const bare = numbersIn(h);
    const npts = Number(named('NPTS') ?? bare[0]);
    const dt = Number(named('DT') ?? bare[1]);
    if (!(npts > 0) || !(dt > 0)) throw new RecordError('badAt2', h.trim());
    const values = lines.slice(header + 1).flatMap(numbersIn).slice(0, npts);
    if (values.length === 0) throw new RecordError('empty');
    return { times: values.map((_, i) => i * dt), accel: values.map((a) => a * G), format: 'at2' };
  }

  const rows = lines.map(numbersIn).filter((r) => r.length > 0);
  if (rows.length === 0) throw new RecordError('empty');

  if (rows.every((r) => r.length >= 2)) {
    const times = rows.map((r) => r[0]!);
    for (let i = 1; i < times.length; i++) {
      if (!(times[i]! > times[i - 1]!)) throw new RecordError('notIncreasing', `t = ${times[i]}`);
    }
    return { times, accel: rows.map((r) => r[1]! * scale), format: 'table' };
  }

  if (!(columnDt && columnDt > 0)) throw new RecordError('needDt');
  const values = rows.flat();
  return { times: values.map((_, i) => i * columnDt), accel: values.map((a) => a * scale), format: 'column' };
}

/**
 * The record at k·dt, k = 0 … nSteps − 1, by linear interpolation.
 *
 * Times are taken relative to the first sample, so a table that starts at t = 5 s starts the
 * analysis at its first value. Past the last sample the ground is still — the engine's own
 * convention for a series that runs out.
 */
export function resample(record: GroundRecord, dt: number, nSteps: number): number[] {
  const t0 = record.times[0] ?? 0;
  const out: number[] = new Array(nSteps).fill(0);
  let j = 0;
  const last = record.times.length - 1;
  for (let k = 0; k < nSteps; k++) {
    const t = t0 + k * dt;
    if (t > record.times[last]! + 1e-12) break;
    while (j < last && record.times[j + 1]! < t) j++;
    const ta = record.times[j]!, tb = record.times[Math.min(j + 1, last)]!;
    const aa = record.accel[j]!, ab = record.accel[Math.min(j + 1, last)]!;
    out[k] = tb > ta ? aa + (ab - aa) * (t - ta) / (tb - ta) : aa;
  }
  return out;
}

/** Duration, s, and peak ground acceleration, m/s² — what the panel shows about a record. */
export function recordSummary(record: GroundRecord): { duration: number; pga: number; points: number } {
  let pga = 0;
  for (const a of record.accel) pga = Math.max(pga, Math.abs(a));
  const n = record.times.length;
  return { duration: n > 0 ? record.times[n - 1]! - record.times[0]! : 0, pga, points: n };
}
