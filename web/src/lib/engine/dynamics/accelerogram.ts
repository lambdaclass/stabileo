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

/** `cm/s2` is the gal, the unit many Latin American networks publish in. */
export type AccelUnit = 'g' | 'm/s2' | 'cm/s2';

/** m/s² per unit. */
export const ACCEL_UNIT_SCALE: Readonly<Record<AccelUnit, number>> = Object.freeze({ g: G, 'm/s2': 1, 'cm/s2': 0.01 });

export interface GroundRecord {
  /** Sample times, s, strictly increasing, starting at the first sample. */
  times: number[];
  /** Acceleration, m/s². */
  accel: number[];
  /** Where the record came from, for the panel to say. */
  format: 'at2' | 'table' | 'column';
  /** The unit the values were read in — the file's own, for an AT2. */
  unit: AccelUnit;
}

export type RecordErrorCode = 'empty' | 'notIncreasing' | 'needDt' | 'badAt2' | 'notAcceleration';

export class RecordError extends Error {
  constructor(readonly code: RecordErrorCode, detail = '') {
    super(`${code}${detail ? `: ${detail}` : ''}`);
  }
}

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function numbersIn(line: string): number[] {
  // A comma is a separator here, never a decimal mark: records are machine-written.
  return (line.match(NUM) ?? []).map(Number).filter(Number.isFinite);
}

/**
 * The unit an AT2 header states, or g.
 *
 * PEER writes `UNITS OF G`; converted records circulate with `CM/S/S`, `CM/SEC2` or `GAL`.
 */
function at2Unit(header: string): AccelUnit {
  if (/\bGALS?\b|CM\s*\/\s*S(EC)?\s*(\/\s*S(EC)?|\^?\s*2|2)/i.test(header)) return 'cm/s2';
  if (/M\s*\/\s*S(EC)?\s*(\/\s*S(EC)?|\^?\s*2|2)/i.test(header)) return 'm/s2';
  return 'g';
}

/**
 * Read a record.
 *
 * `unit` applies to tables and columns; an AT2 says its own. `columnDt` is required for a
 * column, since the values alone do not say how far apart they are.
 *
 * `asColumn` reads the text as a column whatever its shape — for values typed one per step.
 *
 * A TABLE is every row holding exactly two numbers with the first strictly increasing — time,
 * then acceleration. Anything else is a column read row by row, which is how raw records are
 * often written: several values to a line, no time at all.
 */
export function parseGroundRecord(
  text: string, unit: AccelUnit, columnDt?: number, opts: { asColumn?: boolean } = {},
): GroundRecord {
  const lines = text.split(/\r?\n/);

  const header = lines.slice(0, 6).findIndex((l) => /NPTS/i.test(l) && /DT/i.test(l));
  if (header >= 0 && !opts.asColumn) {
    const preamble = lines.slice(0, header + 1).join(' ');
    // The PEER velocity and displacement files share this layout exactly.
    if (/VELOCITY|DISPLACEMENT/i.test(preamble)) throw new RecordError('notAcceleration', lines[Math.max(0, header - 1)]!.trim());
    const h = lines[header]!;
    // Two spellings are in circulation: `NPTS= 4000, DT= .0050 SEC`, and the older
    // `4000   .0050   NPTS, DT`, where the numbers come first and in that order.
    const named = (key: string) => h.match(new RegExp(`${key}\\s*=\\s*([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?)`, 'i'))?.[1];
    const bare = numbersIn(h);
    const npts = Number(named('NPTS') ?? bare[0]);
    const dt = Number(named('DT') ?? bare[1]);
    if (!(npts > 0) || !(dt > 0)) throw new RecordError('badAt2', h.trim());
    const own = at2Unit(preamble);
    const values = lines.slice(header + 1).flatMap(numbersIn).slice(0, npts);
    if (values.length === 0) throw new RecordError('empty');
    const scale = ACCEL_UNIT_SCALE[own];
    return { times: values.map((_, i) => i * dt), accel: values.map((a) => a * scale), format: 'at2', unit: own };
  }

  const rows = lines.map(numbersIn).filter((r) => r.length > 0);
  if (rows.length === 0) throw new RecordError('empty');
  const scale = ACCEL_UNIT_SCALE[unit];

  if (!opts.asColumn && rows.length > 1 && rows.every((r) => r.length === 2)) {
    const times = rows.map((r) => r[0]!);
    const increasing = times.every((tt, i) => i === 0 || tt > times[i - 1]!);
    if (increasing) return { times, accel: rows.map((r) => r[1]! * scale), format: 'table', unit };
    // Two values a line whose first column goes backwards is not a table. With no dt to read it
    // as a column, say what is wrong with it as a table.
    if (!(columnDt && columnDt > 0)) {
      const bad = times.findIndex((tt, i) => i > 0 && !(tt > times[i - 1]!));
      throw new RecordError('notIncreasing', `t = ${times[bad]}`);
    }
  }

  if (!(columnDt && columnDt > 0)) throw new RecordError('needDt');
  const values = rows.flat();
  return { times: values.map((_, i) => i * columnDt), accel: values.map((a) => a * scale), format: 'column', unit };
}

/**
 * The record at k·dt, k = 0 … nSteps, by linear interpolation: nSteps + 1 values.
 *
 * nSteps + 1 because the engine reads the ground at every step's END as well as at t = 0 — it
 * integrates step k from index k to k + 1. A series of nSteps values left the last step with the
 * ground at rest.
 *
 * Times are taken relative to the first sample, so a table that starts at t = 5 s starts the
 * analysis at its first value. Past the last sample the ground is still — the engine's own
 * convention for a series that runs out.
 */
export function resample(record: GroundRecord, dt: number, nSteps: number): number[] {
  const t0 = record.times[0] ?? 0;
  const out: number[] = new Array(nSteps + 1).fill(0);
  let j = 0;
  const last = record.times.length - 1;
  for (let k = 0; k <= nSteps; k++) {
    const t = t0 + k * dt;
    if (t > record.times[last]! + 1e-12) break;
    while (j < last && record.times[j + 1]! < t) j++;
    const ta = record.times[j]!, tb = record.times[Math.min(j + 1, last)]!;
    const aa = record.accel[j]!, ab = record.accel[Math.min(j + 1, last)]!;
    out[k] = tb > ta ? aa + (ab - aa) * (t - ta) / (tb - ta) : aa;
  }
  return out;
}

export type RecordWarning =
  /** PGA above 2.5 g: the largest ever recorded is about 4 g, and most are well under 1. */
  | { code: 'pgaHigh'; pgaG: number }
  /** PGA under 0.001 g: probably a unit read wrong, or a velocity file. */
  | { code: 'pgaLow'; pgaG: number }
  /** The analysis dt is coarser than the record and the resampled series misses its peak. */
  | { code: 'undersampled'; recordDt: number; keptPct: number }
  /** The run ends before the record does. */
  | { code: 'truncated'; runS: number; recordS: number };

/**
 * What is likely wrong with running this record at this dt and length.
 *
 * Not refusals: each can be intended — a short window of a long record, a deliberately coarse
 * first run. Each is a mistake often enough that running it in silence is worse than saying so.
 */
export function recordWarnings(record: GroundRecord, dt: number, nSteps: number): RecordWarning[] {
  const out: RecordWarning[] = [];
  const { pga, duration } = recordSummary(record);
  const pgaG = pga / G;
  if (pgaG > 2.5) out.push({ code: 'pgaHigh', pgaG });
  else if (pga > 0 && pgaG < 0.001) out.push({ code: 'pgaLow', pgaG });

  let recordDt = Infinity;
  for (let i = 1; i < record.times.length; i++) recordDt = Math.min(recordDt, record.times[i]! - record.times[i - 1]!);
  if (dt > recordDt * 1.0001 && pga > 0) {
    let kept = 0;
    // Over the whole record, so a peak the run simply does not reach is not blamed on the dt.
    for (const a of resample(record, dt, Math.ceil(duration / dt))) kept = Math.max(kept, Math.abs(a));
    const keptPct = (kept / pga) * 100;
    if (keptPct < 95) out.push({ code: 'undersampled', recordDt, keptPct });
  }

  const runS = nSteps * dt;
  if (duration > runS + dt / 2) out.push({ code: 'truncated', runS, recordS: duration });
  return out;
}

/** Duration, s, and peak ground acceleration, m/s² — what the panel shows about a record. */
export function recordSummary(record: GroundRecord): { duration: number; pga: number; points: number } {
  let pga = 0;
  for (const a of record.accel) pga = Math.max(pga, Math.abs(a));
  const n = record.times.length;
  return { duration: n > 0 ? record.times[n - 1]! - record.times[0]! : 0, pga, points: n };
}
